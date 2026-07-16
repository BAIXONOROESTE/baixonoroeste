
-- 1) RPC list_assignable_profiles: supervisor/admin lê perfis atribuíveis sem expor email/telefone
CREATE OR REPLACE FUNCTION public.list_assignable_profiles()
RETURNS TABLE(id uuid, full_name text, roles text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name,
           COALESCE(array_agg(ur.role::text) FILTER (WHERE ur.role IS NOT NULL), ARRAY['contador']::text[])
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.active = true
    GROUP BY p.id, p.full_name
    ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_assignable_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_profiles() TO authenticated;

-- 2) Coluna countable em families
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS countable boolean NOT NULL DEFAULT true;
