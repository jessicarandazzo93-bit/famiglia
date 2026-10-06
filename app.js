import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_DIET_START, VAPID_PUBLIC } from './config.js';
import { DIET, QUICK } from './diet.js';

const app = document.getElementById('app');
const configured = !SUPABASE_URL.startsWith('INCOLLA') && !SUPABASE_ANON_KEY.startsWith('INCOLLA');

// "Resta connesso": la sessione va in localStorage (resta) o in sessionStorage (finisce alla chiusura)
const remember = () => { try { return localStorage.getItem('remember') !== '0'; } catch { return true; } };
const authStorage = {
  getItem(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
  setItem(k, v) { try { (remember() ? localStorage : sessionStorage).setItem(k, v); } catch { /* niente */ } },
  removeItem(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* niente */ } },
};
// Link arrivati per email (invito o "password dimenticata"): li leggo prima che Supabase pulisca l'indirizzo
const linkParams = new URLSearchParams(location.hash.slice(1));
const linkType = linkParams.get('type'); // 'invite' | 'recovery'
const linkError = linkParams.get('error_code');
const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true } })
  : null;

// ---------- utilità ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d) => addDays(dayStart(d), -((d.getDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / 86400000);
const wdIdx = (d) => (d.getDay() + 6) % 7; // 0 = lunedì
const fmtDay = (s) => parseYmd(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = (s) => parseYmd(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDT = (s) => new Date(s).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hm = (t) => (t ? t.slice(0, 5) : '');
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kgFmt = (n) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const CATS = [['dieta', '🥗 Dieta'], ['casa', '🏠 Casa'], ['bambini', '🧸 Bambini'], ['altro', '📦 Altro']];
const catLabel = (c) => (CATS.find((x) => x[0] === c) || [c, c])[1];
const MOODS = ['😣', '😕', '😐', '🙂', '😄'];
const MOOD_TXT = ['Male', 'Così così', 'Normale', 'Bene', 'Benissimo'];
const TAGS = ['Nausea', 'Stanchezza', 'Poca fame', 'Tanta fame', 'Mal di testa', 'Stitichezza', 'Gonfiore', 'Reflusso', 'Nervosa', 'Piena di energia', 'Dormito male'];
const RIFIUTI = [['umido', '🍂', 'Organico'], ['plastica', '🧴', 'Plastica e metalli'], ['carta', '📦', 'Carta e cartone'], ['vetro', '🍾', 'Vetro'], ['indiff', '🗑️', 'Indifferenziata'], ['pannolini', '👶', 'Pannolini']];
const rifName = (k) => { const r = RIFIUTI.find((x) => x[0] === k); return r ? `${r[1]} ${r[2]}` : k; };
const CYCLE_DAYS = 28;

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } },
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2800);
}
function fail(e) {
  console.error(e);
  toast(navigator.onLine ? 'Qualcosa è andato storto, riprova' : 'Sei offline: riprova quando torna la rete');
}
const check = ({ data, error }) => { if (error) throw error; return data; };
// tabelle aggiunte dopo: se lo script del database non è ancora stato lanciato, restano vuote
const optional = (res) => (res.error && /PGRST205|42P01/.test(res.error.code) ? [] : check(res));

// ---------- stato ----------
const S = {
  user: null,
  profiles: {},
  settings: {},
  mine: { follows_diet: true, height_cm: null, goal_kg: null },
  shopping: [], tasks: [], weights: [], bp: [], wegovy: [], events: [], diary: [], cycle: [],
  tab: store.get('tab', 'oggi') === 'fuori' ? 'fare' : store.get('tab', 'oggi'),
  htab: store.get('htab', 'dieta'),
  ttab: store.get('tab', '') === 'fuori' ? 'fuori' : store.get('ttab', 'casa'),
  shopFilter: 'tutto',
  dietWeek: null,
  calMonth: null,
  calDay: null,
  channel: null,
};

const dietStart = () => S.settings.diet_start || DEFAULT_DIET_START;
function dietPos(date) {
  const start = mondayOf(parseYmd(dietStart()));
  const diff = daysBetween(start, date);
  if (diff < 0) return null;
  const w = Math.floor(diff / 7);
  return { weekNum: w + 1, idx: w % 4, day: wdIdx(date) };
}
const dietDay = (date) => { const p = dietPos(date); return p ? { ...DIET.settimane[p.idx].giorni[p.day], pos: p } : null; };
// Da venerdì la spesa è per la settimana successiva
function shopWeek() {
  const t = new Date();
  return wdIdx(t) >= 4 ? addDays(mondayOf(t), 7) : mondayOf(t);
}
const nameOf = (id) => (id === S.user?.id ? 'te' : S.profiles[id] || 'qualcuno');

// Differenziata: { days: { '0': ['umido'], ... }, when: 'sera' | 'mattina', time: '20:30' }
// alt: { '2': '2026-10-07' } = quel giorno si raccoglie a settimane alterne, a partire da quella data
const rif = () => ({ days: {}, alt: {}, when: 'sera', time: '', ...(S.settings.rifiuti || {}) });
const isAltWeek = (date, anchor) => ((daysBetween(parseYmd(anchor), date) % 14) + 14) % 14 === 0;
// raccolta prevista da calendario, prima di togliere i festivi
const rifPlanned = (date) => {
  const r = rif(), i = wdIdx(date);
  const types = r.days[i] || [];
  return types.length && r.alt?.[i] && !isAltWeek(date, r.alt[i]) ? [] : types;
};
const rifOn = (date) => (isHoliday(date) ? [] : rifPlanned(date));

// Festività nazionali (nei festivi niente raccolta)
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}
const holidayCache = {};
function isHoliday(date) {
  const y = date.getFullYear();
  holidayCache[y] ||= new Set([...['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].map((md) => `${y}-${md}`), ymd(addDays(easter(y), 1))]);
  return holidayCache[y].has(ymd(date));
}
const rem = () => ({ before: 60, allday: 'sera', alldayTime: '20:00', ...(S.mine.reminders || {}) });
const rifTime = () => rem().rif || rif().time || (rif().when === 'sera' ? '20:30' : '07:00');

// Ciclo: previsione a 28 giorni dall'ultimo inizio
function cycleInfo() {
  if (!S.cycle.length) return null;
  const last = S.cycle[0].start_day;
  const next = addDays(parseYmd(last), CYCLE_DAYS);
  const lens = S.cycle.slice(0, 7).map((c, i, a) => (a[i + 1] ? daysBetween(parseYmd(a[i + 1].start_day), parseYmd(c.start_day)) : null)).filter((n) => n && n < 60);
  return {
    last,
    next: ymd(next),
    dayOf: daysBetween(parseYmd(last), new Date()) + 1,
    toNext: daysBetween(new Date(), next),
    avg: lens.length ? Math.round(lens.reduce((s, n) => s + n, 0) / lens.length) : null,
  };
}

// ---------- notifiche push ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// non resto mai bloccata se il service worker non è (ancora) attivo
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw-timeout')), 4000))]);
const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// S.push: 'on' | 'off' | 'denied' | 'need-install' (iPhone da Safari) | 'unsupported'
async function checkPush() {
  if (!pushSupported()) { S.push = isIOS && !isStandalone() ? 'need-install' : 'unsupported'; return; }
  if (Notification.permission === 'denied') { S.push = 'denied'; return; }
  try {
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription();
    S.push = sub && Notification.permission === 'granted' ? 'on' : 'off';
    if (sub && S.push === 'on') await saveSubscription(sub); // tiene il telefono collegato all'account giusto
  } catch { S.push = 'off'; }
}
async function saveSubscription(sub) {
  const j = sub.toJSON();
  check(await sb.from('push_subscriptions').upsert(
    { user_id: S.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: isIOS ? 'iPhone' : navigator.platform || 'web' },
    { onConflict: 'endpoint' },
  ));
}
async function enablePush() {
  const perm = await Notification.requestPermission(); // deve partire subito dal tocco (iPhone)
  if (perm !== 'granted') { S.push = perm === 'denied' ? 'denied' : 'off'; render(); return; }
  const reg = await swReady();
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(VAPID_PUBLIC) }));
  await saveSubscription(sub);
  S.push = 'on';
  render();
  toast('Notifiche attive 🔔');
}
async function disablePush() {
  const reg = await swReady();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  S.push = 'off';
  render();
  toast('Notifiche disattivate su questo telefono');
}
async function testPush() {
  const { data, error } = await sb.functions.invoke('notifiche', { body: { test: true } });
  if (error) throw error;
  toast(data?.sent ? 'Inviata! Dovrebbe arrivare tra pochi secondi' : 'Nessun telefono collegato: attiva prima le notifiche');
}

function pushCard(compact) {
  const p = S.push;
  if (p === 'on') {
    return compact ? '' : `<div class="card tip"><h2>🔔 Notifiche attive su questo telefono</h2>
      <p class="small" style="margin:0 0 10px">Ti arrivano da sole: differenziata e impegni, agli orari scelti qui sotto.</p>
      <div class="row"><button class="btn ghost" data-act="push-test">Manda una prova</button><button class="btn danger" data-act="push-off">Disattiva</button></div></div>`;
  }
  if (p === 'need-install') {
    return `<div class="card warn"><h2>🔔 Per avere le notifiche</h2>
      <p class="small" style="margin:0">Su iPhone le notifiche funzionano solo dall'app installata:
      in Safari tocca <b>Condividi ⬆️ → Aggiungi alla schermata Home</b>, poi apri l'app dall'icona 🏡 e torna qui.</p></div>`;
  }
  if (p === 'denied') {
    return `<div class="card warn"><h2>🔕 Notifiche bloccate</h2>
      <p class="small" style="margin:0">Le hai rifiutate su questo telefono. Per riattivarle: <b>Impostazioni → Notifiche → Famiglia → Consenti notifiche</b>.</p></div>`;
  }
  if (p === 'off') {
    return `<div class="card tip"><h2>🔔 Attiva le notifiche</h2>
      <p class="small" style="margin:0 0 10px">Ti avviso io per la differenziata e gli impegni, anche ad app chiusa.</p>
      <button class="btn" data-act="push-on">Attiva notifiche</button></div>`;
  }
  return '';
}

// ---------- dati ----------
const since = () => new Date(Date.now() - 7 * 86400000).toISOString();
const loaders = {
  async profiles() {
    const rows = check(await sb.from('profiles').select('id,name'));
    S.profiles = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  },
  async settings() {
    const rows = check(await sb.from('app_settings').select('key,value'));
    S.settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  async mine() {
    const row = check(await sb.from('user_settings').select('*').maybeSingle());
    if (row) S.mine = row;
  },
  async shopping() {
    S.shopping = check(await sb.from('shopping_items').select('*').or(`done.eq.false,done_at.gte.${since()}`).order('created_at'));
  },
  async tasks() {
    S.tasks = check(await sb.from('tasks').select('*').or(`done.eq.false,done_at.gte.${since()}`).order('created_at'));
  },
  async weights() {
    S.weights = check(await sb.from('weights').select('id,day,kg').order('day').order('created_at'));
  },
  async bp() {
    S.bp = check(await sb.from('blood_pressure').select('*').order('measured_at', { ascending: false }).limit(90));
  },
  async wegovy() {
    S.wegovy = check(await sb.from('wegovy_log').select('*').order('day', { ascending: false }).limit(60));
  },
  async events() {
    S.events = optional(await sb.from('events').select('*').gte('day', ymd(addDays(new Date(), -90))).order('day').order('time', { nullsFirst: true }));
  },
  async diary() {
    S.diary = optional(await sb.from('diary').select('*').order('day', { ascending: false }).limit(120));
  },
  async cycle() {
    S.cycle = optional(await sb.from('cycle_log').select('*').order('start_day', { ascending: false }).limit(24));
  },
};
const reload = async (...names) => { await Promise.all(names.map((n) => loaders[n]())); render(); };

async function ensureDietShopping() {
  if (!S.mine.follows_diet) return;
  const target = shopWeek();
  const pos = dietPos(target);
  if (!pos) return;
  const ws = ymd(target);
  const { error } = await sb.from('diet_weeks_loaded').insert({ week_start: ws });
  if (error) { if (error.code === '23505') return; throw error; }
  const rows = DIET.settimane[pos.idx].spesa.map((name) => ({ name, category: 'dieta', week_start: ws }));
  check(await sb.from('shopping_items').insert(rows));
  await loaders.shopping();
}

function subscribe() {
  if (S.channel) return;
  const timers = {};
  const later = (name) => () => { clearTimeout(timers[name]); timers[name] = setTimeout(() => reload(name).catch(fail), 300); };
  S.channel = sb.channel('famiglia')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, later('shopping'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, later('tasks'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, later('events'))
    .subscribe();
}

// ---------- avvio ----------
async function boot() {
  if (!configured) { renderSetup(); return; }
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT') {
      S.user = null;
      if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
      renderLogin();
    }
  });
  const { data } = await sb.auth.getSession();
  if (data.session && (linkType === 'invite' || linkType === 'recovery')) renderSetPassword(linkType);
  else if (data.session) await start(data.session.user);
  else {
    renderLogin();
    if (linkError) {
      showLoginMsg(linkError === 'otp_expired'
        ? 'Il link della mail è scaduto o già usato. Scrivi la tua email qui sopra e tocca "Password dimenticata?" per riceverne uno nuovo.'
        : 'Il link della mail non è valido. Scrivi la tua email e tocca "Password dimenticata?".');
    }
  }
}

function showLoginMsg(msg, ok) {
  const p = document.getElementById('l-err');
  if (!p) return;
  p.textContent = msg;
  p.style.color = ok ? 'var(--green)' : 'var(--red)';
  p.hidden = false;
}

function renderSetPassword(type) {
  history.replaceState(null, '', location.pathname);
  app.innerHTML = `<div class="login">
    <div class="logo">🔑</div>
    <h1 style="text-align:center">${type === 'invite' ? 'Benvenuto/a!' : 'Nuova password'}</h1>
    <p class="muted" style="text-align:center">Scegli la password che userai per entrare</p>
    <form class="card" data-form="set-pass">
      <label class="f" for="sp-1">Password (almeno 8 caratteri)</label>
      <input id="sp-1" name="p1" type="password" autocomplete="new-password" minlength="8" required>
      <label class="f" for="sp-2">Riscrivila</label>
      <input id="sp-2" name="p2" type="password" autocomplete="new-password" minlength="8" required>
      <p style="margin:14px 0 0"><button class="btn full">Salva ed entra</button></p>
      <p id="l-err" class="small" style="color:var(--red);margin:10px 0 0" hidden></p>
    </form></div>`;
}

async function start(user) {
  S.user = user;
  app.innerHTML = '<div class="center muted">Caricamento…</div>';
  try {
    await Promise.all(Object.values(loaders).map((f) => f()));
    if (!S.profiles[user.id]) { renderName(); return; }
    await ensureDietShopping();
    await checkPush();
    render();
    subscribe();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="center"><div><p>Non riesco a caricare i dati.</p><button class="btn" onclick="location.reload()">Riprova</button></div></div>`;
  }
}

// Quando si torna sull'app (es. dal telefono) aggiorno i dati condivisi
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.user && S.profiles[S.user.id]) {
    ensureDietShopping().then(() => reload('shopping', 'tasks', 'events')).catch(() => {});
  }
});

// ---------- schermate fuori dall'app ----------
function renderSetup() {
  app.innerHTML = `<div class="login card"><h2>Quasi pronta 🛠️</h2>
    <p>Manca il collegamento al database: inserisci <b>Project URL</b> e chiave <b>anon</b> di Supabase nel file <code>config.js</code>.</p></div>`;
}

function renderLogin() {
  app.innerHTML = `<div class="login">
    <div class="logo">🏡</div>
    <h1 style="text-align:center">Famiglia</h1>
    <p class="muted" style="text-align:center">Entra con la tua email e password</p>
    <form class="card" data-form="login">
      <label class="f" for="l-email">Email</label>
      <input id="l-email" name="email" type="email" autocomplete="username" autocapitalize="none" required>
      <label class="f" for="l-pass">Password</label>
      <input id="l-pass" name="password" type="password" autocomplete="current-password" required>
      <label class="f" style="display:flex;gap:8px;align-items:center;margin-top:12px;color:var(--ink);font-size:15px">
        <input id="l-remember" name="remember" type="checkbox" style="width:auto" ${remember() ? 'checked' : ''}> Resta connesso
      </label>
      <p style="margin:14px 0 0"><button class="btn full">Entra</button></p>
      <p id="l-err" class="small" style="color:var(--red);margin:10px 0 0" hidden></p>
      <p style="margin:10px 0 0;text-align:center"><button type="button" class="linkbtn" data-act="forgot">Password dimenticata? / Primo accesso</button></p>
    </form></div>`;
}

function renderName() {
  app.innerHTML = `<div class="login">
    <div class="logo">👋</div>
    <h1 style="text-align:center">Benvenuta/o!</h1>
    <form class="card" data-form="name">
      <label class="f" for="n-name">Come ti chiami? (lo vede anche l'altro, es. "Mamma")</label>
      <input id="n-name" name="name" maxlength="40" required>
      <label class="f" style="display:flex;gap:8px;align-items:center;margin-top:12px">
        <input type="checkbox" name="diet" checked style="width:auto"> Seguo il piano alimentare
      </label>
      <p style="margin:14px 0 0"><button class="btn full">Inizia</button></p>
    </form></div>`;
}

// ---------- render principale ----------
function render() {
  if (!S.user) return;
  // conserva quello che si stava scrivendo quando arriva un aggiornamento in tempo reale
  const kept = {};
  app.querySelectorAll('input[id],select[id],textarea[id]').forEach((el) => {
    kept[el.id] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
  });
  const focus = document.activeElement?.id;

  const views = { oggi: viewOggi, salute: viewSalute, spesa: viewSpesa, fare: viewFare, calendario: viewCalendario };
  const view = (views[S.tab] || viewOggi)();
  app.innerHTML = `<div class="wrap">
      <div class="top"><span class="who">Ciao ${esc(S.profiles[S.user.id])}</span>
        <button class="linkbtn" data-act="logout">Esci</button></div>
      ${view}
    </div>${nav()}`;

  for (const [id, v] of Object.entries(kept)) {
    const el = document.getElementById(id);
    if (!el || el.dataset.fresh) continue;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = v; else el.value = v;
  }
  if (focus) document.getElementById(focus)?.focus();
}

function nav() {
  const today = ymd(new Date());
  const toBuy = S.shopping.filter((i) => !i.done).length;
  const late = S.tasks.filter((t) => !t.done && t.due && t.due <= today).length;
  const evToday = S.events.filter((e) => e.day === today).length;
  const b = (id, ic, lbl, dot) => `<button class="${S.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}">
      <span class="ic">${ic}</span>${lbl}${dot ? `<span class="dot">${dot}</span>` : ''}</button>`;
  return `<nav class="tabs"><div class="in">
    ${b('oggi', '🏡', 'Oggi')}${b('salute', '💚', 'Salute')}${b('spesa', '🛒', 'Spesa', toBuy)}${b('fare', '📋', 'Da fare', late)}${b('calendario', '📅', 'Calendario', evToday)}
  </div></nav>`;
}

// ---------- OGGI ----------
function mealBlock(g) {
  return `<div class="meal">
    <div class="lbl">Pranzo</div><div>${esc(g.pranzo)}</div>
    <div class="lbl">Cena</div><div class="${g.libero ? 'free' : ''}">${esc(g.cena)}${g.doppio ? ' <span class="badge orange">cucina doppio</span>' : ''}</div>
  </div>`;
}

function viewOggi() {
  const now = new Date();
  const today = ymd(now);
  const h = now.getHours();
  const saluto = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  let out = `<h1>${saluto} ☀️</h1><div class="muted" style="text-transform:capitalize">${fmtLong(today)}</div>`;
  out += pushCard(true);

  // Differenziata
  const r = rif();
  const rDay = r.when === 'sera' ? addDays(now, 1) : now;
  const rTypes = rifOn(rDay);
  if (rTypes.length) {
    out += `<div class="card info" data-act="tab" data-v="calendario" style="cursor:pointer"><b>♻️ ${r.when === 'sera' ? 'Stasera porta fuori' : 'Stamattina porta fuori'}:</b> ${rTypes.map(rifName).join(', ')}</div>`;
  } else if (isHoliday(rDay) && rifPlanned(rDay).length) {
    out += `<div class="card info">♻️ ${r.when === 'sera' ? 'Domani' : 'Oggi'} è festivo: <b>niente raccolta</b>, non portare fuori niente.</div>`;
  }

  // Impegni di oggi e domani
  const tomorrow = ymd(addDays(now, 1));
  const evs = S.events.filter((e) => e.day === today || e.day === tomorrow);
  if (evs.length) {
    out += `<div class="card" data-act="tab" data-v="calendario" style="cursor:pointer"><h2>📅 Impegni</h2><ul class="list">${evs.map((e) =>
      `<li class="item"><div class="main"><div class="title">${e.time ? `<b>${hm(e.time)}</b> ` : ''}${esc(e.title)}</div>
        <div class="meta">${e.day === today ? '<span class="badge orange">oggi</span>' : '<span class="badge blue">domani</span>'}${e.who ? ' · ' + esc(e.who) : ''}</div></div></li>`).join('')}</ul></div>`;
  }

  // Dieta
  if (S.mine.follows_diet) {
    const g = dietDay(now);
    if (!g) {
      out += `<div class="card info">🥗 La dieta parte <b>${fmtDay(ymd(mondayOf(parseYmd(dietStart()))))}</b>.</div>`;
    } else {
      out += `<div class="card"><h2>🍽️ Oggi si mangia <span class="badge">Settimana ${g.pos.idx + 1}${g.pos.weekNum > 4 ? ` · giro ${Math.ceil(g.pos.weekNum / 4)}` : ''}</span></h2>
        <details class="meal-c"><summary>☕ Colazione: una a scelta</summary>
          <ul style="margin:4px 0 6px 18px;padding:0">${DIET.colazioni.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>
        ${mealBlock(g)}
        <p class="small muted" style="margin:10px 0 0">💊 Libramed prima dei pasti con 2 bicchieri d'acqua · 💧 1,5–2 litri al giorno</p>
      </div>`;

      const gt = dietDay(addDays(now, 1));
      if (gt && gt.pos.day <= 4) {
        out += `<div class="card tip"><b>🌙 Stasera prepara il pranzo di domani</b><br>${esc(gt.pranzo)}
          ${g.doppio ? '<div class="small" style="margin-top:4px">Usa la seconda porzione della cena di stasera.</div>' : ''}</div>`;
      }
      if (g.pos.day === 6) {
        out += `<div class="card warn"><b>🕐 Domenica: 30 minuti di preparazione</b>
          <ul style="margin:6px 0 0 18px;padding:0">${DIET.prepDomenica.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
      }
      const next = [1, 2, 3].map((n) => addDays(now, n)).map((d) => [d, dietDay(d)]).filter(([, x]) => x);
      out += `<div class="card"><details open><summary>🗓️ Prossimi giorni</summary>${next.map(([d, x]) =>
        `<div style="margin-top:10px"><b style="text-transform:capitalize">${fmtLong(ymd(d))}</b>${mealBlock(x)}</div>`).join('')}
        <p style="margin:10px 0 0"><button class="btn ghost" data-act="go-dieta">Vedi tutta la settimana</button></p></details></div>`;
    }
  }

  // Come ti senti
  const d = S.diary.find((x) => x.day === today);
  out += `<div class="card"><h2>💭 Come ti senti oggi?</h2><div class="moods">${MOODS.map((m, i) =>
    `<button class="mood ${d?.mood === i + 1 ? 'on' : ''}" data-act="mood" data-v="${i + 1}" aria-label="${MOOD_TXT[i]}">${m}</button>`).join('')}</div>
    ${d && (d.tags?.length || d.notes) ? `<div class="small muted" style="margin-top:6px">${esc([...(d.tags || []), d.notes].filter(Boolean).join(' · '))}</div>` : ''}
    <p style="margin:8px 0 0"><button class="linkbtn" data-act="go-diario">Scrivi come ti senti →</button></p></div>`;

  // Ciclo
  const c = cycleInfo();
  if (c && c.toNext <= 3 && c.toNext >= -10) {
    out += `<div class="card warn" data-act="go-ciclo" style="cursor:pointer">🩸 ${c.toNext > 0 ? `Ciclo previsto tra <b>${c.toNext} giorn${c.toNext === 1 ? 'o' : 'i'}</b>` : c.toNext === 0 ? 'Ciclo previsto <b>oggi</b>' : `Ciclo in ritardo di <b>${-c.toNext} giorn${c.toNext === -1 ? 'o' : 'i'}</b>`} · tocca per segnarlo</div>`;
  }

  // Spesa
  const toBuy = S.shopping.filter((i) => !i.done);
  const left = toBuy.filter((i) => i.week_start < ymd(shopWeek())).length;
  out += `<div class="card" data-act="tab" data-v="spesa" style="cursor:pointer"><h2>🛒 Spesa</h2>
    ${toBuy.length ? `<b>${toBuy.length}</b> cose da prendere${left ? ` · <span class="badge orange">${left} rimaste dalla volta scorsa</span>` : ''}` : 'Lista vuota 🎉'}
    <div class="small muted" style="margin-top:4px">Tocca per aprire la lista →</div></div>`;

  // Da fare
  const soon = ymd(addDays(now, 3));
  const urgent = S.tasks.filter((t) => !t.done && (!t.due || t.due <= soon))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 6);
  out += `<div class="card"><h2>📋 Da fare</h2>${urgent.length ? `<ul class="list">${urgent.map((t) => taskRow(t, today, true)).join('')}</ul>` : '<span class="muted">Niente in scadenza nei prossimi giorni.</span>'}</div>`;

  // Peso
  const last = S.weights[S.weights.length - 1];
  out += `<form class="card" data-form="weight-add"><h2>⚖️ Peso</h2>
    ${last ? `<div class="small muted">Ultima pesata: <b>${kgFmt(last.kg)} kg</b> (${fmtDay(last.day)})</div>` : ''}
    <div class="row" style="margin-top:8px"><input id="o-kg" name="kg" inputmode="decimal" placeholder="Peso di oggi, es. 113,5" required>
    <input type="hidden" name="day" value="${today}"><button class="btn">Salva</button></div></form>`;
  return out;
}

// ---------- SALUTE ----------
function viewSalute() {
  const tabs = [['dieta', 'Dieta'], ['diario', 'Diario'], ['peso', 'Peso'], ['ciclo', 'Ciclo'], ['pressione', 'Pressione'], ['wegovy', 'Wegovy']];
  const seg = `<div class="seg scroll">${tabs.map(([k, l]) => `<button class="${S.htab === k ? 'on' : ''}" data-act="htab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const sub = { dieta: viewDieta, diario: viewDiario, peso: viewPeso, ciclo: viewCiclo, pressione: viewPressione, wegovy: viewWegovy }[S.htab] || viewDieta;
  return `<h1>💚 Salute</h1><div class="small muted">Diario, peso, ciclo, pressione e Wegovy li vedi solo tu.</div>${seg}${sub()}`;
}

function viewDieta() {
  const pos = dietPos(new Date());
  const w = S.dietWeek ?? (pos ? pos.idx : 0);
  const sett = DIET.settimane[w];
  const chips = DIET.settimane.map((_, i) => `<button class="chip ${i === w ? 'on' : ''}" data-act="dweek" data-v="${i}">Settimana ${i + 1}</button>`).join('');
  const days = sett.giorni.map((g, i) => {
    const isToday = pos && pos.idx === w && pos.day === i;
    const past = pos && pos.idx === w && i < pos.day;
    return `<div class="card day ${isToday ? 'today' : ''} ${past ? 'past' : ''}">
      <h2>${GIORNI[i]} ${isToday ? '<span class="badge">oggi</span>' : ''}</h2>${mealBlock(g)}</div>`;
  }).join('');
  return `<div class="chips">${chips}</div>
    ${sett.nota ? `<div class="card info small">${esc(sett.nota)}</div>` : ''}
    ${days}
    <div class="card">
      <details open><summary>🔑 Le regole</summary><ul>${DIET.regole.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
      <details><summary>📏 Porzioni</summary><table>${DIET.porzioni.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></details>
      <details><summary>☕ Colazioni</summary><ul>${DIET.colazioni.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>
      <details><summary>🍎 Spuntini (1–2 al giorno)</summary><ul>${DIET.spuntini.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>
    </div>
    <form class="card" data-form="diet-settings"><h2>⚙️ Impostazioni dieta</h2>
      <label class="f" for="d-start">Lunedì di inizio (vale per tutta la famiglia)</label>
      <input id="d-start" name="start" type="date" value="${esc(dietStart())}" data-fresh="1">
      <label class="f" style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <input id="d-follow" name="follow" type="checkbox" style="width:auto" ${S.mine.follows_diet ? 'checked' : ''} data-fresh="1"> Seguo il piano (mostra i pasti in "Oggi" e mette la spesa della dieta in lista)
      </label>
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p></form>
    <div class="card warn small">⚠️ Questo piano non sostituisce il parere della tua endocrinologa. Se allatti, se hai capogiri o se la pressione scende molto, avvisa il medico.</div>`;
}

function viewDiario() {
  const today = ymd(new Date());
  const d = S.diary.find((x) => x.day === today) || {};
  const tags = new Set(d.tags || []);
  const byDay = (arr, k) => Object.fromEntries(arr.map((x) => [x[k], x]));
  const wg = byDay(S.wegovy, 'day');
  const wt = byDay(S.weights, 'day');
  const cy = byDay(S.cycle, 'start_day');
  return `<form class="card" data-form="diary-save"><h2>💭 Come ti senti oggi?</h2>
      <div class="moods">${MOODS.map((m, i) => `<label class="mood ${d.mood === i + 1 ? 'on' : ''}"><input type="radio" id="dm-${i + 1}" name="mood" value="${i + 1}" ${d.mood === i + 1 ? 'checked' : ''} data-fresh="1">${m}</label>`).join('')}</div>
      <div class="chips" style="margin-top:10px">${TAGS.map((t, i) => `<label class="chip tag ${tags.has(t) ? 'on' : ''}"><input type="checkbox" id="dt-${i}" name="tag" value="${esc(t)}" ${tags.has(t) ? 'checked' : ''} data-fresh="1">${esc(t)}</label>`).join('')}</div>
      <label class="f" for="d-notes">Note</label>
      <textarea id="d-notes" name="notes" maxlength="1000" placeholder="Com'è andata oggi? Cosa hai mangiato fuori programma, com'era l'umore…" data-fresh="1">${esc(d.notes || '')}</textarea>
      <input type="hidden" name="day" value="${today}">
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p></form>
    ${S.diary.length ? `<div class="card"><h2>Diario</h2><ul class="list">${S.diary.slice(0, 60).map((x) => {
      const extra = [wg[x.day] ? `💉 ${esc(wg[x.day].dose)}` : '', wt[x.day] ? `⚖️ ${kgFmt(wt[x.day].kg)} kg` : '', cy[x.day] ? '🩸 ciclo' : ''].filter(Boolean).join(' · ');
      return `<li class="item"><div style="font-size:26px">${x.mood ? MOODS[x.mood - 1] : '·'}</div><div class="main">
        <div class="title"><b style="text-transform:capitalize">${fmtDay(x.day)}</b>${extra ? ` <span class="small muted">${extra}</span>` : ''}</div>
        <div class="meta">${esc([...(x.tags || []), x.notes].filter(Boolean).join(' · '))}</div></div>
        <button class="x" data-act="diary-del" data-v="${x.id}" aria-label="Elimina">✕</button></li>`;
    }).join('')}</ul></div>` : ''}
    <div class="card info small">Puoi scriverlo ogni giorno, non solo quello della puntura. Nel diario vedi accanto anche puntura, peso e ciclo di quel giorno.</div>`;
}

function weightChart(ws, goal) {
  if (ws.length < 2) return '<p class="muted small">Il grafico compare dalla seconda pesata.</p>';
  const W = 600, H = 280, P = { l: 52, r: 12, t: 14, b: 36 };
  const xs = ws.map((w) => parseYmd(w.day).getTime());
  const ys = ws.map((w) => +w.kg);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const showGoal = goal && goal >= lo - 8 && goal <= hi + 8;
  if (showGoal) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const sx = (t) => P.l + (W - P.l - P.r) * ((t - x0) / (x1 - x0 || 1));
  const sy = (v) => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo || 1));
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const pts = xs.map((t, i) => `${sx(t).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del peso">
    ${ticks.map((v) => `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${P.l - 6}" y="${sy(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('')}
    ${showGoal ? `<line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${sy(goal)}" y2="${sy(goal)}"/>` : ''}
    <polyline class="line" points="${pts}"/>
    ${xs.map((t, i) => `<circle class="pt" cx="${sx(t)}" cy="${sy(ys[i])}" r="3.5"/>`).join('')}
    <text x="${P.l}" y="${H - 8}">${fmtDay(ws[0].day)}</text>
    <text x="${W - P.r}" y="${H - 8}" text-anchor="end">${fmtDay(ws[ws.length - 1].day)}</text>
  </svg>`;
}

function viewPeso() {
  const ws = S.weights;
  const first = ws[0], last = ws[ws.length - 1];
  const delta = first && last ? last.kg - first.kg : null;
  const bmi = last && S.mine.height_cm ? last.kg / (S.mine.height_cm / 100) ** 2 : null;
  const toGoal = last && S.mine.goal_kg ? last.kg - S.mine.goal_kg : null;
  return `<form class="card" data-form="weight-add"><h2>⚖️ Nuova pesata</h2>
      <div class="row"><input id="p-kg" name="kg" inputmode="decimal" placeholder="kg, es. 113,5" required>
      <input id="p-day" name="day" type="date" value="${ymd(new Date())}" required><button class="btn">Salva</button></div>
      <p class="small muted" style="margin:8px 0 0">Consiglio: pesati una volta a settimana, stesso giorno, al mattino.</p></form>
    ${last ? `<div class="card"><div class="stats">
      <div class="stat"><b>${kgFmt(last.kg)}</b><span>kg oggi</span></div>
      <div class="stat"><b style="color:${delta <= 0 ? 'var(--green)' : 'var(--red)'}">${delta > 0 ? '+' : ''}${kgFmt(delta)}</b><span>dall'inizio</span></div>
      <div class="stat"><b>${toGoal !== null ? kgFmt(Math.max(toGoal, 0)) : bmi ? bmi.toFixed(1) : '–'}</b><span>${toGoal !== null ? 'kg all\'obiettivo' : 'BMI'}</span></div>
    </div><div style="margin-top:12px">${weightChart(ws, S.mine.goal_kg ? +S.mine.goal_kg : null)}</div></div>` : ''}
    ${ws.length ? `<div class="card"><h2>Storico</h2><ul class="list">${[...ws].reverse().slice(0, 30).map((w) =>
      `<li class="item"><div class="main"><div class="title"><b>${kgFmt(w.kg)} kg</b></div><div class="meta">${fmtDay(w.day)}</div></div>
       <button class="x" data-act="w-del" data-v="${w.id}" aria-label="Elimina">✕</button></li>`).join('')}</ul></div>` : ''}
    <form class="card" data-form="health-settings"><h2>⚙️ I tuoi dati</h2>
      <div class="row">
        <div><label class="f" for="h-height">Altezza (cm)</label><input id="h-height" name="height" inputmode="numeric" value="${esc(S.mine.height_cm ?? '')}" data-fresh="1"></div>
        <div><label class="f" for="h-goal">Obiettivo (kg)</label><input id="h-goal" name="goal" inputmode="decimal" value="${esc(S.mine.goal_kg ?? '')}" data-fresh="1"></div>
      </div><p style="margin:12px 0 0"><button class="btn ghost">Salva</button></p></form>`;
}

function viewCiclo() {
  const c = cycleInfo();
  const list = S.cycle;
  let head = '<div class="card info">Segna il primo giorno dell\'ultimo ciclo: da lì calcolo il prossimo (ogni 28 giorni).</div>';
  if (c) {
    const st = c.toNext > 0 ? `tra <b>${c.toNext} giorn${c.toNext === 1 ? 'o' : 'i'}</b>` : c.toNext === 0 ? '<b>oggi</b>' : `<span style="color:var(--red)">in ritardo di <b>${-c.toNext} giorn${c.toNext === -1 ? 'o' : 'i'}</b></span>`;
    head = `<div class="card"><div class="stats">
        <div class="stat"><b>${c.dayOf}°</b><span>giorno del ciclo</span></div>
        <div class="stat"><b>${parseYmd(c.next).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</b><span>prossimo previsto</span></div>
        <div class="stat"><b>${c.avg ?? '–'}</b><span>durata media</span></div></div>
      <p style="margin:10px 0 0">🩸 Prossimo ciclo ${st}</p></div>`;
  }
  return `${head}
    <form class="card" data-form="cycle-add"><h2>🩸 È arrivato il ciclo</h2>
      <div class="row"><input id="c-start" name="day" type="date" value="${ymd(new Date())}" required><button class="btn">Segna</button></div>
      <p class="small muted" style="margin:8px 0 0">Segna solo il primo giorno. Se è arrivato ieri, cambia la data.</p></form>
    ${list.length ? `<div class="card"><h2>Storico</h2><ul class="list">${list.map((x, i) => {
      const len = list[i + 1] ? daysBetween(parseYmd(list[i + 1].start_day), parseYmd(x.start_day)) : null;
      return `<li class="item"><div class="main"><div class="title"><b>${fmtDay(x.start_day)}</b></div>
        <div class="meta">${len ? `ciclo di ${len} giorni` : 'primo segnato'}</div></div>
        <button class="x" data-act="cycle-del" data-v="${x.id}" aria-label="Elimina">✕</button></li>`;
    }).join('')}</ul></div>` : ''}`;
}

function bpBadge(r) {
  if (r.sys >= 140 || r.dia >= 90) return '<span class="badge red">alta</span>';
  if (r.sys < 90 || r.dia < 60) return '<span class="badge blue">bassa</span>';
  return '<span class="badge">ok</span>';
}
function viewPressione() {
  const week = S.bp.filter((r) => new Date(r.measured_at) >= addDays(new Date(), -7));
  const avg = (k) => Math.round(week.reduce((s, r) => s + r[k], 0) / week.length);
  return `<form class="card" data-form="bp-add"><h2>🩺 Nuova misurazione</h2>
      <div class="row">
        <div><label class="f" for="b-sys">Massima</label><input id="b-sys" name="sys" inputmode="numeric" placeholder="es. 130" required></div>
        <div><label class="f" for="b-dia">Minima</label><input id="b-dia" name="dia" inputmode="numeric" placeholder="es. 85" required></div>
        <div><label class="f" for="b-pulse">Battiti</label><input id="b-pulse" name="pulse" inputmode="numeric" placeholder="es. 72"></div>
      </div>
      <label class="f" for="b-note">Note (facoltative)</label><input id="b-note" name="note" placeholder="es. mal di testa, dopo il caffè…">
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p></form>
    ${week.length ? `<div class="card"><div class="stats">
      <div class="stat"><b>${avg('sys')}/${avg('dia')}</b><span>media 7 giorni</span></div>
      <div class="stat"><b>${week.length}</b><span>misurazioni</span></div>
      <div class="stat"><b>${week.filter((r) => r.sys >= 140 || r.dia >= 90).length}</b><span>sopra 140/90</span></div></div></div>` : ''}
    <div class="card info small">Se la pressione scende sotto 90/60 o hai capogiri, avvisa il medico: dimagrendo la terapia potrebbe andare ridotta.</div>
    ${S.bp.length ? `<div class="card"><h2>Storico</h2><ul class="list">${S.bp.map((r) =>
      `<li class="item"><div class="main"><div class="title"><b>${r.sys}/${r.dia}</b>${r.pulse ? ` · ${r.pulse} bpm` : ''} ${bpBadge(r)}</div>
        <div class="meta">${fmtDT(r.measured_at)}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
        <button class="x" data-act="bp-del" data-v="${r.id}" aria-label="Elimina">✕</button></li>`).join('')}</ul></div>` : ''}`;
}

function viewWegovy() {
  const last = S.wegovy[0];
  const next = last ? addDays(parseYmd(last.day), 7) : null;
  const doses = ['0,25 mg', '0,5 mg', '1 mg', '1,7 mg', '2,4 mg'];
  return `${next ? `<div class="card tip"><b>💉 Prossima puntura:</b> ${fmtDay(ymd(next))}${daysBetween(new Date(), next) < 0 ? ' <span class="badge red">in ritardo</span>' : ''}</div>` : ''}
    <form class="card" data-form="wg-add"><h2>💉 Segna la puntura</h2>
      <div class="row">
        <input id="g-day" name="day" type="date" value="${ymd(new Date())}" required>
        <select id="g-dose" name="dose">${doses.map((d) => `<option ${last?.dose === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <label class="f" for="g-notes">Note sulla puntura</label>
      <textarea id="g-notes" name="notes" placeholder="es. punto dell'iniezione, dimenticanze…"></textarea>
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p>
      <p class="small muted" style="margin:8px 0 0">Come ti senti nei giorni seguenti scrivilo nel <button type="button" class="linkbtn" data-act="go-diario" style="padding:0">Diario</button>, ogni giorno.</p></form>
    ${S.wegovy.length ? `<div class="card"><h2>Punture</h2><ul class="list">${S.wegovy.map((r) =>
      `<li class="item"><div class="main"><div class="title"><b>${esc(r.dose)}</b> · ${fmtDay(r.day)}</div>
        ${r.notes ? `<div class="meta">${esc(r.notes)}</div>` : ''}</div>
        <button class="x" data-act="wg-del" data-v="${r.id}" aria-label="Elimina">✕</button></li>`).join('')}</ul></div>` : ''}`;
}

// ---------- SPESA ----------
function shopRow(i, target) {
  const left = !i.done && i.week_start < target;
  return `<li class="item ${i.done ? 'done' : ''}">
    <button class="check" data-act="shop-toggle" data-v="${i.id}" aria-label="${i.done ? 'Rimetti in lista' : 'Preso'}">${i.done ? '✓' : ''}</button>
    <div class="main" data-act="shop-toggle" data-v="${i.id}"><div class="title">${esc(i.name)} ${left ? '<span class="badge orange">rimasto</span>' : ''}</div>
      <div class="meta">${i.done ? `preso da ${esc(nameOf(i.done_by ?? null))}` : `aggiunto da ${esc(nameOf(i.created_by))}`}</div></div>
    <button class="x" data-act="shop-del" data-v="${i.id}" aria-label="Elimina">✕</button></li>`;
}

function viewSpesa() {
  const target = ymd(shopWeek());
  const f = S.shopFilter;
  const items = S.shopping.filter((i) => f === 'tutto' || i.category === f);
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const count = (c) => S.shopping.filter((i) => !i.done && (c === 'tutto' || i.category === c)).length;
  const filters = [['tutto', 'Tutto'], ...CATS].map(([k, l]) =>
    `<button class="chip ${f === k ? 'on' : ''}" data-act="filter" data-v="${k}">${l} (${count(k)})</button>`).join('');

  const groups = CATS.map(([c, l]) => {
    const g = todo.filter((i) => i.category === c);
    return g.length ? `<h3>${l}</h3><ul class="list">${g.map((i) => shopRow(i, target)).join('')}</ul>` : '';
  }).join('');

  const quickSets = f === 'tutto' ? [['dieta', 'Dispensa', QUICK.dispensa], ['casa', 'Casa', QUICK.casa], ['bambini', 'Bambini', QUICK.bambini]]
    : f === 'dieta' ? [['dieta', 'Dispensa', QUICK.dispensa]] : QUICK[f] ? [[f, catLabel(f), QUICK[f]]] : [];
  const have = new Set(S.shopping.filter((i) => !i.done).map((i) => i.name.toLowerCase()));
  const quick = quickSets.map(([c, l, arr]) => {
    const list = arr.filter((n) => !have.has(n.toLowerCase()));
    return list.length ? `<div class="small muted" style="margin-top:6px">${l}</div><div class="chips">${list.map((n) =>
      `<button class="chip add" data-act="quick" data-v="${esc(n)}" data-c="${c}">${esc(n)}</button>`).join('')}</div>` : '';
  }).join('');

  const defCat = f === 'tutto' ? 'casa' : f;
  return `<h1>🛒 Spesa</h1><div class="small muted">Per la settimana del ${fmtDay(target)} · quello che non prendi resta in lista</div>
    <form class="card" data-form="shop-add">
      <div class="row"><input id="s-name" name="name" placeholder="Cosa serve?" maxlength="80" required autocomplete="off">
      <select id="s-cat" name="category" style="flex:0 0 120px">${CATS.map(([k, l]) => `<option value="${k}" ${k === defCat ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn">+</button></div>
      ${quick ? `<details style="margin-top:6px"><summary>⚡ Aggiunte veloci</summary>${quick}</details>` : ''}
    </form>
    <div class="chips">${filters}</div>
    <div class="card">${todo.length ? groups : '<span class="muted">Niente da comprare qui 🎉</span>'}
      ${f === 'tutto' || f === 'dieta' ? '<p class="small muted" style="margin:10px 0 0">Le quantità della dieta sono per una persona: per il resto della famiglia moltiplica carne, pesce, frutta e verdura.</p>' : ''}</div>
    ${done.length ? `<div class="card"><details><summary>✓ Presi negli ultimi 7 giorni (${done.length})</summary>
      <ul class="list">${done.map((i) => shopRow(i, target)).join('')}</ul>
      <p style="margin:10px 0 0"><button class="btn danger" data-act="shop-clear">Svuota i presi</button></p></details></div>` : ''}`;
}

// ---------- DA FARE (casa / fuori casa) ----------
function taskRow(t, today, showKind) {
  const late = t.due && t.due < today;
  const isToday = t.due === today;
  return `<li class="item ${t.done ? 'done' : ''}">
    <button class="check" data-act="task-toggle" data-v="${t.id}" aria-label="${t.done ? 'Da rifare' : 'Fatto'}">${t.done ? '✓' : ''}</button>
    <div class="main" data-act="task-toggle" data-v="${t.id}"><div class="title">${showKind ? (t.kind === 'casa' ? '🏠 ' : '🚗 ') : ''}${esc(t.title)}</div>
      <div class="meta">${t.due ? `<span class="badge ${late ? 'red' : isToday ? 'orange' : 'blue'}">${late ? 'scaduto · ' : isToday ? 'oggi · ' : ''}${fmtDay(t.due)}</span> ` : ''}${t.assignee ? `per ${esc(nameOf(t.assignee))}` : 'per entrambi'}</div></div>
    <button class="x" data-act="task-del" data-v="${t.id}" aria-label="Elimina">✕</button></li>`;
}

function viewFare() {
  const today = ymd(new Date());
  const k = S.ttab;
  const mine = S.tasks.filter((t) => (t.kind || 'fuori') === k);
  const todo = mine.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const done = mine.filter((t) => t.done);
  const people = Object.entries(S.profiles);
  const n = (kind) => S.tasks.filter((t) => !t.done && (t.kind || 'fuori') === kind).length;
  const ph = k === 'casa' ? 'es. Cambiare le lenzuola, lavatrice bianchi, sistemare armadio…' : 'es. Ritirare le analisi, pediatra, posta…';
  return `<h1>📋 Da fare</h1><div class="small muted">Le vedete entrambi</div>
    <div class="seg"><button class="${k === 'casa' ? 'on' : ''}" data-act="ttab" data-v="casa">🏠 A casa (${n('casa')})</button>
      <button class="${k === 'fuori' ? 'on' : ''}" data-act="ttab" data-v="fuori">🚗 Fuori casa (${n('fuori')})</button></div>
    <form class="card" data-form="task-add">
      <input id="t-title" name="title" placeholder="${ph}" maxlength="120" required autocomplete="off">
      <div class="row" style="margin-top:8px">
        <input id="t-due" name="due" type="date" aria-label="Entro il">
        <select id="t-who" name="assignee"><option value="">Per entrambi</option>${people.map(([id, nm]) =>
          `<option value="${id}">${id === S.user.id ? 'Per me' : 'Per ' + esc(nm)}</option>`).join('')}</select>
        <button class="btn">Aggiungi</button>
      </div></form>
    <div class="card">${todo.length ? `<ul class="list">${todo.map((t) => taskRow(t, today)).join('')}</ul>` : '<span class="muted">Tutto fatto 🎉</span>'}</div>
    ${done.length ? `<div class="card"><details><summary>✓ Fatti negli ultimi 7 giorni (${done.length})</summary>
      <ul class="list">${done.map((t) => taskRow(t, today)).join('')}</ul></details></div>` : ''}`;
}

// ---------- CALENDARIO ----------
function eventRow(e) {
  return `<li class="item"><div class="main"><div class="title">${e.time ? `<b>${hm(e.time)}</b> ` : ''}${esc(e.title)}</div>
    <div class="meta">${fmtDay(e.day)}${e.who ? ' · ' + esc(e.who) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
    <button class="x" data-act="ev-ics" data-v="${e.id}" aria-label="Aggiungi al calendario del telefono" title="Promemoria sul telefono">📲</button>
    <button class="x" data-act="ev-del" data-v="${e.id}" aria-label="Elimina">✕</button></li>`;
}

function viewCalendario() {
  const today = ymd(new Date());
  const sel = S.calDay || today;
  const m = S.calMonth || new Date(parseYmd(sel).getFullYear(), parseYmd(sel).getMonth(), 1);
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const gridStart = mondayOf(first);
  const evByDay = {};
  S.events.forEach((e) => { (evByDay[e.day] ||= []).push(e); });
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const k = ymd(d);
    if (i >= 35 && d.getMonth() !== m.getMonth()) break;
    const ev = evByDay[k] || [];
    cells.push(`<button class="cal-d ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}" data-act="cal-day" data-v="${k}">
      <span>${d.getDate()}</span><span class="marks">${ev.length ? '<i class="ev"></i>' : ''}${rifOn(d).length ? '<i class="rf"></i>' : ''}</span></button>`);
  }
  const monthName = m.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const selEv = evByDay[sel] || [];
  const selRif = rifOn(parseYmd(sel));
  const upcoming = S.events.filter((e) => e.day >= today && e.day <= ymd(addDays(new Date(), 30)));
  const who = ['', ...Object.values(S.profiles), 'Bimbi', 'Tutti'];

  return `<h1>📅 Calendario</h1><div class="small muted">Impegni in comune · ♻️ differenziata</div>
    <div class="card cal">
      <div class="cal-h"><button class="x" data-act="cal-month" data-v="-1" aria-label="Mese precedente">‹</button>
        <b style="text-transform:capitalize">${monthName}</b>
        <button class="x" data-act="cal-month" data-v="1" aria-label="Mese successivo">›</button></div>
      <div class="cal-g">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<div class="cal-w">${x}</div>`).join('')}${cells.join('')}</div>
      <div class="small muted" style="margin-top:6px"><i class="ev"></i> impegno &nbsp; <i class="rf"></i> raccolta rifiuti</div>
    </div>

    <div class="card"><h2 style="text-transform:capitalize">${fmtLong(sel)}</h2>
      ${selRif.length ? `<p style="margin:0 0 8px">♻️ Raccolta: ${selRif.map(rifName).join(', ')}</p>` : ''}
      ${selEv.length ? `<ul class="list">${selEv.map(eventRow).join('')}</ul>` : '<p class="muted" style="margin:0">Nessun impegno.</p>'}
      <form data-form="ev-add" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <input id="e-title" name="title" placeholder="Nuovo impegno, es. Pediatra" maxlength="120" required autocomplete="off">
        <div class="row" style="margin-top:8px">
          <input id="e-day" name="day" type="date" value="${sel}" required data-fresh="1">
          <input id="e-time" name="time" type="time" aria-label="Ora (facoltativa)">
        </div>
        <div class="row" style="margin-top:8px">
          <select id="e-who" name="who">${who.map((w) => `<option value="${esc(w)}">${w ? 'Per ' + esc(w) : 'Per chi? (facoltativo)'}</option>`).join('')}</select>
          <button class="btn">Aggiungi</button>
        </div></form></div>

    <div class="card"><h2>Prossimi 30 giorni</h2>${upcoming.length ? `<ul class="list">${upcoming.map(eventRow).join('')}</ul>` : '<span class="muted">Niente in programma.</span>'}
      ${upcoming.length ? '<p style="margin:10px 0 0"><button class="btn ghost" data-act="ev-ics-all">📲 Metti tutti sul calendario del telefono</button></p>' : ''}</div>

    ${pushCard(false)}
    ${viewPromemoria()}

    <form class="card" data-form="ev-paste"><h2>🤖 Incolla impegni da Claude</h2>
      <p class="small muted" style="margin:0 0 8px">Dimmi in chat i tuoi impegni: ti preparo le righe da incollare qui. Una per riga, es.<br><code>12/10 15:30 Pediatra (Bimbi)</code><br><code>15/10 Riunione scuola</code></p>
      <textarea id="e-paste" name="text" placeholder="12/10 15:30 Pediatra (Bimbi)"></textarea>
      <p style="margin:10px 0 0"><button class="btn">Aggiungi al calendario</button></p></form>

    ${viewRifiuti()}`;
}

function viewPromemoria() {
  const r = rem();
  const befores = [[15, '15 minuti'], [30, '30 minuti'], [60, '1 ora'], [120, '2 ore'], [180, '3 ore'], [1440, '1 giorno']];
  return `<form class="card" data-form="rem-save"><h2>🔔 I miei promemoria</h2>
      <p class="small muted" style="margin:0 0 4px">Orari solo tuoi: tuo marito può scegliere i suoi.</p>
      <label class="f" for="m-before">Impegni con orario: avvisami</label>
      <select id="m-before" name="before" data-fresh="1">${befores.map(([v, l]) => `<option value="${v}" ${+r.before === v ? 'selected' : ''}>${l} prima</option>`).join('')}</select>
      <label class="f" for="m-allday">Impegni senza orario: avvisami</label>
      <div class="row">
        <select id="m-allday" name="allday" data-fresh="1"><option value="sera" ${r.allday === 'sera' ? 'selected' : ''}>la sera prima</option>
          <option value="mattina" ${r.allday === 'mattina' ? 'selected' : ''}>la mattina stessa</option></select>
        <input id="m-allday-t" name="alldayTime" type="time" value="${esc(r.alldayTime)}" data-fresh="1" style="flex:0 0 110px" aria-label="Ora">
      </div>
      <label class="f" for="m-rif">Differenziata: avvisami alle</label>
      <input id="m-rif" name="rif" type="time" value="${esc(rifTime())}" data-fresh="1" style="max-width:140px">
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p>
      <p class="small muted" style="margin:8px 0 0">Dopo aver cambiato gli orari, rimetti i promemoria sul telefono con i bottoni 📲.</p></form>`;
}

function viewRifiuti() {
  const r = rif();
  const rows = GIORNI.map((g, i) => {
    // prossime due date di quel giorno della settimana, per scegliere le settimane alterne
    let d1 = dayStart(new Date());
    while (wdIdx(d1) !== i) d1 = addDays(d1, 1);
    const opts = [ymd(d1), ymd(addDays(d1, 7))];
    const cur = r.alt?.[i] ? opts.find((o) => isAltWeek(parseYmd(o), r.alt[i])) : '';
    return `<tr><td><b>${g.slice(0, 3)}</b></td><td><div class="chips" style="margin:0">${RIFIUTI.map(([k, ic, nm]) =>
      `<label class="chip tag small-chip ${(r.days[i] || []).includes(k) ? 'on' : ''}"><input type="checkbox" id="r-${i}-${k}" name="d${i}" value="${k}" ${(r.days[i] || []).includes(k) ? 'checked' : ''} data-fresh="1">${ic} ${nm.split(' ')[0]}</label>`).join('')}</div>
      <select id="r-alt-${i}" name="alt${i}" class="small" style="margin-top:6px;padding:6px 8px" data-fresh="1">
        <option value="">Ogni settimana</option>
        ${opts.map((o) => `<option value="${o}" ${cur === o ? 'selected' : ''}>Ogni 15 giorni, prossima ${fmtDay(o)}</option>`).join('')}
      </select></td></tr>`;
  }).join('');
  const configured = Object.values(r.days).some((x) => x.length);
  return `<form class="card" data-form="rif-save"><h2>♻️ Differenziata</h2>
      <p class="small muted" style="margin:0 0 8px">Segna cosa raccolgono in ogni giorno (vale per tutta la famiglia). Nei festivi nazionali la raccolta è saltata in automatico.</p>
      <table>${rows}</table>
      <div class="row" style="margin-top:10px">
        <select id="r-when" name="when" data-fresh="1"><option value="sera" ${r.when === 'sera' ? 'selected' : ''}>La porto fuori la sera prima</option>
          <option value="mattina" ${r.when === 'mattina' ? 'selected' : ''}>La porto fuori la mattina stessa</option></select>
      </div>
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p>
    </form>
    ${configured ? `<div class="card tip"><h2>🔔 Notifiche della differenziata</h2>
      <p class="small" style="margin:0 0 10px">Aggiungo i promemoria settimanali al calendario del telefono: ti suona all'ora che hai scelto, anche ad app chiusa.</p>
      <button class="btn" data-act="rif-ics">📲 Aggiungi i promemoria al telefono</button>
      <p class="small muted" style="margin:10px 0 0">Se cambi i giorni, ripeti questo passaggio e cancella i vecchi promemoria dal calendario del telefono.</p></div>` : ''}`;
}

// ---------- calendario del telefono (.ics) ----------
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDay = (s) => s.replace(/-/g, '');
const icsStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
function icsWrap(vevents) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Famiglia//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...vevents, 'END:VCALENDAR'].join('\r\n');
}
// Quando suona l'avviso: con orario X minuti prima; senza orario la sera prima o la mattina, all'ora scelta
function eventTrigger(timed) {
  const r = rem();
  if (timed) return r.before >= 1440 ? `-P${Math.round(r.before / 1440)}D` : `-PT${r.before}M`;
  const [h, m] = (r.alldayTime || '20:00').split(':').map(Number);
  const mins = h * 60 + m;
  return r.allday === 'mattina' ? `PT${mins}M` : `-PT${24 * 60 - mins}M`;
}
function icsEvent(e) {
  const lines = ['BEGIN:VEVENT', `UID:evento-${e.id}@famiglia`, `DTSTAMP:${icsStamp()}`, `SUMMARY:${icsEsc(e.title)}`];
  if (e.time) {
    const t = hm(e.time).replace(':', '');
    const end = new Date(parseYmd(e.day).getTime());
    end.setHours(+t.slice(0, 2) + 1, +t.slice(2));
    lines.push(`DTSTART:${icsDay(e.day)}T${t}00`, `DTEND:${icsDay(ymd(end))}T${pad(end.getHours())}${pad(end.getMinutes())}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDay(e.day)}`, `DTEND;VALUE=DATE:${icsDay(ymd(addDays(parseYmd(e.day), 1)))}`);
  }
  if (e.who || e.note) lines.push(`DESCRIPTION:${icsEsc([e.who && 'Per ' + e.who, e.note].filter(Boolean).join(' - '))}`);
  // promemoria secondo le preferenze (Calendario → Promemoria)
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:${eventTrigger(!!e.time)}`, 'END:VALARM', 'END:VEVENT');
  return lines.join('\r\n');
}
function icsRifiuti() {
  const r = rif();
  const [hh, mm] = rifTime().split(':');
  const BY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const out = [];
  const back = r.when === 'sera' ? 1 : 0; // il promemoria è la sera prima della raccolta
  const today = dayStart(new Date());
  for (let i = 0; i < 7; i++) {
    const types = r.days[i] || [];
    if (!types.length) continue;
    const step = r.alt?.[i] ? 14 : 7;
    // prima raccolta il cui promemoria non è già passato
    let c = addDays(today, back);
    while (wdIdx(c) !== i || (step === 14 && !isAltWeek(c, r.alt[i]))) c = addDays(c, 1);
    const first = addDays(c, -back);
    // salta i promemoria dei festivi per i prossimi 2 anni
    const ex = [];
    for (let x = c; daysBetween(today, x) < 730; x = addDays(x, step)) {
      if (isHoliday(x)) ex.push(`EXDATE:${icsDay(ymd(addDays(x, -back)))}T${hh}${mm}00`);
    }
    const names = types.map((k) => (RIFIUTI.find((x) => x[0] === k) || [k, '', k])[2]).join(', ');
    const title = `♻️ ${r.when === 'sera' ? 'Stasera fuori' : 'Fuori stamattina'}: ${names}`;
    out.push(['BEGIN:VEVENT', `UID:rifiuti-${i}@famiglia`, `DTSTAMP:${icsStamp()}`, `SUMMARY:${icsEsc(title)}`,
      `DTSTART:${icsDay(ymd(first))}T${hh}${mm}00`, 'DURATION:PT15M', `RRULE:FREQ=WEEKLY;INTERVAL=${step / 7};BYDAY=${BY[wdIdx(first)]}`, ...ex,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  }
  return icsWrap(out);
}
function saveIcs(name, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Apri il file scaricato e scegli "Aggiungi" al calendario');
}

// "12/10 15:30 Pediatra (Bimbi)" → evento
function parseLine(line) {
  const m = line.trim().replace(/^[-•*]\s*/, '').match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s+(?:(?:ore\s*)?(\d{1,2})[:.](\d{2})\s+)?(.+)$/i);
  if (!m) return null;
  const [, dd, mo, yy, h, mi, rest] = m;
  const now = new Date();
  let y = yy ? (+yy < 100 ? 2000 + +yy : +yy) : now.getFullYear();
  let date = new Date(y, +mo - 1, +dd);
  if (date.getMonth() !== +mo - 1) return null;
  if (!yy && daysBetween(date, now) > 60) date = new Date(++y, +mo - 1, +dd);
  if (h !== undefined && (+h > 23 || +mi > 59)) return null;
  let title = rest.trim(), who = null;
  const w = title.match(/\(([^)]{1,40})\)\s*$/);
  if (w) { who = w[1].trim(); title = title.slice(0, w.index).trim(); }
  if (!title) return null;
  return { day: ymd(date), time: h !== undefined ? `${pad(h)}:${mi}` : null, title: title.slice(0, 120), who };
}

// ---------- azioni ----------
async function saveDiary(day, patch) {
  const cur = S.diary.find((x) => x.day === day) || {};
  const row = { user_id: S.user.id, day, mood: cur.mood ?? null, tags: cur.tags || [], notes: cur.notes ?? null, ...patch };
  check(await sb.from('diary').upsert(row, { onConflict: 'user_id,day' }));
  await reload('diary');
}

app.addEventListener('change', (e) => {
  // evidenzia subito le scelte (faccine, etichette, giorni della differenziata)
  const lbl = e.target.closest('label.mood, label.chip');
  if (!lbl) return;
  if (e.target.type === 'radio') lbl.parentElement.querySelectorAll('label.mood').forEach((l) => l.classList.toggle('on', l.contains(e.target)));
  else lbl.classList.toggle('on', e.target.checked);
});

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, v } = el.dataset;
  try {
    switch (act) {
      case 'tab': S.tab = v; store.set('tab', v); render(); window.scrollTo(0, 0); break;
      case 'htab': S.htab = v; store.set('htab', v); render(); break;
      case 'ttab': S.ttab = v; store.set('ttab', v); render(); break;
      case 'go-dieta': S.tab = 'salute'; S.htab = 'dieta'; store.set('tab', 'salute'); store.set('htab', 'dieta'); render(); window.scrollTo(0, 0); break;
      case 'go-diario': S.tab = 'salute'; S.htab = 'diario'; store.set('tab', 'salute'); store.set('htab', 'diario'); render(); window.scrollTo(0, 0); break;
      case 'go-ciclo': S.tab = 'salute'; S.htab = 'ciclo'; store.set('tab', 'salute'); store.set('htab', 'ciclo'); render(); window.scrollTo(0, 0); break;
      case 'dweek': S.dietWeek = +v; render(); break;
      case 'filter': S.shopFilter = v; render(); break;
      case 'logout': await sb.auth.signOut(); break;
      case 'push-on': await enablePush(); break;
      case 'push-off': await disablePush(); break;
      case 'push-test': await testPush(); break;
      case 'forgot': {
        const email = document.getElementById('l-email')?.value.trim().toLowerCase();
        if (!email || !email.includes('@')) { showLoginMsg('Scrivi prima la tua email qui sopra, poi tocca di nuovo.'); return; }
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) { showLoginMsg(/rate|seconds/i.test(error.message) ? 'Troppe richieste ravvicinate: riprova tra qualche minuto.' : `Invio non riuscito (${error.message}).`); return; }
        showLoginMsg(`Fatto! Se ${email} è registrata, arriva una mail da Supabase: apri il link e scegli la password. Guarda anche nello spam.`, true);
        return;
      }

      case 'mood':
        await saveDiary(ymd(new Date()), { mood: +v });
        toast('Segnato nel diario');
        break;
      case 'diary-del':
      case 'cycle-del':
      case 'w-del':
      case 'bp-del':
      case 'wg-del':
      case 'ev-del': {
        if (!confirm(act === 'ev-del' ? 'Eliminare questo impegno?' : 'Eliminare questa registrazione?')) return;
        const [table, key] = {
          'diary-del': ['diary', 'diary'], 'cycle-del': ['cycle_log', 'cycle'], 'w-del': ['weights', 'weights'],
          'bp-del': ['blood_pressure', 'bp'], 'wg-del': ['wegovy_log', 'wegovy'], 'ev-del': ['events', 'events'],
        }[act];
        check(await sb.from(table).delete().eq('id', +v));
        await reload(key);
        break;
      }

      case 'cal-day': {
        S.calDay = v;
        const d = parseYmd(v);
        S.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        render();
        break;
      }
      case 'cal-month': {
        const base = S.calMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        S.calMonth = new Date(base.getFullYear(), base.getMonth() + +v, 1);
        render();
        break;
      }
      case 'ev-ics': {
        const ev = S.events.find((x) => x.id === +v);
        if (ev) saveIcs(`impegno-${ev.day}.ics`, icsWrap([icsEvent(ev)]));
        break;
      }
      case 'ev-ics-all': {
        const today = ymd(new Date());
        const list = S.events.filter((x) => x.day >= today);
        if (list.length) saveIcs('impegni-famiglia.ics', icsWrap(list.map(icsEvent)));
        break;
      }
      case 'rif-ics': saveIcs('differenziata.ics', icsRifiuti()); break;

      case 'shop-toggle': {
        const it = S.shopping.find((i) => i.id === +v);
        if (!it) return;
        it.done = !it.done;
        it.done_at = it.done ? new Date().toISOString() : null;
        it.done_by = it.done ? S.user.id : null;
        render();
        check(await sb.from('shopping_items').update({ done: it.done, done_at: it.done_at, done_by: it.done_by }).eq('id', it.id));
        break;
      }
      case 'shop-del':
        S.shopping = S.shopping.filter((i) => i.id !== +v); render();
        check(await sb.from('shopping_items').delete().eq('id', +v));
        break;
      case 'shop-clear': {
        const ids = S.shopping.filter((i) => i.done && (S.shopFilter === 'tutto' || i.category === S.shopFilter)).map((i) => i.id);
        if (!ids.length || !confirm('Togliere dalla lista tutte le cose già prese?')) return;
        S.shopping = S.shopping.filter((i) => !ids.includes(i.id)); render();
        check(await sb.from('shopping_items').delete().in('id', ids));
        break;
      }
      case 'quick':
        check(await sb.from('shopping_items').insert({ name: v, category: el.dataset.c, week_start: ymd(shopWeek()) }));
        toast(`Aggiunto: ${v}`);
        await reload('shopping');
        break;

      case 'task-toggle': {
        const t = S.tasks.find((x) => x.id === +v);
        if (!t) return;
        t.done = !t.done;
        t.done_at = t.done ? new Date().toISOString() : null;
        render();
        check(await sb.from('tasks').update({ done: t.done, done_at: t.done_at }).eq('id', t.id));
        break;
      }
      case 'task-del':
        if (!confirm('Eliminare questa voce?')) return;
        S.tasks = S.tasks.filter((t) => t.id !== +v); render();
        check(await sb.from('tasks').delete().eq('id', +v));
        break;
    }
  } catch (err) {
    fail(err);
    reload('shopping', 'tasks').catch(() => {});
  }
});

app.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const formData = new FormData(form);
  const fd = Object.fromEntries(formData);
  const btn = form.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try {
    switch (form.dataset.form) {
      case 'login': {
        store.set('remember', fd.remember ? '1' : '0');
        const { data, error } = await sb.auth.signInWithPassword({ email: fd.email.trim().toLowerCase(), password: fd.password });
        if (error) {
          const msg = /not confirmed/i.test(error.message) ? 'Questo account non è ancora confermato: va confermato su Supabase.'
            : /invalid login/i.test(error.message) ? 'Email o password sbagliate.'
            : navigator.onLine ? `Accesso non riuscito (${error.message}).` : 'Sei offline: controlla la connessione.';
          showLoginMsg(msg);
          break;
        }
        await start(data.user);
        break;
      }
      case 'set-pass': {
        if (fd.p1 !== fd.p2) { showLoginMsg('Le due password non sono uguali.'); break; }
        const { data, error } = await sb.auth.updateUser({ password: fd.p1 });
        if (error) { showLoginMsg(/weak|pwned|leaked/i.test(error.message) ? 'Password troppo facile o già finita in furti di dati: scegline un\'altra.' : `Non riuscito (${error.message}).`); break; }
        toast('Password salvata ✅');
        await start(data.user);
        break;
      }
      case 'name': {
        check(await sb.from('profiles').upsert({ id: S.user.id, name: fd.name.trim() }));
        check(await sb.from('user_settings').upsert({ user_id: S.user.id, follows_diet: !!fd.diet }));
        await start(S.user);
        break;
      }
      case 'shop-add':
        check(await sb.from('shopping_items').insert({ name: fd.name.trim(), category: fd.category, week_start: ymd(shopWeek()) }));
        form.reset();
        await reload('shopping');
        document.getElementById('s-name')?.focus();
        break;
      case 'task-add':
        check(await sb.from('tasks').insert({ title: fd.title.trim(), due: fd.due || null, assignee: fd.assignee || null, kind: S.ttab }));
        form.reset();
        await reload('tasks');
        toast('Aggiunto');
        break;
      case 'weight-add': {
        const kg = num(fd.kg);
        if (!kg || kg < 30 || kg > 300) { toast('Controlla il peso (es. 113,5)'); break; }
        check(await sb.from('weights').insert({ kg, day: fd.day }));
        form.reset();
        await reload('weights');
        toast('Peso salvato 💪');
        break;
      }
      case 'bp-add': {
        const sys = parseInt(fd.sys, 10), dia = parseInt(fd.dia, 10), pulse = fd.pulse ? parseInt(fd.pulse, 10) : null;
        if (!(sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160) || (pulse !== null && !(pulse >= 30 && pulse <= 220))) { toast('Controlla i valori'); break; }
        check(await sb.from('blood_pressure').insert({ sys, dia, pulse, note: fd.note?.trim() || null }));
        form.reset();
        await reload('bp');
        toast('Pressione salvata');
        break;
      }
      case 'wg-add':
        check(await sb.from('wegovy_log').insert({ day: fd.day, dose: fd.dose, notes: fd.notes?.trim() || null }));
        form.reset();
        await reload('wegovy');
        toast('Puntura segnata');
        break;
      case 'diary-save':
        await saveDiary(fd.day, { mood: fd.mood ? +fd.mood : null, tags: formData.getAll('tag'), notes: fd.notes?.trim() || null });
        toast('Diario salvato');
        break;
      case 'cycle-add': {
        const { error } = await sb.from('cycle_log').insert({ start_day: fd.day });
        if (error && error.code !== '23505') throw error;
        await reload('cycle');
        toast('Ciclo segnato');
        break;
      }
      case 'ev-add':
        check(await sb.from('events').insert({ title: fd.title.trim(), day: fd.day, time: fd.time || null, who: fd.who || null }));
        S.calDay = fd.day;
        form.reset();
        await reload('events');
        toast('Impegno aggiunto');
        break;
      case 'ev-paste': {
        const lines = String(fd.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const rows = lines.map(parseLine);
        const ok = rows.filter(Boolean);
        if (!ok.length) { toast('Non ho capito le righe: usa il formato 12/10 15:30 Titolo'); break; }
        check(await sb.from('events').insert(ok));
        form.reset();
        await reload('events');
        toast(`Aggiunti ${ok.length} impegni${ok.length < lines.length ? ` · ${lines.length - ok.length === 1 ? '1 riga non capita' : (lines.length - ok.length) + ' righe non capite'}` : ''}`);
        break;
      }
      case 'rem-save': {
        const reminders = { before: +fd.before || 60, allday: fd.allday === 'mattina' ? 'mattina' : 'sera', alldayTime: fd.alldayTime || '20:00', rif: fd.rif || '' };
        check(await sb.from('user_settings').upsert({ user_id: S.user.id, follows_diet: S.mine.follows_diet, height_cm: S.mine.height_cm, goal_kg: S.mine.goal_kg, reminders }));
        await reload('mine');
        toast('Orari salvati: ora rimetti i promemoria sul telefono 📲');
        break;
      }
      case 'rif-save': {
        const days = {}, alt = {};
        for (let i = 0; i < 7; i++) {
          const t = formData.getAll(`d${i}`);
          if (t.length) days[i] = t;
          if (t.length && fd[`alt${i}`]) alt[i] = fd[`alt${i}`];
        }
        check(await sb.from('app_settings').upsert({ key: 'rifiuti', value: { days, alt, when: fd.when, time: rif().time || '' } }));
        await reload('settings');
        toast('Differenziata salvata');
        break;
      }
      case 'diet-settings': {
        const follows = !!fd.follow;
        if (fd.start && fd.start !== dietStart()) {
          const monday = ymd(mondayOf(parseYmd(fd.start)));
          check(await sb.from('app_settings').upsert({ key: 'diet_start', value: monday }));
        }
        check(await sb.from('user_settings').upsert({ user_id: S.user.id, follows_diet: follows }));
        await Promise.all([loaders.settings(), loaders.mine()]);
        await ensureDietShopping();
        S.dietWeek = null;
        render();
        toast('Salvato');
        break;
      }
      case 'health-settings': {
        const height = fd.height ? parseInt(fd.height, 10) : null;
        const goal = fd.goal ? num(fd.goal) : null;
        if ((height !== null && !(height >= 100 && height <= 230)) || (goal !== null && !(goal >= 30 && goal <= 300))) { toast('Controlla i valori'); break; }
        check(await sb.from('user_settings').upsert({ user_id: S.user.id, follows_diet: S.mine.follows_diet, height_cm: height, goal_kg: goal }));
        await reload('mine');
        toast('Salvato');
        break;
      }
    }
  } catch (err) {
    fail(err);
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
});

boot().catch((e) => { console.error(e); app.innerHTML = '<div class="center">Errore di avvio. Ricarica la pagina.</div>'; });
