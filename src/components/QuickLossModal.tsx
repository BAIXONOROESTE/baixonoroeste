import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { registerLoss } from "@/lib/losses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { X, Search, ChevronLeft } from "lucide-react";

type Product = { id: string; code: string; name: string; unit?: string | null };

export function QuickLossModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [qty, setQty] = useState("");
  const [obs, setObs] = useState("");
  const registerLossFn = useServerFn(registerLoss);

  const { data: results } = useQuery({
    queryKey: ["quick-loss-prod-search", search],
    queryFn: async () => {
      const s = search.trim();
      if (s.length < 2) return [];
      const { data } = await supabase
        .from("products")
        .select("id, code, name, unit")
        .or(`name.ilike.%${s}%,code.ilike.%${s}%,barcode.ilike.%${s}%`)
        .eq("active", true)
        .limit(20);
      return (data ?? []) as Product[];
    },
    enabled: !product && search.trim().length >= 2,
  });

  const { data: reasons } = useQuery({
    queryKey: ["loss-reasons"],
    queryFn: async () =>
      (await supabase.from("loss_reasons").select("*").eq("active", true).order("name")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Selecione um produto.");
      const q = Number(qty.replace(",", "."));
      if (!reasonId || !q) throw new Error("Preencha motivo e quantidade.");
      await registerLossFn({
        data: {
          product_id: product.id,
          reason_id: reasonId,
          quantity: q,
          observation: obs || null,
          count_item_id: null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Perda registrada!");
      qc.invalidateQueries({ queryKey: ["losses"] });
      onClose();
    },
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
          <h3 className="font-display font-semibold">Nova perda</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {!product ? (
          <>
            <div className="relative">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, código ou EAN"
                className="pl-9"
              />
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {search.trim().length < 2 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Digite ao menos 2 caracteres para buscar.
                </p>
              )}
              {search.trim().length >= 2 && (results ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto encontrado.</p>
              )}
              {(results ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProduct(p)}
                  className="w-full text-left rounded-lg border border-border bg-background hover:bg-muted p-3"
                >
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.code}
                    {p.unit ? ` · ${p.unit}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setProduct(null)}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" /> trocar produto
            </button>
            <div className="rounded-lg bg-muted p-3">
              <div className="font-medium text-sm truncate">{product.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {product.code}
                {product.unit ? ` · ${product.unit}` : ""}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Motivo</label>
              <select
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
              >
                <option value="">— selecione —</option>
                {reasons?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Quantidade</label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Observação</label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
            </div>
            <Button
              className="w-full"
              onClick={() => save.mutate()}
              disabled={save.isPending || !reasonId || !qty}
            >
              {save.isPending ? "Salvando..." : "Registrar perda"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
