
-- 1) CRÍTICO: trigger de restrição em count_items para contadores
CREATE OR REPLACE FUNCTION public.enforce_count_items_contador_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_priv := public.current_user_is_supervisor_or_admin();
  IF _is_priv THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.counted_by := _uid;
    IF NEW.needs_recount IS DISTINCT FROM false
       OR NEW.needs_adjust IS DISTINCT FROM false
       OR NEW.reviewer_note IS NOT NULL
       OR NEW.omie_updated_at IS NOT NULL
       OR NEW.omie_response IS NOT NULL THEN
      RAISE EXCEPTION 'Colaborador não pode definir campos de revisão ou integração Omie.'
        USING ERRCODE = '42501';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.counted_by       IS DISTINCT FROM OLD.counted_by
       OR NEW.unit_cost     IS DISTINCT FROM OLD.unit_cost
       OR NEW.needs_recount IS DISTINCT FROM OLD.needs_recount
       OR NEW.needs_adjust  IS DISTINCT FROM OLD.needs_adjust
       OR NEW.reviewer_note IS DISTINCT FROM OLD.reviewer_note
       OR NEW.omie_updated_at IS DISTINCT FROM OLD.omie_updated_at
       OR NEW.omie_response   IS DISTINCT FROM OLD.omie_response
       OR NEW.inventory_id  IS DISTINCT FROM OLD.inventory_id
       OR NEW.product_id    IS DISTINCT FROM OLD.product_id
       OR NEW.quantity_before IS DISTINCT FROM OLD.quantity_before
       OR NEW.status        IS DISTINCT FROM OLD.status
       OR NEW.round         IS DISTINCT FROM OLD.round THEN
      RAISE EXCEPTION 'Colaborador só pode alterar a quantidade contada.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_count_items_contador_restrictions ON public.count_items;
CREATE TRIGGER trg_count_items_contador_restrictions
BEFORE INSERT OR UPDATE ON public.count_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_count_items_contador_restrictions();

DROP TRIGGER IF EXISTS trg_inventories_contador_restrictions ON public.inventories;
CREATE TRIGGER trg_inventories_contador_restrictions
BEFORE INSERT OR UPDATE ON public.inventories
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_contador_restrictions();

-- 3) MODERADO: TO authenticated explícito
DROP POLICY IF EXISTS "sup/admin or own read logs" ON public.logs;
CREATE POLICY "sup/admin or own read logs" ON public.logs
  FOR SELECT TO authenticated
  USING (public.current_user_is_supervisor_or_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "own insert logs" ON public.logs;
CREATE POLICY "own insert logs" ON public.logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "assigned or supervisor/admin read history" ON public.count_item_history;
CREATE POLICY "assigned or supervisor/admin read history" ON public.count_item_history
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_supervisor_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = count_item_history.inventory_id
        AND i.assigned_counter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assigned or supervisor/admin read reviews" ON public.count_item_reviews;
CREATE POLICY "assigned or supervisor/admin read reviews" ON public.count_item_reviews
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_supervisor_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = count_item_reviews.inventory_id
        AND i.assigned_counter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assigned or supervisor/admin read losses" ON public.losses;
CREATE POLICY "assigned or supervisor/admin read losses" ON public.losses
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_supervisor_or_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.count_items ci
      JOIN public.inventories i ON i.id = ci.inventory_id
      WHERE ci.id = losses.count_item_id
        AND i.assigned_counter_id = auth.uid()
    )
  );

-- 4) BAIXO: REVOKE ALL do role anon em tabelas auth-only
REVOKE ALL ON public.user_roles           FROM anon;
REVOKE ALL ON public.settings             FROM anon;
REVOKE ALL ON public.sync_log             FROM anon;
REVOKE ALL ON public.inventories          FROM anon;
REVOKE ALL ON public.inventory_families   FROM anon;
REVOKE ALL ON public.inventory_products   FROM anon;
REVOKE ALL ON public.inventory_rejections FROM anon;
REVOKE ALL ON public.count_items          FROM anon;
REVOKE ALL ON public.count_item_history   FROM anon;
REVOKE ALL ON public.count_item_reviews   FROM anon;
REVOKE ALL ON public.close_requests       FROM anon;
REVOKE ALL ON public.logs                 FROM anon;
REVOKE ALL ON public.losses               FROM anon;
REVOKE ALL ON public.products             FROM anon;
REVOKE ALL ON public.families             FROM anon;
REVOKE ALL ON public.loss_reasons         FROM anon;
REVOKE ALL ON public.auth_signup_invites  FROM anon;
REVOKE ALL ON public.email_send_log       FROM anon;
REVOKE ALL ON public.email_send_state     FROM anon;
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon;
REVOKE ALL ON public.notification_outbox  FROM anon;
REVOKE ALL ON public.pin_reset_tokens     FROM anon;
REVOKE ALL ON public.suppressed_emails    FROM anon;
REVOKE ALL ON public.profiles             FROM anon;

-- 5) BAIXO: proteção de profiles contra auto-alteração de campos sensíveis
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(_uid, 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.id = _uid THEN
    IF NEW.active IS DISTINCT FROM OLD.active
       OR NEW.slug   IS DISTINCT FROM OLD.slug
       OR NEW.email  IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Somente um administrador pode alterar seu status, slug ou e-mail.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_self_update_restrictions ON public.profiles;
CREATE TRIGGER trg_profiles_self_update_restrictions
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update_restrictions();
