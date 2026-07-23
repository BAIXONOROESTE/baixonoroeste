
-- 1. checklist_run_item_evidence INSERT scoped
DROP POLICY IF EXISTS "evidence insert own" ON public.checklist_run_item_evidence;
CREATE POLICY "checklist evidence insert scoped" ON public.checklist_run_item_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.checklist_run_items ri
      JOIN public.checklist_runs r ON r.id = ri.run_id
      WHERE ri.id = checklist_run_item_evidence.run_item_id
        AND (r.started_by = auth.uid() OR public.current_user_is_supervisor_or_admin())
    )
  );

-- 2. maintenance_ticket_evidence INSERT scoped
DROP POLICY IF EXISTS "ticket evidence insert own" ON public.maintenance_ticket_evidence;
CREATE POLICY "maintenance evidence insert scoped" ON public.maintenance_ticket_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.maintenance_tickets t
      WHERE t.id = maintenance_ticket_evidence.ticket_id
        AND (t.reported_by = auth.uid() OR t.assigned_to = auth.uid() OR public.current_user_is_supervisor_or_admin())
    )
  );

-- 4. reference media on checklist_template_items
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS reference_media_path TEXT,
  ADD COLUMN IF NOT EXISTS reference_media_type TEXT CHECK (reference_media_type IN ('foto','video'));
