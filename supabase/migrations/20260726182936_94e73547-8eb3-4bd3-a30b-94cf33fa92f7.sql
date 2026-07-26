
CREATE TABLE public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('semanal','12x36')),
  weekday INT CHECK (weekday IS NULL OR (weekday BETWEEN 0 AND 6)),
  reference_date DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_shifts TO authenticated;
GRANT ALL ON public.work_shifts TO service_role;

ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_shifts_select_all_auth" ON public.work_shifts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_shifts_insert_sup_admin" ON public.work_shifts
  FOR INSERT TO authenticated WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "work_shifts_update_sup_admin" ON public.work_shifts
  FOR UPDATE TO authenticated USING (public.current_user_is_supervisor_or_admin()) WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "work_shifts_delete_sup_admin" ON public.work_shifts
  FOR DELETE TO authenticated USING (public.current_user_is_supervisor_or_admin());

CREATE TRIGGER update_work_shifts_updated_at
  BEFORE UPDATE ON public.work_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.out_of_shift_activity
WITH (security_invoker = true) AS
WITH activities AS (
  SELECT ci.counted_by AS user_id,
         (ci.created_at AT TIME ZONE 'America/Sao_Paulo') AS local_ts,
         'contagem'::text AS tipo,
         COALESCE(p.name, 'Produto') AS descricao
  FROM public.count_items ci
  LEFT JOIN public.products p ON p.id = ci.product_id
  WHERE ci.counted_by IS NOT NULL
  UNION ALL
  SELECT cri.done_by AS user_id,
         (cri.done_at AT TIME ZONE 'America/Sao_Paulo') AS local_ts,
         'checklist'::text AS tipo,
         COALESCE(cti.title, 'Item de checklist') AS descricao
  FROM public.checklist_run_items cri
  LEFT JOIN public.checklist_template_items cti ON cti.id = cri.template_item_id
  WHERE cri.done_by IS NOT NULL AND cri.done_at IS NOT NULL
  UNION ALL
  SELECT mt.reported_by AS user_id,
         (mt.created_at AT TIME ZONE 'America/Sao_Paulo') AS local_ts,
         'manutencao'::text AS tipo,
         mt.title AS descricao
  FROM public.maintenance_tickets mt
  WHERE mt.reported_by IS NOT NULL
),
evaluated AS (
  SELECT a.user_id,
         pr.full_name,
         a.tipo,
         a.descricao,
         a.local_ts,
         (a.local_ts::date) AS local_date,
         (a.local_ts::time) AS local_time,
         EXTRACT(DOW FROM a.local_ts)::int AS local_dow,
         -- has any shift configured?
         EXISTS (SELECT 1 FROM public.work_shifts ws WHERE ws.user_id = a.user_id) AS has_shift,
         -- does any shift cover this day?
         EXISTS (
           SELECT 1 FROM public.work_shifts ws
           WHERE ws.user_id = a.user_id
             AND (
               (ws.shift_type = 'semanal' AND (ws.weekday IS NULL OR ws.weekday = EXTRACT(DOW FROM a.local_ts)::int))
               OR
               (ws.shift_type = '12x36' AND ws.reference_date IS NOT NULL
                 AND ((a.local_ts::date - ws.reference_date) % 2) = 0
                 AND (a.local_ts::date - ws.reference_date) >= 0)
             )
         ) AS day_ok,
         -- does any shift cover both day AND time?
         EXISTS (
           SELECT 1 FROM public.work_shifts ws
           WHERE ws.user_id = a.user_id
             AND (
               (ws.shift_type = 'semanal' AND (ws.weekday IS NULL OR ws.weekday = EXTRACT(DOW FROM a.local_ts)::int))
               OR
               (ws.shift_type = '12x36' AND ws.reference_date IS NOT NULL
                 AND ((a.local_ts::date - ws.reference_date) % 2) = 0
                 AND (a.local_ts::date - ws.reference_date) >= 0)
             )
             AND (
               (ws.start_time <= ws.end_time AND (a.local_ts::time) BETWEEN ws.start_time AND ws.end_time)
               OR
               (ws.start_time > ws.end_time AND ((a.local_ts::time) >= ws.start_time OR (a.local_ts::time) <= ws.end_time))
             )
         ) AS in_shift
  FROM activities a
  LEFT JOIN public.profiles pr ON pr.id = a.user_id
)
SELECT user_id,
       full_name,
       tipo,
       descricao,
       local_ts AS created_at,
       CASE WHEN NOT day_ok THEN 'dia_de_folga' ELSE 'fora_do_horario' END AS motivo
FROM evaluated
WHERE has_shift = true
  AND in_shift = false;

GRANT SELECT ON public.out_of_shift_activity TO authenticated;
