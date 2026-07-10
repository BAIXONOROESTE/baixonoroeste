-- Segurança: remover SELECT anônimo direto na tabela profiles (expunha email/telefone)
DROP POLICY IF EXISTS "anon can list active profiles for pin login" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;

-- Manter o seletor de login: função SECURITY DEFINER expõe só colunas seguras
GRANT EXECUTE ON FUNCTION public.list_login_profiles() TO anon, authenticated;