import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { listLoginProfiles } from "@/lib/login-profiles.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const Route = createFileRoute("/_authenticated/checklists/admin/")({
  head: () => ({ meta: [{ title: "Gerenciar checklists · Baixo Noroeste" }] }),
  component: ChecklistAdminPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">Erro</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type TemplateRow = {
  id: string;
  name: string;
  scheduled_time: string | null;
  active: boolean;
  items: { id: string }[];
};

function ChecklistAdminPage() {
  const { data: profile, isLoading } = useProfile();
  const role = profile?.role ?? "contador";
  const canManage = role === "admin" || role === "supervisor";
  const qc = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("");

  const [assignFor, setAssignFor] = useState<TemplateRow | null>(null);
  const [assignDate, setAssignDate] = useState<string>(todayLocalISO());
  const [assignUserId, setAssignUserId] = useState<string>("");

  const listLoginProfilesFn = useServerFn(listLoginProfiles);
  const activeProfilesQ = useQuery({
    queryKey: ["login-profiles-active"],
    queryFn: async () => {
      const rows = await listLoginProfilesFn();
      return (rows ?? []).filter((p) => p.active);
    },
    enabled: canManage,
  });

  const existingAssignmentQ = useQuery({
    queryKey: ["checklist-assignment", assignFor?.id, assignDate],
    enabled: !!assignFor && !!assignDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_assignments")
        .select("id, assigned_to")
        .eq("template_id", assignFor!.id)
        .eq("assignment_date", assignDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Sincroniza o usuário selecionado com o valor persistido quando abre.
  const currentAssigned = existingAssignmentQ.data?.assigned_to ?? "";
  if (assignFor && !assignUserId && currentAssigned) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    setAssignUserId(currentAssigned);
  }

  const upsertAssignment = useMutation({
    mutationFn: async () => {
      if (!assignFor) throw new Error("Selecione um checklist.");
      if (!assignUserId) throw new Error("Selecione um colaborador.");
      if (!profile?.id) throw new Error("Sem usuário autenticado.");
      const { error } = await supabase
        .from("checklist_assignments")
        .upsert(
          {
            template_id: assignFor.id,
            assignment_date: assignDate,
            assigned_to: assignUserId,
            created_by: profile.id,
          },
          { onConflict: "template_id,assignment_date" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Responsável definido");
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklist-assignment"] });
      setAssignFor(null);
      setAssignUserId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atribuir"),
  });


  const query = useQuery({
    queryKey: ["checklist-admin-templates"],
    enabled: canManage,
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("id, name, scheduled_time, active, items:checklist_template_items(id)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as TemplateRow[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("checklist_templates")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["checklist-admin-templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Informe o nome do checklist.");
      const { error } = await supabase.from("checklist_templates").insert({
        name: newName.trim(),
        scheduled_time: newTime ? newTime : null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checklist criado");
      qc.invalidateQueries({ queryKey: ["checklist-admin-templates"] });
      setCreating(false);
      setNewName("");
      setNewTime("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar checklist"),
  });

  const sorted = useMemo(() => {
    return (query.data ?? []).slice().sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? "") ||
        a.name.localeCompare(b.name);
    });
  }, [query.data]);

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!canManage) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Acesso negado</h1>
        <p className="text-sm text-muted-foreground">
          Apenas admin ou supervisor podem gerenciar checklists.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/checklists">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/checklists"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Gerenciar checklists</h1>
            <p className="text-sm text-muted-foreground">Modelos, horários e itens.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo checklist
        </Button>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {sorted.length === 0 && !query.isLoading && (
        <p className="text-sm text-muted-foreground">Nenhum checklist cadastrado.</p>
      )}

      <div className="space-y-2">
        {sorted.map((t) => (
          <Card key={t.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-muted-foreground w-12 shrink-0">
                  {t.scheduled_time ? t.scheduled_time.slice(0, 5) : "—"}
                </span>
                <span className="font-medium truncate">{t.name}</span>
                {!t.active && <Badge variant="outline">Inativo</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-1 ml-14">
                {t.items?.length ?? 0} itens
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Switch
                checked={t.active}
                onCheckedChange={(v) => toggleActive.mutate({ id: t.id, active: v })}
                aria-label="Ativo"
              />
              <Button asChild size="sm" variant="outline">
                <Link to="/checklists/admin/$templateId" params={{ templateId: t.id }}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Editar
                </Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Abertura da loja" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Horário programado (opcional)</label>
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={createTemplate.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => createTemplate.mutate()}
              disabled={!newName.trim() || createTemplate.isPending}
            >
              {createTemplate.isPending ? "Salvando…" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
