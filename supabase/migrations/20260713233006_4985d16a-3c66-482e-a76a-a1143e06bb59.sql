DROP POLICY IF EXISTS "signed-in create losses" ON public.losses;
CREATE POLICY "supervisor/admin create losses" ON public.losses
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_supervisor_or_admin() AND created_by = auth.uid());