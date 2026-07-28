import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, ClipboardList, BarChart3, Trophy, AlertTriangle, FileText, Users, Settings, ScrollText, RefreshCw, Inbox, ArrowRight, Bell, Wrench, CheckSquare, Clock, CalendarCheck } from "lucide-react";
import React, { useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncFamiliesAndProducts } from "@/lib/omie.functions";
import { listLoginProfiles } from "@/lib/login-profiles.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MaintenanceTicketDialog } from "@/components/MaintenanceTicketDialog";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/inicio")({ component: HomePage });

const tiles = [
  { to: "/inventarios", label: "Inventários", icon: Package, roles: ["admin","supervisor","contador"] as const },
  { to: "/checklists", label: "Checklists", icon: CheckSquare, roles: ["admin","supervisor","contador"] as const },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin","supervisor"] as const },
  { to: "/ranking", label: "Ranking", icon: Trophy, roles: ["admin","supervisor","contador"] as const },
  { to: "/perdas", label: "Perdas & Quebras", icon: AlertTriangle, roles: ["admin","supervisor","contador"] as const },
  { to: "/manutencao", label: "Manutenção", icon: Wrench, roles: ["admin","supervisor"] as const },
  { to: "/atividade-fora-turno", label: "Atividade fora do turno", icon: Clock, roles: ["admin","supervisor"] as const },
  { to: "/relatorios", label: "Relatórios", icon: FileText, roles: ["admin","supervisor"] as const },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["admin"] as const },
  { to: "/logs", label: "Logs", icon: ScrollText, roles: ["admin","supervisor"] as const },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] as const },
];

function HomePage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const syncFn = useServerFn(syncFamiliesAndProducts);
  const [ticketOpen, setTicketOpen] = useState(false);

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
    queryKey: ["pending-maintenance-tickets", isSup ? "all" : uid ?? "anon"],
    enabled: !!uid,
    queryFn: async () => {
      let query = supabase
        .from("maintenance_tickets")
        .select("id, title, status, assigned_to, reported_by, created_at")
        .in("status", ["aberto", "em_andamento"])
        .order("created_at", { ascending: false });
      // Admin/supervisor: todos os chamados abertos. Colaborador: só onde ele é o responsável.
      if (!isSup && uid) query = query.eq("assigned_to", uid);
      const { data } = await query;
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
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: checklistsToday } = useQuery({
    queryKey: ["home-checklists-today", todayISO],
    enabled: isSup,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("id, runs:checklist_runs(id, status, run_date)")
        .eq("active", true)
        .eq("runs.run_date", todayISO);
      if (error) throw error;
      let aprovados = 0, aguardando = 0, naoIniciados = 0;
      for (const t of (data ?? []) as Array<{ runs: Array<{ status: string }> }>) {
        const run = (t.runs ?? [])[0];
        if (!run) naoIniciados += 1;
        else if (run.status === "aprovado") aprovados += 1;
        else if (run.status === "aguardando_aprovacao") aguardando += 1;
      }
      return { aprovados, aguardando, naoIniciados };
    },
    refetchOnWindowFocus: true,
  });

  const { data: outOfShift24h } = useQuery({
    queryKey: ["home-out-of-shift-24h"],
    enabled: isSup,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("out_of_shift_activity")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
    refetchOnWindowFocus: true,
  });

  const { data: topWeekly } = useQuery({
    queryKey: ["home-top-weekly"],
    enabled: isSup,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scoring_weekly")
        .select("user_id, full_name, individual_score")
        .order("individual_score", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) throw error;
      const r = (data ?? [])[0] as { full_name?: string | null; individual_score?: number | null } | undefined;
      if (!r || r.individual_score == null) return null;
      return { name: r.full_name ?? "—", score: Number(r.individual_score) };
    },
    refetchOnWindowFocus: false,
  });

  const { data: myChecklistsToday } = useQuery({
    queryKey: ["my-checklists-today", uid, todayISO],
    enabled: !!uid && !isSup,
    queryFn: async () => {
      // 1) Assignments for me today
      const { data: assigns, error: aErr } = await supabase
        .from("checklist_assignments")
        .select("template_id")
        .eq("assignment_date", todayISO)
        .eq("assigned_to", uid!);
      if (aErr) throw aErr;

      let templates: Array<{ id: string; name: string; scheduled_time: string | null }> = [];
      if (assigns && assigns.length > 0) {
        const ids = assigns.map((a) => a.template_id);
        const { data: t, error: tErr } = await supabase
          .from("checklist_templates")
          .select("id, name, scheduled_time")
          .in("id", ids)
          .eq("active", true);
        if (tErr) throw tErr;
        templates = (t ?? []) as typeof templates;
      } else {
        // Fallback: any active template not yet started/approved today
        const { data: t, error: tErr } = await supabase
          .from("checklist_templates")
          .select("id, name, scheduled_time")
          .eq("active", true);
        if (tErr) throw tErr;
        templates = (t ?? []) as typeof templates;
      }
      if (templates.length === 0) return [];

      const { data: runs, error: rErr } = await supabase
        .from("checklist_runs")
        .select("id, template_id, status")
        .eq("run_date", todayISO)
        .in("template_id", templates.map((t) => t.id));
      if (rErr) throw rErr;
      const byTpl = new Map<string, { id: string; status: string }>();
      (runs ?? []).forEach((r) => byTpl.set(r.template_id, { id: r.id, status: r.status as string }));

      return templates
        .filter((t) => {
          const r = byTpl.get(t.id);
          return !r || r.status !== "aprovado";
        })
        .map((t) => ({
          template_id: t.id,
          name: t.name,
          scheduled_time: t.scheduled_time,
          run_id: byTpl.get(t.id)?.id ?? null,
          run_status: byTpl.get(t.id)?.status ?? null,
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


  const firstPendingCloseToken = pendingCloses?.[0]?.approval_token;

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

      {isSup && myTasks && myTasks.length > 0 && (
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

      {!isSup && (() => {
        const now = Date.now();
        type Item = {
          key: string;
          kind: "inventario" | "checklist" | "manutencao";
          title: string;
          deadlineMs: number | null;
          deadlineLabel: string | null;
          overdue: boolean;
          render: () => React.ReactElement;
        };
        const items: Item[] = [];
        (myTasks ?? []).forEach((t) => {
          const dMs = t.deadline_at ? new Date(t.deadline_at).getTime() : null;
          const overdue = dMs != null && dMs < now;
          items.push({
            key: `inv-${t.id}`,
            kind: "inventario",
            title: t.name,
            deadlineMs: dMs,
            deadlineLabel: t.deadline_at ? `Prazo: ${fmtDateTime(t.deadline_at)}` : null,
            overdue,
            render: () => (
              <Link to="/inventarios/$id" params={{ id: t.id }}>
                <Button size="sm">Abrir <ArrowRight className="h-3 w-3 ml-1" /></Button>
              </Link>
            ),
          });
        });
        (myChecklistsToday ?? []).forEach((c) => {
          const dMs = c.scheduled_time ? new Date(`${todayISO}T${c.scheduled_time}`).getTime() : null;
          const overdue = dMs != null && dMs < now && c.run_status !== "aprovado";
          items.push({
            key: `chk-${c.template_id}`,
            kind: "checklist",
            title: c.name,
            deadlineMs: dMs,
            deadlineLabel: c.scheduled_time ? `Hoje às ${c.scheduled_time.slice(0, 5)}` : "Hoje",
            overdue,
            render: () =>
              c.run_id ? (
                <Link to="/checklists/$runId" params={{ runId: c.run_id }}>
                  <Button size="sm">Abrir <ArrowRight className="h-3 w-3 ml-1" /></Button>
                </Link>
              ) : (
                <Link to="/checklists">
                  <Button size="sm">Abrir <ArrowRight className="h-3 w-3 ml-1" /></Button>
                </Link>
              ),
          });
        });
        (pendingMaintenanceTickets ?? []).forEach((t) => {
          items.push({
            key: `mnt-${t.id}`,
            kind: "manutencao",
            title: t.title,
            deadlineMs: new Date(t.created_at).getTime(),
            deadlineLabel: t.status === "aberto" ? "Aberto" : "Em andamento",
            overdue: false,
            render: () => (
              <Link to="/manutencao">
                <Button size="sm">Abrir <ArrowRight className="h-3 w-3 ml-1" /></Button>
              </Link>
            ),
          });
        });
        if (items.length === 0) return null;
        items.sort((a, b) => {
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
          if (a.deadlineMs == null && b.deadlineMs == null) return 0;
          if (a.deadlineMs == null) return 1;
          if (b.deadlineMs == null) return -1;
          return a.deadlineMs - b.deadlineMs;
        });
        const badgeFor = (kind: Item["kind"]) => {
          if (kind === "inventario")
            return { label: "Inventário", Icon: Package, cls: "bg-primary/15 text-primary" };
          if (kind === "checklist")
            return { label: "Checklist", Icon: CheckSquare, cls: "bg-emerald-500/15 text-emerald-600" };
          return { label: "Manutenção", Icon: Wrench, cls: "bg-amber-500/15 text-amber-600" };
        };
        return (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" /> Minhas tarefas de hoje
              </h2>
              <span className="rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5">
                {items.length}
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((it) => {
                const b = badgeFor(it.kind);
                const Icon = b.Icon;
                return (
                  <li
                    key={it.key}
                    className={`rounded-2xl bg-surface border p-3 flex items-center justify-between gap-2 ${
                      it.overdue ? "border-destructive/60" : "border-primary/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 font-semibold ${b.cls}`}>
                          <Icon className="h-3 w-3" /> {b.label}
                        </span>
                        {it.overdue && (
                          <span className="text-[10px] uppercase tracking-wide rounded-full bg-destructive/20 text-destructive px-2 py-0.5 font-semibold">
                            Atrasada
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate mt-1">{it.title}</div>
                      {it.deadlineLabel && (
                        <div className={`text-[11px] ${it.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {it.deadlineLabel}
                        </div>
                      )}
                    </div>
                    {it.render()}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })()}


      {isSup && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" /> Hoje em resumo
          </h2>
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 text-primary" /> Checklists de hoje
                </div>
                {checklistsToday ? (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {checklistsToday.aprovados} aprovado{checklistsToday.aprovados === 1 ? "" : "s"}
                    {" · "}{checklistsToday.aguardando} aguardando
                    {" · "}{checklistsToday.naoIniciados} não iniciado{checklistsToday.naoIniciados === 1 ? "" : "s"}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">Carregando…</div>
                )}
              </div>
              <Link to="/checklists" className="text-xs text-primary hover:underline shrink-0">Ver</Link>
            </div>

            <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" /> Atividade fora do turno
                </div>
                {outOfShift24h && outOfShift24h > 0 ? (
                  <div className="text-xs text-warning mt-0.5">
                    {outOfShift24h} atividade{outOfShift24h === 1 ? "" : "s"} fora do turno nas últimas 24h
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">Tudo dentro do horário ✓</div>
                )}
              </div>
              {outOfShift24h && outOfShift24h > 0 ? (
                <Link to="/atividade-fora-turno" className="text-xs text-primary hover:underline shrink-0">
                  Ver
                </Link>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-1.5">
                  <Wrench className="h-4 w-4 text-primary" /> Manutenção pendente
                </div>
                {pendingMaintenanceTickets && pendingMaintenanceTickets.length > 0 ? (
                  <div className="text-xs text-warning mt-0.5">
                    {pendingMaintenanceTickets.length} chamado{pendingMaintenanceTickets.length === 1 ? "" : "s"} em aberto
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">Nenhum chamado pendente ✓</div>
                )}
              </div>
              {pendingMaintenanceTickets && pendingMaintenanceTickets.length > 0 ? (
                <Link to="/manutencao" className="text-xs text-primary hover:underline shrink-0">Ver</Link>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-1.5">
                  <Inbox className="h-4 w-4 text-primary" /> Pedidos de fechamento
                </div>
                {pendingCloses && pendingCloses.length > 0 ? (
                  <div className="text-xs text-warning mt-0.5">
                    {pendingCloses.length} pedido{pendingCloses.length === 1 ? "" : "s"} aguardando aprovação
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">Nenhum pedido pendente ✓</div>
                )}
              </div>
              {pendingCloses && pendingCloses.length > 0 ? (
                firstPendingCloseToken ? (
                  <Link to="/aprovar/$token" params={{ token: firstPendingCloseToken }} className="text-xs text-primary hover:underline shrink-0">
                    Ver
                  </Link>
                ) : (
                  <Link to="/inventarios" className="text-xs text-primary hover:underline shrink-0">Ver</Link>
                )
              ) : null}
            </div>

            {topWeekly && (
              <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-primary" /> Destaque da semana
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {topWeekly.name} · {topWeekly.score.toFixed(1)}%
                  </div>
                </div>
                <Link to="/ranking" className="text-xs text-primary hover:underline shrink-0">Ver</Link>
              </div>
            )}
          </div>
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

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Manutenção</h2>
        <Button
          onClick={() => setTicketOpen(true)}
          variant="outline"
          className="w-full justify-start rounded-2xl h-auto py-3"
        >
          <Wrench className="h-4 w-4 mr-2 text-primary" />
          <div className="text-left">
            <div className="text-sm font-medium">Reportar problema</div>
            <div className="text-xs text-muted-foreground">Abrir um chamado de manutenção</div>
          </div>
        </Button>
      </section>

      <MaintenanceTicketDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["pending-maintenance-tickets"] })}
      />

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
