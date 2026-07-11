-- 1) Dedupe idempotente para a fila offline de contagem
ALTER TABLE public.count_items
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_count_items_client_mutation
  ON public.count_items(client_mutation_id) WHERE client_mutation_id IS NOT NULL;

-- 2) Tabela de recusas
CREATE TABLE IF NOT EXISTS public.inventory_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  rejected_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  notes text,
  recount_deadline timestamptz,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.inventory_rejections TO authenticated;
GRANT ALL ON public.inventory_rejections TO service_role;

ALTER TABLE public.inventory_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sup/admin can insert rejections"
  ON public.inventory_rejections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "participants can read rejections"
  ON public.inventory_rejections
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = inventory_rejections.inventory_id
        AND (i.assigned_counter_id = auth.uid()
             OR i.assigned_supervisor_id = auth.uid()
             OR i.assigned_admin_id = auth.uid()
             OR i.started_by = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_inventory_rejections_inv ON public.inventory_rejections(inventory_id);

-- 3) Intervalo configurável de auto-sync Omie
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS auto_sync_interval_seconds integer NOT NULL DEFAULT 300;