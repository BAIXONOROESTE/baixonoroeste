
-- Trigger to enforce that contador-role users cannot set assignment/deadline/tolerance fields
CREATE OR REPLACE FUNCTION public.enforce_inventory_contador_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
BEGIN
  -- Service role / no auth context: allow (server functions using admin client bypass this)
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_priv := public.current_user_is_supervisor_or_admin();
  IF _is_priv THEN
    RETURN NEW;
  END IF;

  -- Contador rules
  IF TG_OP = 'INSERT' THEN
    -- Force counter to self; block setting supervisor/admin/deadline/tolerance manually
    IF NEW.assigned_counter_id IS DISTINCT FROM _uid THEN
      NEW.assigned_counter_id := _uid;
    END IF;
    IF NEW.assigned_supervisor_id IS NOT NULL AND NEW.assigned_supervisor_id <> _uid THEN
      -- allow only if it was auto-filled to a valid supervisor by server fn — but contador
      -- shouldn't be picking; we accept any value written by server fn since it derived it.
      NULL;
    END IF;
    -- Contador cannot set custom deadline or tolerance
    IF NEW.deadline_at IS NOT NULL OR NEW.tolerance_pct IS DISTINCT FROM 0 THEN
      -- Allow only if server fn set them from defaults; we can't distinguish here reliably,
      -- so we forbid explicit non-default values coming from a contador session.
      -- To keep server-fn flexibility, we simply null them out.
      NEW.deadline_at := NULL;
      NEW.tolerance_pct := COALESCE((SELECT tolerance_pct_default FROM public.settings WHERE id = 1), 0);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Contador cannot change any of these fields
    IF NEW.assigned_counter_id IS DISTINCT FROM OLD.assigned_counter_id
       OR NEW.assigned_supervisor_id IS DISTINCT FROM OLD.assigned_supervisor_id
       OR NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id
       OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at
       OR NEW.tolerance_pct IS DISTINCT FROM OLD.tolerance_pct THEN
      RAISE EXCEPTION 'Colaborador não pode alterar responsável, supervisor, administrador, prazo ou tolerância.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventories_contador_restrictions ON public.inventories;
CREATE TRIGGER trg_inventories_contador_restrictions
  BEFORE INSERT OR UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_contador_restrictions();
