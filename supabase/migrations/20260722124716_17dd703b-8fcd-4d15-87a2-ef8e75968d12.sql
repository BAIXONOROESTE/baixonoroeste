
-- 1) email_relay_rpc: revoke queue_transactional_email from authenticated/anon
REVOKE EXECUTE ON FUNCTION public.queue_transactional_email(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_transactional_email(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_transactional_email(jsonb) TO service_role;

-- 2) loss_ctx_leak: authorize caller before returning loss context
CREATE OR REPLACE FUNCTION public.get_loss_notification_context(_loss_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _loss  losses%ROWTYPE;
  _uid uuid := auth.uid();
  _allowed boolean := false;
  _product jsonb;
  _reason jsonb;
  _actor jsonb;
  _count_item jsonb;
  _recipients jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _loss FROM public.losses WHERE id = _loss_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'loss not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: caller must be creator, the assigned counter of the
  -- related inventory, or a supervisor/admin.
  IF _loss.created_by = _uid
     OR public.has_role(_uid, 'admin')
     OR public.has_role(_uid, 'supervisor') THEN
    _allowed := true;
  ELSIF _loss.count_item_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.count_items ci
      JOIN public.inventories i ON i.id = ci.inventory_id
      WHERE ci.id = _loss.count_item_id
        AND i.assigned_counter_id = _uid
    ) INTO _allowed;
  END IF;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(p) INTO _product
  FROM (
    SELECT name, code, unit, cost, omie_id
    FROM public.products WHERE id = _loss.product_id
  ) p;

  SELECT to_jsonb(r) INTO _reason
  FROM (
    SELECT name FROM public.loss_reasons WHERE id = _loss.reason_id
  ) r;

  SELECT to_jsonb(a) INTO _actor
  FROM (
    SELECT full_name, email FROM public.profiles WHERE id = _loss.created_by
  ) a;

  IF _loss.count_item_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'inventory_id', ci.inventory_id,
      'inventory_name', i.name
    ) INTO _count_item
    FROM public.count_items ci
    LEFT JOIN public.inventories i ON i.id = ci.inventory_id
    WHERE ci.id = _loss.count_item_id;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT p.email) FILTER (WHERE p.email IS NOT NULL), '[]'::jsonb)
    INTO _recipients
  FROM public.profiles p
  WHERE p.active = true
    AND (
      p.id = _loss.created_by
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('admin','supervisor')
      )
    );

  RETURN jsonb_build_object(
    'loss_id', _loss.id,
    'created_at', _loss.created_at,
    'product', _product,
    'reason', _reason,
    'actor', _actor,
    'count_item', _count_item,
    'recipients', _recipients
  );
END;
$function$;

-- 3) losses_daily_public: update pg_cron to send Authorization header with service role key
SELECT cron.unschedule('losses-daily-report');
SELECT cron.schedule(
  'losses-daily-report',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--3b0cb417-8a2e-4642-b988-e04b92853993.lovable.app/api/public/reports/losses-daily',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
