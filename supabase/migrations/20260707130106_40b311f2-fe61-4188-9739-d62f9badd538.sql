-- 1. Fix signup role-escalation: never trust raw_user_meta_data.role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Bootstrap: the very first user becomes admin; everyone else defaults to contador.
  -- Role escalation for later users must go through an authenticated admin path,
  -- never through client-supplied signup metadata.
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first;
  IF _is_first THEN
    _role := 'admin';
  ELSE
    _role := 'contador';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;
