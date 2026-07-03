import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [prods, items, sync, losses] = await Promise.all([
        supabase.from("products").select("id, family_name, active").eq("active", true),
        supabase.from("count_items").select("id, status, financial_diff, product_id"),
        supabase.from("sync_log").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("losses").select("id"),
      ]);
      return { prods: prods.data ?? [], items: items.data ?? [], sync: sync.data, losses: losses.data ?? [] };
    },
  });

  const total = data?.prods.length ?? 0;
  const countedIds = new Set((data?.items ?? []).map((i) => i.product_id));
  const counted = countedIds.size;
  const pending = Math.max(0, total - counted);
  const divergencias = (data?.items ?? []).filter((i) => i.status === "divergencia").length;
  const totalDiff = (data?.items ?? []).reduce((a, i) => a + Number(i.financial_diff ?? 0), 0);
  const pct = total ? Math.round((counted / total) * 100) : 0;

  const byFamily: Record<string, number> = {};
  (data?.prods ?? []).forEach((p) => { const f = p.family_name ?? "—"; byFamily[f] = (byFamily[f] ?? 0) + 1; });
  const famData = Object.entries(byFamily).map(([name, v]) => ({ name, v })).slice(0, 8);

  const statusData = [
    { name: "Correto", v: (data?.items ?? []).filter(i => i.status === "correto").length, c: "var(--color-success)" },
    { name: "Divergência", v: divergencias, c: "var(--color-warning)" },
    { name: "Atualizado", v: (data?.items ?? []).filter(i => i.status === "atualizado").length, c: "var(--color-chart-4)" },
    { name: "Justificado", v: (data?.items ?? []).filter(i => i.status === "justificado").length, c: "var(--color-chart-5)" },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Produtos" value={total} />
        <Stat label="Contados" value={counted} />
        <Stat label="Pendentes" value={pending} />
        <Stat label="Divergências" value={divergencias} />
        <Stat label="Δ financeiro" value={fmtMoney(totalDiff)} className="col-span-2" />
        <Stat label="Concluído" value={`${pct}%`} />
        <Stat label="Perdas registradas" value={data?.losses.length ?? 0} />
      </div>
      <div className="text-xs text-muted-foreground text-center">Última sincronização: {fmtDateTime(data?.sync?.started_at)}</div>

      <div className="rounded-2xl bg-surface border border-border p-4">
        <div className="text-sm font-medium mb-2">Produtos por família</div>
        <div className="h-52">
          <ResponsiveContainer>
            <BarChart data={famData}>
              <XAxis dataKey="name" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis fontSize={10} />
              <Tooltip contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }} />
              <Bar dataKey="v" fill="var(--color-primary)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-border p-4">
        <div className="text-sm font-medium mb-2">Status das contagens</div>
        <div className="h-52">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={statusData} dataKey="v" nameKey="name" outerRadius={70} label>
                {statusData.map((s, i) => <Cell key={i} fill={s.c} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface border border-border p-3 ${className}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-display font-semibold">{value}</div>
    </div>
  );
}
