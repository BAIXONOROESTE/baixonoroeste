import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { signUpWithPin, slugify } from "@/lib/auth-helpers";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: UsuariosPage });

function UsuariosPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [role, setRole] = useState<"admin"|"supervisor"|"contador">("contador");

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("*"),
      ]);
      return (p ?? []).map((prof) => ({ ...prof, roles: (r ?? []).filter((x) => x.user_id === prof.id).map((x) => x.role) }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim() || pin.length < 4) throw new Error("Nome e PIN obrigatórios.");
      const { error } = await signUpWithPin({ fullName: name.trim(), slug: slugify(name), pin, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Usuário criado."); setName(""); setPin(""); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (me?.role !== "admin") return <div className="p-6 text-muted-foreground">Somente admin.</div>;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Usuários</h1>
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <div className="font-medium text-sm">Novo funcionário</div>
        <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g,""))} />
        <select value={role} onChange={(e) => setRole(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
          <option value="contador">Contador</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option>
        </select>
        <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>Criar</Button>
      </div>
      <div className="space-y-2">
        {profiles?.map((p) => (
          <div key={p.id} className="rounded-xl bg-surface border border-border p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{p.full_name}</div>
              <div className="text-xs text-muted-foreground">{p.roles.join(", ") || "sem papel"} · {p.active ? "ativo" : "inativo"}</div>
            </div>
            <Button size="sm" variant="outline" onClick={async () => {
              await supabase.from("profiles").update({ active: !p.active }).eq("id", p.id);
              qc.invalidateQueries();
            }}>{p.active ? "Desativar" : "Ativar"}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
