import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/atividade-fora-turno")({ component: AtividadeForaTurnoPage });

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const TIPO_LABEL: Record<string, string> = {
  contagem: "Contagem",
  checklist: "Checklist",
  manutencao: "Manutenção",
};

function AtividadeForaTurnoPage() {
  const { data: me } = useProfile();
  const isSupOrAdmin = me?.role === "admin" || me?.role === "supervisor";

  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [userId, setUserId] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");

  const { data: profiles } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSupOrAdmin,
  });

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["out-of-shift", from, to, userId, tipo],
    queryFn: async () => {
      let q = supabase
        .from("out_of_shift_activity")
        .select("user_id, full_name, tipo, descricao, created_at, motivo")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (userId) q = q.eq("user_id", userId);
      if (tipo) q = q.eq("tipo", tipo);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSupOrAdmin,
  });

  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows ?? []) {
      const k = r.full_name ?? "—";
      if (!m.has(k)) m.set(k, [] as typeof rows);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [rows]);

  if (!isSupOrAdmin) return <div className="p-6 text-muted-foreground">Somente admin ou supervisor.</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-8 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Atividade fora de turno</h1>
      <p className="text-sm text-muted-foreground">
        Ações registradas pelos usuários fora do horário/dia previsto de trabalho. Somente aparece para usuários com escala cadastrada.
      </p>

      <div className="rounded-2xl bg-surface border border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">De</div>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Até</div>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Usuário</div>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
            >
              <option value="">Todos</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Tipo</div>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="contagem">Contagem</option>
              <option value="checklist">Checklist</option>
              <option value="manutencao">Manutenção</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {error && <div className="text-sm text-destructive">Erro ao carregar.</div>}
      {!isLoading && (rows ?? []).length === 0 && (
        <div className="rounded-2xl bg-surface border border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma atividade fora de turno no período.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(([name, items]) => (
          <div key={name} className="rounded-2xl bg-surface border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">{name}</div>
              <div className="text-xs text-muted-foreground">{items!.length} evento{items!.length === 1 ? "" : "s"}</div>
            </div>
            <div className="space-y-1.5">
              {items!.map((r, i) => (
                <div key={i} className="rounded-md border border-border bg-background/40 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{TIPO_LABEL[r.tipo ?? ""] ?? r.tipo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.motivo === "dia_de_folga" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                      {r.motivo === "dia_de_folga" ? "Dia de folga" : "Fora do horário"}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate">{r.descricao}</div>
                  <div className="text-muted-foreground">{r.created_at ? fmtDateTime(r.created_at) : "—"}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
