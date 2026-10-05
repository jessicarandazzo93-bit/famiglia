-- App Famiglia: schema del database.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run.
-- Dati condivisi (spesa, cose da fare, impostazioni) li vede chiunque abbia fatto login;
-- dati di salute (peso, pressione, Wegovy) li vede solo chi li ha scritti.

-- Nomi visualizzati
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);

-- Impostazioni condivise (es. data di inizio dieta)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb
);

-- Lista della spesa (condivisa)
create table if not exists public.shopping_items (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'casa' check (category in ('dieta', 'casa', 'bambini', 'altro')),
  week_start date not null,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users on delete set null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Settimane di dieta già caricate nella spesa (evita doppioni)
create table if not exists public.diet_weeks_loaded (
  week_start date primary key,
  loaded_at timestamptz not null default now()
);

-- Cose da fare fuori casa (condivise)
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 120),
  due date,
  assignee uuid references auth.users on delete set null,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Salute: privati per ciascuno
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  follows_diet boolean not null default true,
  height_cm int check (height_cm between 100 and 230),
  goal_kg numeric(5,1) check (goal_kg between 30 and 300)
);

create table if not exists public.weights (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  kg numeric(5,1) not null check (kg between 30 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.blood_pressure (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  measured_at timestamptz not null default now(),
  sys int not null check (sys between 60 and 260),
  dia int not null check (dia between 30 and 160),
  pulse int check (pulse between 30 and 220),
  note text
);

create table if not exists public.wegovy_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  dose text not null,
  notes text
);

-- Accesso alle tabelle solo per chi ha fatto login (le regole qui sotto decidono cosa vede)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- Sicurezza (Row Level Security)
alter table public.profiles          enable row level security;
alter table public.app_settings      enable row level security;
alter table public.shopping_items    enable row level security;
alter table public.diet_weeks_loaded enable row level security;
alter table public.tasks             enable row level security;
alter table public.user_settings     enable row level security;
alter table public.weights           enable row level security;
alter table public.blood_pressure    enable row level security;
alter table public.wegovy_log        enable row level security;

-- Profili: tutti leggono i nomi, ognuno scrive solo il proprio
create policy "profili leggibili" on public.profiles for select to authenticated using (true);
create policy "profilo proprio insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profilo proprio update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Condivisi
create policy "condiviso" on public.app_settings      for all to authenticated using (true) with check (true);
create policy "condiviso" on public.shopping_items    for all to authenticated using (true) with check (true);
create policy "condiviso" on public.diet_weeks_loaded for all to authenticated using (true) with check (true);
create policy "condiviso" on public.tasks             for all to authenticated using (true) with check (true);

-- Privati
create policy "solo mio" on public.user_settings  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "solo mio" on public.weights        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "solo mio" on public.blood_pressure for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "solo mio" on public.wegovy_log     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Aggiornamenti in tempo reale per spesa e cose da fare
alter publication supabase_realtime add table public.shopping_items, public.tasks;
