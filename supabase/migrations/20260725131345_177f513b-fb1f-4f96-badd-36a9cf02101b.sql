
CREATE TABLE public.checklist_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, assignment_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_assignments TO authenticated;
GRANT ALL ON public.checklist_assignments TO service_role;

ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_assignments_select_authenticated"
  ON public.checklist_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "checklist_assignments_insert_sup_admin"
  ON public.checklist_assignments FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE POLICY "checklist_assignments_update_sup_admin"
  ON public.checklist_assignments FOR UPDATE
  TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE POLICY "checklist_assignments_delete_sup_admin"
  ON public.checklist_assignments FOR DELETE
  TO authenticated
  USING (public.current_user_is_supervisor_or_admin());

CREATE TRIGGER update_checklist_assignments_updated_at
  BEFORE UPDATE ON public.checklist_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.checklist_runs ADD COLUMN observacao_geral TEXT;
