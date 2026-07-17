import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ranking")({ component: Ranking });

type Period = "monthly" | "weekly";
type Mode = "team" | "individual";

function Ranking() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [mode, setMode] = useState<Mode>("individual");

  // team_scoring_weekly não existe ainda — força individual no semanal.
  const teamWeeklyDisabled = period === "weekly";
  const effectiveMode: Mode = teamWeeklyDisabled && mode === "team" ? "individual" : mode;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-3 pb-8">
      <h1 className="text-2xl font-display font-semibold">Ranking</h1>

      <div className="grid grid-cols-2 gap-2">
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={[
            { value: "monthly", label: "Mensal" },
            { value: "weekly", label: "Semanal" },
          ]}
        />
        <Segmented
          value={effectiveMode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { value: "individual", label: "Individual" },
            { value: "team", label: "Por equipe", disabled: teamWeeklyDisabled },
          ]}
        />
      </div>

      {effectiveMode === "team" ? (
        <TeamRanking period={period} />
      ) : (
        <IndividualRanking period={period} />
      )}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <div className="flex rounded-xl bg-surface border border-border p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            className={`flex-1 text-xs h-8 rounded-lg transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            } ${o.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IndividualRanking({ period }: { period: Period }) {
  const view = period === "monthly" ? "scoring_monthly" : "scoring_weekly";
  const { data } = useQuery({
    queryKey: ["ranking-individual", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(view)
        .select("*")
        .order("individual_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!data?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sem contagens ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((r, i) => {
        const score = Number(r.individual_score ?? 0);
        const top = score >= 90;
        const periodLabel = period === "monthly" ? "Mês" : "Semana";
        const periodValue = (period === "monthly" ? (r as { month?: string }).month : (r as { week?: string }).week) ?? "";
        return (
          <div
            key={`${r.user_id}-${periodValue}`}
            className={`rounded-2xl border p-4 ${top ? "border-primary bg-primary/10 glow-primary" : "border-border bg-surface"}`}
          >
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full grid place-items-center font-semibold ${top ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.team_name ?? "Sem equipe"} · {periodLabel}: {String(periodValue).slice(0, 10)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-display font-semibold flex items-center gap-1 justify-end">
                  {top && <Trophy className="h-4 w-4 text-primary" />}
                  {score.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Acertos {Number(r.accuracy_pct ?? 0).toFixed(1)}%
                  {r.ontime_pct != null ? ` · Prazo ${Number(r.ontime_pct).toFixed(1)}%` : ""}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamRanking({ period }: { period: Period }) {
  // Só existe team_scoring_monthly por enquanto.
  const { data } = useQuery({
    queryKey: ["ranking-team", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_scoring_monthly")
        .select("*")
        .order("team_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: period === "monthly",
  });

  if (period !== "monthly") {
    return <p className="text-sm text-muted-foreground text-center py-8">Ranking semanal por equipe ainda não disponível.</p>;
  }

  if (!data?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sem dados de equipe ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((r, i) => {
        const score = Number(r.team_score ?? 0);
        const top = score >= 90;
        return (
          <div
            key={`${r.team_id}-${r.month}`}
            className={`rounded-2xl border p-4 ${top ? "border-primary bg-primary/10 glow-primary" : "border-border bg-surface"}`}
          >
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full grid place-items-center font-semibold ${top ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.team_name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.members_count} membro{Number(r.members_count) === 1 ? "" : "s"} · Mês: {String(r.month ?? "").slice(0, 10)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-display font-semibold flex items-center gap-1 justify-end">
                  {top && <Trophy className="h-4 w-4 text-primary" />}
                  {score.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
