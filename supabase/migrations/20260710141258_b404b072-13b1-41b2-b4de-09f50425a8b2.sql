
-- Tighten profiles SELECT: no more open read to everyone signed-in / anon
DROP POLICY IF EXISTS "everyone signed-in reads profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon can list active profiles for pin login" ON public.profiles;

-- Self or admin can read the full row (including phone/email)
CREATE POLICY "self or admin reads profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.current_user_is_admin());

-- Safe public view: only non-sensitive columns, bypasses RLS by design
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT id, full_name, slug, avatar_color, active, role_hint
  FROM (
    SELECT id, full_name, slug, avatar_color, active, NULL::text AS role_hint
    FROM public.profiles
  ) p;

-- Redefine without the NULL hack (kept simple): drop and recreate as owner-owned view
DROP VIEW public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = off) AS
  SELECT id, full_name, slug, avatar_color, active
  FROM public.profiles
  WHERE active = true;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
