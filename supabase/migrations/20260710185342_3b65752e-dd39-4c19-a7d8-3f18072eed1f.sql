-- Schedule daily losses & breakage report at 05:00 America/Sao_Paulo (08:00 UTC)
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('losses-daily-report');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(
  'losses-daily-report',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--3b0cb417-8a2e-4642-b988-e04b92853993.lovable.app/api/public/reports/losses-daily',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $cron$
);