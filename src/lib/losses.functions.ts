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
    // Todos os dados vêm de UMA RPC security definer (contorna RLS de
    // products/loss_reasons/profiles/user_roles sem depender de supabaseAdmin).
    type LossCtx = {
      loss_id: string;
      created_at: string;
      product: { name: string | null; code: string | null; unit: string | null; cost: number | null; omie_id: number | null } | null;
      reason: { name: string | null } | null;
      actor: { full_name: string | null; email: string | null } | null;
      count_item: { inventory_id: string | null; inventory_name: string | null } | null;
      recipients: string[];
    };

    try {
      const { data: ctxData, error: ctxErr } = await supabase.rpc(
        "get_loss_notification_context",
        { _loss_id: created.id },
      );
      if (ctxErr) throw new Error(`RPC get_loss_notification_context: ${ctxErr.message}`);
      const ctx = ctxData as unknown as LossCtx;
      const product = ctx?.product ?? null;
      const reason = ctx?.reason ?? null;
      const actor = ctx?.actor ?? null;
      const inventoryName = ctx?.count_item?.inventory_name ?? null;
      const recipients = ctx?.recipients ?? [];

      // ---- Ajuste imediato de estoque na Omie ----
      const codigoOmie = Number(product?.omie_id ?? 0);
      const obsText = `Quebra: ${reason?.name ?? "-"} - registrado por ${actor?.full_name ?? "-"}${
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
          const { error: updErr } = await supabase
            .from("losses")
            .update({ omie_updated_at: new Date().toISOString(), omie_response: resp as never })
            .eq("id", created.id);
          if (updErr) {
            await supabase.from("logs").insert({
              user_id: userId,
              action: "omie_ajuste_perda_erro",
              entity: "loss",
              details: { loss_id: created.id, erro: `update omie_updated_at falhou: ${updErr.message}` },
            });
          }
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
          details: { loss_id: created.id, product_id: data.product_id, erro: "Produto sem omie_id — ajuste não enviado à Omie.", obs: obsText },
        });
      }

      // ---- Notificação por e-mail (via supabaseAdmin) ----
      if (recipients.length > 0) {
        const { sendTemplateEmail } = await import("@/lib/email/notify.server");
        const unitCost = Number(product?.cost ?? 0);
        const finValue = unitCost * Number(data.quantity);
        try {
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
              inventory_name: inventoryName,
              registered_at: new Date(created.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              }),
            },
          });
        } catch (mailErr) {
          const emsg = mailErr instanceof Error ? mailErr.message : String(mailErr);
          await supabase.from("logs").insert({
            user_id: userId,
            action: "registerLoss_email_erro",
            entity: "loss",
            details: { loss_id: created.id, erro: emsg },
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[registerLoss] pós-insert falhou", e);
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

