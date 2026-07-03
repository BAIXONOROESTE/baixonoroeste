import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useState } from "react";

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
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
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
