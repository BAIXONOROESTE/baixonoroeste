
CREATE TABLE public.maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','resolvido')),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  related_run_item_id UUID REFERENCES public.checklist_run_items(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id),
  resolution_note TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tickets TO authenticated;
GRANT ALL ON public.maintenance_tickets TO service_role;

ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets select authenticated"
  ON public.maintenance_tickets FOR SELECT TO authenticated USING (true);

CREATE POLICY "tickets insert own"
  ON public.maintenance_tickets FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "tickets update sup/admin"
  ON public.maintenance_tickets FOR UPDATE TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE TRIGGER update_maintenance_tickets_updated_at
  BEFORE UPDATE ON public.maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.maintenance_ticket_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  evidence_path TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('foto','video')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_ticket_evidence TO authenticated;
GRANT ALL ON public.maintenance_ticket_evidence TO service_role;

ALTER TABLE public.maintenance_ticket_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket evidence select authenticated"
  ON public.maintenance_ticket_evidence FOR SELECT TO authenticated USING (true);

CREATE POLICY "ticket evidence insert own"
  ON public.maintenance_ticket_evidence FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "maintenance-evidence insert own prefix"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IS NOT NULL
  );

CREATE POLICY "maintenance-evidence select authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'maintenance-evidence');
