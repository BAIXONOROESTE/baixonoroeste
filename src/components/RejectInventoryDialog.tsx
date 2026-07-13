import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, AlertTriangle } from "lucide-react";
import { fmtNumber } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { rejectInventoryTask } from "@/lib/inventory-flow.functions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface DivergentItem {
  id: string;
  product_id: string;
  quantity_before: number;
  quantity_counted: number;
  difference: number | null;
  product: { name: string; code: string } | null;
}

export function RejectInventoryDialog({ inventoryId, divergentItems, onClose }: {
  inventoryId: string;
  divergentItems: DivergentItem[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const rejectFn = useServerFn(rejectInventoryTask);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(divergentItems.map((i) => i.product_id)));
  const [saving, setSaving] = useState(false);

  function toggle(pid: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
  }
  function toggleAll() {
    if (selected.size === divergentItems.length) setSelected(new Set());
    else setSelected(new Set(divergentItems.map((i) => i.product_id)));
  }

  async function submit() {
    if (!reason.trim()) { toast.error("Motivo é obrigatório."); return; }
    if (selected.size === 0) { toast.error("Selecione ao menos um produto para recontagem."); return; }
    setSaving(true);
    try {
      await rejectFn({ data: {
        inventory_id: inventoryId,
        reason: reason.trim(),
        notes: notes.trim() || null,
        recount_deadline: deadline ? new Date(deadline).toISOString() : null,
        product_ids: Array.from(selected),
      } });
      toast.success("Inventário recusado. Colaborador notificado.");
      qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao recusar.");
    } finally { setSaving(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 flex items-end sm:items-center justify-center overflow-auto overscroll-contain"
      style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface border border-border p-5 space-y-3 max-h-[100dvh] overflow-auto"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-display font-semibold text-lg">Recusar inventário</h3>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div>
          <label className="text-xs font-medium">Motivo da recusa *</label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: divergências acima do aceitável; contagem inconsistente…" maxLength={1000} />
        </div>

        <div>
          <label className="text-xs font-medium">Observações (opc.)</label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </div>

        <div>
          <label className="text-xs font-medium">Prazo para recontagem (opc.)</label>
          <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium">Produtos para recontar *</label>
            <button className="text-[11px] underline text-muted-foreground" onClick={toggleAll} type="button">
              {selected.size === divergentItems.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <div className="rounded-lg border border-border max-h-56 overflow-auto divide-y divide-border">
            {divergentItems.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground text-center">Nenhum item divergente detectado.</div>
            )}
            {divergentItems.map((i) => (
              <label key={i.id} className="flex items-center gap-2 p-2 text-xs cursor-pointer hover:bg-muted">
                <input type="checkbox" checked={selected.has(i.product_id)} onChange={() => toggle(i.product_id)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.product?.name ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {i.product?.code} · esperado {fmtNumber(i.quantity_before)} · contado {fmtNumber(i.quantity_counted)} · Δ {fmtNumber(Number(i.difference ?? 0))}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">{selected.size} selecionado(s)</div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="destructive" className="flex-1" onClick={submit} disabled={saving || !reason.trim() || selected.size === 0}>
            {saving ? "Enviando…" : "Recusar inventário"}
          </Button>
        </div>
      </div>
    </div>
  );
}
