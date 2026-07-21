import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

type TemplateRow = {
  id: string;
  name: string;
  scheduled_time: string | null;
  runs: RunSummary[];
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
  const role = profile?.role ?? "contador";
  const canReview = role === "admin" || role === "supervisor";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const todayISO = todayLocalISO();

  const todayQuery = useQuery({
    queryKey: ["checklists", "today", todayISO],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select(
          `id, name, scheduled_time,
           runs:checklist_runs(id, status, started_by, run_date, items:checklist_run_items(id, done))`,
        )
        .eq("active", true)
        .eq("runs.run_date", todayISO);
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        scheduled_time: t.scheduled_time,
        runs: (t.runs ?? []) as RunSummary[],
      }));
    },
  });

  const pendingQuery = useQuery({
    queryKey: ["checklists", "pending-review"],
    enabled: canReview,
    queryFn: async (): Promise<PendingReview[]> => {
      const { data, error } = await supabase
        .from("checklist_runs")
        .select(
          `id, run_date, status,
           template:checklist_templates(name),
           starter:profiles!checklist_runs_started_by_fkey(full_name)`,
        )
        .eq("status", "aguardando_aprovacao")
        .order("run_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PendingReview[];
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

          let badge: { label: string; className: string } | null = null;
          let action: React.ReactNode = null;

          if (!run) {
            if (isNowWindow) badge = { label: "Agora", className: "bg-primary text-primary-foreground" };
            action = (
              <Button size="sm" disabled={startRun.isPending} onClick={() => startRun.mutate(t.id)}>
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
                  <span className="text-sm font-mono text-muted-foreground w-12 shrink-0">
                    {t.scheduled_time ? t.scheduled_time.slice(0, 5) : "—"}
                  </span>
                  <span className="font-medium truncate">{t.name}</span>
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
    </div>
  );
}
