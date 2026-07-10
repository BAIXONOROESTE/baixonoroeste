ALTER TABLE public.auth_signup_invites
ADD COLUMN IF NOT EXISTS reset_for_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS auth_signup_invites_reset_for_user_id_idx
ON public.auth_signup_invites (reset_for_user_id)
WHERE reset_for_user_id IS NOT NULL AND used_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invite public.auth_signup_invites%ROWTYPE;
  _full_name TEXT;
  _slug TEXT;
  _role public.app_role;
  _is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first;

  SELECT * INTO _invite
  FROM public.auth_signup_invites
  WHERE auth_email = NEW.email
    AND used_at IS NULL
  LIMIT 1;

  IF NOT FOUND AND NOT _is_first THEN
    RAISE EXCEPTION 'Cadastro não autorizado.' USING ERRCODE = '28000';
  END IF;

  IF _invite.reset_for_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = _invite.reset_for_user_id) THEN
      UPDATE auth.users
      SET encrypted_password = NEW.encrypted_password,
          updated_at = now()
      WHERE id = _invite.reset_for_user_id;
    END IF;

    UPDATE public.auth_signup_invites
    SET used_at = now()
    WHERE id = _invite.id;

    DELETE FROM auth.users WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  _full_name := COALESCE(_invite.full_name, NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  _slug := COALESCE(_invite.slug, NEW.raw_user_meta_data->>'slug', split_part(NEW.email,'@',1));

  IF _is_first THEN
    _role := 'admin';
  ELSE
    _role := COALESCE(_invite.role, 'contador');
  END IF;

  INSERT INTO public.profiles (id, full_name, slug, avatar_color, phone, email, active)
    VALUES (
      NEW.id,
      _full_name,
      _slug,
      COALESCE(_invite.avatar_color, NEW.raw_user_meta_data->>'avatar_color', 'amber'),
      _invite.phone,
      _invite.contact_email,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      slug = EXCLUDED.slug,
      avatar_color = EXCLUDED.avatar_color,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      active = EXCLUDED.active;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;

  IF _invite.id IS NOT NULL THEN
    UPDATE public.auth_signup_invites
    SET used_at = now()
    WHERE id = _invite.id;
  END IF;

  RETURN NEW;
END;
$function$;