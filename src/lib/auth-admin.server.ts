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
  if (usesNewOpaqueSecretKey()) {
    return createAuthUserViaInviteSignup(input);
  }

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

  return createAuthUserViaInviteSignup(input);
}

export async function updateAuthUserPasswordAsService(userId: string, password: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (!error) return;
  if (!isAdminKeyCompatibilityError(error.message)) throw new Error(error.message);

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("full_name, slug, avatar_color, phone, email")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  if (!profile?.slug || !profile.full_name) throw new Error("Perfil do usuário não encontrado.");

  const { data: roles, error: rolesErr } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesErr) throw new Error(rolesErr.message);
  const role = roles?.some((r) => r.role === "admin") ? "admin" : roles?.some((r) => r.role === "supervisor") ? "supervisor" : "contador";
  const resetEmail = `${profile.slug}.reset.${crypto.randomUUID()}@users.baixonoroeste.com.br`;

  const { error: inviteErr } = await supabaseAdmin.from("auth_signup_invites").insert({
    auth_email: resetEmail,
    full_name: profile.full_name,
    slug: profile.slug,
    role,
    avatar_color: profile.avatar_color ?? "amber",
    phone: profile.phone,
    contact_email: profile.email,
    reset_for_user_id: userId,
  });
  if (inviteErr) throw new Error(`Falha ao preparar reset de PIN: ${inviteErr.message}`);

  const publicAuth = createServerAuthClient();
  const signup = await publicAuth.auth.signUp({
    email: resetEmail,
    password,
    options: {
      data: {
        full_name: profile.full_name,
        slug: profile.slug,
        avatar_color: profile.avatar_color ?? "amber",
      },
    },
  });
  if (signup.error) throw new Error(signup.error.message);
}

function isAdminKeyCompatibilityError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("user not allowed") || normalized.includes("not_admin");
}

async function createAuthUserViaInviteSignup(input: CreateAuthUserInput) {
  const publicAuth = createServerAuthClient();
  const signup = await publicAuth.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: input.user_metadata,
    },
  });
  if (signup.error) throw new Error(formatAuthError(signup.error));
  if (!signup.data.user?.id) throw new Error("Usuário criado sem identificador.");
  return { id: signup.data.user.id } satisfies AuthUser;
}

function usesNewOpaqueSecretKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith("sb_secret_") === true;
}

function formatAuthError(error: unknown) {
  if (error instanceof Error && error.message && error.message !== "{}") return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "msg", "error_description", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value && value !== "{}") return value;
    }
    try {
      const serialized = JSON.stringify(record);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // ignore serialization failures and use the generic message below
    }
  }
  return "Falha ao criar login do usuário.";
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
