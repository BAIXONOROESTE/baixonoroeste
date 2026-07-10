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

function getApiKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Configuração de autenticação ausente.");
  return key;
}

function base64Url(input: string | ArrayBuffer) {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function collectPrivateJwks(value: unknown, jwks: JsonWebKey[] = []) {
  if (!value || typeof value !== "object") return jwks;
  if (Array.isArray(value)) {
    for (const item of value) collectPrivateJwks(item, jwks);
    return jwks;
  }

  const record = value as Record<string, unknown>;
  if (record.kty === "EC" && record.d && (record.crv === "P-256" || record.alg === "ES256")) {
    jwks.push(record as JsonWebKey);
  }
  for (const item of Object.values(record)) collectPrivateJwks(item, jwks);
  return jwks;
}

function getSigningJwk() {
  const raw = process.env.SUPABASE_JWKS || process.env.SUPABASE_SECRET_KEYS;
  if (!raw) throw new Error("Chave administrativa de autenticação ausente.");

  try {
    const jwks = collectPrivateJwks(JSON.parse(raw));
    const jwk = jwks.find((key) => key.alg === "ES256") ?? jwks[0];
    if (jwk) return jwk;
  } catch {
    // Fall through to the generic error below.
  }

  throw new Error("Chave administrativa de autenticação inválida.");
}

async function signServiceRoleJwt() {
  const configuredKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (configuredKey && configuredKey.split(".").length === 3) return configuredKey;

  const jwk = getSigningJwk();
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", ...(jwk.kid ? { kid: jwk.kid } : {}) };
  const payload = {
    aud: "authenticated",
    exp: now + 5 * 60,
    iat: now,
    iss: "supabase",
    role: "service_role",
  };
  const body = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(body),
  );
  return `${body}.${base64Url(signature)}`;
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
  const jwt = await signServiceRoleJwt();
  const response = await fetch(`${getSupabaseUrl()}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: getApiKey(),
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) throw new Error(await parseAuthError(response));
  return (await response.json()) as T;
}

function extractUser(response: AuthAdminUserResponse) {
  const user = "user" in response && response.user ? response.user : response;
  if (!user.id) throw new Error("Usuário criado sem identificador.");
  return user;
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