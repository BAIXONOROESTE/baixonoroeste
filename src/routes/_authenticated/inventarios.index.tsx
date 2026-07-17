import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { DeleteInventoryButton } from "@/components/DeleteInventoryButton";

export const Route = createFileRoute("/_authenticated/inventarios/")({ component: InventoriesList });

const STATUS_LABEL: Record<string, string> = {
  aberto: "Em andamento",
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pendente_validacao: "Pendente validação",
  divergencia: "Divergência",
  recontagem_solicitada: "Recontagem",
  ajuste_solicitado: "Ajuste",
  recontagem_enviada: "Recontagem enviada",
  aguardando_validacao: "Aguardando validação",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  fechado: "Fechado",
};

function statusPill(status: string): string {
  if (["aprovada", "concluida", "fechado"].includes(status)) return "bg-success/20 text-success";
  if (["divergencia", "reprovada"].includes(status)) return "bg-destructive/20 text-destructive";
  if (["pendente_validacao", "aguardando_validacao", "recontagem_enviada"].includes(status)) return "bg-primary/20 text-primary";
  if (["recontagem_solicitada", "ajuste_solicitado"].includes(status)) return "bg-warning/20 text-warning";
  return "bg-warning/20 text-warning";
}

const PENDING_FOR_ME = ["pendente", "aberto", "em_andamento", "recontagem_solicitada", "ajuste_solicitado"];

function InventoriesList() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const { data: profile } = useProfile();
  const myId = profile?.id;

  const { data } = useQuery({
    queryKey: ["inventories-list"],
    queryFn: async () => (await supabase
      .from("inventories")
      .select("id, name, status, started_at, deadline_at, assigned_counter_id, assigned_supervisor_id, counter:profiles!inventories_assigned_counter_id_fkey(full_name), supervisor:profiles!inventories_assigned_supervisor_id_fkey(full_name)")
      .order("started_at", { ascending: false })
      .limit(100)).data ?? [],
  });

  const stats = useMemo(() => {
    const items = data ?? [];
    return {
      pendentes: items.filter((i) => ["pendente", "aberto", "em_andamento"].includes(i.status)).length,
      concluidas: items.filter((i) => ["concluida", "aprovada", "fechado"].includes(i.status)).length,
      divergentes: items.filter((i) => ["divergencia", "pendente_validacao"].includes(i.status)).length,
      validacao: items.filter((i) => ["pendente_validacao", "aguardando_validacao", "recontagem_enviada"].includes(i.status)).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const items = data ?? [];
    const s = q.toLowerCase().trim();
    return items.filter((i) => {
      if (statusFilter !== "todos" && i.status !== statusFilter) return false;
      if (s) {
        const c = (i.counter as { full_name?: string } | null)?.full_name?.toLowerCase() ?? "";
        const sup = (i.supervisor as { full_name?: string } | null)?.full_name?.toLowerCase() ?? "";
        if (!i.name.toLowerCase().includes(s) && !c.includes(s) && !sup.includes(s)) return false;
      }
      return true;
    });
  }, [data, q, statusFilter]);

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-3">
      <h1 className="text-2xl font-display font-semibold">Inventários</h1>

      {(() => {
        const mine = (data ?? []).filter((i) => i.assigned_counter_id === myId && PENDING_FOR_ME.includes(i.status));
        if (!myId || mine.length === 0) return null;
        return (
          <section className="rounded-2xl border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-primary">Aguardando você</div>
              <span className="rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5">{mine.length}</span>
            </div>
            <ul className="space-y-2">
              {mine.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 rounded-xl bg-background/40 p-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{inv.name}</div>
                    {inv.deadline_at && (
                      <div className="text-[11px] text-muted-foreground truncate">Prazo: {fmtDateTime(inv.deadline_at)}</div>
                    )}
                  </div>
                  <Link to="/inventarios/$id" params={{ id: inv.id }}>
                    <Button size="sm">Abrir <ArrowRight className="h-3 w-3 ml-1" /></Button>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Pendentes" value={stats.pendentes} tone="warning" />
        <StatCard label="Divergentes" value={stats.divergentes} tone="destructive" />
        <StatCard label="Validação" value={stats.validacao} tone="primary" />
        <StatCard label="Concluídas" value={stats.concluidas} tone="success" />
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou responsável" />
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
        className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
        <option value="todos">Todos os status</option>
        {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      {filtered.map((inv) => {
        const overdue = inv.deadline_at && new Date(inv.deadline_at) < new Date() && !["aprovada", "concluida", "fechado", "reprovada"].includes(inv.status);
        const mine = inv.assigned_counter_id === myId && PENDING_FOR_ME.includes(inv.status);
        return (
          <Link key={inv.id} to="/inventarios/$id" params={{ id: inv.id }}
                className={`block rounded-2xl bg-surface border p-4 hover:border-primary/50 ${overdue ? "border-destructive/60" : mine ? "border-primary/60" : "border-border"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate flex items-center gap-2">
                  {mine && <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/20 text-primary px-2 py-0.5 font-semibold shrink-0">Aguardando você</span>}
                  {inv.name}
                  {overdue && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground truncate">{fmtDateTime(inv.started_at)}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {(inv.counter as { full_name?: string } | null)?.full_name ? `👤 ${(inv.counter as { full_name?: string }).full_name}` : ""}
                  {(inv.supervisor as { full_name?: string } | null)?.full_name ? ` · sup: ${(inv.supervisor as { full_name?: string }).full_name}` : ""}
                </div>
                {inv.deadline_at && (
                  <div className={`text-[11px] flex items-center gap-1 mt-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                    <Clock className="h-3 w-3" /> Prazo: {fmtDateTime(inv.deadline_at)}
                  </div>
                )}
              </div>
              <span className={`text-[11px] rounded-full px-2 py-1 shrink-0 ${statusPill(inv.status)}`}>
                {STATUS_LABEL[inv.status] ?? inv.status}
              </span>
            </div>
          </Link>
        );
      })}
      {!filtered.length && <p className="text-sm text-muted-foreground text-center py-8">Nenhum inventário encontrado.</p>}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "warning" | "destructive" | "success" | "primary" }) {
  const cls = {
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    primary: "bg-primary/10 text-primary",
  }[tone];
  return (
    <div className={`rounded-xl p-2 text-center ${cls}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}
