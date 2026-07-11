import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Compat: mantido para não quebrar chamadas antigas. WhatsApp está desativado
 * — todas as notificações vão por e-mail.
 */
export async function sendWhatsApp(_opts: { to: string; body: string }): Promise<{ ok: boolean; skipped: true }> {
  return { ok: false, skipped: true };
}

/**
 * Notifica supervisores/admins por e-mail quando uma divergência é registrada.
 * Dedupe via idempotency por inventário para não gerar chuva de emails quando
 * várias divergências acontecem no mesmo inventário em curto intervalo.
 */
export const notifyDivergence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendTemplateEmail, loadNotificationRecipients } = await import(
        "@/lib/email/notify.server"
      );

      const [{ data: inv }, { data: items }, { data: actor }] = await Promise.all([
        supabaseAdmin
          .from("inventories")
          .select("id, name, status")
          .eq("id", data.inventory_id)
          .maybeSingle(),
        supabaseAdmin
          .from("count_items")
          .select("quantity_before, quantity_counted, difference, financial_diff, status, product:products(name, code, unit)")
          .eq("inventory_id", data.inventory_id)
          .eq("status", "divergencia"),
        supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      if (!inv || !(items ?? []).length) return { ok: true, skipped: "no_divergences" as const };

      const recipients = await loadNotificationRecipients();
      if (recipients.length === 0) return { ok: true, skipped: "no_recipients" as const };

      const totalDiff = (items ?? []).reduce((a, i) => a + Number(i.financial_diff ?? 0), 0);
      const templateItems = (items ?? []).map((i) => {
        const expected = Number(i.quantity_before ?? 0);
        const counted = Number(i.quantity_counted);
        const diff = Number(i.difference);
        return {
          product: (i.product as { name: string }).name,
          code: (i.product as { code?: string }).code,
          expected,
          counted,
          diff,
          diff_pct: expected === 0 ? (counted === 0 ? 0 : 100) : (diff / expected) * 100,
          sent_to_omie: false,
          unit: (i.product as { unit?: string | null }).unit ?? undefined,
        };
      });

      // Janela de 30min: idempotency por meia-hora evita spammar.
      const bucket = Math.floor(Date.now() / (30 * 60 * 1000));

      await sendTemplateEmail({
        templateName: "count-completed",
        recipients,
        idempotencyKeyPrefix: `divergence-${data.inventory_id}-${bucket}`,
        templateData: {
          counter_name: actor?.full_name ?? "—",
          inventory_name: inv.name ?? "",
          finished_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          mode: "divergence",
          total_diff_value: totalDiff,
          items: templateItems,
        },
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[notifyDivergence] falhou", e);
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("logs").insert({
          user_id: userId, action: "notify_divergence_erro", entity: "inventory",
          details: { inventory_id: data.inventory_id, erro: msg },
        });
      } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
  });
