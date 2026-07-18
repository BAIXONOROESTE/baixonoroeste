
DROP POLICY IF EXISTS "evidence select authenticated" ON public.checklist_run_item_evidence;
CREATE POLICY "evidence select scoped" ON public.checklist_run_item_evidence
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_supervisor_or_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.checklist_run_items ri
      JOIN public.checklist_runs r ON r.id = ri.run_id
      WHERE ri.id = checklist_run_item_evidence.run_item_id
        AND r.started_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "checklist-evidence select authenticated" ON storage.objects;
CREATE POLICY "checklist evidence select scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'checklist-evidence'
    AND (
      public.current_user_is_supervisor_or_admin()
      OR auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.checklist_run_items ri
        JOIN public.checklist_runs r ON r.id = ri.run_id
        WHERE ri.id::text = (storage.foldername(name))[2]
          AND r.started_by = auth.uid()
      )
    )
  );
