import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";

export function LossModal({ product_id, count_item_id, presetQuantity, productName, onClose, onDone }: {
  product_id: string;
  count_item_id?: string;
  presetQuantity?: number;
  productName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reasonId, setReasonId] = useState("");
  const [qty, setQty] = useState(presetQuantity != null ? String(presetQuantity) : "");
  const [obs, setObs] = useState("");
  const qc = useQueryClient();
  const locked = presetQuantity != null;

  const { data: reasons } = useQuery({
    queryKey: ["loss-reasons"],
    queryFn: async () => (await supabase.from("loss_reasons").select("*").eq("active", true).order("name")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const q = Number(qty.replace(",", "."));
      if (!reasonId || !q) throw new Error("Preencha motivo e quantidade.");
      const { error } = await supabase.from("losses").insert({
        product_id, count_item_id: count_item_id ?? null, reason_id: reasonId,
        quantity: q, observation: obs || null, created_by: u.user!.id,
      });
      if (error) throw error;
      if (count_item_id) {
        await supabase.from("count_items").update({ status: "justificado" }).eq("id", count_item_id);
      }
      await supabase.from("logs").insert({ user_id: u.user!.id, action: "perda_registrada", entity: "loss", details: { product_id, qtd: q, reason_id: reasonId } });
    },
    onSuccess: () => { toast.success("Perda registrada!"); qc.invalidateQueries(); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 flex items-end sm:items-center justify-center px-3 overflow-y-auto overscroll-contain"
      style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface border border-border p-5 space-y-3 max-h-[100dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-display font-semibold">Registrar perda</h3>
            {productName && <div className="text-xs text-muted-foreground truncate">{productName}</div>}
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        {locked && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="text-xs text-muted-foreground">Quantidade da perda</div>
            <div className="font-semibold text-lg">{presetQuantity}</div>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">Motivo</label>
          <select value={reasonId} onChange={(e) => setReasonId(e.target.value)}
            className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="">— selecione —</option>
            {reasons?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        {!locked && (
          <div>
            <label className="text-xs text-muted-foreground">Quantidade</label>
            <Input type="number" step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">Observação</label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </div>
        <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !reasonId}>
          {save.isPending ? "Salvando" : "Registrar perda"}
        </Button>
      </div>
    </div>
  );
}
