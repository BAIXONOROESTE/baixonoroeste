import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Envia mensagem de WhatsApp via Twilio (connector gateway).
 * Faz no-op silencioso se o connector do Twilio ainda não estiver ligado
 * (nenhum TWILIO_API_KEY / TWILIO_WHATSAPP_FROM disponível). Isso permite
 * ligar toda a UI antes de conectar o Twilio.
 */
export async function sendWhatsApp(_opts: { to: string; body: string }): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  // WhatsApp desativado nesta fase — stub silencioso.
  return { ok: false, skipped: true, error: "wa_disabled" };
}

/**
 * Aviso agrupado por 30 min de divergência num inventário. Chamado depois de
 * salvar um count_item com status = 'divergencia'. Dedup via notification_outbox.
 */
export const notifyDivergence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string }) => d)
  .handler(async (_ctx) => {
    // WhatsApp desativado — mantido apenas para preservar assinatura no cliente.
    return { ok: true, skipped: "wa_disabled" as const };
  });

