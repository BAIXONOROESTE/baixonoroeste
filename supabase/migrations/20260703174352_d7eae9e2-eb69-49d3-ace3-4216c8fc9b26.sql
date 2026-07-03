
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'contador');
CREATE TYPE public.inventory_type AS ENUM ('geral', 'familia', 'produto');
CREATE TYPE public.inventory_status AS ENUM ('aberto', 'fechado');
CREATE TYPE public.count_status AS ENUM ('correto', 'divergencia', 'atualizado', 'justificado');
CREATE TYPE public.sync_status AS ENUM ('sucesso', 'erro', 'em_andamento');

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- =========================================================
-- Profiles
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  avatar_color TEXT NOT NULL DEFAULT 'amber',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- User roles
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin') $$;

CREATE OR REPLACE FUNCTION public.current_user_is_supervisor_or_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') $$;

-- Profiles policies (need has_role first)
CREATE POLICY "everyone signed-in reads profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "self can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "read own roles or admin reads all" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "admin manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

-- =========================================================
-- Families
-- =========================================================
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  omie_id TEXT UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read families" ON public.families FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages families" ON public.families FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE TRIGGER trg_families_updated BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Products (espelho Omie)
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  omie_id TEXT UNIQUE NOT NULL,
  code TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  family_id UUID REFERENCES public.families(id),
  family_name TEXT,
  unit TEXT,
  stock_omie NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  price NUMERIC(14,4),
  location TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_products_code ON public.products(code);
CREATE INDEX idx_products_family ON public.products(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages products" ON public.products FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Inventories
-- =========================================================
CREATE TABLE public.inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.inventory_type NOT NULL,
  family_id UUID REFERENCES public.families(id),
  status public.inventory_status NOT NULL DEFAULT 'aberto',
  started_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventories TO authenticated;
GRANT ALL ON public.inventories TO service_role;
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read inventories" ON public.inventories FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed-in create inventories" ON public.inventories FOR INSERT TO authenticated
  WITH CHECK (started_by = auth.uid());
CREATE POLICY "supervisor/admin update inventories" ON public.inventories FOR UPDATE TO authenticated
  USING (public.current_user_is_supervisor_or_admin() OR started_by = auth.uid())
  WITH CHECK (public.current_user_is_supervisor_or_admin() OR started_by = auth.uid());
CREATE POLICY "admin deletes inventories" ON public.inventories FOR DELETE TO authenticated
  USING (public.current_user_is_admin());
CREATE TRIGGER trg_inventories_updated BEFORE UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Count items
-- =========================================================
CREATE TABLE public.count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  counted_by UUID NOT NULL REFERENCES auth.users(id),
  quantity_before NUMERIC(14,3) NOT NULL DEFAULT 0,
  quantity_counted NUMERIC(14,3) NOT NULL,
  difference NUMERIC(14,3) GENERATED ALWAYS AS (quantity_counted - quantity_before) STORED,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  financial_diff NUMERIC(14,4) GENERATED ALWAYS AS ((quantity_counted - quantity_before) * unit_cost) STORED,
  status public.count_status NOT NULL DEFAULT 'correto',
  omie_updated_at TIMESTAMPTZ,
  omie_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, product_id)
);
CREATE INDEX idx_count_items_inv ON public.count_items(inventory_id);
CREATE INDEX idx_count_items_user ON public.count_items(counted_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.count_items TO authenticated;
GRANT ALL ON public.count_items TO service_role;
ALTER TABLE public.count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read counts" ON public.count_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed-in insert own counts" ON public.count_items FOR INSERT TO authenticated
  WITH CHECK (counted_by = auth.uid());
CREATE POLICY "own or supervisor update counts" ON public.count_items FOR UPDATE TO authenticated
  USING (counted_by = auth.uid() OR public.current_user_is_supervisor_or_admin())
  WITH CHECK (counted_by = auth.uid() OR public.current_user_is_supervisor_or_admin());
CREATE POLICY "admin/supervisor delete counts" ON public.count_items FOR DELETE TO authenticated
  USING (public.current_user_is_supervisor_or_admin());
CREATE TRIGGER trg_count_items_updated BEFORE UPDATE ON public.count_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Loss reasons (configurable)
-- =========================================================
CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loss_reasons TO authenticated;
GRANT ALL ON public.loss_reasons TO service_role;
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read loss reasons" ON public.loss_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages loss reasons" ON public.loss_reasons FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

INSERT INTO public.loss_reasons (name) VALUES
  ('Quebra'), ('Vencimento'), ('Degustação'), ('Consumo interno'), ('Desperdício'), ('Outro');

-- =========================================================
-- Losses
-- =========================================================
CREATE TABLE public.losses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_item_id UUID REFERENCES public.count_items(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  reason_id UUID NOT NULL REFERENCES public.loss_reasons(id),
  quantity NUMERIC(14,3) NOT NULL,
  observation TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_losses_product ON public.losses(product_id);
CREATE INDEX idx_losses_user ON public.losses(created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.losses TO authenticated;
GRANT ALL ON public.losses TO service_role;
ALTER TABLE public.losses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read losses" ON public.losses FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed-in create losses" ON public.losses FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "admin/supervisor edit losses" ON public.losses FOR UPDATE TO authenticated
  USING (public.current_user_is_supervisor_or_admin()) WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "admin delete losses" ON public.losses FOR DELETE TO authenticated
  USING (public.current_user_is_admin());

-- =========================================================
-- Settings (singleton row)
-- =========================================================
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  omie_update_mode TEXT NOT NULL DEFAULT 'encerramento' CHECK (omie_update_mode IN ('imediato','encerramento')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin updates settings" ON public.settings FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
INSERT INTO public.settings (id) VALUES (1);

-- =========================================================
-- Sync log
-- =========================================================
CREATE TABLE public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  status public.sync_status NOT NULL,
  message TEXT,
  items_count INT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.sync_log TO authenticated;
GRANT ALL ON public.sync_log TO service_role;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read sync_log" ON public.sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages sync_log" ON public.sync_log FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

-- =========================================================
-- Logs
-- =========================================================
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_created ON public.logs(created_at DESC);
CREATE INDEX idx_logs_action ON public.logs(action);
GRANT SELECT, INSERT ON public.logs TO authenticated;
GRANT ALL ON public.logs TO service_role;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read logs" ON public.logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "signed-in insert logs" ON public.logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- =========================================================
-- Trigger: auto-create profile on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _full_name TEXT;
  _slug TEXT;
  _role public.app_role;
  _is_first BOOLEAN;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  _slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email,'@',1));
  INSERT INTO public.profiles (id, full_name, slug, avatar_color)
    VALUES (NEW.id, _full_name, _slug, COALESCE(NEW.raw_user_meta_data->>'avatar_color', 'amber'))
    ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first;
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'contador');
  IF _is_first THEN _role := 'admin'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Ranking view
-- =========================================================
CREATE OR REPLACE VIEW public.ranking_view AS
SELECT
  p.id AS user_id,
  p.full_name,
  DATE_TRUNC('month', ci.created_at)::DATE AS month,
  COUNT(*) AS conferidos,
  COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado')) AS acertos,
  COUNT(*) FILTER (WHERE ci.status = 'divergencia') AS divergencias,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE ci.status IN ('correto','atualizado'))
    / NULLIF(COUNT(*),0), 1
  ) AS percentual
FROM public.count_items ci
JOIN public.profiles p ON p.id = ci.counted_by
GROUP BY p.id, p.full_name, DATE_TRUNC('month', ci.created_at);

GRANT SELECT ON public.ranking_view TO authenticated;
