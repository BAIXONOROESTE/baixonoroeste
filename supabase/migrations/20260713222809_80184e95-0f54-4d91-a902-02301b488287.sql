
CREATE OR REPLACE FUNCTION public.enforce_inventory_contador_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
  _default_sup uuid;
  _default_adm uuid;
  _default_tol numeric;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_priv := public.current_user_is_supervisor_or_admin();
  IF _is_priv THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Força responsável = próprio contador
    NEW.assigned_counter_id := _uid;

    -- Herda supervisor/admin padrão (primeiro ativo com o papel)
    SELECT ur.user_id INTO _default_sup
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'supervisor' AND p.active = true
     ORDER BY p.created_at ASC LIMIT 1;
    SELECT ur.user_id INTO _default_adm
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'admin' AND p.active = true
     ORDER BY p.created_at ASC LIMIT 1;

    NEW.assigned_supervisor_id := _default_sup;
    NEW.assigned_admin_id := _default_adm;

    -- Contador não define prazo nem tolerância customizada
    NEW.deadline_at := NULL;
    SELECT tolerance_pct_default INTO _default_tol FROM public.settings WHERE id = 1;
    NEW.tolerance_pct := COALESCE(_default_tol, 0);

  ELSIF TG_OP = 'UPDATE' THEN
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
