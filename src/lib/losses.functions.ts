import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Registra uma perda/quebra. Só supervisor/admin pode chamar (validado por RLS
 * e checagem explícita). Após o insert, notifica admins/supervisores por e-mail.
 */
export const registerLoss = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      product_id: string;
      reason_id: string;
      quantity: number;
      observation?: string | null;
      count_item_id?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: allowed } = await supabase.rpc("current_user_is_supervisor_or_admin");
    if (!allowed) throw new Error("Somente supervisor ou administrador pode registrar perda.");

    const { data: created, error } = await supabase
      .from("losses")
      .insert({
        product_id: data.product_id,
        reason_id: data.reason_id,
        quantity: data.quantity,
        observation: data.observation ?? null,
        count_item_id: data.count_item_id ?? null,
        created_by: userId,
      })
      .select("id, created_at")
      .single();
    if (error || !created) throw new Error(`Falha ao registrar perda: ${error?.message ?? ""}`);

    if (data.count_item_id) {
      await supabase.from("count_items").update({ status: "justificado" }).eq("id", data.count_item_id);
    }

    await supabase.from("logs").insert({
      user_id: userId,
      action: "perda_registrada",
      entity: "loss",
      details: { loss_id: created.id, product_id: data.product_id, qtd: data.quantity, reason_id: data.reason_id },
    });

    // Notificação por e-mail + ajuste imediato de estoque na Omie.
    type ProductRow = { name: string | null; code: string | null; unit: string | null; cost: number | null; omie_id: number | null };
    type ReasonRow = { name: string | null };
    type ActorRow = { full_name: string | null; email: string | null };
    type CountItemRow = { inventory_id: string; inventory?: { name?: string } | null };
    let product: ProductRow | null = null;
    let reason: ReasonRow | null = null;
    let actor: ActorRow | null = null;
    let countItem: CountItemRow | null = null;

    // Breadcrumb: prova que a versão nova está em produção.
    await supabase.from("logs").insert({
      user_id: userId, action: "registerLoss_pos_insert_start", entity: "loss",
      details: { loss_id: created.id, product_id: data.product_id },
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [prodRes, reasonRes, actorRes, ciRes] = await Promise.all([
        supabaseAdmin
          .from("products")
          .select("name, code, unit, cost, omie_id")
          .eq("id", data.product_id)
          .maybeSingle(),
        supabaseAdmin.from("loss_reasons").select("name").eq("id", data.reason_id).maybeSingle(),
        supabaseAdmin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
        data.count_item_id
          ? supabaseAdmin
              .from("count_items")
              .select("inventory_id, inventory:inventories!count_items_inventory_id_fkey(name)")
              .eq("id", data.count_item_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      // Diagnóstico: se algum select retornou erro, grava e aborta pós-insert.
      const selectErrors = {
        products: (prodRes as { error?: unknown }).error ?? null,
        loss_reasons: (reasonRes as { error?: unknown }).error ?? null,
        profiles: (actorRes as { error?: unknown }).error ?? null,
        count_items: (ciRes as { error?: unknown }).error ?? null,
      };
      const hasSelectError = Object.values(selectErrors).some((e) => e !== null);
      if (hasSelectError) {
        await supabase.from("logs").insert({
          user_id: userId,
          action: "registerLoss_admin_select_erro",
          entity: "loss",
          details: { loss_id: created.id, errors: JSON.parse(JSON.stringify(selectErrors)) },
        });
      }

      product = (prodRes.data ?? null) as ProductRow | null;
      reason = (reasonRes.data ?? null) as ReasonRow | null;
      actor = (actorRes.data ?? null) as ActorRow | null;
      countItem = (ciRes.data ?? null) as CountItemRow | null;

      // ---- Ajuste imediato de estoque na Omie ----
      const codigoOmie = Number(product?.omie_id ?? 0);
      const obsText = `Quebra: ${reason?.name ?? "—"} — registrado por ${actor?.full_name ?? "—"}${
        data.observation ? `. Obs: ${data.observation}` : ""
      }`;
      if (codigoOmie > 0) {
        try {
          const { ajustarEstoqueOmie } = await import("@/lib/omie.server");
          const resp = await ajustarEstoqueOmie({
            codigo_produto: codigoOmie,
            quantidade: -Math.abs(Number(data.quantity)),
            valor_unitario: Number(product?.cost ?? 0),
            observacao: obsText,
          });
          await supabaseAdmin
            .from("losses")
            .update({ omie_updated_at: new Date().toISOString(), omie_response: resp as never })
            .eq("id", created.id);
        } catch (omieErr) {
          const msg = omieErr instanceof Error ? omieErr.message : String(omieErr);
          await supabase.from("logs").insert({
            user_id: userId,
            action: "omie_ajuste_perda_erro",
            entity: "loss",
            details: { loss_id: created.id, product_id: data.product_id, quantidade: Number(data.quantity), erro: msg, obs: obsText },
          });
        }
      } else {
        await supabase.from("logs").insert({
          user_id: userId,
          action: "omie_ajuste_perda_erro",
          entity: "loss",
          details: { loss_id: created.id, product_id: data.product_id, erro: "Produto sem omie_id — ajuste não enviado à Omie.", obs: obsText, product_null: product === null },
        });
      }





      // ---- Notificação por e-mail ----
      const { sendTemplateEmail, loadNotificationRecipients } = await import(
        "@/lib/email/notify.server"
      );
      const recipients = await loadNotificationRecipients();
      if (recipients.length > 0) {
        const unitCost = Number(product?.cost ?? 0);
        const finValue = unitCost * Number(data.quantity);
        await sendTemplateEmail({
          templateName: "loss-registered",
          recipients,
          idempotencyKeyPrefix: `loss-${created.id}`,
          templateData: {
            product_name: product?.name ?? "—",
            product_code: product?.code ?? "",
            unit: product?.unit ?? "",
            quantity: Number(data.quantity),
            unit_cost: unitCost,
            financial_value: finValue,
            reason: reason?.name ?? "—",
            observation: data.observation ?? "",
            registered_by: actor?.full_name ?? "—",
            inventory_name: countItem?.inventory?.name ?? null,
            registered_at: new Date(created.created_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            }),
          },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[registerLoss] pós-insert falhou", e);
      // Usa o client autenticado (context.supabase) — se supabaseAdmin estiver
      // quebrado (env faltando), este ainda funciona porque RLS permite ao
      // próprio usuário inserir em logs.
      try {
        await supabase.from("logs").insert({
          user_id: userId,
          action: "registerLoss_pos_insert_erro",
          entity: "loss",
          details: { loss_id: created.id, product_id: data.product_id, erro: msg },
        });
      } catch { /* ignore */ }
    }

    return { ok: true, id: created.id };
  });
