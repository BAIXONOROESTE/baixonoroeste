import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/checklists/")({
  head: () => ({ meta: [{ title: "Checklists · Baixo Noroeste" }] }),
  component: ChecklistsPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">Erro ao carregar checklists</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTodayHeader(): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return `HOJE — ${s}`;
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

type RunSummary = {
  id: string;
  status: "em_andamento" | "aguardando_aprovacao" | "aprovado" | "reprovado";
  started_by: string;
  items: { id: string; done: boolean }[];
};


type Assignment = {
  id: string;
  assigned_to: string;
  assignee: { full_name: string | null } | null;
};

type RecurringAssignee = {
  userIds: string[];
  names: string[];
};

type ExpectedByShift = {
  userIds: string[];
  names: string[];
};

type TemplateRow = {
  id: string;
  name: string;
  scheduled_time: string | null;
  runs: RunSummary[];
  assignments: Assignment[];
  recurring: RecurringAssignee | null;
  expectedByShift: ExpectedByShift | null;
};



type PendingReview = {
  id: string;
  run_date: string;
  status: string;
  template: { name: string } | null;
  starter: { full_name: string | null } | null;
};

function ChecklistsPage() {
  const { data: profile } = useProfile();
  const uid = profile?.id ?? null;
  const role = profile?.role ?? "contador";
  const canReview = role === "admin" || role === "supervisor";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const todayISO = todayLocalISO();

  const [assignmentPrompt, setAssignmentPrompt] = useState<{
    templateId: string;
    expectedName: string;
  } | null>(null);

  const todayQuery = useQuery({
    queryKey: ["checklists", "today", todayISO],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select(
          `id, name, scheduled_time,
           runs:checklist_runs(id, status, started_by, run_date, items:checklist_run_items(id, done)),
           assignments:checklist_assignments(id, assigned_to, assignment_date),
           recurring:checklist_recurring_assignments(user_id, team_id)`,
        )
        .eq("active", true)
        .eq("runs.run_date", todayISO)
        .eq("assignments.assignment_date", todayISO);
      if (error) throw error;

      const assignedIds = new Set<string>();
      const recurringUserIds = new Set<string>();
      const recurringTeamIds = new Set<string>();
      for (const t of (data ?? []) as any[]) {
        for (const a of (t.assignments ?? [])) assignedIds.add(a.assigned_to as string);
        const rec = (t.recurring ?? [])[0];
        if (rec?.user_id) recurringUserIds.add(rec.user_id as string);
        if (rec?.team_id) recurringTeamIds.add(rec.team_id as string);
      }

      // Recorrente pessoa: só vale se trabalha hoje.
      const worksToday: Record<string, boolean> = {};
      await Promise.all(
        Array.from(recurringUserIds).map(async (u) => {
          const { data: ok, error: fnErr } = await supabase.rpc("person_works_on_date", {
            p_user_id: u,
            p_check_date: todayISO,
          });
          if (fnErr) throw fnErr;
          worksToday[u] = !!ok;
        }),
      );

      // Recorrente equipe: expandir membros que trabalham hoje.
      const teamMembers: Record<string, string[]> = {};
      await Promise.all(
        Array.from(recurringTeamIds).map(async (tid) => {
          const { data: ids, error: teamErr } = await supabase.rpc("expected_team_assignees", {
            p_team_id: tid,
            p_check_date: todayISO,
          });
          if (teamErr) throw teamErr;
          teamMembers[tid] = ((ids ?? []) as any[]).map((r) => r.user_id as string);
        }),
      );

      // 3ª prioridade: descobrir esperado por turno para templates sem manual/recorrente ativo.
      const needsShiftLookup = (data ?? []).filter((t: any) => {
        if (!t.scheduled_time) return false;
        if ((t.assignments ?? []).length > 0) return false;
        const rec = (t.recurring ?? [])[0];
        if (rec?.user_id && worksToday[rec.user_id]) return false;
        if (rec?.team_id && (teamMembers[rec.team_id]?.length ?? 0) > 0) return false;
        return true;
      });
      const shiftIdsPerTemplate: Record<string, string[]> = {};
      await Promise.all(
        needsShiftLookup.map(async (t: any) => {
          const { data: ids, error: rpcErr } = await supabase.rpc(
            "expected_checklist_assignees",
            { p_template_id: t.id, p_check_date: todayISO },
          );
          if (rpcErr) throw rpcErr;
          shiftIdsPerTemplate[t.id] = ((ids ?? []) as any[]).map((r) => r.user_id as string);
        }),
      );

      // Coletar todos os ids para uma busca única de nomes.
      const allIds = new Set<string>();
      for (const u of assignedIds) allIds.add(u);
      for (const u of recurringUserIds) if (worksToday[u]) allIds.add(u);
      for (const uids of Object.values(teamMembers)) for (const u of uids) allIds.add(u);
      for (const uids of Object.values(shiftIdsPerTemplate)) for (const u of uids) allIds.add(u);
      const namesById: Record<string, string | null> = {};
      if (allIds.size > 0) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", Array.from(allIds));
        if (profErr) throw profErr;
        for (const p of profs ?? []) namesById[p.id as string] = p.full_name as string | null;
      }

      const expectedByTemplate: Record<string, ExpectedByShift | null> = {};
      for (const [tid, uids] of Object.entries(shiftIdsPerTemplate)) {
        expectedByTemplate[tid] = uids.length === 0
          ? null
          : { userIds: uids, names: uids.map((u) => namesById[u] ?? "").filter(Boolean) };
      }

      return (data ?? []).map((t: any) => {
        const rec = (t.recurring ?? [])[0];
        let recurring: RecurringAssignee | null = null;
        if (rec?.user_id && worksToday[rec.user_id]) {
          recurring = {
            userIds: [rec.user_id],
            names: [namesById[rec.user_id] ?? ""].filter(Boolean),
          };
        } else if (rec?.team_id) {
          const uids = teamMembers[rec.team_id] ?? [];
          if (uids.length > 0) {
            recurring = {
              userIds: uids,
              names: uids.map((u) => namesById[u] ?? "").filter(Boolean),
            };
          }
        }
        return {
          id: t.id,
          name: t.name,
          scheduled_time: t.scheduled_time,
          runs: (t.runs ?? []) as RunSummary[],
          assignments: (t.assignments ?? []).map((a: any) => ({
            ...a,
            assignee: { full_name: namesById[a.assigned_to] ?? null },
          })) as Assignment[],
          recurring,
          expectedByShift: expectedByTemplate[t.id] ?? null,
        };
      });
    },
  });


  const avgTimesQuery = useQuery({
    queryKey: ["checklists", "avg-times"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("checklist_runs")
        .select("template_id, created_at, submitted_at")
        .eq("status", "aprovado")
        .not("submitted_at", "is", null);
      if (error) throw error;
      const acc: Record<string, { sum: number; n: number }> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.submitted_at || !r.created_at) continue;
        const ms = new Date(r.submitted_at).getTime() - new Date(r.created_at).getTime();
        if (!Number.isFinite(ms) || ms <= 0) continue;
        const key = r.template_id as string;
        acc[key] ??= { sum: 0, n: 0 };
        acc[key].sum += ms;
        acc[key].n += 1;
      }
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(acc)) {
        if (v.n >= 3) result[k] = Math.round(v.sum / v.n / 60000);
      }
      return result;
    },
  });



  const pendingQuery = useQuery({
    queryKey: ["checklists", "pending-review"],
    enabled: canReview,
    queryFn: async (): Promise<PendingReview[]> => {
      const { data, error } = await supabase
        .from("checklist_runs")
        .select(
          `id, run_date, status, started_by,
           template:checklist_templates(name)`,
        )
        .eq("status", "aguardando_aprovacao")
        .order("run_date", { ascending: false });
      if (error) throw error;

      const starterIds = Array.from(new Set((data ?? []).map((r: any) => r.started_by as string)));
      const namesById: Record<string, string | null> = {};
      if (starterIds.length > 0) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", starterIds);
        if (profErr) throw profErr;
        for (const p of profs ?? []) namesById[p.id as string] = p.full_name as string | null;
      }

      return (data ?? []).map((r: any) => ({
        ...r,
        starter: { full_name: namesById[r.started_by] ?? null },
      })) as unknown as PendingReview[];
    },
  });

  const startRun = useMutation({
    mutationFn: async (templateId: string) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sem usuário autenticado.");

      const { data: run, error: runErr } = await supabase
        .from("checklist_runs")
        .insert({
          template_id: templateId,
          run_date: todayISO,
          started_by: uid,
          status: "em_andamento",
        })
        .select("id")
        .single();
      if (runErr) throw runErr;

      const { data: items, error: itemsErr } = await supabase
        .from("checklist_template_items")
        .select("id")
        .eq("template_id", templateId)
        .order("position", { ascending: true });
      if (itemsErr) throw itemsErr;

      if (items && items.length > 0) {
        const rows = items.map((i) => ({
          run_id: run.id,
          template_item_id: i.id,
          done: false,
          review_status: "pendente" as const,
        }));
        const { error: insErr } = await supabase.from("checklist_run_items").insert(rows);
        if (insErr) throw insErr;
      }

      return run.id as string;
    },
    onSuccess: (runId) => {
      toast.success("Checklist iniciado");
      queryClient.invalidateQueries({ queryKey: ["checklists", "today", todayISO] });
      navigate({ to: "/checklists/$runId", params: { runId } });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Erro ao iniciar checklist");
    },
  });

  const templates = (todayQuery.data ?? []).slice().sort((a, b) => {
    const ta = timeToMinutes(a.scheduled_time);
    const tb = timeToMinutes(b.scheduled_time);
    if (ta === null && tb === null) return a.name.localeCompare(b.name);
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb || a.name.localeCompare(b.name);
  });

  const nowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold capitalize">{formatTodayHeader()}</h1>
          <p className="text-sm text-muted-foreground">Checklists de rotina do dia.</p>
        </div>
        {canReview && (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/checklists/admin">
              <Settings className="h-4 w-4 mr-1.5" /> Gerenciar checklists
            </Link>
          </Button>
        )}
      </div>

      {canReview && (pendingQuery.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Aguardando minha aprovação</h2>
          <div className="space-y-2">
            {pendingQuery.data!.map((r) => (
              <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.template?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.starter?.full_name ?? "—"} · {r.run_date}
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/checklists/$runId" params={{ runId: r.id }}>Ver</Link>
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {todayQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {todayQuery.isError && (
          <p className="text-sm text-destructive">Erro: {(todayQuery.error as Error).message}</p>
        )}
        {!todayQuery.isLoading && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum checklist ativo.</p>
        )}
        {templates.map((t) => {
          const run = t.runs[0] ?? null;
          const total = run?.items.length ?? 0;
          const done = run?.items.filter((i) => i.done).length ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const sched = timeToMinutes(t.scheduled_time);
          const isNowWindow =
            !run &&
            sched !== null &&
            nowMinutes >= sched - 30 &&
            nowMinutes <= sched + 120;
          const assignment = t.assignments[0] ?? null;
          let expectedUserIds: string[] = [];
          let expectedName: string | null = null;
          if (assignment) {
            expectedUserIds = [assignment.assigned_to];
            expectedName = assignment.assignee?.full_name ?? null;
          } else if (t.recurring) {
            expectedUserIds = [t.recurring.user_id];
            expectedName = t.recurring.assignee?.full_name ?? null;
          } else if (t.expectedByShift && t.expectedByShift.userIds.length > 0) {
            expectedUserIds = t.expectedByShift.userIds;
            expectedName = t.expectedByShift.names.length > 0
              ? t.expectedByShift.names.join(" ou ")
              : null;
          }
          const avgMin = avgTimesQuery.data?.[t.id];

          let badge: { label: string; className: string } | null = null;
          let action: React.ReactNode = null;

          const handleStart = () => {
            if (
              expectedUserIds.length > 0 &&
              uid &&
              !expectedUserIds.includes(uid) &&
              expectedName
            ) {
              setAssignmentPrompt({ templateId: t.id, expectedName });
              return;
            }
            startRun.mutate(t.id);
          };


          if (!run) {
            if (isNowWindow) badge = { label: "Agora", className: "bg-primary text-primary-foreground" };
            action = (
              <Button size="sm" disabled={startRun.isPending} onClick={handleStart}>
                Iniciar
              </Button>
            );
          } else if (run.status === "em_andamento") {
            action = (
              <Button asChild size="sm">
                <Link to="/checklists/$runId" params={{ runId: run.id }}>Continuar</Link>
              </Button>
            );
          } else if (run.status === "aguardando_aprovacao") {
            badge = { label: "Aguardando aprovação", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
            action = (
              <Button asChild size="sm" variant="outline">
                <Link to="/checklists/$runId" params={{ runId: run.id }}>Ver</Link>
              </Button>
            );
          } else if (run.status === "aprovado") {
            badge = { label: "Finalizado", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
            action = (
              <Button asChild size="sm" variant="outline">
                <Link to="/checklists/$runId" params={{ runId: run.id }}>Ver</Link>
              </Button>
            );
          } else if (run.status === "reprovado") {
            badge = { label: "Reprovado", className: "bg-destructive/15 text-destructive border-destructive/30" };
            action = (
              <Button asChild size="sm" variant="outline">
                <Link to="/checklists/$runId" params={{ runId: run.id }}>Ver</Link>
              </Button>
            );
          }

          return (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 shrink-0 leading-tight">
                    <div className="text-sm font-mono text-muted-foreground">
                      {t.scheduled_time ? t.scheduled_time.slice(0, 5) : "—"}
                    </div>
                    {typeof avgMin === "number" && (
                      <div className="text-[10px] text-muted-foreground">
                        ~{avgMin} min
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    {expectedName && (
                      <div className="text-xs text-muted-foreground truncate">
                        Esperado: {expectedName}
                      </div>
                    )}
                  </div>
                </div>
                {badge && (
                  <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                )}
              </div>
              <div className="space-y-1">
                <Progress value={pct} className="h-2" />
                <div className="text-xs text-muted-foreground">{done}/{total} itens</div>
              </div>
              <div className="flex justify-end">{action}</div>
            </Card>
          );
        })}
      </section>

      <AlertDialog
        open={!!assignmentPrompt}
        onOpenChange={(v) => {
          if (!v) setAssignmentPrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir responsável?</AlertDialogTitle>
            <AlertDialogDescription>
              Este checklist estava atribuído a {assignmentPrompt?.expectedName}. Confirma que vai fazer no lugar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (assignmentPrompt) {
                  startRun.mutate(assignmentPrompt.templateId);
                }
                setAssignmentPrompt(null);
              }}
            >
              Sim, fazer agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
