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

    // Notificação por e-mail (admins/supervisores).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendTemplateEmail, loadNotificationRecipients } = await import(
        "@/lib/email/notify.server"
      );

      const [{ data: product }, { data: reason }, { data: actor }, { data: countItem }] = await Promise.all([
        supabaseAdmin
          .from("products")
          .select("name, code, unit, cost")
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
          : Promise.resolve({ data: null }),
      ]);

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
            inventory_name:
              (countItem as { inventory?: { name?: string } } | null)?.inventory?.name ?? null,
            registered_at: new Date(created.created_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            }),
          },
        });
      }
    } catch (e) {
      console.error("[registerLoss] notify falhou", e);
    }

    return { ok: true, id: created.id };
  });
