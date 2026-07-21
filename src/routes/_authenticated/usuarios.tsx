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

type ProfileRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  roles: string[];
  team_ids: string[];
};

function UsuariosPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const createUserFn = useServerFn(createUserAsAdmin);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "supervisor" | "contador">("contador");
  const [showInactive, setShowInactive] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const isAdmin = me?.role === "admin";
  const isSupOrAdmin = me?.role === "admin" || me?.role === "supervisor";

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const [{ data: p }, { data: r }, { data: tm }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("*"),
        supabase.from("team_members").select("user_id, team_id"),
      ]);
      return (p ?? []).map((prof) => ({
        ...prof,
        roles: (r ?? []).filter((x) => x.user_id === prof.id).map((x) => x.role),
        team_ids: (tm ?? []).filter((x) => x.user_id === prof.id).map((x) => x.team_id),
      })) as ProfileRow[];
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["teams-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSupOrAdmin,
  });

  const visibleProfiles = (profiles ?? []).filter((p) => showInactive || p.active);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome obrigatório.");
      if (!/^\d{6,8}$/.test(pin)) throw new Error("PIN deve ter de 6 a 8 dígitos.");
      const isSup = role === "admin" || role === "supervisor";
      if (isSup && !email.trim()) throw new Error("Email obrigatório para supervisor/admin (usado no reset de PIN e notificações).");
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Email inválido.");
      const slug = slugify(name);
      await createUserFn({ data: { fullName: name.trim(), slug, pin, role, phone: phone.trim() || undefined, email: email.trim() || undefined } });
    },
    onSuccess: () => {
      toast.success("Usuário criado.");
      setName(""); setPin(""); setPhone(""); setEmail("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const createTeam = useMutation({
    mutationFn: async () => {
      const n = newTeamName.trim();
      if (!n) throw new Error("Nome da equipe é obrigatório.");
      const { error } = await supabase.from("teams").insert({ name: n });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Equipe criada.");
      setNewTeamName("");
      qc.invalidateQueries({ queryKey: ["teams-all"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar equipe."),
  });

  if (!isSupOrAdmin) return <div className="p-6 text-muted-foreground">Somente admin ou supervisor.</div>;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4 pb-8">
      <h1 className="text-2xl font-display font-semibold">Usuários</h1>
      {isAdmin && (
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
          <div className="font-medium text-sm">Novo funcionário</div>
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="password" inputMode="numeric" placeholder="PIN (6 a 8 dígitos)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={8} />
          <Input type="email" inputMode="email" placeholder="Email (para reset de PIN e notificações)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input inputMode="tel" placeholder="Telefone (opcional, ex: +5511999999999)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="contador">Contador</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option>
          </select>
          <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>Criar</Button>
        </div>
      )}

      {/* Equipes */}
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <div className="font-medium text-sm">Equipes</div>
        {isAdmin && (
          <div className="flex gap-2">
            <Input placeholder="Nome da nova equipe" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
            <Button size="sm" onClick={() => createTeam.mutate()} disabled={createTeam.isPending}>Criar</Button>
          </div>
        )}
        <div className="space-y-2">
          {(teams ?? []).map((t) => {
            const members = (profiles ?? []).filter((p) => p.team_ids.includes(t.id) && p.active);
            return (
              <div key={t.id} className="rounded-xl border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{members.length} membro{members.length === 1 ? "" : "s"}</div>
                </div>
                {members.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {members.map((m) => m.full_name).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
          {(teams ?? []).length === 0 && <div className="text-xs text-muted-foreground">Nenhuma equipe criada ainda.</div>}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="text-sm text-muted-foreground">
          {visibleProfiles.length} usuário{visibleProfiles.length === 1 ? "" : "s"}
          {showInactive ? " (incluindo inativos)" : " ativos"}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>
      <div className="space-y-2">
        {visibleProfiles.map((p) => (
          <ProfileRowItem
            key={p.id}
            profile={p}
            teams={teams ?? []}
            isAdmin={!!isAdmin}
            onChanged={() => qc.invalidateQueries()}
          />
        ))}
      </div>
    </div>
  );
}


function ProfileRowItem({
  profile,
  teams,
  isAdmin,
  onChanged,
}: {
  profile: ProfileRow;
  teams: { id: string; name: string }[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [resetting, setResetting] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const resetFn = useServerFn(resetUserPinAsAdmin);

  async function saveContact() {
    const emailTrim = email.trim().toLowerCase();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { toast.error("Email inválido."); return; }
    const { error } = await supabase.from("profiles").update({
      phone: phone.trim() || null,
      email: emailTrim || null,
    }).eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Contato atualizado.");
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

  async function changeTeam(next: string) {
    setSavingTeam(true);
    try {
      if (!next) {
        const { error } = await supabase.from("team_members").delete().eq("user_id", profile.id);
        if (error) throw error;
      } else if (!profile.team_id) {
        const { error } = await supabase.from("team_members").insert({ user_id: profile.id, team_id: next });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_members").update({ team_id: next }).eq("user_id", profile.id);
        if (error) throw error;
      }
      toast.success("Equipe atualizada.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar equipe.");
    } finally {
      setSavingTeam(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{profile.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {profile.roles.join(", ") || "sem papel"} · {profile.active ? "ativo" : "inativo"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            ✉ {profile.email ?? "sem email"} · ☎ {profile.phone ?? "—"}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => { setEditing((v) => !v); setResetting(false); }}>{editing ? "Fechar" : "Editar"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setResetting((v) => !v); setEditing(false); }}>{resetting ? "Fechar" : "PIN"}</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              await supabase.from("profiles").update({ active: !profile.active }).eq("id", profile.id);
              onChanged();
            }}>{profile.active ? "Desativar" : "Ativar"}</Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Equipe:</span>
        <select
          className="flex-1 h-9 rounded-md bg-input border border-border px-2 text-sm disabled:opacity-60"
          value={profile.team_id ?? ""}
          disabled={savingTeam}
          onChange={(e) => changeTeam(e.target.value)}
        >
          <option value="">— Sem equipe —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {editing && isAdmin && (
        <div className="space-y-2">
          <Input type="email" placeholder="Email para reset/notificação" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <Input inputMode="tel" placeholder="+5511999999999" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button size="sm" onClick={saveContact}>Salvar</Button>
          </div>
        </div>
      )}
      {resetting && isAdmin && (
        <div className="flex gap-2">
          <Input type="password" inputMode="numeric" maxLength={8} placeholder="Novo PIN (6-8 dígitos)" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
          <Button size="sm" onClick={doReset}>Trocar</Button>
        </div>
      )}
    </div>
  );
}
