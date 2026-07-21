
DROP POLICY IF EXISTS "ticket evidence select authenticated" ON public.maintenance_ticket_evidence;
CREATE POLICY "maintenance evidence select scoped" ON public.maintenance_ticket_evidence
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_supervisor_or_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.maintenance_tickets t
      WHERE t.id = maintenance_ticket_evidence.ticket_id
        AND (t.reported_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "maintenance-evidence select authenticated" ON storage.objects;
CREATE POLICY "maintenance evidence storage select scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'maintenance-evidence'
    AND (
      public.current_user_is_supervisor_or_admin()
      OR auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.maintenance_tickets t
        WHERE t.id::text = (storage.foldername(name))[2]
          AND (t.reported_by = auth.uid() OR t.assigned_to = auth.uid())
      )
    )
  );
