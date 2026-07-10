-- 1. profiles.email (email real, distinto do interno slug@estoque.local)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON public.profiles (LOWER(email)) WHERE email IS NOT NULL;

-- 2. settings — colunas de notificação por email
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notif_from_email TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notif_from_name TEXT DEFAULT 'Baixo Noroeste Inventário';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notif_reply_to TEXT;

-- 3. pin_reset_tokens — armazena tokens temporários para reset por email
CREATE TABLE IF NOT EXISTS public.pin_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.pin_reset_tokens TO service_role;
-- Nenhum GRANT para anon/authenticated: só server-side com service role acessa.

ALTER TABLE public.pin_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy para authenticated/anon; sem policies, RLS bloqueia tudo,
-- e apenas service_role (que ignora RLS) consegue ler/escrever.

CREATE INDEX IF NOT EXISTS pin_reset_tokens_user_idx ON public.pin_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS pin_reset_tokens_expires_idx ON public.pin_reset_tokens (expires_at);

-- 4. Policy: usuário lê/atualiza o próprio email; admin vê/edita todos.
-- (as policies existentes de profiles cobrem, mas garantimos coluna email)
-- Nada extra necessário — RLS já é por linha (id = auth.uid()) para o próprio,
-- e admins usam has_role.
