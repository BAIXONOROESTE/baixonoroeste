
CREATE OR REPLACE FUNCTION public.enforce_count_items_contador_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
  _computed text;
  _qb numeric;
  _qc numeric;
BEGIN
  -- Always derive status from quantities (for everyone, all ops).
  -- Reviewer-only statuses ('atualizado','justificado','recontagem_solicitada')
  -- are preserved when the quantity did not change on UPDATE.
  IF TG_OP = 'INSERT' THEN
    _qb := COALESCE(NEW.quantity_before, 0);
    _qc := COALESCE(NEW.quantity_counted, 0);
    IF _qc = _qb THEN
      NEW.status := 'correto';
    ELSE
      NEW.status := 'divergencia';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity_counted IS DISTINCT FROM OLD.quantity_counted
       OR NEW.quantity_before IS DISTINCT FROM OLD.quantity_before THEN
      _qb := COALESCE(NEW.quantity_before, 0);
      _qc := COALESCE(NEW.quantity_counted, 0);
      IF _qc = _qb THEN
        NEW.status := 'correto';
      ELSE
        NEW.status := 'divergencia';
      END IF;
    END IF;
  END IF;

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
    -- Status is intentionally NOT in this list — it is computed above.
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
       OR NEW.round         IS DISTINCT FROM OLD.round THEN
      RAISE EXCEPTION 'Colaborador só pode alterar a quantidade contada.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
