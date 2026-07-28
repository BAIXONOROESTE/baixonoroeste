CREATE TABLE public.checklist_recurring_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL UNIQUE REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_recurring_assignments TO authenticated;
GRANT ALL ON public.checklist_recurring_assignments TO service_role;

ALTER TABLE public.checklist_recurring_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_assignments_select_authenticated"
  ON public.checklist_recurring_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "recurring_assignments_insert_sup_admin"
  ON public.checklist_recurring_assignments FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE POLICY "recurring_assignments_update_sup_admin"
  ON public.checklist_recurring_assignments FOR UPDATE
  TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE POLICY "recurring_assignments_delete_sup_admin"
  ON public.checklist_recurring_assignments FOR DELETE
  TO authenticated
  USING (public.current_user_is_supervisor_or_admin());

CREATE TRIGGER trg_checklist_recurring_assignments_updated_at
  BEFORE UPDATE ON public.checklist_recurring_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.person_works_on_date(p_user_id UUID, p_check_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_any BOOLEAN;
  _dow INTEGER;
  _weekly_match BOOLEAN;
  _twelve_match BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.work_shifts WHERE user_id = p_user_id) INTO _has_any;
  IF NOT _has_any THEN
    RETURN TRUE;
  END IF;

  -- ISO weekday: 1 = Monday .. 7 = Sunday. Match whatever convention the app stores.
  _dow := EXTRACT(ISODOW FROM p_check_date)::INTEGER;

  SELECT EXISTS (
    SELECT 1 FROM public.work_shifts
    WHERE user_id = p_user_id
      AND shift_type = 'semanal'
      AND (weekday IS NULL OR weekday = _dow)
  ) INTO _weekly_match;

  IF _weekly_match THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.work_shifts
    WHERE user_id = p_user_id
      AND shift_type = '12x36'
      AND reference_date IS NOT NULL
      AND MOD((p_check_date - reference_date)::INTEGER, 2) = 0
  ) INTO _twelve_match;

  RETURN _twelve_match;
END;
$$;

GRANT EXECUTE ON FUNCTION public.person_works_on_date(UUID, DATE) TO authenticated;