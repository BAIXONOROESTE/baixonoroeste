DROP POLICY IF EXISTS "admin manages sync_log" ON public.sync_log;
CREATE POLICY "supervisor or admin manages sync_log" ON public.sync_log
  FOR ALL TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

DROP POLICY IF EXISTS "admin manages products" ON public.products;
CREATE POLICY "supervisor or admin manages products" ON public.products
  FOR ALL TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

DROP POLICY IF EXISTS "admin manages families" ON public.families;
CREATE POLICY "supervisor or admin manages families" ON public.families
  FOR ALL TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());