type AuthUser = { id: string };

type AuthAdminUserResponse = AuthUser | { user?: AuthUser };

type CreateAuthUserInput = {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
};

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("Configuração de autenticação ausente.");
  return url.replace(/\/$/, "");
}

function getServiceRoleKey() {
  // Aceita tanto o formato novo `sb_secret_...` quanto JWT legado.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Chave administrativa de autenticação ausente.");
  return key;
}

function getApiKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

async function parseAuthError(response: Response) {
  const text = await response.text();
  if (!text) return `Falha na autenticação (${response.status}).`;
  try {
    const parsed = JSON.parse(text) as { msg?: string; message?: string; error?: string };
    return parsed.msg ?? parsed.message ?? parsed.error ?? `Falha na autenticação (${response.status}).`;
  } catch {
    return text;
  }
}

async function authAdminRequest<T>(path: string, init: RequestInit) {
  const serviceKey = getServiceRoleKey();
  const response = await fetch(`${getSupabaseUrl()}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: getApiKey() || serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) throw new Error(await parseAuthError(response));
  return (await response.json()) as T;
}

function extractUser(response: AuthAdminUserResponse): AuthUser {
  if ("id" in response && response.id) return response;
  if ("user" in response && response.user?.id) return response.user;
  throw new Error("Usuário criado sem identificador.");
}

export async function createAuthUserAsService(input: CreateAuthUserInput) {
  const response = await authAdminRequest<AuthAdminUserResponse>("/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return extractUser(response);
}

export async function updateAuthUserPasswordAsService(userId: string, password: string) {
  await authAdminRequest<AuthAdminUserResponse>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}
