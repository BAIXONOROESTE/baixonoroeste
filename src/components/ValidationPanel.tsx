import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCcw, Wrench, XCircle } from "lucide-react";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { reviewCountItems, approveInventoryTask, submitRecountOrAdjust } from "@/lib/inventory-flow.functions";
import { RejectInventoryDialog } from "@/components/RejectInventoryDialog";

type Item = {
  id: string;
  product_id: string;
  quantity_before: number;
  quantity_counted: number;
  difference: number | null;
  financial_diff: number | null;
  status: string;
  needs_recount: boolean;
  needs_adjust: boolean;
  round: number;
  product: { name: string; code: string; unit: string | null } | null;
};

export function ValidationPanel({ inventoryId, tolerancePct }: { inventoryId: string; tolerancePct: number }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"divergentes" | "todos" | "aprovados">("divergentes");
  const [decisions, setDecisions] = useState<Record<string, { action: "aprovar" | "recontagem" | "ajuste" | "reprovar"; reason: string }>>({});
  const [bulkReason, setBulkReason] = useState("");
  const [deadline, setDeadline] = useState("");
  const [showReject, setShowReject] = useState(false);
  const reviewFn = useServerFn(reviewCountItems);
  const approveFn = useServerFn(approveInventoryTask);

  const { data: items } = useQuery({
    queryKey: ["validation-items", inventoryId],
    queryFn: async () => {
      const { data } = await supabase.from("count_items")
        .select("id, product_id, quantity_before, quantity_counted, difference, financial_diff, status, needs_recount, needs_adjust, round, product:products(name, code, unit)")
        .eq("inventory_id", inventoryId);
      return (data ?? []) as unknown as Item[];
    },
  });

  const rows = useMemo(() => {
    const all = items ?? [];
    return all.filter((i) => {
      if (filter === "todos") return true;
      const expected = Number(i.quantity_before ?? 0);
      const diff = Number(i.difference ?? 0);
      const pct = expected === 0 ? (diff === 0 ? 0 : 100) : Math.abs((diff / expected) * 100);
      const isDiv = i.status === "divergencia" && pct > tolerancePct;
      if (filter === "divergentes") return isDiv;
      return !isDiv;
    });
  }, [items, filter, tolerancePct]);

  const totalDiff = rows.reduce((a, i) => a + Number(i.financial_diff ?? 0), 0);
  const divCount = rows.filter((i) => i.status === "divergencia").length;

  function decide(id: string, action: "aprovar" | "recontagem" | "ajuste") {
    setDecisions((d) => ({ ...d, [id]: { action, reason: d[id]?.reason ?? "" } }));
  }
  function clearDecision(id: string) {
    setDecisions((d) => { const x = { ...d }; delete x[id]; return x; });
  }
  function bulkApply(action: "aprovar" | "recontagem" | "ajuste") {
    if ((action === "recontagem" || action === "ajuste") && !bulkReason.trim()) {
      toast.error("Informe o motivo para aplicar em massa.");
      return;
    }
    const next = { ...decisions };
    for (const r of rows.filter((x) => x.status === "divergencia")) {
      next[r.id] = { action, reason: bulkReason };
    }
    setDecisions(next);
  }

  async function saveDecisions() {
    const entries = Object.entries(decisions);
    if (!entries.length) { toast.error("Nenhuma decisão registrada."); return; }
    const invalid = entries.find(([, v]) => (v.action === "recontagem" || v.action === "ajuste") && !v.reason.trim());
    if (invalid) { toast.error("Recontagem/ajuste exigem motivo."); return; }
    try {
      await reviewFn({ data: {
        inventory_id: inventoryId,
        decisions: entries.map(([count_item_id, v]) => ({
          count_item_id,
          action: v.action,
          reason: v.reason.trim() || null,
          deadline_at: deadline ? new Date(deadline).toISOString() : null,
        })),
      } });
      toast.success("Decisões registradas e notificações enviadas.");
      setDecisions({});
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar.");
    }
  }

  async function approve() {
    if (!confirm("Aprovar inventário? Todos os itens divergentes precisam já ter decisão.")) return;
    try {
      await approveFn({ data: { inventory_id: inventoryId } });
      toast.success("Inventário aprovado!");
      qc.invalidateQueries();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao aprovar."); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface border border-border p-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted p-2">Divergências: <b>{divCount}</b></div>
        <div className="rounded-lg bg-muted p-2">Δ R$: <b className={totalDiff < 0 ? "text-destructive" : "text-success"}>{fmtMoney(totalDiff)}</b></div>
      </div>

      <div className="flex gap-1 text-xs">
        {(["divergentes", "todos", "aprovados"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded-md border capitalize ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border bg-surface"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-surface border border-border p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Ação em massa (só divergentes)</div>
        <Input placeholder="Motivo (obrigatório p/ recontagem/ajuste)" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} />
        <div className="grid grid-cols-3 gap-1">
          <Button size="sm" variant="outline" onClick={() => bulkApply("aprovar")}>Aprovar todos</Button>
          <Button size="sm" variant="outline" onClick={() => bulkApply("recontagem")}>Recontar</Button>
          <Button size="sm" variant="outline" onClick={() => bulkApply("ajuste")}>Ajustar</Button>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Prazo para nova ação (opcional)</label>
          <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((i) => {
          const expected = Number(i.quantity_before ?? 0);
          const counted = Number(i.quantity_counted);
          const diff = Number(i.difference ?? 0);
          const pct = expected === 0 ? (counted === 0 ? 0 : 100) : (diff / expected) * 100;
          const dec = decisions[i.id];
          return (
            <div key={i.id} className={`rounded-xl border p-3 ${dec ? "border-primary bg-primary/5" : diff === 0 ? "border-border bg-surface" : diff > 0 ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{i.product?.name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{i.product?.code ?? "—"} · round {i.round}</div>
                </div>
                {i.needs_recount && <span className="text-[10px] bg-warning/20 text-warning rounded px-1.5 py-0.5">recontar</span>}
                {i.needs_adjust && <span className="text-[10px] bg-primary/20 text-primary rounded px-1.5 py-0.5">ajustar</span>}
              </div>
              <div className="grid grid-cols-4 gap-1 text-[11px] mt-2">
                <div><div className="text-muted-foreground">Esp.</div><div>{fmtNumber(expected)}</div></div>
                <div><div className="text-muted-foreground">Cont.</div><div>{fmtNumber(counted)}</div></div>
                <div><div className="text-muted-foreground">Δ</div><div className={diff > 0 ? "text-success font-semibold" : diff < 0 ? "text-destructive font-semibold" : ""}>{diff > 0 ? "+" : ""}{fmtNumber(diff)}</div></div>
                <div><div className="text-muted-foreground">%</div><div>{pct.toFixed(1)}%</div></div>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2">
                <Button size="sm" variant={dec?.action === "aprovar" ? "default" : "outline"} onClick={() => decide(i.id, "aprovar")}><CheckCircle2 className="h-3 w-3" /></Button>
                <Button size="sm" variant={dec?.action === "recontagem" ? "default" : "outline"} onClick={() => decide(i.id, "recontagem")}><RefreshCcw className="h-3 w-3" /></Button>
                <Button size="sm" variant={dec?.action === "ajuste" ? "default" : "outline"} onClick={() => decide(i.id, "ajuste")}><Wrench className="h-3 w-3" /></Button>
              </div>
              {dec && (dec.action === "recontagem" || dec.action === "ajuste") && (
                <Input className="mt-2" placeholder="Motivo *" value={dec.reason} onChange={(e) => setDecisions((d) => ({ ...d, [i.id]: { ...d[i.id], reason: e.target.value } }))} />
              )}
              {dec && (
                <button className="text-[10px] text-muted-foreground underline mt-1" onClick={() => clearDecision(i.id)}>limpar decisão</button>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum item neste filtro.</p>}
      </div>

      <div className="space-y-2">
        <Button className="w-full" onClick={saveDecisions} disabled={!Object.keys(decisions).length}>
          Salvar decisões ({Object.keys(decisions).length})
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="destructive" onClick={() => setShowReject(true)}>
            <XCircle className="h-4 w-4 mr-1" /> Recusar
          </Button>
          <Button variant="secondary" onClick={approve}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
          </Button>
        </div>
      </div>

      {showReject && (
        <RejectInventoryDialog
          inventoryId={inventoryId}
          divergentItems={(items ?? []).filter((i) => i.status === "divergencia").map((i) => ({
            id: i.id, product_id: i.product_id,
            quantity_before: Number(i.quantity_before ?? 0),
            quantity_counted: Number(i.quantity_counted),
            difference: Number(i.difference ?? 0),
            product: i.product,
          }))}
          onClose={() => setShowReject(false)}
        />
      )}
    </div>
  );
}

export function RecountAdjustView({ inventoryId }: { inventoryId: string }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const submitFn = useServerFn(submitRecountOrAdjust);

  const { data: items } = useQuery({
    queryKey: ["recount-items", inventoryId],
    queryFn: async () => {
      const { data } = await supabase.from("count_items")
        .select("id, quantity_before, quantity_counted, needs_recount, needs_adjust, reviewer_note, product:products(name, code, unit)")
        .eq("inventory_id", inventoryId)
        .or("needs_recount.eq.true,needs_adjust.eq.true");
      return data ?? [];
    },
  });

  async function submit() {
    const payload = Object.entries(values).map(([count_item_id, v]) => ({
      count_item_id,
      quantity_counted: Number(v.replace(",", ".")),
      notes: notes[count_item_id] ?? null,
    })).filter((x) => !Number.isNaN(x.quantity_counted));
    if (!payload.length) { toast.error("Preencha ao menos um item."); return; }
    try {
      await submitFn({ data: { inventory_id: inventoryId, items: payload } });
      toast.success("Enviado para nova validação!");
      setValues({}); setNotes({});
      qc.invalidateQueries();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar."); }
  }

  if (!items?.length) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum item pendente para você.</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-warning/10 border border-warning/40 p-3 text-xs text-warning-foreground">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>O supervisor solicitou {items.some((i) => i.needs_recount) ? "recontagem" : ""}{items.some((i) => i.needs_recount) && items.some((i) => i.needs_adjust) ? " e " : ""}{items.some((i) => i.needs_adjust) ? "ajuste" : ""} nos itens abaixo.</div>
        </div>
      </div>
      {items.map((i) => (
        <div key={i.id} className="rounded-xl border border-warning/40 bg-surface p-3 space-y-2">
          <div>
            <div className="font-medium text-sm">{(i.product as { name: string })?.name}</div>
            <div className="text-[11px] text-muted-foreground">{(i.product as { code: string })?.code} · esperado {fmtNumber(Number(i.quantity_before))} · contado antes {fmtNumber(Number(i.quantity_counted))}</div>
          </div>
          {i.reviewer_note && <div className="text-xs italic text-muted-foreground">"{i.reviewer_note}"</div>}
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" step="any" placeholder="Nova quantidade" value={values[i.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))} />
            <Input placeholder="Observação (opc.)" value={notes[i.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {i.needs_recount ? "Recontar" : i.needs_adjust ? "Ajustar" : ""}
          </div>
        </div>
      ))}
      <Button className="w-full" onClick={submit}>Enviar para nova validação</Button>
    </div>
  );
}
