
-- 1) Enums: estender inventory_status e inventory_type
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'pendente';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'em_andamento';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'concluida';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'pendente_validacao';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'divergencia';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'recontagem_solicitada';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'ajuste_solicitado';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'recontagem_enviada';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'aguardando_validacao';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'aprovada';
ALTER TYPE public.inventory_status ADD VALUE IF NOT EXISTS 'reprovada';

ALTER TYPE public.inventory_type ADD VALUE IF NOT EXISTS 'personalizado';

-- 2) Novos campos em inventories
ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS assigned_counter_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_supervisor_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tolerance_pct numeric(6,3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inventories_counter ON public.inventories(assigned_counter_id);
CREATE INDEX IF NOT EXISTS idx_inventories_supervisor ON public.inventories(assigned_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_inventories_deadline ON public.inventories(deadline_at);

-- 3) Novos campos em count_items
ALTER TABLE public.count_items
  ADD COLUMN IF NOT EXISTS needs_recount boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_adjust  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS round int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reviewer_note text;

-- 4) settings: webhook n8n + tolerância padrão
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS n8n_webhook_url text,
  ADD COLUMN IF NOT EXISTS n8n_webhook_secret text,
  ADD COLUMN IF NOT EXISTS tolerance_pct_default numeric(6,3) NOT NULL DEFAULT 0;

-- 5) inventory_families
CREATE TABLE IF NOT EXISTS public.inventory_families (
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inventory_id, family_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_families TO authenticated;
GRANT ALL ON public.inventory_families TO service_role;
ALTER TABLE public.inventory_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read inv_families" ON public.inventory_families FOR SELECT TO authenticated USING (true);
CREATE POLICY "sup/admin write inv_families" ON public.inventory_families
  FOR ALL TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

-- 6) inventory_products
CREATE TABLE IF NOT EXISTS public.inventory_products (
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inventory_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_products TO authenticated;
GRANT ALL ON public.inventory_products TO service_role;
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read inv_products" ON public.inventory_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "sup/admin write inv_products" ON public.inventory_products
  FOR ALL TO authenticated
  USING (public.current_user_is_supervisor_or_admin())
  WITH CHECK (public.current_user_is_supervisor_or_admin());

-- 7) count_item_history (auditoria)
CREATE TABLE IF NOT EXISTS public.count_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_item_id uuid REFERENCES public.count_items(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, -- 'contagem_inicial' | 'recontagem' | 'ajuste' | 'revisao'
  quantity_before numeric(14,3),
  quantity_counted numeric(14,3),
  difference numeric(14,3),
  round int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cih_inventory ON public.count_item_history(inventory_id);
CREATE INDEX IF NOT EXISTS idx_cih_item ON public.count_item_history(count_item_id);
GRANT SELECT, INSERT ON public.count_item_history TO authenticated;
GRANT ALL ON public.count_item_history TO service_role;
ALTER TABLE public.count_item_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read history" ON public.count_item_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed-in insert history" ON public.count_item_history
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- 8) count_item_reviews (decisões do revisor)
CREATE TABLE IF NOT EXISTS public.count_item_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_item_id uuid NOT NULL REFERENCES public.count_items(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, -- 'aprovar' | 'recontagem' | 'ajuste' | 'reprovar'
  reason text,
  deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cir_inventory ON public.count_item_reviews(inventory_id);
CREATE INDEX IF NOT EXISTS idx_cir_item ON public.count_item_reviews(count_item_id);
GRANT SELECT, INSERT ON public.count_item_reviews TO authenticated;
GRANT ALL ON public.count_item_reviews TO service_role;
ALTER TABLE public.count_item_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read reviews" ON public.count_item_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "sup/admin insert reviews" ON public.count_item_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_supervisor_or_admin() AND reviewer_id = auth.uid());
