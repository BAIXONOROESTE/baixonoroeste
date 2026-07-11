-- Restrict settings SELECT to admins only (protects n8n_webhook_secret and integration credentials)
DROP POLICY IF EXISTS "signed-in read settings" ON public.settings;

CREATE POLICY "admin read settings"
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- Safe subset of settings that any signed-in user may read
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE (
  omie_update_mode text,
  tolerance_pct_default numeric,
  auto_sync_interval_seconds integer,
  notif_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT omie_update_mode, tolerance_pct_default, auto_sync_interval_seconds, notif_enabled
  FROM public.settings
  WHERE id = 1
$$;

REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated;