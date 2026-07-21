import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, ClipboardList, BarChart3, Trophy, AlertTriangle, FileText, Users, Settings, ScrollText, RefreshCw, Inbox, ArrowRight, Bell, Wrench, CheckSquare } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncFamiliesAndProducts } from "@/lib/omie.functions";
import { listLoginProfiles } from "@/lib/login-profiles.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/inicio")({ component: HomePage });

const tiles = [
  { to: "/contar", label: "Nova contagem", icon: ClipboardList, roles: ["admin","supervisor"] as const },
  { to: "/inventarios", label: "Inventários", icon: Package, roles: ["admin","supervisor","contador"] as const },
  { to: "/checklists", label: "Checklists", icon: CheckSquare, roles: ["admin","supervisor","contador"] as const },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin","supervisor"] as const },
  { to: "/ranking", label: "Ranking", icon: Trophy, roles: ["admin","supervisor","contador"] as const },
  { to: "/perdas", label: "Perdas & Quebras", icon: AlertTriangle, roles: ["admin","supervisor","contador"] as const },
  { to: "/manutencao", label: "Manutenção", icon: Wrench, roles: ["admin","supervisor"] as const },
  { to: "/relatorios", label: "Relatórios", icon: FileText, roles: ["admin","supervisor"] as const },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["admin"] as const },
  { to: "/logs", label: "Logs", icon: ScrollText, roles: ["admin","supervisor"] as const },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] as const },
];

function HomePage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const syncFn = useServerFn(syncFamiliesAndProducts);

  const role = profile?.role ?? "contador";
  const isSup = role === "admin" || role === "supervisor";
  const uid = profile?.id;

  const PENDING_STATUSES = ["pendente", "aberto", "em_andamento", "recontagem_solicitada", "ajuste_solicitado"] as const;
  type InvStatus = typeof PENDING_STATUSES[number];

  const { data: myTasks } = useQuery({
    queryKey: ["my-tasks", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventories")
        .select("id, name, status, started_at, deadline_at")
        .eq("assigned_counter_id", uid!)
        .in("status", PENDING_STATUSES as unknown as InvStatus[])
        .order("deadline_at", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
    refetchOnWindowFocus: true,
  });

  const { data: lastSync } = useQuery({
    queryKey: ["last-sync"],
    queryFn: async () => {
      const { data } = await supabase.from("sync_log").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: missingEmails } = useQuery({
    queryKey: ["admins-missing-email"],
    enabled: role === "admin",
    queryFn: async () => {
      const [{ data: roles }, { data: profs }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("role", ["admin", "supervisor"]),
        supabase.from("profiles").select("id, full_name, email, active"),
      ]);
      const ids = new Set((roles ?? []).map((r) => r.user_id));
      return (profs ?? []).filter((p) => ids.has(p.id) && p.active && (!p.email || p.email.trim() === ""));
    },
    refetchOnWindowFocus: true,
  });

  const { data: pendingCloses } = useQuery({
    queryKey: ["pending-close-requests"],
    enabled: isSup,
    queryFn: async () => {
      const { data } = await supabase
        .from("close_requests")
        .select("id, approval_token, created_at, requested_by, inventory:inventories(name)")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.requested_by)));
      const profs = ids.length ? await listLoginProfiles() : [];
      const byId = new Map((profs ?? []).filter((p) => ids.includes(p.id)).map((p) => [p.id, p.full_name] as const));

      return rows.map((r) => ({ ...r, requester_name: byId.get(r.requested_by) ?? "—" }));
    },
    refetchOnWindowFocus: true,
  });

  const { data: pendingMaintenanceTickets } = useQuery({
    queryKey: ["pending-maintenance-tickets"],
    enabled: isSup,
    queryFn: async () => {
      const { data } = await supabase
        .from("maintenance_tickets")
        .select("id, title, status, assigned_to, reported_by, created_at")
        .in("status", ["aberto", "em_andamento"])
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      const ids = Array.from(
        new Set(
          rows.flatMap((r) => [r.assigned_to, r.reported_by]).filter(Boolean) as string[],
        ),
      );
      const names: Record<string, string> = {};
      if (ids.length) {
        const profs = await listLoginProfiles();
        (profs ?? [])
          .filter((p) => ids.includes(p.id))
          .forEach((p) => {
            names[p.id] = p.full_name;
          });
      }
      return rows.map((r) => ({
        ...r,
        assigned_name: r.assigned_to ? names[r.assigned_to] ?? null : null,
        reporter_name: names[r.reported_by] ?? null,
      }));
    },
    refetchOnWindowFocus: true,
  });



  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.familias} famílias, ${r.produtos} produtos.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização."),
  });

  const visible = tiles.filter((t) => (t.roles as readonly string[]).includes(role));


  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Olá, {profile?.full_name}</p>
        <h1 className="text-2xl font-display font-semibold">Início</h1>
      </div>

      {role === "admin" && missingEmails && missingEmails.length > 0 && (
        <div className="rounded-2xl border border-warning/60 bg-warning/10 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">
                {missingEmails.length} supervisor{missingEmails.length > 1 ? "es" : ""}/admin{missingEmails.length > 1 ? "s" : ""} sem e-mail configurado
              </div>
              <div className="text-xs text-muted-foreground">
                Notificações de fechamento e divergência não chegarão até isso ser corrigido:
                {" "}{missingEmails.map((u) => u.full_name).join(", ")}.
              </div>
              <Link to="/usuarios" className="inline-block mt-2">
                <Button size="sm" variant="outline">Abrir Usuários</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {myTasks && myTasks.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Minhas tarefas
            </h2>
            <span className="rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5">
              {myTasks.length}
            </span>
          </div>
          <ul className="space-y-2">
            {myTasks.map((t) => {
              const overdue = t.deadline_at && new Date(t.deadline_at) < new Date();
              return (
                <li key={t.id} className={`rounded-2xl bg-surface border p-3 flex items-center justify-between gap-2 ${overdue ? "border-destructive/60" : "border-primary/40"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/20 text-primary px-2 py-0.5 font-semibold">
                        Aguardando você
                      </span>
                      {overdue && (
                        <span className="text-[10px] uppercase tracking-wide rounded-full bg-destructive/20 text-destructive px-2 py-0.5 font-semibold">
                          Atrasada
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate mt-1">{t.name}</div>
                    {t.deadline_at && (
                      <div className={`text-[11px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        Prazo: {fmtDateTime(t.deadline_at)}
                      </div>
                    )}
                  </div>
                  <Link to="/inventarios/$id" params={{ id: t.id }}>
                    <Button size="sm">Abrir <ArrowRight className="h-3 w-3 ml-1" /></Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}


      {role === "admin" && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Sincronização</h2>
          <div className="rounded-2xl bg-surface border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Sincronização com Omie</div>
                <div className="text-xs text-muted-foreground">Última: {fmtDateTime(lastSync?.started_at)}</div>
              </div>
              <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
                {sync.isPending ? "Sincronizando" : "Sincronizar"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {isSup && pendingCloses && pendingCloses.length > 0 && (
        <div className="rounded-2xl bg-surface border border-warning/40 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-warning" />
            <div className="text-sm font-medium">Pedidos de fechamento pendentes ({pendingCloses.length})</div>
          </div>
          <ul className="space-y-2">
            {pendingCloses.map((r) => {
              const inv = r.inventory as { name?: string } | null;
              const req = { full_name: r.requester_name };
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-background/40 p-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{inv?.name ?? "Inventário"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {req?.full_name ?? "—"} · {fmtDateTime(r.created_at)}
                    </div>
                  </div>
                  <Link to="/aprovar/$token" params={{ token: r.approval_token }}>
                    <Button size="sm" variant="outline">Abrir</Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isSup && pendingMaintenanceTickets && pendingMaintenanceTickets.length > 0 && (
        <div className="rounded-2xl bg-surface border border-warning/40 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-warning" />
              <div className="text-sm font-medium">
                Manutenção pendente ({pendingMaintenanceTickets.length})
              </div>
            </div>
            {pendingMaintenanceTickets.length > 5 && (
              <Link to="/manutencao" className="text-xs text-primary hover:underline">
                Ver todos
              </Link>
            )}
          </div>
          <ul className="space-y-2">
            {pendingMaintenanceTickets.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-background/40 p-2"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                    <span
                      className={`text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 font-semibold ${
                        t.status === "aberto"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-blue-500/15 text-blue-600"
                      }`}
                    >
                      {t.status === "aberto" ? "Aberto" : "Em andamento"}
                    </span>
                    <span className="truncate">
                      {t.assigned_name ?? "Sem responsável"}
                    </span>
                  </div>
                </div>
                <Link to="/manutencao">
                  <Button size="sm" variant="outline">Abrir</Button>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}





      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Navegação</h2>
        <div className="grid grid-cols-2 gap-3">
          {visible.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to} className="rounded-2xl bg-surface border border-border p-4 flex flex-col gap-2 hover:border-primary/50 transition">
                <Icon className="h-6 w-6 text-primary" />
                <div className="text-sm font-medium">{t.label}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
