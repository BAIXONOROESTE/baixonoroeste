import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AuthUser = { id: string };

type CreateAuthUserInput = {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
};

export async function createAuthUserAsService(input: CreateAuthUserInput) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.email_confirm,
    user_metadata: input.user_metadata,
  });
  if (!error) {
    if (!data.user?.id) throw new Error("Usuário criado sem identificador.");
    return { id: data.user.id } satisfies AuthUser;
  }

  if (!isAdminKeyCompatibilityError(error.message)) throw new Error(error.message);

  const publicAuth = createServerAuthClient();
  const signup = await publicAuth.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: input.user_metadata,
    },
  });
  if (signup.error) throw new Error(signup.error.message);
  if (!signup.data.user?.id) throw new Error("Usuário criado sem identificador.");
  return { id: signup.data.user.id } satisfies AuthUser;
}

export async function updateAuthUserPasswordAsService(userId: string, password: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}

function isAdminKeyCompatibilityError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("user not allowed") || normalized.includes("not_admin");
}

function createServerAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração de autenticação ausente.");

  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
