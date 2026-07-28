import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil · Baixo Noroeste" },
      { name: "description", content: "Preferências de notificação e informações do usuário." },
    ],
  }),
  component: PerfilPage,
});

type Prefs = { maintenance_enabled: boolean; approvals_enabled: boolean };

function PerfilPage() {
  const { data: profile } = useProfile();
  const uid = profile?.id ?? null;
  const qc = useQueryClient();

  const prefsQuery = useQuery({
    queryKey: ["notification-prefs", uid],
    enabled: !!uid,
    queryFn: async (): Promise<Prefs> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("maintenance_enabled, approvals_enabled")
        .eq("user_id", uid!)
        .maybeSingle();
      if (error) throw error;
      return data ?? { maintenance_enabled: true, approvals_enabled: true };
    },
  });

  const [local, setLocal] = useState<Prefs | null>(null);
  useEffect(() => {
    if (prefsQuery.data) setLocal(prefsQuery.data);
  }, [prefsQuery.data]);

  const saveMut = useMutation({
    mutationFn: async (next: Prefs) => {
      if (!uid) throw new Error("Sem usuário autenticado.");
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: uid, ...next }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs", uid] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Erro ao salvar preferência.");
      // reverte para o último valor confirmado
      if (prefsQuery.data) setLocal(prefsQuery.data);
    },
  });

  function toggle(key: keyof Prefs, value: boolean) {
    if (!local) return;
    const next = { ...local, [key]: value };
    setLocal(next);
    saveMut.mutate(next);
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Perfil</h1>
        <p className="text-sm text-muted-foreground">{profile?.full_name}</p>
        <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Notificações push
        </h2>
        <PushNotificationsToggle />

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div>
            <p className="text-sm font-medium">Quais avisos você quer receber?</p>
            <p className="text-xs text-muted-foreground">
              Vale para os pushes deste dispositivo e de qualquer outro que você tenha ativado.
            </p>
          </div>

          <PrefRow
            label="Manutenção"
            hint="Novos chamados, mudanças de status e conclusões."
            checked={local?.maintenance_enabled ?? true}
            disabled={prefsQuery.isLoading || saveMut.isPending}
            onChange={(v) => toggle("maintenance_enabled", v)}
          />
          <PrefRow
            label="Aprovações"
            hint="Checklists enviados para revisão, aprovados ou rejeitados."
            checked={local?.approvals_enabled ?? true}
            disabled={prefsQuery.isLoading || saveMut.isPending}
            onChange={(v) => toggle("approvals_enabled", v)}
          />
        </div>
      </section>
    </div>
  );
}

function PrefRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
