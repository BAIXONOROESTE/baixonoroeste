import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Envia mensagem de WhatsApp via Twilio (connector gateway).
 * Faz no-op silencioso se o connector do Twilio ainda não estiver ligado
 * (nenhum TWILIO_API_KEY / TWILIO_WHATSAPP_FROM disponível). Isso permite
 * ligar toda a UI antes de conectar o Twilio.
 */
export async function sendWhatsApp(opts: { to: string; body: string }): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!lovableKey || !twilioKey || !from) {
    console.warn("[whatsapp] Twilio não configurado; mensagem não enviada.", { to: opts.to });
    return { ok: false, skipped: true, error: "twilio_not_configured" };
  }
  const to = normalizeWhatsAppNumber(opts.to);
  const fromNorm = normalizeWhatsAppNumber(from);
  if (!to) return { ok: false, error: "telefone_invalido" };

  const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: fromNorm, Body: opts.body }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[whatsapp] Twilio ${res.status}: ${text}`);
    return { ok: false, error: `twilio_${res.status}` };
  }
  return { ok: true };
}

function normalizeWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
  return `whatsapp:${withPlus}`;
}

/**
 * Aviso agrupado por 30 min de divergência num inventário. Chamado depois de
 * salvar um count_item com status = 'divergencia'. Dedup via notification_outbox.
 */
export const notifyDivergence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Já mandamos aviso nos últimos 30 min? Se sim, sai.
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("notification_outbox")
      .select("id")
      .eq("kind", "divergencia")
      .eq("inventory_id", data.inventory_id)
      .not("sent_at", "is", null)
      .gte("sent_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) return { ok: true, skipped: "recent" };

    // Junta contexto: inventário + total de divergências abertas.
    const [{ data: inv }, { count }] = await Promise.all([
      supabaseAdmin.from("inventories").select("id, name").eq("id", data.inventory_id).single(),
      supabaseAdmin.from("count_items").select("id", { count: "exact", head: true })
        .eq("inventory_id", data.inventory_id).eq("status", "divergencia"),
    ]);
    if (!inv) return { ok: false, error: "inventario_nao_encontrado" };

    const { data: recipients } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, user_roles:user_roles(role)")
      .eq("active", true)
      .not("phone", "is", null);
    const targets = (recipients ?? []).filter((r) => {
      const roles = ((r.user_roles ?? []) as { role: string }[]).map((x) => x.role);
      return roles.includes("admin") || roles.includes("supervisor");
    });
    if (targets.length === 0) return { ok: true, skipped: "sem_destinatarios" };

    const baseUrl = process.env.APP_PUBLIC_URL ?? "";
    const link = baseUrl ? `${baseUrl}/inventarios/${inv.id}` : `/inventarios/${inv.id}`;
    const body = `📦 Estoque Omie\nInventário "${inv.name}" tem ${count ?? 0} divergência(s) em aberto.\n${link}`;

    let sent = 0;
    for (const t of targets) {
      if (!t.phone) continue;
      const r = await sendWhatsApp({ to: t.phone, body });
      if (r.ok) sent++;
    }

    await supabaseAdmin.from("notification_outbox").insert({
      kind: "divergencia",
      inventory_id: data.inventory_id,
      payload: { total_divergencias: count ?? 0, destinatarios: targets.length, enviados: sent },
      scheduled_for: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    });
    return { ok: true, sent };
  });
