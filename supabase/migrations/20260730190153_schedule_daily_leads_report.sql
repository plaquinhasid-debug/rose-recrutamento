create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-leads-report',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://iaqzbernshmhkqznleye.supabase.co/functions/v1/daily-leads-report',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
