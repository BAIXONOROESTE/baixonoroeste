REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT (id, full_name, slug, avatar_color, active) ON public.profiles TO anon;

DROP POLICY IF EXISTS "self or admin reads profile" ON public.profiles;
CREATE POLICY "self or admin reads profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.current_user_is_admin());

DROP POLICY IF EXISTS "anon can list active profiles for pin login" ON public.profiles;
CREATE POLICY "anon can list active profiles for pin login"
  ON public.profiles FOR SELECT
  TO anon
  USING (active = true);

REVOKE EXECUTE ON FUNCTION public.list_login_profiles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_is_supervisor_or_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_supervisor_or_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;