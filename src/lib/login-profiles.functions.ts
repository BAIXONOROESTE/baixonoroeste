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
 * Endpoint público (sem middleware de auth) porque roda antes do usuário
 * autenticar. Usa a chave pública no servidor e depende de RLS/GRANTs que
 * liberam apenas colunas seguras — nunca expõe PIN/email/telefone.
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

    const { data, error } = await supabasePublic
      .from("profiles")
      .select("id, full_name, slug, avatar_color, active")
      .eq("active", true)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LoginProfile[];
  },
);
