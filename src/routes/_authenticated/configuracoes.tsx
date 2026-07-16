import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });
  const { data: reasons } = useQuery({
    queryKey: ["loss-reasons-all"],
    queryFn: async () => (await supabase.from("loss_reasons").select("*").order("name")).data ?? [],
  });
  const [newReason, setNewReason] = useState("");

  const setMode = useMutation({
    mutationFn: async (mode: "imediato" | "encerramento") => {
      const { error } = await supabase.from("settings").update({ omie_update_mode: mode }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo!"); qc.invalidateQueries({ queryKey: ["settings"] }); },
  });

  if (me?.role !== "admin") return <div className="p-6 text-muted-foreground">Somente admin.</div>;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Configurações</h1>

      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <div className="font-medium text-sm">Modo de atualização do Omie</div>
        <div className="grid grid-cols-2 gap-2">
          {(["imediato","encerramento"] as const).map((m) => (
            <button key={m} onClick={() => setMode.mutate(m)}
              className={`p-3 rounded-xl text-sm border ${settings?.omie_update_mode === m ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>
              <div className="font-medium capitalize">{m}</div>
              <div className="text-xs text-muted-foreground mt-1">{m === "imediato" ? "Atualiza a cada item salvo." : "Atualiza ao fechar o inventário."}</div>
            </button>
          ))}
        </div>
      </div>

      <NotificationSettings settings={settings} onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })} />

      <N8nSettings settings={settings} onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })} />

      <CountableFamiliesSettings />



      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <div className="font-medium text-sm">Motivos de perda</div>
        {reasons?.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm">
            <span className={r.active ? "" : "text-muted-foreground line-through"}>{r.name}</span>
            <Button size="sm" variant="ghost" onClick={async () => {
              await supabase.from("loss_reasons").update({ active: !r.active }).eq("id", r.id);
              qc.invalidateQueries();
            }}>{r.active ? "desativar" : "ativar"}</Button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Novo motivo" />
          <Button onClick={async () => {
            if (!newReason.trim()) return;
            const { error } = await supabase.from("loss_reasons").insert({ name: newReason.trim() });
            if (error) toast.error(error.message); else { setNewReason(""); qc.invalidateQueries(); }
          }}>Add</Button>
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-border p-4">
        <div className="font-medium text-sm">Credenciais do Omie</div>
        <p className="text-xs text-muted-foreground mt-1">Configuradas nos secrets do backend. Para trocar, use o menu de secrets do projeto.</p>
      </div>
    </div>
  );
}

type Settings = {
  notif_enabled: boolean;
  notif_from_email: string | null;
  notif_from_name: string | null;
  notif_reply_to: string | null;
  n8n_webhook_url?: string | null;
  n8n_webhook_secret?: string | null;
  tolerance_pct_default?: number | null;
} | null | undefined;

function NotificationSettings({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("Baixo Noroeste Inventário");
  const [replyTo, setReplyTo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(!!settings.notif_enabled);
    setFromEmail(settings.notif_from_email ?? "");
    setFromName(settings.notif_from_name ?? "Baixo Noroeste Inventário");
    setReplyTo(settings.notif_reply_to ?? "");
  }, [settings]);

  async function save() {
    if (enabled && (!fromEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail.trim()))) {
      toast.error("Informe um email remetente válido.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("settings").update({
      notif_enabled: enabled,
      notif_from_email: fromEmail.trim() || null,
      notif_from_name: fromName.trim() || null,
      notif_reply_to: replyTo.trim() || null,
    }).eq("id", 1);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Notificações salvas.");
    onSaved();
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Notificações por Email</div>
          <div className="text-xs text-muted-foreground">Aviso a admins/supervisores quando uma contagem for encerrada ou perda registrada.</div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
          {enabled ? "Ativo" : "Desativado"}
        </label>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">Email remetente (From)</label>
          <Input type="email" placeholder="notificacoes@baixonoroeste.com.br" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Nome exibido</label>
          <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Reply-to (opcional)</label>
          <Input type="email" placeholder="ex: gerencia@baixonoroeste.com.br" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Salvando" : "Salvar notificações"}</Button>
      <p className="text-[11px] text-muted-foreground leading-snug">
        O domínio do email remetente precisa estar verificado no Lovable Emails para os envios acontecerem.
      </p>
    </div>
  );
}

function N8nSettings({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [tol, setTol] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setUrl(settings.n8n_webhook_url ?? "");
    setSecret(settings.n8n_webhook_secret ?? "");
    setTol(String(settings.tolerance_pct_default ?? 0));
  }, [settings]);

  async function save() {
    setSaving(true);
    const tolNum = Number(String(tol).replace(",", "."));
    const { error } = await supabase.from("settings").update({
      n8n_webhook_url: url.trim() || null,
      n8n_webhook_secret: secret.trim() || null,
      tolerance_pct_default: Number.isFinite(tolNum) ? tolNum : 0,
    }).eq("id", 1);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Webhook e tolerância salvos.");
    onSaved();
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
      <div>
        <div className="font-medium text-sm">Integração n8n (webhook)</div>
        <div className="text-xs text-muted-foreground">
          Envia eventos do fluxo (criação, divergência, recontagem, ajuste, aprovação) para o n8n disparar WhatsApp e automações.
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">URL do webhook n8n</label>
          <Input placeholder="https://n8n.seu-dominio.com/webhook/..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Segredo (opcional — HMAC-SHA256 em X-Signature)</label>
          <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="segredo compartilhado com o n8n" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tolerância padrão de divergência (%)</label>
          <Input type="number" step="0.1" min="0" value={tol} onChange={(e) => setTol(e.target.value)} />
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Salvando" : "Salvar integração"}</Button>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Payload JSON com os campos: evento, tarefa_id, tarefa_nome, responsavel, supervisor, admin, itens_divergentes[], motivo, deadline.
      </p>
    </div>
  );
}
