
-- Fix mutable search_path on email queue helpers (pgmq objects are fully qualified).
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';

-- Revoke anonymous execute on the login-profile RPC.
-- The app now goes through the listLoginProfiles server function (service role, safe columns only).
REVOKE EXECUTE ON FUNCTION public.list_login_profiles() FROM PUBLIC, anon;
