import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
 * Endpoint público (sem middleware de auth) — roda antes do usuário autenticar.
 * Chama a função SECURITY DEFINER `list_login_profiles()`, que expõe SOMENTE
 * as colunas seguras (id/full_name/slug/avatar_color/active). O acesso direto
 * à tabela `profiles` fica bloqueado para `anon`, protegendo email/telefone.
 */
export const listLoginProfiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<LoginProfile[]> => {
    const supabasePublic = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data, error } = await supabasePublic.rpc("list_login_profiles");
    if (error) throw new Error(error.message);
    return (data ?? []) as LoginProfile[];
  },
);
