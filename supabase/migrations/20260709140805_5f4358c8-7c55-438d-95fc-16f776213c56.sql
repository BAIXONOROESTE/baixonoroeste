GRANT SELECT ON public.profiles TO anon;

CREATE POLICY "anon can list active profiles for pin login"
ON public.profiles
FOR SELECT
TO anon
USING (active = true);