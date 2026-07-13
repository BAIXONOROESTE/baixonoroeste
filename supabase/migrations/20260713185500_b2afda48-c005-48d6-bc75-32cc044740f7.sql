GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.current_app_profile()
RETURNS TABLE(
  id uuid,
  full_name text,
  slug text,
  avatar_color text,
  role public.app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.slug,
    p.avatar_color,
    CASE
      WHEN public.has_role(auth.uid(), 'admin') THEN 'admin'::public.app_role
      WHEN public.has_role(auth.uid(), 'supervisor') THEN 'supervisor'::public.app_role
      ELSE 'contador'::public.app_role
    END AS role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.active = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_app_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_profile() TO authenticated, service_role;