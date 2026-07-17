
-- 1. teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read teams"
  ON public.teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin insert teams"
  ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "admin update teams"
  ON public.teams FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "admin delete teams"
  ON public.teams FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. team_members
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read team_members"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sup/admin insert team_members"
  ON public.team_members FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE POLICY "sup/admin update team_members"
  ON public.team_members FOR UPDATE
  TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE POLICY "sup/admin delete team_members"
  ON public.team_members FOR DELETE
  TO authenticated
  USING (public.current_user_is_supervisor_or_admin());

-- 3. inventories.due_at
ALTER TABLE public.inventories ADD COLUMN due_at TIMESTAMPTZ;

-- 4. scoring_monthly
CREATE VIEW public.scoring_monthly
WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  p.full_name,
  tm.team_id,
  t.name AS team_name,
  DATE_TRUNC('month', ci.created_at) AS month,
  COUNT(*) AS total_conferidos,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
    / NULLIF(COUNT(*), 0)
  , 1) AS accuracy_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE i.due_at IS NOT NULL AND ci.created_at <= i.due_at)
    / NULLIF(COUNT(*) FILTER (WHERE i.due_at IS NOT NULL), 0)
  , 1) AS ontime_pct,
  ROUND(
    0.5 * ROUND(
      100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
      / NULLIF(COUNT(*), 0)
    , 1)
    + 0.5 * COALESCE(
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE i.due_at IS NOT NULL AND ci.created_at <= i.due_at)
          / NULLIF(COUNT(*) FILTER (WHERE i.due_at IS NOT NULL), 0)
        , 1),
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
          / NULLIF(COUNT(*), 0)
        , 1)
      )
  , 1) AS individual_score
FROM public.count_items ci
JOIN public.inventories i ON i.id = ci.inventory_id
JOIN public.profiles p ON p.id = ci.counted_by
LEFT JOIN public.team_members tm ON tm.user_id = p.id
LEFT JOIN public.teams t ON t.id = tm.team_id
GROUP BY p.id, p.full_name, tm.team_id, t.name, DATE_TRUNC('month', ci.created_at);

GRANT SELECT ON public.scoring_monthly TO authenticated;

-- 5. scoring_weekly
CREATE VIEW public.scoring_weekly
WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  p.full_name,
  tm.team_id,
  t.name AS team_name,
  DATE_TRUNC('week', ci.created_at) AS week,
  COUNT(*) AS total_conferidos,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
    / NULLIF(COUNT(*), 0)
  , 1) AS accuracy_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE i.due_at IS NOT NULL AND ci.created_at <= i.due_at)
    / NULLIF(COUNT(*) FILTER (WHERE i.due_at IS NOT NULL), 0)
  , 1) AS ontime_pct,
  ROUND(
    0.5 * ROUND(
      100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
      / NULLIF(COUNT(*), 0)
    , 1)
    + 0.5 * COALESCE(
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE i.due_at IS NOT NULL AND ci.created_at <= i.due_at)
          / NULLIF(COUNT(*) FILTER (WHERE i.due_at IS NOT NULL), 0)
        , 1),
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
          / NULLIF(COUNT(*), 0)
        , 1)
      )
  , 1) AS individual_score
FROM public.count_items ci
JOIN public.inventories i ON i.id = ci.inventory_id
JOIN public.profiles p ON p.id = ci.counted_by
LEFT JOIN public.team_members tm ON tm.user_id = p.id
LEFT JOIN public.teams t ON t.id = tm.team_id
GROUP BY p.id, p.full_name, tm.team_id, t.name, DATE_TRUNC('week', ci.created_at);

GRANT SELECT ON public.scoring_weekly TO authenticated;

-- 6. team_scoring_monthly
CREATE VIEW public.team_scoring_monthly
WITH (security_invoker = true) AS
SELECT
  team_id,
  team_name,
  month,
  COUNT(DISTINCT user_id) AS members_count,
  ROUND(AVG(individual_score), 1) AS team_score
FROM public.scoring_monthly
WHERE team_id IS NOT NULL
GROUP BY team_id, team_name, month;

GRANT SELECT ON public.team_scoring_monthly TO authenticated;
