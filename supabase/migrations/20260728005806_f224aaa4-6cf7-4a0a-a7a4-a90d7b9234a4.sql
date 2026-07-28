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

  -- App convention: 0 = Sunday .. 6 = Saturday (Postgres DOW).
  _dow := EXTRACT(DOW FROM p_check_date)::INTEGER;

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