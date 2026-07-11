/**
 * Server-only helper para disparar eventos ao webhook do n8n.
 * A URL e o segredo ficam em `settings.n8n_webhook_url` / `n8n_webhook_secret`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac } from "crypto";

export type N8nEvent =
  | "tarefa_criada"
  | "tarefa_concluida"
  | "divergencia_encontrada"
  | "recontagem_solicitada"
  | "ajuste_solicitado"
  | "recontagem_enviada"
  | "tarefa_aprovada";

export interface N8nPayload {
  evento: N8nEvent;
  tarefa_id: string;
  tarefa_nome?: string | null;
  responsavel?: { nome?: string | null; email?: string | null; telefone?: string | null } | null;
  supervisor?: { nome?: string | null; email?: string | null; telefone?: string | null } | null;
  admin?: { nome?: string | null; email?: string | null; telefone?: string | null } | null;
  itens_divergentes?: Array<{
    produto: string;
    sku?: string | null;
    quantidade_esperada: number;
    quantidade_contada: number;
    diferenca: number;
  }>;
  motivo?: string | null;
  deadline?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Dispara evento ao n8n. Falha silenciosa (loga em `logs`), nunca bloqueia
 * o fluxo principal. Timeout 5s.
 */
export async function fireN8nEvent(payload: N8nPayload): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  try {
    const { data: settings } = await supabaseAdmin.from("settings").select("n8n_webhook_url, n8n_webhook_secret").eq("id", 1).maybeSingle();
    const url = (settings as { n8n_webhook_url?: string | null } | null)?.n8n_webhook_url?.trim();
    const secret = (settings as { n8n_webhook_secret?: string | null } | null)?.n8n_webhook_secret?.trim();
    if (!url) return { ok: false, skipped: "no_webhook_url" };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) {
      const sig = createHmac("sha256", secret).update(body).digest("hex");
      headers["X-Signature"] = sig;
      headers["X-Signature-256"] = `sha256=${sig}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await supabaseAdmin.from("logs").insert({
          user_id: null as unknown as string, action: "n8n_webhook_falha", entity: "inventory",
          details: { evento: payload.evento, tarefa_id: payload.tarefa_id, status: res.status, body: txt.slice(0, 500) },
        }).then(() => {}, () => {});
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await supabaseAdmin.from("logs").insert({
        user_id: null as unknown as string, action: "n8n_webhook_erro", entity: "inventory",
        details: { evento: payload.evento, tarefa_id: payload.tarefa_id, erro: msg },
      });
    } catch { /* ignore */ }
    return { ok: false, error: msg };
  }
}

/**
 * Monta o payload padrão para um inventário, populando os campos de
 * responsável/supervisor/admin quando existirem.
 */
export async function buildInventoryPayload(inventoryId: string, evento: N8nEvent, extra: Partial<N8nPayload> = {}): Promise<N8nPayload> {
  const { data: inv } = await supabaseAdmin
    .from("inventories")
    .select("id, name, deadline_at, assigned_counter_id, assigned_supervisor_id, assigned_admin_id")
    .eq("id", inventoryId)
    .maybeSingle();
  if (!inv) return { evento, tarefa_id: inventoryId, ...extra };

  const ids = [inv.assigned_counter_id, inv.assigned_supervisor_id, inv.assigned_admin_id].filter(Boolean) as string[];
  const { data: profs } = ids.length
    ? await supabaseAdmin.from("profiles").select("id, full_name, email, phone").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string; email: string | null; phone: string | null }> };
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  const pick = (id: string | null | undefined) => {
    if (!id) return null;
    const p = byId.get(id);
    return p ? { nome: p.full_name, email: p.email, telefone: p.phone } : null;
  };

  return {
    evento,
    tarefa_id: inv.id,
    tarefa_nome: inv.name,
    deadline: inv.deadline_at,
    responsavel: pick(inv.assigned_counter_id),
    supervisor: pick(inv.assigned_supervisor_id),
    admin: pick(inv.assigned_admin_id),
    ...extra,
  };
}
