GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_supervisor_or_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;