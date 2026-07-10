import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  if (error) throw new Error(error.message);
  if (!data.user?.id) throw new Error("Usuário criado sem identificador.");
  return { id: data.user.id } satisfies AuthUser;
}

export async function updateAuthUserPasswordAsService(userId: string, password: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}
