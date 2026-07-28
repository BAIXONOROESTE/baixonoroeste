
CREATE OR REPLACE FUNCTION public.enforce_count_items_contador_restrictions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
  _qb numeric;
  _qc numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _qb := COALESCE(NEW.quantity_before, 0);
    _qc := COALESCE(NEW.quantity_counted, 0);
    NEW.status := CASE WHEN _qc = _qb THEN 'correto' ELSE 'divergencia' END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity_counted IS DISTINCT FROM OLD.quantity_counted
       OR NEW.quantity_before IS DISTINCT FROM OLD.quantity_before THEN
      _qb := COALESCE(NEW.quantity_before, 0);
      _qc := COALESCE(NEW.quantity_counted, 0);
      NEW.status := CASE WHEN _qc = _qb THEN 'correto' ELSE 'divergencia' END;
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
    -- Colaborador pode reenviar a contagem (corrigir a quantidade).
    -- Campos permitidos: quantity_counted, quantity_before (estoque de referência atualizado),
    -- unit_cost (custo atualizado do Omie) e counted_by (assume a autoria da nova contagem).
    IF NEW.needs_recount IS DISTINCT FROM OLD.needs_recount
       OR NEW.needs_adjust  IS DISTINCT FROM OLD.needs_adjust
       OR NEW.reviewer_note IS DISTINCT FROM OLD.reviewer_note
       OR NEW.omie_updated_at IS DISTINCT FROM OLD.omie_updated_at
       OR NEW.omie_response   IS DISTINCT FROM OLD.omie_response
       OR NEW.inventory_id  IS DISTINCT FROM OLD.inventory_id
       OR NEW.product_id    IS DISTINCT FROM OLD.product_id
       OR NEW.round         IS DISTINCT FROM OLD.round THEN
      RAISE EXCEPTION 'Colaborador só pode alterar a quantidade contada.'
        USING ERRCODE = '42501';
    END IF;

    -- Se o colaborador está atualizando, força counted_by = ele mesmo
    -- (evita passar a autoria para outro usuário).
    IF NEW.counted_by IS DISTINCT FROM OLD.counted_by THEN
      NEW.counted_by := _uid;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
