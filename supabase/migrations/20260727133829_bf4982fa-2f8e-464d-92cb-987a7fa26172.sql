
ALTER TABLE public.checklist_run_items
  DROP CONSTRAINT checklist_run_items_template_item_id_fkey;

ALTER TABLE public.checklist_run_items
  ADD CONSTRAINT checklist_run_items_template_item_id_fkey
  FOREIGN KEY (template_item_id) REFERENCES public.checklist_template_items(id) ON DELETE CASCADE;

CREATE TABLE public.pending_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'email',
  template_name TEXT NOT NULL,
  recipients TEXT[] NOT NULL,
  template_data JSONB NOT NULL,
  send_after TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.pending_notifications TO service_role;

ALTER TABLE public.pending_notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pending_notifications_unsent
  ON public.pending_notifications (send_after)
  WHERE sent_at IS NULL;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('pending-notifications-flush');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(
  'pending-notifications-flush',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--3b0cb417-8a2e-4642-b988-e04b92853993.lovable.app/api/public/notifications/process-pending',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $cron$
);
