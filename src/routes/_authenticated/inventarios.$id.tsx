import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Camera, Search, CheckCircle2, AlertTriangle, X, Lock, RefreshCw } from "lucide-react";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { closeInventory, pushCountToOmie, syncFamiliesAndProducts } from "@/lib/omie.functions";
import { requestCloseInventory } from "@/lib/close-requests.functions";
import { notifyDivergence } from "@/lib/notify.functions";
import { LossModal } from "@/components/LossModal";
import { useProfile } from "@/hooks/useProfile";


export const Route = createFileRoute("/_authenticated/inventarios/$id")({ component: InventoryDetail });

function InventoryDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [lossFor, setLossFor] = useState<{ product_id: string; count_item_id?: string; presetQuantity?: number; productName?: string } | null>(null);
  const navigate = useNavigate();
  const closeFn = useServerFn(closeInventory);
  const requestCloseFn = useServerFn(requestCloseInventory);
  const pushFn = useServerFn(pushCountToOmie);
  const notifyDivFn = useServerFn(notifyDivergence);
  const syncFn = useServerFn(syncFamiliesAndProducts);
  const { data: profile } = useProfile();


  const { data: inv } = useQuery({
    queryKey: ["inventory", id],
    queryFn: async () => (await supabase.from("inventories").select("*, family:families(name)").eq("id", id).single()).data,
  });

  const { data: items } = useQuery({
    queryKey: ["count-items", id],
    queryFn: async () => (await supabase.from("count_items").select("*, product:products(name, code, unit)").eq("inventory_id", id)).data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ["products-for-inv", inv?.type, inv?.family_id, q.trim()],
    queryFn: async () => {
      const search = q.trim().replace(/[%_,().:]/g, " ").replace(/\s+/g, " ").trim();
      let query = supabase.from("products").select("id, code, barcode, name, family_id, family_name, unit, stock_omie, cost, active");
      if (inv?.type === "familia" && inv?.family_id) query = query.eq("family_id", inv.family_id);
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,barcode.ilike.%${search}%`);
      const { data, error } = await query.order("active", { ascending: false }).order("name").limit(search ? 80 : 200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!inv,
    placeholderData: (previousData) => previousData ?? [],
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.familias} famílias, ${r.produtos} produtos.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização."),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!q.trim()) return products;
    const s = q.toLowerCase().trim();
    return products.filter((p) =>
      p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || (p.barcode ?? "").includes(s)
    );
  }, [products, q]);

  const countedIds = new Set((items ?? []).map((i) => i.product_id));
  const activeProducts = (products ?? []).filter((p) => p.active);
  const progress = activeProducts.length ? Math.round((countedIds.size / activeProducts.length) * 100) : 0;
  const divergencias = (items ?? []).filter((i) => i.status === "divergencia").length;
  const totalDiff = (items ?? []).reduce((acc, i) => acc + Number(i.financial_diff ?? 0), 0);

  const selected = filtered.find((p) => p.id === selectedProduct);

  const closed = inv?.status === "fechado";

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold">{inv?.name}</h1>
        <div className="text-xs text-muted-foreground">
          {inv?.type === "familia" ? `Família: ${inv?.family?.name ?? "—"}` : inv?.type} · {inv?.status}
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-border p-4">
        <div className="flex items-center justify-between text-sm">
          <span>Progresso</span>
          <span className="font-medium">{countedIds.size}/{activeProducts.length} ({progress}%)</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted p-2"><span className="text-muted-foreground">Divergências: </span><b>{divergencias}</b></div>
          <div className="rounded-lg bg-muted p-2"><span className="text-muted-foreground">Δ R$: </span><b className={totalDiff < 0 ? "text-destructive" : ""}>{fmtMoney(totalDiff)}</b></div>
        </div>
      </div>

      {!closed && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, código ou EAN" className="pl-9" />
            </div>
            <Button variant="secondary" onClick={() => setScanning(true)}><Camera className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-1">
            {filtered.map((p) => {
              const item = items?.find((i) => i.product_id === p.id);
              const isDiv = item?.status === "divergencia";
              const isInactive = !p.active;
              const canSeeStock = profile?.role === "admin" || profile?.role === "supervisor" || !!item;
              return (
                <button key={p.id} onClick={() => {
                    if (isInactive) { toast.error("Produto inativo no Omie — não pode ser contado."); return; }
                    setSelectedProduct(p.id);
                  }}
                  className={`w-full text-left rounded-xl border p-3 flex items-center justify-between transition ${
                    isInactive
                      ? "border-destructive/40 bg-destructive/5 text-destructive opacity-90"
                      : isDiv
                        ? "highlight-diff-row border-warning"
                        : item
                          ? "border-success/40 bg-success/5"
                          : "border-border bg-surface"
                  }`}>
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {p.name}
                      {isInactive && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-destructive/15 border border-destructive/30">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className={`text-xs truncate ${isInactive ? "text-destructive/80" : "text-muted-foreground"}`}>
                      {p.code} · {p.family_name ?? "—"}
                      {canSeeStock && !isInactive ? ` · Est.: ${fmtNumber(p.stock_omie)}` : ""}
                    </div>
                  </div>
                  {!isInactive && (item && (item.status === "correto" || item.status === "atualizado")
                    ? <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    : isDiv ? <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" /> : null)}
                </button>
              );
            })}
            {products?.length === 0 && (
              <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 text-sm">
                <div>
                  <div className="font-medium">
                    {q.trim() ? "Nenhum produto encontrado" : inv?.type === "familia" ? "Sem produtos nessa família" : "Catálogo Omie vazio"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {q.trim() ? "Tente buscar por outro nome, código ou EAN." : profile?.role === "admin" ? "Sincronize o Omie para carregar os produtos." : "Peça para um admin sincronizar o Omie."}
                  </div>
                </div>
                {!q.trim() && profile?.role === "admin" && (
                  <Button className="w-full" onClick={() => sync.mutate()} disabled={sync.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
                    {sync.isPending ? "Sincronizando" : "Sincronizar Omie"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {closed && (
        <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Lock className="h-4 w-4" /> Inventário fechado. Somente leitura.
        </div>
      )}

      {selectedProduct && selected && !closed && (
        <CountForm
          product={selected}
          inventoryId={id}
          currentItem={items?.find((i) => i.product_id === selectedProduct) as never}
          blind={profile?.role === "contador"}
          canRegisterLoss={profile?.role === "admin" || profile?.role === "supervisor"}
          onClose={() => setSelectedProduct(null)}
          onSaved={async (item_id, status) => {
            qc.invalidateQueries({ queryKey: ["count-items", id] });
            if (settings?.omie_update_mode === "imediato") {
              try { await pushFn({ data: { count_item_id: item_id } }); qc.invalidateQueries({ queryKey: ["count-items", id] }); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao atualizar Omie."); }
            }
            if (status === "divergencia") {
              notifyDivFn({ data: { inventory_id: id } }).catch((e) => console.warn("notifyDivergence:", e));
            }
          }}

          onOpenLoss={(count_item_id, presetQuantity) => setLossFor({ product_id: selected.id, count_item_id, presetQuantity, productName: selected.name })}
        />

      )}

      {scanning && <BarcodeScanner onClose={() => setScanning(false)} onScan={(code) => {
        setScanning(false);
        const p = products?.find((p) => p.barcode === code || p.code === code);
        if (!p) { toast.error(`Produto não encontrado: ${code}`); return; }
        if (!p.active) { toast.error(`Produto inativo no Omie: ${p.name}`); return; }
        setSelectedProduct(p.id);
      }} />}

      {lossFor && <LossModal {...lossFor} onClose={() => setLossFor(null)} onDone={() => { setLossFor(null); qc.invalidateQueries(); }} />}

      {!closed && (
        <div className="pt-2">
          <Button className="w-full" variant="default"
            onClick={async () => {
              const isSup = profile?.role === "admin" || profile?.role === "supervisor";
              const pushToOmie = settings?.omie_update_mode === "encerramento";
              const modeText = isSup
                ? (pushToOmie ? "Isso vai empurrar TODAS as divergências para o Omie. Continuar?" : "Fechar inventário?")
                : "Enviar pedido de fechamento para o supervisor/admin por e-mail?";
              if (!confirm(modeText)) return;
              try {
                if (isSup) {
                  await closeFn({ data: { inventory_id: id, push_to_omie: pushToOmie } });
                  toast.success("Inventário fechado!");
                  qc.invalidateQueries();
                  navigate({ to: "/inventarios" });
                } else {
                  const r = await requestCloseFn({ data: { inventory_id: id, push_to_omie: pushToOmie } });
                  toast.success(`Pedido enviado (${r.sent}/${r.targets} notificações).`);
                }
              } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao fechar."); }
            }}>
            <Lock className="h-4 w-4 mr-2" /> {profile?.role === "contador" ? "Pedir fechamento" : "Fechar inventário"}
          </Button>
        </div>
      )}

    </div>
  );
}

function CountForm({ product, inventoryId, currentItem, blind, canRegisterLoss, onClose, onSaved, onOpenLoss }: {
  product: { id: string; name: string; code: string; family_name: string | null; unit: string | null; stock_omie: number; cost: number };
  inventoryId: string;
  currentItem: { id: string; quantity_counted: number; difference: number; financial_diff: number; status: string } | undefined;
  blind: boolean;
  canRegisterLoss: boolean;
  onClose: () => void;
  onSaved: (count_item_id: string, status: "correto" | "divergencia") => void;
  onOpenLoss: (count_item_id: string | undefined, presetQuantity?: number) => void;
}) {

  const [qty, setQty] = useState(currentItem ? String(currentItem.quantity_counted) : "");
  const [saving, setSaving] = useState(false);
  // Depois de salvar, revelamos o resultado mesmo no modo às cegas.
  const [revealed, setRevealed] = useState<null | { diff: number; finDiff: number; status: string }>(null);
  // Só escondemos estoque/diferença enquanto o item ainda NÃO foi salvo nesta sessão.
  const hideStock = blind && !currentItem && !revealed;

  async function save() {
    const q = Number(qty.replace(",", "."));
    if (Number.isNaN(q)) { toast.error("Quantidade inválida"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const stock = Number(product.stock_omie);
    const status: "correto" | "divergencia" = q === stock ? "correto" : "divergencia";
    const payload = {
      inventory_id: inventoryId, product_id: product.id, counted_by: u.user!.id,
      quantity_before: stock, quantity_counted: q, unit_cost: Number(product.cost), status,
    };
    const { data, error } = await supabase.from("count_items").upsert(payload, { onConflict: "inventory_id,product_id" }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await supabase.from("logs").insert({ user_id: u.user!.id, action: "contagem_salva", entity: "count_item", details: { id: data.id, produto: product.name, qtd: q, status } });
    toast.success("Contagem salva!");
    const diff = q - stock;
    setRevealed({ diff, finDiff: diff * Number(product.cost), status });
    onSaved(data.id, status);
  }

  const qNum = Number(qty.replace(",", ".")) || 0;
  const diff = revealed ? revealed.diff : qNum - Number(product.stock_omie);
  const finDiff = revealed ? revealed.finDiff : diff * Number(product.cost);
  const showDiff = !!revealed || (!blind && qty !== "");

  return (
    <div className="fixed inset-0 z-40 bg-background/95 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface border border-border p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-lg truncate">{product.name}</h3>
            <div className="text-xs text-muted-foreground">{product.code} · {product.family_name ?? "—"}</div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted p-2">
            <div className="text-xs text-muted-foreground">Estoque atual</div>
            <div className="font-semibold">
              {hideStock ? "•••" : `${fmtNumber(product.stock_omie)} ${product.unit ?? ""}`}
            </div>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <div className="text-xs text-muted-foreground">Custo unit.</div>
            <div className="font-semibold">{fmtMoney(product.cost)}</div>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Quantidade contada</label>
          <Input type="number" step="any" inputMode="decimal" autoFocus value={qty} onChange={(e) => { setQty(e.target.value); if (revealed) setRevealed(null); }} className="text-2xl h-14 text-center" disabled={!!revealed} />
        </div>
        {showDiff && (
          <div className={`rounded-lg p-3 text-sm ${diff === 0 ? "bg-success/15 text-success" : "highlight-diff-cell"}`}>
            {diff === 0 ? "✓ Bate com o estoque" : (
              <>Diferença: <b>{diff > 0 ? "+" : ""}{fmtNumber(diff)}</b> · {fmtMoney(finDiff)}</>
            )}
          </div>
        )}
        {blind && !revealed && qty !== "" && (
          <div className="text-xs text-muted-foreground text-center">Contagem às cegas — o resultado aparece depois de salvar.</div>
        )}
        <div className="flex gap-2">
          {!revealed ? (
            <Button className="flex-1" onClick={save} disabled={saving}>{saving ? "Salvando" : "Salvar"}</Button>
          ) : (
            <Button className="flex-1" onClick={onClose}>Fechar</Button>
          )}
          {!revealed && canRegisterLoss && (
            <Button variant="outline" onClick={() => onOpenLoss(currentItem?.id)}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Perda
            </Button>
          )}

        </div>
      </div>
    </div>
  );
}
