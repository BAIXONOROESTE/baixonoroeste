import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Package, Layers, ListChecks, RefreshCw, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { syncFamiliesAndProducts } from "@/lib/omie.functions";
import { createInventoryTask } from "@/lib/inventory-flow.functions";
import { useProfile } from "@/hooks/useProfile";

type Tipo = "geral" | "familia" | "produto" | "personalizado";

export const Route = createFileRoute("/_authenticated/contar")({ component: ContarPage });

function ContarPage() {
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [familyId, setFamilyId] = useState<string>("");
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [name, setName] = useState("");
  const [counterId, setCounterId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [adminId, setAdminId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [tolerance, setTolerance] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const syncFn = useServerFn(syncFamiliesAndProducts);
  const createFn = useServerFn(createInventoryTask);

  const { data: families } = useQuery({
    queryKey: ["families"],
    queryFn: async () => (await supabase.from("families").select("id, name").order("name")).data ?? [],
  });

  const { data: profs } = useQuery({
    queryKey: ["profiles-with-roles"],
    queryFn: async () => {
      const [{ data: ps }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const byUser = new Map<string, string[]>();
      for (const r of rs ?? []) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r.role);
        byUser.set(r.user_id, list);
      }
      return (ps ?? []).map((p) => ({
        ...p,
        roles: byUser.get(p.id) ?? ["contador"],
      }));
    },
  });

  const counters = (profs ?? []).filter((p) => p.roles.includes("contador") || p.roles.includes("supervisor") || p.roles.includes("admin"));
  const supervisors = (profs ?? []).filter((p) => p.roles.includes("supervisor") || p.roles.includes("admin"));
  const admins = (profs ?? []).filter((p) => p.roles.includes("admin"));

  const { data: prodResults } = useQuery({
    queryKey: ["prod-search-contar", productSearch],
    queryFn: async () => {
      const s = productSearch.trim();
      if (s.length < 2) return [];
      const { data } = await supabase.from("products")
        .select("id, code, name, family_name, active")
        .or(`name.ilike.%${s}%,code.ilike.%${s}%,barcode.ilike.%${s}%`)
        .eq("active", true)
        .limit(20);
      return data ?? [];
    },
    enabled: (tipo === "personalizado" || tipo === "produto") && productSearch.trim().length >= 2,
  });

  const { data: catalogCounts } = useQuery({
    queryKey: ["catalog-counts"],
    queryFn: async () => {
      const [familiesCount, productsCount] = await Promise.all([
        supabase.from("families").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      return { families: familiesCount.count ?? 0, products: productsCount.count ?? 0 };
    },
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => { toast.success(`Sincronizado: ${r.familias} famílias, ${r.produtos} produtos.`); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização."),
  });

  const create = useMutation({
    mutationFn: async () => {
      const family = families?.find((f) => f.id === familyId);
      const defaultName = tipo === "geral" ? `Inventário geral ${new Date().toLocaleDateString("pt-BR")}` :
        tipo === "familia" ? `Contagem — ${family?.name}` :
        tipo === "personalizado" ? `Contagem personalizada ${new Date().toLocaleDateString("pt-BR")}` :
        `Contagem avulsa ${new Date().toLocaleDateString("pt-BR")}`;
      const tolNum = tolerance.trim() ? Number(tolerance.replace(",", ".")) : null;
      const r = await createFn({ data: {
        name: name || defaultName,
        type: tipo!,
        family_id: tipo === "familia" ? familyId : null,
        family_ids: tipo === "personalizado" ? familyIds : undefined,
        product_ids: (tipo === "personalizado" || tipo === "produto") ? productIds : undefined,
        assigned_counter_id: counterId || null,
        assigned_supervisor_id: supervisorId || null,
        assigned_admin_id: adminId || null,
        deadline_at: deadline ? new Date(deadline).toISOString() : null,
        notes: notes.trim() || null,
        tolerance_pct: tolNum,
      } });
      return r.id;
    },
    onSuccess: (id) => navigate({ to: "/inventarios/$id", params: { id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar."),
  });

  const canSync = profile?.role === "admin" || profile?.role === "supervisor";
  const scopeError =
    tipo === "produto" && productIds.length === 0
      ? "Selecione ao menos um produto abaixo antes de iniciar a contagem."
      : tipo === "personalizado" && familyIds.length === 0 && productIds.length === 0
        ? "Selecione ao menos uma família ou um produto para a contagem personalizada."
        : null;

  const disabled =
    !tipo ||
    catalogCounts?.products === 0 ||
    (tipo === "familia" && (!familyId || catalogCounts?.families === 0)) ||
    !!scopeError ||
    create.isPending;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Nova contagem</h1>

      {catalogCounts && catalogCounts.products === 0 && (
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <div className="text-sm">
            <div className="font-medium">Catálogo Omie vazio</div>
            <div className="text-xs text-muted-foreground">
              {canSync ? "Sincronize antes de iniciar." : "Peça para um supervisor ou admin sincronizar."}
            </div>
          </div>
          {canSync && (
            <Button className="w-full" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Sincronizando" : "Sincronizar Omie"}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <TipoCard active={tipo === "geral"} onClick={() => setTipo("geral")} icon={ListChecks} title="Inventário geral" desc="Contar todos os produtos ativos." />
        <TipoCard active={tipo === "familia"} onClick={() => setTipo("familia")} icon={Layers} title="Por família" desc="Todos os itens de uma família." />
        <TipoCard active={tipo === "produto"} onClick={() => setTipo("produto")} icon={Package} title="Por produto" desc="Itens avulsos (busca ou câmera)." />
        <TipoCard active={tipo === "personalizado"} onClick={() => setTipo("personalizado")} icon={Sparkles} title="Personalizado" desc="Escolha várias famílias e/ou produtos específicos." />
      </div>

      {tipo === "familia" && (
        <div>
          <label className="text-xs text-muted-foreground">Família</label>
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="">— selecione —</option>
            {families?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}
      {tipo === "produto" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Produtos ({productIds.length})</label>
          <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar por nome, código ou EAN" />
          {(prodResults ?? []).length > 0 && (
            <div className="rounded-md border border-border bg-input max-h-52 overflow-auto">
              {(prodResults ?? []).map((p) => {
                const on = productIds.includes(p.id);
                return (
                  <button key={p.id} onClick={() => setProductIds((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                    className={`w-full text-left text-sm px-3 py-2 flex justify-between ${on ? "bg-primary/10" : ""}`}>
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.code}</span>
                  </button>
                );
              })}
            </div>
          )}
          {productIds.length > 0 && (
            <button className="text-xs text-muted-foreground underline" onClick={() => setProductIds([])}>Limpar seleção ({productIds.length})</button>
          )}
        </div>
      )}


      {tipo === "personalizado" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Famílias ({familyIds.length})</label>
            <div className="max-h-40 overflow-auto rounded-md border border-border bg-input p-2 space-y-1">
              {(families ?? []).map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={familyIds.includes(f.id)}
                    onChange={(e) => setFamilyIds((prev) => e.target.checked ? [...prev, f.id] : prev.filter((x) => x !== f.id))}
                    className="h-4 w-4 accent-primary" />
                  {f.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Produtos avulsos ({productIds.length})</label>
            <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar por nome, código ou EAN" />
            {(prodResults ?? []).length > 0 && (
              <div className="mt-1 rounded-md border border-border bg-input max-h-40 overflow-auto">
                {(prodResults ?? []).map((p) => {
                  const on = productIds.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => setProductIds((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                      className={`w-full text-left text-sm px-3 py-2 flex justify-between ${on ? "bg-primary/10" : ""}`}>
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.code}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {productIds.length > 0 && (
              <button className="text-xs text-muted-foreground mt-1 underline" onClick={() => setProductIds([])}>Limpar seleção</button>
            )}
          </div>
        </div>
      )}

      {tipo && (
        <>
          <div>
            <label className="text-xs text-muted-foreground">Nome (opcional)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Estoque bar sexta-feira" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Responsável (colaborador)</label>
              <select value={counterId} onChange={(e) => setCounterId(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="">— selecione —</option>
                {counters.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Supervisor</label>
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="">— selecione —</option>
                {supervisors.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Administrador</label>
              <select value={adminId} onChange={(e) => setAdminId(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="">— selecione —</option>
                {admins.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Prazo</label>
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tolerância (%)</label>
              <Input type="number" step="0.1" min="0" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Observações</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" placeholder="Detalhes, instruções, contexto..." />
          </div>
        </>
      )}

      {scopeError && tipo && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {scopeError}
        </div>
      )}

      <Button className="w-full" disabled={disabled} onClick={() => create.mutate()}>
        {create.isPending ? "Criando..." : "Iniciar contagem"}
      </Button>
    </div>
  );
}

function TipoCard({ active, onClick, icon: Icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ComponentType<{className?: string}>; title: string; desc: string }) {
  return (
    <button onClick={onClick} className={`text-left rounded-2xl border p-4 transition ${active ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/40"}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`} />
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
    </button>
  );
}
