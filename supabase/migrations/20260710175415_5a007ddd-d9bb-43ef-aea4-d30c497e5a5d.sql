
-- 1) Migrar emails internos existentes de @estoque.local para @users.baixonoroeste.com.br
UPDATE auth.users
SET email = regexp_replace(email, '@estoque\.local$', '@users.baixonoroeste.com.br')
WHERE email LIKE '%@estoque.local';

-- 2) Substituir a view SECURITY DEFINER por uma função SECURITY DEFINER que devolve apenas colunas seguras
DROP VIEW IF EXISTS public.profiles_public;

CREATE OR REPLACE FUNCTION public.list_login_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  slug text,
  avatar_color text,
  active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, slug, avatar_color, active
  FROM public.profiles
  WHERE active = true
  ORDER BY full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_login_profiles() TO anon, authenticated;
