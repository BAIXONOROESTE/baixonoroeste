
ALTER TABLE public.losses
  ADD COLUMN IF NOT EXISTS omie_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS omie_response jsonb;
