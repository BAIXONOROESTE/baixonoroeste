import { createServerFn } from "@tanstack/react-start";

export type LoginProfile = {
  id: string;
  full_name: string;
  slug: string;
  avatar_color: string | null;
  active: boolean;
};

/**
 * Lista os perfis ativos usados no seletor da tela de login.
 *
 * Endpoint público (sem middleware de auth) porque roda antes do usuário
 * autenticar. Usa o service role apenas para ler colunas seguras
 * (nome, slug, cor do avatar) — nunca expõe PIN/email/telefone.
 */
export const listLoginProfiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<LoginProfile[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, slug, avatar_color, active")
      .eq("active", true)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LoginProfile[];
  },
);
