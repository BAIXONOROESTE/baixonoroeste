-- 1) scheduled_time on checklist_templates
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS scheduled_time time;

UPDATE public.checklist_templates SET scheduled_time = '08:00' WHERE name = 'Abertura de Loja';
UPDATE public.checklist_templates SET scheduled_time = '21:00' WHERE name = 'Fechamento de Loja';

-- 2) new evidence table
CREATE TABLE public.checklist_run_item_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_item_id uuid NOT NULL REFERENCES public.checklist_run_items(id) ON DELETE CASCADE,
  evidence_path text NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('foto','video')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_run_item_evidence TO authenticated;
GRANT ALL ON public.checklist_run_item_evidence TO service_role;

ALTER TABLE public.checklist_run_item_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence select authenticated"
  ON public.checklist_run_item_evidence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "evidence insert own"
  ON public.checklist_run_item_evidence FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "evidence delete own or supervisor/admin"
  ON public.checklist_run_item_evidence FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.current_user_is_supervisor_or_admin()
  );

CREATE INDEX idx_checklist_run_item_evidence_run_item
  ON public.checklist_run_item_evidence(run_item_id);

-- 3) drop unused columns from checklist_run_items
ALTER TABLE public.checklist_run_items DROP COLUMN IF EXISTS evidence_path;
ALTER TABLE public.checklist_run_items DROP COLUMN IF EXISTS evidence_type;
