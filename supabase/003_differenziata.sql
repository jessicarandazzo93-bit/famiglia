-- Calendario della differenziata (si può modificare anche dall'app: Calendario → Differenziata).
-- Mercoledì a settimane alterne a partire dal 7/10/2026. Promemoria la sera prima alle 20:30.
insert into public.app_settings (key, value) values ('rifiuti', '{
  "days": {
    "0": ["umido", "pannolini"],
    "1": ["carta"],
    "2": ["indiff", "pannolini"],
    "3": ["umido", "vetro"],
    "4": ["plastica", "pannolini"],
    "5": ["umido"]
  },
  "alt": { "2": "2026-10-07" },
  "when": "sera",
  "time": "20:30"
}'::jsonb)
on conflict (key) do update set value = excluded.value;
