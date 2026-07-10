CREATE TABLE IF NOT EXISTS public.auth_signup_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  slug text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'contador',
  avatar_color text NOT NULL DEFAULT 'amber',
  phone text,
  contact_email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_signup_invites TO authenticated;
GRANT ALL ON public.auth_signup_invites TO service_role;

ALTER TABLE public.auth_signup_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage auth signup invites" ON public.auth_signup_invites;
CREATE POLICY "Admins can manage auth signup invites"
ON public.auth_signup_invites
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

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

  IF FOUND THEN
    UPDATE public.auth_signup_invites
    SET used_at = now()
    WHERE id = _invite.id;
  END IF;

  RETURN NEW;
END;
$function$;