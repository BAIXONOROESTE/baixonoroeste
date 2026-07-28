CREATE OR REPLACE FUNCTION public.expected_checklist_assignees(p_template_id UUID, p_check_date DATE)
RETURNS TABLE(user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tpl AS (
    SELECT scheduled_time FROM public.checklist_templates WHERE id = p_template_id
  ),
  cand AS (
    SELECT
      ws.user_id,
      LEAST(
        LEAST(
          ABS(EXTRACT(EPOCH FROM ((SELECT scheduled_time FROM tpl) - ws.start_time)) / 60),
          1440 - ABS(EXTRACT(EPOCH FROM ((SELECT scheduled_time FROM tpl) - ws.start_time)) / 60)
        ),
        LEAST(
          ABS(EXTRACT(EPOCH FROM ((SELECT scheduled_time FROM tpl) - ws.end_time)) / 60),
          1440 - ABS(EXTRACT(EPOCH FROM ((SELECT scheduled_time FROM tpl) - ws.end_time)) / 60)
        )
      ) AS diff_min
    FROM public.work_shifts ws
    WHERE (SELECT scheduled_time FROM tpl) IS NOT NULL
      AND public.person_works_on_date(ws.user_id, p_check_date)
  ),
  best AS (
    SELECT MIN(diff_min) AS m FROM cand WHERE diff_min <= 180
  )
  SELECT DISTINCT c.user_id
  FROM cand c, best
  WHERE best.m IS NOT NULL
    AND c.diff_min = best.m;
$$;

GRANT EXECUTE ON FUNCTION public.expected_checklist_assignees(UUID, DATE) TO authenticated;