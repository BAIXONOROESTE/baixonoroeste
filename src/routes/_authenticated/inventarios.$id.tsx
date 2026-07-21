import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Camera, Search, CheckCircle2, AlertTriangle, X, Lock, Unlock, RefreshCw, ArrowLeft, Save, Check } from "lucide-react";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { closeInventory, pushCountToOmie, reopenInventory, syncFamiliesAndProducts } from "@/lib/omie.functions";
import { requestCloseInventory, respondCloseRequest } from "@/lib/close-requests.functions";
import { notifyDivergence } from "@/lib/notify.functions";
import { LossModal } from "@/components/LossModal";
import { useProfile } from "@/hooks/useProfile";
import { ValidationPanel, RecountAdjustView } from "@/components/ValidationPanel";
import { submitForValidation } from "@/lib/inventory-flow.functions";
import { useOfflineCountQueue } from "@/hooks/useOfflineCountQueue";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CloudOff, RefreshCw as SyncIcon } from "lucide-react";
import { DeleteInventoryButton } from "@/components/DeleteInventoryButton";
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



export const Route = createFileRoute("/_authenticated/inventarios/$id")({ component: InventoryDetail });

function InventoryDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [scanning, setScanning] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [lossFor, setLossFor] = useState<{ product_id: string; count_item_id?: string; presetQuantity?: number; productName?: string } | null>(null);
  const navigate = useNavigate();
  const closeFn = useServerFn(closeInventory);
  const requestCloseFn = useServerFn(requestCloseInventory);
  const respondCloseFn = useServerFn(respondCloseRequest);
  const reopenFn = useServerFn(reopenInventory);
  const pushFn = useServerFn(pushCountToOmie);
  const notifyDivFn = useServerFn(notifyDivergence);
  const syncFn = useServerFn(syncFamiliesAndProducts);
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [respondBusy, setRespondBusy] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [recountItemId, setRecountItemId] = useState<string | null>(null);
  const [quickBusyId, setQuickBusyId] = useState<string | null>(null);

  async function handleQuickAccept(countItemId: string) {
    setQuickBusyId(countItemId);
    try {
      await pushFn({ data: { count_item_id: countItemId } });
      toast.success("Ajuste enviado à Omie.");
      qc.invalidateQueries({ queryKey: ["count-items", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar à Omie.");
    } finally {
      setQuickBusyId(null);
    }
  }

  async function handleConfirmRecount() {
    if (!recountItemId) return;
    const targetId = recountItemId;
    setRecountItemId(null);
    try {
      const { error } = await supabase
        .from("count_items")
        .update({ quantity_counted: null, status: "pendente", difference: null, financial_diff: null })
        .eq("id", targetId);
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase.from("logs").insert({
          user_id: u.user.id,
          action: "recontagem_solicitada_item",
          entity: "count_item",
          details: { count_item_id: targetId },
        });
      }
      toast.success("Recontagem solicitada.");
      qc.invalidateQueries({ queryKey: ["count-items", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao solicitar recontagem.");
    }
  }



  const { data: inv, isLoading: invLoading, error: invError } = useQuery({
    queryKey: ["inventory", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventories").select("*, family:families!inventories_family_id_fkey(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["count-items", id],
    queryFn: async () => (await supabase.from("count_items").select("*, product:products(name, code, unit)").eq("inventory_id", id)).data ?? [],
  });

  const isSupOrAdminRole = profile?.role === "admin" || profile?.role === "supervisor";
  const { data: pendingCloseRequest } = useQuery({
    queryKey: ["close-request-pending", id],
    queryFn: async () => {
      const { data: r } = await supabase
        .from("close_requests")
        .select("id, approval_token, created_at, requested_by, push_to_omie")
        .eq("inventory_id", id)
        .eq("status", "pendente")
        .order("created_at", { ascending: false })
        .limit(1)

        .maybeSingle();
      if (!r) return null;
      const { data: prof } = await supabase
        .from("profiles").select("full_name").eq("id", r.requested_by).maybeSingle();
      return { ...r, requester_name: prof?.full_name ?? "—" };
    },
    enabled: !!profile && isSupOrAdminRole,
  });



  const { data: scope } = useQuery({
    queryKey: ["inventory-scope", id, inv?.type],
    queryFn: async () => {
      if (!inv) return { productIds: null as string[] | null, familyIds: null as string[] | null };
      if (inv.type === "personalizado" || inv.type === "produto") {
        const [{ data: ip }, { data: ifam }] = await Promise.all([
          supabase.from("inventory_products").select("product_id").eq("inventory_id", id),
          supabase.from("inventory_families").select("family_id").eq("inventory_id", id),
        ]);
        return {
          productIds: (ip ?? []).map((r) => r.product_id),
          familyIds: (ifam ?? []).map((r) => r.family_id),
        };
      }
      return { productIds: null, familyIds: null };
    },
    enabled: !!inv,
  });

  const { data: nonCountableFamilyIds } = useQuery({
    queryKey: ["families", "non-countable-ids"],
    queryFn: async () => {
      const { data } = await supabase.from("families").select("id").eq("countable", false);
      return (data ?? []).map((f) => f.id as string);
    },
  });

  const debouncedQ = useDebouncedValue(q, 300);
  const { data: productsResp } = useQuery({
    queryKey: ["products-for-inv", inv?.type, inv?.family_id, debouncedQ.trim(), page, scope?.productIds?.length, scope?.familyIds?.length, nonCountableFamilyIds?.length],
    queryFn: async () => {
      const search = debouncedQ.trim().replace(/[%_,().:]/g, " ").replace(/\s+/g, " ").trim();
      let query = supabase
        .from("products")
        .select("id, code, barcode, name, family_id, family_name, unit, stock_omie, cost, active", { count: "exact" });
      if (inv?.type === "familia" && inv?.family_id) query = query.eq("family_id", inv.family_id);
      if (inv?.type === "personalizado" || inv?.type === "produto") {
        const pIds = scope?.productIds ?? [];
        const fIds = scope?.familyIds ?? [];
        if (pIds.length === 0 && fIds.length === 0) {
          return { data: [], count: 0 };
        }
        const filters: string[] = [];
        if (pIds.length) filters.push(`id.in.(${pIds.join(",")})`);
        if (fIds.length) filters.push(`family_id.in.(${fIds.join(",")})`);
        query = query.or(filters.join(","));
      }
      // Inventário geral: exclui produtos de famílias marcadas como não-contáveis
      if (inv?.type === "geral" && (nonCountableFamilyIds?.length ?? 0) > 0) {
        query = query.not("family_id", "in", `(${nonCountableFamilyIds!.join(",")})`);
      }
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,barcode.ilike.%${search}%`);
      query = query.eq("active", true);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await query
        .order("active", { ascending: false })
        .order("name")
        .range(from, to);
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    enabled: !!inv && (inv.type === "geral" || inv.type === "familia" || !!scope) && (inv?.type !== "geral" || nonCountableFamilyIds !== undefined),
    placeholderData: (previousData) => previousData ?? { data: [], count: 0 },
  });

  const products = productsResp?.data;
  const totalProducts = productsResp?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.familias} famílias, ${r.produtos} produtos.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização."),
  });

  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_settings");
      return data?.[0] ?? null;
    },
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

  const isSupOrAdmin = profile?.role === "admin" || profile?.role === "supervisor";
  const canOpenInventory = !!inv && !!profile && (isSupOrAdmin || inv.assigned_counter_id === profile.id);
  const closed = inv?.status === "fechado" || inv?.status === "aprovada" || inv?.status === "reprovada";
  const canEditCounts = canOpenInventory && !closed;
  const showValidation = isSupOrAdmin && ["pendente_validacao", "aguardando_validacao", "divergencia", "recontagem_enviada", "recontagem_solicitada", "ajuste_solicitado"].includes(inv?.status ?? "");
  const showRecount = !isSupOrAdmin && ["recontagem_solicitada", "ajuste_solicitado"].includes(inv?.status ?? "");
  const submitValidationFn = useServerFn(submitForValidation);
  const { pending: pendingQueue, flushing, online, flush } = useOfflineCountQueue(id);

  if (profileLoading || invLoading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8 text-sm text-muted-foreground">
        Carregando inventário...
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8 space-y-3">
        <h1 className="text-xl font-display font-semibold">Perfil indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Não foi possível confirmar sua função de acesso. Saia e entre novamente; se persistir, contate um administrador.
        </p>
        <Button variant="secondary" onClick={() => navigate({ to: "/inventarios" })}>Voltar para inventários</Button>
      </div>
    );
  }

  if (invError || !inv || !canOpenInventory) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8 space-y-3">
        <h1 className="text-xl font-display font-semibold">Inventário indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Esta contagem não existe ou não está designada para este usuário. Supervisores e administradores podem abrir qualquer contagem.
        </p>
        <Button variant="secondary" onClick={() => navigate({ to: "/inventarios" })}>Voltar para inventários</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => navigate({ to: "/inventarios" })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 px-1 py-1"
          aria-label="Voltar para inventários"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1 text-right">
          <Save className="h-3 w-3" />
          Seu progresso já foi salvo
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-display font-semibold truncate">{inv?.name}</h1>
          <div className="text-xs text-muted-foreground">
            {inv?.type === "familia" ? `Família: ${inv?.family?.name ?? "—"}` : inv?.type} · {inv?.status}
          </div>
        </div>
        {profile?.role === "admin" && inv && (
          <DeleteInventoryButton
            inventoryId={id}
            inventoryName={inv.name}
            variant="full"
            redirectAfter
          />
        )}
      </div>


      {!online && (
        <div className="rounded-xl bg-warning/10 border border-warning/40 p-3 text-xs flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-warning" />
          <span>Você está offline. Contagens são salvas no aparelho e sincronizadas quando a internet voltar.</span>
        </div>
      )}
      {pendingQueue.length > 0 && (
        <div className="rounded-xl bg-primary/10 border border-primary/40 p-3 text-xs flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <SyncIcon className={`h-4 w-4 text-primary ${flushing ? "animate-spin" : ""}`} />
            <span><b>{pendingQueue.length}</b> contagem(ns) aguardando sincronização.</span>
          </div>
          <button className="text-primary underline" onClick={() => flush()} disabled={flushing || !online}>Sincronizar</button>
        </div>
      )}

      {pendingCloseRequest && isSupOrAdminRole && (
        <div className="rounded-2xl bg-warning/10 border-2 border-warning p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Pedido de fechamento pendente
          </div>
          <div className="text-xs text-muted-foreground">
            Solicitado por <b className="text-foreground">{pendingCloseRequest.requester_name}</b>
            {" em "}
            {new Date(pendingCloseRequest.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background p-2"><span className="text-muted-foreground">Divergências: </span><b>{divergencias}</b></div>
            <div className="rounded-lg bg-background p-2"><span className="text-muted-foreground">Δ R$: </span><b className={totalDiff < 0 ? "text-destructive" : ""}>{fmtMoney(totalDiff)}</b></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={respondBusy}
              onClick={() => setRejectOpen(true)}
            >
              <X className="h-4 w-4 mr-1" /> Reprovar
            </Button>
            <Button
              disabled={respondBusy}
              onClick={async () => {
                setRespondBusy(true);
                try {
                  await respondCloseFn({ data: { token: pendingCloseRequest.approval_token, approve: true } });
                  toast.success("Inventário fechado!");
                  qc.invalidateQueries({ queryKey: ["close-request-pending", id] });
                  qc.invalidateQueries({ queryKey: ["inventory", id] });
                  qc.invalidateQueries({ queryKey: ["count-items", id] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao aprovar.");
                } finally { setRespondBusy(false); }
              }}
            >
              <Check className="h-4 w-4 mr-1" /> Aprovar
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar pedido de fechamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja reprovar? A contagem não será enviada à Omie e o inventário continuará aberto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={respondBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={respondBusy}
              onClick={async () => {
                if (!pendingCloseRequest) return;
                setRespondBusy(true);
                try {
                  await respondCloseFn({ data: { token: pendingCloseRequest.approval_token, approve: false } });
                  toast.success("Pedido reprovado.");
                  qc.invalidateQueries({ queryKey: ["close-request-pending", id] });
                  qc.invalidateQueries({ queryKey: ["inventory", id] });
                  qc.invalidateQueries({ queryKey: ["count-items", id] });
                  setRejectOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao reprovar.");
                } finally { setRespondBusy(false); }
              }}
            >
              Reprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir inventário?</AlertDialogTitle>
            <AlertDialogDescription>
              Reabrir este inventário permite editar contagens novamente. Se ajustes já foram enviados à Omie, reabrir e editar pode causar divergência entre o estoque do sistema e o real — o ajuste anterior não é desfeito automaticamente. Deseja continuar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopenBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={reopenBusy}
              onClick={async () => {
                setReopenBusy(true);
                try {
                  await reopenFn({ data: { inventory_id: id } });
                  toast.success("Inventário reaberto.");
                  qc.invalidateQueries({ queryKey: ["inventory", id] });
                  qc.invalidateQueries({ queryKey: ["count-items", id] });
                  setReopenOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao reabrir.");
                } finally { setReopenBusy(false); }
              }}
            >
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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

      {showValidation && (
        <div className="rounded-2xl bg-primary/5 border border-primary/40 p-3 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Validação do inventário</div>
          <ValidationPanel inventoryId={id} tolerancePct={Number(inv?.tolerance_pct ?? 0)} />
        </div>
      )}

      {showRecount && (
        <div className="rounded-2xl bg-warning/5 border border-warning/40 p-3 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Ação necessária: {inv?.status === "recontagem_solicitada" ? "recontagem" : "ajuste"}</div>
          <RecountAdjustView inventoryId={id} />
        </div>
      )}

      {canEditCounts && !showValidation && !showRecount && (
        <>
          {(inv?.status === "pendente" || inv?.status === "em_andamento" || inv?.status === "aberto") && (items?.length ?? 0) > 0 && (
            <Button variant="secondary" className="w-full" onClick={async () => {
              try {
                const r = await submitValidationFn({ data: { inventory_id: id } });
                toast.success(r.divergencias > 0 ? `Enviado. ${r.divergencias} item(ns) para validar.` : "Sem divergências — inventário concluído.");
                qc.invalidateQueries();
              } catch (e) { toast.error(e instanceof Error ? e.message : "Falha."); }
            }}>Enviar para validação</Button>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Nome, código ou EAN" className="pl-9" />
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
                    {q.trim()
                      ? "Nenhum produto encontrado"
                      : inv?.type === "familia"
                        ? "Sem produtos nessa família"
                        : (inv?.type === "personalizado" || inv?.type === "produto")
                          ? "Este inventário não tem produtos vinculados"
                          : "Catálogo Omie vazio"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {q.trim()
                      ? "Tente buscar por outro nome, código ou EAN."
                      : (inv?.type === "personalizado" || inv?.type === "produto")
                        ? "A contagem foi criada sem itens selecionados. Contate o supervisor ou admin que criou esta contagem para refazê-la com os produtos corretos."
                        : (profile?.role === "admin" || profile?.role === "supervisor")
                          ? "Sincronize o Omie para carregar os produtos."
                          : "Peça para um supervisor ou admin sincronizar o Omie."}
                  </div>
                </div>
                {!q.trim() && (profile?.role === "admin" || profile?.role === "supervisor") && (inv?.type === "geral" || inv?.type === "familia") && (
                  <Button className="w-full" onClick={() => sync.mutate()} disabled={sync.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
                    {sync.isPending ? "Sincronizando" : "Sincronizar Omie"}
                  </Button>
                )}
              </div>
            )}
          </div>
          {totalProducts > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalProducts)} de {totalProducts}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
                <span className="self-center">{page + 1}/{totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </>
      )}

      {closed && (
        <div className="space-y-2">
          <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="h-4 w-4" /> Inventário fechado. Somente leitura.
          </div>
          {profile?.role === "admin" && (
            <Button
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setReopenOpen(true)}
              disabled={reopenBusy}
            >
              <Unlock className="h-4 w-4 mr-2" /> Reabrir inventário
            </Button>
          )}
        </div>
      )}


      {selectedProduct && selected && canEditCounts && (
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
              notifyDivFn({ data: { inventory_id: id } })
                .then((r) => { if (r && (r as { ok?: boolean }).ok === false) toast.warning(`Alerta por e-mail falhou: ${(r as { error?: string }).error ?? "erro"}`); })
                .catch((e) => { console.warn("notifyDivergence:", e); toast.warning("Não foi possível enviar alerta por e-mail."); });
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

      {canEditCounts && (
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
  const { enqueue, flush, online } = useOfflineCountQueue(inventoryId);
  const [qty, setQty] = useState(currentItem ? String(currentItem.quantity_counted) : "");
  const [saving, setSaving] = useState(false);
  // Depois de salvar, revelamos o resultado mesmo no modo às cegas.
  const [revealed, setRevealed] = useState<null | { diff: number; finDiff: number; status: string; itemId: string }>(null);
  // Só escondemos estoque/diferença enquanto o item ainda NÃO foi salvo nesta sessão.
  const hideStock = blind && !currentItem && !revealed;

  async function save() {
    const q = Number(qty.replace(",", "."));
    if (Number.isNaN(q)) { toast.error("Quantidade inválida"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); toast.error("Sessão expirada. Entre novamente."); return; }
    const stock = Number(product.stock_omie);
    const status: "correto" | "divergencia" = q === stock ? "correto" : "divergencia";
    const diff = q - stock;

    // Salva na fila offline (grava localmente e tenta sincronizar imediatamente)
    await enqueue({
      inventory_id: inventoryId,
      product_id: product.id,
      counted_by: u.user!.id,
      quantity_before: stock,
      quantity_counted: q,
      unit_cost: Number(product.cost),
      status,
    });

    let realId = currentItem?.id ?? "";
    if (online) {
      const r = await flush();
      if (!r.ok) {
        setSaving(false);
        toast.error(typeof r.reason === "string" ? r.reason : "Falha ao sincronizar a contagem.");
        return;
      }
      if (r.ok) {
        const { data: ci, error: ciErr } = await supabase.from("count_items").select("id").eq("inventory_id", inventoryId).eq("product_id", product.id).maybeSingle();
        if (ci?.id) {
          realId = ci.id;
          await supabase.from("logs").insert({ user_id: u.user!.id, action: "contagem_salva", entity: "count_item", details: { id: ci.id, produto: product.name, qtd: q, status } });
        } else {
          console.error("[inventarios.save] count_item não encontrado após flush", {
            inventoryId,
            productId: product.id,
            error: ciErr,
          });
        }
      }
    }

    setSaving(false);
    toast.success(online ? "Contagem salva!" : "Salva offline · vai sincronizar sozinha");
    setRevealed({ diff, finDiff: diff * Number(product.cost), status, itemId: realId });
    if (realId) onSaved(realId, status);
  }

  const qNum = Number(qty.replace(",", ".")) || 0;
  const diff = revealed ? revealed.diff : qNum - Number(product.stock_omie);
  const finDiff = revealed ? revealed.finDiff : diff * Number(product.cost);
  const showDiff = !!revealed || (!blind && qty !== "");

  return (
    <div
      className="fixed inset-0 z-40 bg-background/95 flex items-end sm:items-center justify-center overflow-y-auto overscroll-contain"
      style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface border border-border p-5 space-y-3 max-h-[100dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
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
        {!revealed ? (
          <Button className="w-full" onClick={save} disabled={saving || qty === ""}>
            {saving ? "Salvando" : "Salvar contagem"}
          </Button>
        ) : (
          <div className="space-y-2">
            {diff < 0 && canRegisterLoss && (
              <Button
                variant="outline"
                className="w-full border-warning text-warning hover:bg-warning/10"
                onClick={() => onOpenLoss(revealed?.itemId ?? currentItem?.id, Math.abs(diff))}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Registrar como perda ({fmtNumber(Math.abs(diff))})
              </Button>
            )}
            <Button className="w-full" onClick={onClose}>Fechar</Button>
          </div>
        )}
      </div>
    </div>
  );
}
