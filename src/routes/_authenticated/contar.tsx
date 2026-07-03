import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Package, Layers, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contar")({ component: ContarPage });

function ContarPage() {
  const [tipo, setTipo] = useState<"geral" | "familia" | "produto" | null>(null);
  const [familyId, setFamilyId] = useState<string>("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const { data: families } = useQuery({
    queryKey: ["families"],
    queryFn: async () => (await supabase.from("families").select("id, name").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const family = families?.find((f) => f.id === familyId);
      const defaultName = tipo === "geral" ? `Inventário geral ${new Date().toLocaleDateString("pt-BR")}` :
        tipo === "familia" ? `Contagem — ${family?.name}` : `Contagem avulsa ${new Date().toLocaleDateString("pt-BR")}`;
      const { data, error } = await supabase.from("inventories").insert({
        name: name || defaultName,
        type: tipo!,
        family_id: tipo === "familia" ? familyId : null,
        started_by: u.user!.id,
      }).select("id").single();
      if (error) throw error;
      await supabase.from("logs").insert({ user_id: u.user!.id, action: "inventario_criado", entity: "inventory", details: { id: data.id, tipo } });
      return data.id as string;
    },
    onSuccess: (id) => navigate({ to: "/inventarios/$id", params: { id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar."),
  });

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Nova contagem</h1>

      <div className="grid grid-cols-1 gap-3">
        <TipoCard active={tipo === "geral"} onClick={() => setTipo("geral")} icon={ListChecks} title="Inventário geral" desc="Contar todos os produtos ativos." />
        <TipoCard active={tipo === "familia"} onClick={() => setTipo("familia")} icon={Layers} title="Por família" desc="Contar todos os itens de uma família." />
        <TipoCard active={tipo === "produto"} onClick={() => setTipo("produto")} icon={Package} title="Por produto" desc="Contar itens avulsos (por busca ou câmera)." />
      </div>

      {tipo === "familia" && (
        <div>
          <label className="text-xs text-muted-foreground">Família</label>
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)}
            className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="">— selecione —</option>
            {families?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}

      {tipo && (
        <div>
          <label className="text-xs text-muted-foreground">Nome (opcional)</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Estoque bar sexta-feira" />
        </div>
      )}

      <Button className="w-full" disabled={!tipo || (tipo === "familia" && !familyId) || create.isPending}
              onClick={() => create.mutate()}>
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
