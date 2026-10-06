-- App Famiglia: aggiornamento 2 (diario, ciclo, calendario, cose da fare a casa).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run.

-- Cose da fare: a casa o fuori casa
alter table public.tasks add column if not exists kind text not null default 'fuori';
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('fuori', 'casa'));

-- Calendario in comune
create table if not exists public.events (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 120),
  day date not null,
  time time,
  who text check (char_length(who) <= 40),
  note text check (char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Diario di ogni giorno (privato)
create table if not exists public.diary (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  mood smallint check (mood between 1 and 5),
  tags text[] not null default '{}',
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- Ciclo (privato)
create table if not exists public.cycle_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  start_day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, start_day)
);

grant select, insert, update, delete on public.events, public.diary, public.cycle_log to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.events, public.diary, public.cycle_log from anon;

alter table public.events    enable row level security;
alter table public.diary     enable row level security;
alter table public.cycle_log enable row level security;

drop policy if exists "condiviso" on public.events;
drop policy if exists "solo mio" on public.diary;
drop policy if exists "solo mio" on public.cycle_log;
create policy "condiviso" on public.events    for all to authenticated using (true) with check (true);
create policy "solo mio"  on public.diary     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "solo mio"  on public.cycle_log for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.events;
