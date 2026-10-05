# 🏡 App Famiglia

Web app per la famiglia: dieta del giorno, peso, pressione, diario Wegovy, lista della spesa condivisa (le cose non prese restano in lista) e commissioni fuori casa.

- **Hosting:** GitHub Pages (gratis)
- **Login e dati:** Supabase, piano gratuito
- **Nessuna IA dentro, quindi nessun costo a consumo**
- Si installa sul telefono come un'app: icona nella schermata home

## Chi vede cosa
| Dato | Chi lo vede |
|---|---|
| Spesa, cose da fare fuori casa, data di inizio dieta | Tutti e due |
| Peso, pressione, diario Wegovy, altezza e obiettivo | Solo chi li scrive |

## Installazione (una volta sola)

### 1. Supabase
1. Su [supabase.com](https://supabase.com) fai *Continue with GitHub* → **New project** → nome `famiglia`, regione *Europe*.
2. **SQL Editor → New query**: incolla tutto il file `supabase/schema.sql` e premi **Run**.
3. **Authentication → Sign In / Providers → Email**: disattiva **"Allow new users to sign up"**. Così nessun estraneo può registrarsi, nemmeno conoscendo l'indirizzo dell'app.
4. **Authentication → Users → Add user → Create new user**: crea il tuo account e quello di tuo marito (email + password, con *Auto Confirm User* attivo).
5. **Project Settings → API**: copia **Project URL** e chiave **anon public** dentro `config.js`.
   ⚠️ La chiave **service_role** non va mai messa nell'app.

### 2. GitHub Pages
1. Crea un repository (es. `famiglia`) sul tuo account personale e caricaci questi file.
2. **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. L'app sarà su `https://<tuo-utente>.github.io/famiglia/`.

### 3. Sul telefono
- **iPhone (Safari):** apri il link → tasto Condividi → **Aggiungi alla schermata Home**
- **Android (Chrome):** apri il link → menu ⋮ → **Installa app**

## Prova in locale
```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```
- http://localhost:8080 → app vera (serve `config.js` compilato con le chiavi)
- http://localhost:8080/tools/test.html → app con dati finti, senza Supabase

## Come funziona la spesa
- Da **venerdì** la lista è per la settimana successiva: la spesa della dieta di quella settimana viene aggiunta da sola, una volta.
- Quello che non spunti **resta in lista** con l'etichetta *rimasto*.
- Le cose prese restano visibili 7 giorni nella sezione "Presi", poi spariscono.

## File
- `index.html`, `app.js`, `styles.css`: l'app
- `diet.js`: piano alimentare e aggiunte rapide della spesa (da aggiornare per le settimane nuove)
- `config.js`: collegamento a Supabase
- `supabase/schema.sql`: tabelle e regole di sicurezza
- `tools/`: server locale e database finto per le prove
