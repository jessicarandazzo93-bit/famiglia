-- Notifiche push (applicato col connettore Supabase il 2026-10-06).
-- Le chiavi VAPID e il segreto del cron stanno in public.push_config (nessun accesso dall'app): NON vanno nel repository.
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;
alter table public.push_subscriptions enable row level security;
create policy "solo mio" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.notifications_sent (key text primary key, sent_at timestamptz not null default now());
create table if not exists public.push_config (key text primary key, value text not null);
revoke all on public.notifications_sent, public.push_config from anon, authenticated;
alter table public.notifications_sent enable row level security;
alter table public.push_config enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ogni 5 minuti chiama la funzione "notifiche" (supabase/functions/notifiche)
select cron.schedule('notifiche-famiglia', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://uctwaqosanqvqgdiacsj.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.push_config where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);
