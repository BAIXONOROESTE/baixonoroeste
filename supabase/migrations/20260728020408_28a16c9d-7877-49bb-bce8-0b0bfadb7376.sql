
ALTER TABLE public.checklist_recurring_assignments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.checklist_recurring_assignments
  ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.checklist_recurring_assignments
  ADD CONSTRAINT recurring_target_check
  CHECK (
    (user_id IS NOT NULL AND team_id IS NULL)
    OR (user_id IS NULL AND team_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.expected_team_assignees(p_team_id uuid, p_check_date date)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm.user_id
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND p.active = true
    AND public.person_works_on_date(tm.user_id, p_check_date);
$$;

GRANT EXECUTE ON FUNCTION public.expected_team_assignees(uuid, date) TO authenticated;
