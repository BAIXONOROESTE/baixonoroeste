import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { slugify } from "@/lib/auth-helpers";
import { createUserAsAdmin, resetUserPinAsAdmin } from "@/lib/admin-users.functions";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: UsuariosPage });

function UsuariosPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const createUserFn = useServerFn(createUserAsAdmin);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "supervisor" | "contador">("contador");

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
      if (!name.trim()) throw new Error("Nome obrigatório.");
      if (!/^\d{6,8}$/.test(pin)) throw new Error("PIN deve ter de 6 a 8 dígitos.");
      if ((role === "admin" || role === "supervisor") && !phone.trim()) {
        throw new Error("WhatsApp obrigatório para supervisor/admin.");
      }
      await createUserFn({ data: { fullName: name.trim(), slug: slugify(name), pin, role, phone: phone.trim() || undefined } });
    },
    onSuccess: () => {
      toast.success("Usuário criado.");
      setName(""); setPin(""); setPhone("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (me?.role !== "admin") return <div className="p-6 text-muted-foreground">Somente admin.</div>;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Usuários</h1>
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <div className="font-medium text-sm">Novo funcionário</div>
        <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="password" inputMode="numeric" placeholder="PIN (6 a 8 dígitos)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={8} />
        <Input inputMode="tel" placeholder="WhatsApp (ex: +5511999999999)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
          <option value="contador">Contador</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option>
        </select>
        <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>Criar</Button>
      </div>
      <div className="space-y-2">
        {profiles?.map((p) => (
          <ProfileRow key={p.id} profile={p} onChanged={() => qc.invalidateQueries()} />
        ))}
      </div>
    </div>
  );
}

function ProfileRow({ profile, onChanged }: { profile: { id: string; full_name: string; phone: string | null; active: boolean; roles: string[] }; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [resetting, setResetting] = useState(false);
  const [newPin, setNewPin] = useState("");
  const resetFn = useServerFn(resetUserPinAsAdmin);

  async function savePhone() {
    const { error } = await supabase.from("profiles").update({ phone: phone.trim() || null }).eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Telefone atualizado.");
    setEditing(false);
    onChanged();
  }

  async function doReset() {
    if (!/^\d{6,8}$/.test(newPin)) { toast.error("PIN de 6 a 8 dígitos."); return; }
    try {
      await resetFn({ data: { user_id: profile.id, new_pin: newPin } });
      toast.success(`PIN de ${profile.full_name} redefinido.`);
      setResetting(false); setNewPin("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao resetar PIN.");
    }
  }

  return (
    <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{profile.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {profile.roles.join(", ") || "sem papel"} · {profile.active ? "ativo" : "inativo"} · {profile.phone ?? "sem WhatsApp"}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={() => { setEditing((v) => !v); setResetting(false); }}>{editing ? "Fechar" : "Editar"}</Button>
          <Button size="sm" variant="outline" onClick={() => { setResetting((v) => !v); setEditing(false); }}>{resetting ? "Fechar" : "PIN"}</Button>
          <Button size="sm" variant="outline" onClick={async () => {
            await supabase.from("profiles").update({ active: !profile.active }).eq("id", profile.id);
            onChanged();
          }}>{profile.active ? "Off" : "On"}</Button>
        </div>
      </div>
      {editing && (
        <div className="flex gap-2">
          <Input inputMode="tel" placeholder="+5511999999999" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button size="sm" onClick={savePhone}>Salvar</Button>
        </div>
      )}
      {resetting && (
        <div className="flex gap-2">
          <Input type="password" inputMode="numeric" maxLength={8} placeholder="Novo PIN (6-8 dígitos)" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
          <Button size="sm" onClick={doReset}>Trocar</Button>
        </div>
      )}
    </div>
  );
}
