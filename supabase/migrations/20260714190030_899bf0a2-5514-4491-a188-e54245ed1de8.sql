
-- =========================================================================
-- RPC 1: get_loss_notification_context
-- Retorna todo o contexto necessário para notificar sobre uma quebra.
-- SECURITY DEFINER porque contorna RLS de products/loss_reasons/profiles/user_roles.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_loss_notification_context(_loss_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _loss  losses%ROWTYPE;
  _product jsonb;
  _reason jsonb;
  _actor jsonb;
  _count_item jsonb;
  _recipients jsonb;
BEGIN
  -- Só authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _loss FROM public.losses WHERE id = _loss_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'loss not found' USING ERRCODE = 'P0002';
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
$$;

REVOKE ALL ON FUNCTION public.get_loss_notification_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loss_notification_context(uuid) TO authenticated;

-- =========================================================================
-- RPC 2: queue_transactional_email
-- Enfileira um e-mail transacional (log + pgmq) para um destinatário,
-- checando supressão e gerando token de descadastro.
-- Payload esperado:
--   { message_id, to, from, sender_domain, subject, html, text,
--     purpose, label, template_name, idempotency_key, queued_at }
-- Retorna: { ok, status: 'enqueued'|'suppressed'|'failed', message_id, reason? }
-- =========================================================================
CREATE OR REPLACE FUNCTION public.queue_transactional_email(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _to text;
  _template text;
  _message_id uuid;
  _unsub_token text;
  _existing_token text;
  _existing_used timestamptz;
  _final_payload jsonb;
  _bytes bytea;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  _to := lower(trim(COALESCE(_payload->>'to', '')));
  _template := COALESCE(_payload->>'template_name', _payload->>'label', 'unknown');
  _message_id := COALESCE((_payload->>'message_id')::uuid, gen_random_uuid());

  IF _to IS NULL OR _to = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'failed', 'reason', 'missing recipient');
  END IF;

  -- 1) supressão
  IF EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = _to) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'suppressed', 'message_id', _message_id);
  END IF;

  -- 2) token de descadastro (reaproveita ativo)
  SELECT token, used_at INTO _existing_token, _existing_used
  FROM public.email_unsubscribe_tokens WHERE email = _to;

  IF _existing_token IS NOT NULL AND _existing_used IS NULL THEN
    _unsub_token := _existing_token;
  ELSE
    _bytes := extensions.gen_random_bytes(32);
    _unsub_token := encode(_bytes, 'hex');
    INSERT INTO public.email_unsubscribe_tokens (token, email)
      VALUES (_unsub_token, _to)
      ON CONFLICT (email) DO UPDATE
        SET token = EXCLUDED.token, used_at = NULL;
  END IF;

  -- 3) log pending
  INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status)
    VALUES (_message_id, _template, _to, 'pending');

  -- 4) enfileira via wrapper existente
  _final_payload := _payload
    || jsonb_build_object(
      'message_id', _message_id,
      'to', _to,
      'unsubscribe_token', _unsub_token,
      'queued_at', COALESCE(_payload->>'queued_at', now()::text)
    );

  PERFORM public.enqueue_email('transactional_emails', _final_payload);

  RETURN jsonb_build_object('ok', true, 'status', 'enqueued', 'message_id', _message_id);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_transactional_email(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_transactional_email(jsonb) TO authenticated;
