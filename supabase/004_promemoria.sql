-- Orari dei promemoria, personali per ciascuno (applicato col connettore Supabase il 2026-10-06)
alter table public.user_settings add column if not exists reminders jsonb not null default '{}'::jsonb;
