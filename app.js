import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_DIET_START } from './config.js';
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
const fmtDay = (s) => parseYmd(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDT = (s) => new Date(s).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kgFmt = (n) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const CATS = [['dieta', '🥗 Dieta'], ['casa', '🏠 Casa'], ['bambini', '🧸 Bambini'], ['altro', '📦 Altro']];
const catLabel = (c) => (CATS.find((x) => x[0] === c) || [c, c])[1];

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } },
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
function fail(e) {
  console.error(e);
  toast(navigator.onLine ? 'Qualcosa è andato storto, riprova' : 'Sei offline: riprova quando torna la rete');
}
const check = ({ data, error }) => { if (error) throw error; return data; };

// ---------- stato ----------
const S = {
  user: null,
  profiles: {},
  settings: {},
  mine: { follows_diet: true, height_cm: null, goal_kg: null },
  shopping: [], tasks: [], weights: [], bp: [], wegovy: [],
  tab: store.get('tab', 'oggi'),
  htab: store.get('htab', 'dieta'),
  shopFilter: 'tutto',
  dietWeek: null,
  channel: null,
};

const dietStart = () => S.settings.diet_start || DEFAULT_DIET_START;
function dietPos(date) {
  const start = mondayOf(parseYmd(dietStart()));
  const diff = daysBetween(start, date);
  if (diff < 0) return null;
  const w = Math.floor(diff / 7);
  return { weekNum: w + 1, idx: w % 4, day: (date.getDay() + 6) % 7 };
}
// Da venerdì la spesa è per la settimana successiva
function shopWeek() {
  const t = new Date();
  const wd = (t.getDay() + 6) % 7;
  return wd >= 4 ? addDays(mondayOf(t), 7) : mondayOf(t);
}
const nameOf = (id) => (id === S.user?.id ? 'te' : S.profiles[id] || 'qualcuno');

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
  let t;
  const later = (name) => () => { clearTimeout(t); t = setTimeout(() => reload(name).catch(fail), 300); };
  S.channel = sb.channel('famiglia')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, later('shopping'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, later('tasks'))
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
  if (data.session) await start(data.session.user);
  else renderLogin();
}

async function start(user) {
  S.user = user;
  app.innerHTML = '<div class="center muted">Caricamento…</div>';
  try {
    await Promise.all(Object.values(loaders).map((f) => f()));
    if (!S.profiles[user.id]) { renderName(); return; }
    await ensureDietShopping();
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
    ensureDietShopping().then(() => reload('shopping', 'tasks')).catch(() => {});
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
      <input id="l-email" name="email" type="email" autocomplete="username" required>
      <label class="f" for="l-pass">Password</label>
      <input id="l-pass" name="password" type="password" autocomplete="current-password" required>
      <label class="f" style="display:flex;gap:8px;align-items:center;margin-top:12px;color:var(--ink);font-size:15px">
        <input id="l-remember" name="remember" type="checkbox" style="width:auto" ${remember() ? 'checked' : ''}> Resta connesso
      </label>
      <p style="margin:14px 0 0"><button class="btn full">Entra</button></p>
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
    kept[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  const focus = document.activeElement?.id;

  const views = { oggi: viewOggi, salute: viewSalute, spesa: viewSpesa, fuori: viewFuori };
  const view = (views[S.tab] || viewOggi)();
  app.innerHTML = `<div class="wrap">
      <div class="top"><span class="who">Ciao ${esc(S.profiles[S.user.id])}</span>
        <button class="linkbtn" data-act="logout">Esci</button></div>
      ${view}
    </div>${nav()}`;

  for (const [id, v] of Object.entries(kept)) {
    const el = document.getElementById(id);
    if (!el || el.dataset.fresh) continue;
    if (el.type === 'checkbox') el.checked = v; else el.value = v;
  }
  if (focus) document.getElementById(focus)?.focus();
}

function nav() {
  const toBuy = S.shopping.filter((i) => !i.done).length;
  const late = S.tasks.filter((t) => !t.done && t.due && t.due <= ymd(new Date())).length;
  const b = (id, ic, lbl, dot) => `<button class="${S.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}">
      <span class="ic">${ic}</span>${lbl}${dot ? `<span class="dot">${dot}</span>` : ''}</button>`;
  return `<nav class="tabs"><div class="in">
    ${b('oggi', '🏡', 'Oggi')}${b('salute', '💚', 'Salute')}${b('spesa', '🛒', 'Spesa', toBuy)}${b('fuori', '📋', 'Fuori casa', late)}
  </div></nav>`;
}

// ---------- OGGI ----------
function viewOggi() {
  const now = new Date();
  const h = now.getHours();
  const saluto = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const dataLunga = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  let out = `<h1>${saluto} ☀️</h1><div class="muted" style="text-transform:capitalize">${dataLunga}</div>`;

  if (S.mine.follows_diet) {
    const pos = dietPos(now);
    if (!pos) {
      out += `<div class="card info">🥗 La dieta parte <b>${fmtDay(ymd(mondayOf(parseYmd(dietStart()))))}</b>.</div>`;
    } else {
      const g = DIET.settimane[pos.idx].giorni[pos.day];
      out += `<div class="card"><h2>🍽️ Oggi si mangia <span class="badge">Settimana ${pos.idx + 1}${pos.weekNum > 4 ? ` · giro ${Math.ceil(pos.weekNum / 4)}` : ''}</span></h2>
        <div class="meal">
          <div class="lbl">Colazione</div><div><details><summary style="padding:0;font-weight:400">Una a scelta</summary>
            <ul style="margin:4px 0 0 18px;padding:0">${DIET.colazioni.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details></div>
          <div class="lbl">Pranzo</div><div>${esc(g.pranzo)}</div>
          <div class="lbl">Cena</div><div class="${g.libero ? 'free' : ''}">${esc(g.cena)}${g.doppio ? ' <span class="badge orange">cucina doppio</span>' : ''}</div>
        </div>
        <p class="small muted" style="margin:10px 0 0">💊 Libramed prima dei pasti con 2 bicchieri d'acqua · 💧 1,5–2 litri al giorno</p>
      </div>`;

      const tom = addDays(now, 1);
      const tp = dietPos(tom);
      if (tp && tp.day <= 4) {
        const gt = DIET.settimane[tp.idx].giorni[tp.day];
        out += `<div class="card tip"><b>🌙 Stasera prepara il pranzo di domani</b><br>${esc(gt.pranzo)}
          ${g.doppio ? '<div class="small" style="margin-top:4px">Usa la seconda porzione della cena di stasera.</div>' : ''}</div>`;
      }
      if (pos.day === 6) {
        out += `<div class="card warn"><b>🕐 Domenica: 30 minuti di preparazione</b>
          <ul style="margin:6px 0 0 18px;padding:0">${DIET.prepDomenica.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
      }
    }
  }

  const toBuy = S.shopping.filter((i) => !i.done);
  const left = toBuy.filter((i) => i.week_start < ymd(shopWeek())).length;
  out += `<div class="card" data-act="tab" data-v="spesa" style="cursor:pointer"><h2>🛒 Spesa</h2>
    ${toBuy.length ? `<b>${toBuy.length}</b> cose da prendere${left ? ` · <span class="badge orange">${left} rimaste dalla volta scorsa</span>` : ''}` : 'Lista vuota 🎉'}
    <div class="small muted" style="margin-top:4px">Tocca per aprire la lista →</div></div>`;

  const today = ymd(new Date());
  const soon = ymd(addDays(new Date(), 3));
  const urgent = S.tasks.filter((t) => !t.done && (!t.due || t.due <= soon))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 5);
  out += `<div class="card"><h2>📋 Da fare</h2>${urgent.length ? `<ul class="list">${urgent.map((t) => taskRow(t, today)).join('')}</ul>` : '<span class="muted">Niente in scadenza nei prossimi giorni.</span>'}</div>`;

  const last = S.weights[S.weights.length - 1];
  out += `<form class="card" data-form="weight-add"><h2>⚖️ Peso</h2>
    ${last ? `<div class="small muted">Ultima pesata: <b>${kgFmt(last.kg)} kg</b> (${fmtDay(last.day)})</div>` : ''}
    <div class="row" style="margin-top:8px"><input id="o-kg" name="kg" inputmode="decimal" placeholder="Peso di oggi, es. 113,5" required>
    <input type="hidden" name="day" value="${today}"><button class="btn">Salva</button></div></form>`;
  return out;
}

// ---------- SALUTE ----------
function viewSalute() {
  const tabs = [['dieta', 'Dieta'], ['peso', 'Peso'], ['pressione', 'Pressione'], ['wegovy', 'Wegovy']];
  const seg = `<div class="seg">${tabs.map(([k, l]) => `<button class="${S.htab === k ? 'on' : ''}" data-act="htab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const sub = { dieta: viewDieta, peso: viewPeso, pressione: viewPressione, wegovy: viewWegovy }[S.htab] || viewDieta;
  return `<h1>💚 Salute</h1><div class="small muted">I dati di peso, pressione e Wegovy li vedi solo tu.</div>${seg}${sub()}`;
}

function viewDieta() {
  const pos = dietPos(new Date());
  const w = S.dietWeek ?? (pos ? pos.idx : 0);
  const sett = DIET.settimane[w];
  const chips = DIET.settimane.map((_, i) => `<button class="chip ${i === w ? 'on' : ''}" data-act="dweek" data-v="${i}">Settimana ${i + 1}</button>`).join('');
  const rows = sett.giorni.map((g, i) => {
    const isToday = pos && pos.idx === w && pos.day === i;
    return `<tr style="${isToday ? 'background:var(--green-soft)' : ''}"><td><b>${GIORNI[i].slice(0, 3)}</b>${isToday ? '<br><span class="badge">oggi</span>' : ''}</td>
      <td>${esc(g.pranzo)}</td><td class="${g.libero ? 'free' : ''}">${esc(g.cena)}${g.doppio ? ' <span class="badge orange">x2</span>' : ''}</td></tr>`;
  }).join('');
  return `<div class="chips">${chips}</div>
    ${sett.nota ? `<div class="card info small">${esc(sett.nota)}</div>` : ''}
    <div class="card" style="padding:8px 10px"><table><tr><th></th><th>Pranzo (al lavoro)</th><th>Cena</th></tr>${rows}</table>
      <p class="small muted">x2 = cucina doppio: la seconda porzione è il pranzo di domani.</p></div>
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
      <label class="f" for="g-notes">Effetti collaterali / note</label>
      <textarea id="g-notes" name="notes" placeholder="es. un po' di nausea il giorno dopo, poca fame…"></textarea>
      <p style="margin:12px 0 0"><button class="btn">Salva</button></p></form>
    ${S.wegovy.length ? `<div class="card"><h2>Diario</h2><ul class="list">${S.wegovy.map((r) =>
      `<li class="item"><div class="main"><div class="title"><b>${esc(r.dose)}</b> · ${fmtDay(r.day)}</div>
        ${r.notes ? `<div class="meta">${esc(r.notes)}</div>` : ''}</div>
        <button class="x" data-act="wg-del" data-v="${r.id}" aria-label="Elimina">✕</button></li>`).join('')}</ul></div>` : ''}
    <div class="card info small">Porta questo diario alle visite: all'endocrinologa serve sapere come hai tollerato ogni dose.</div>`;
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

// ---------- FUORI CASA ----------
function taskRow(t, today) {
  const late = t.due && t.due < today;
  const isToday = t.due === today;
  return `<li class="item ${t.done ? 'done' : ''}">
    <button class="check" data-act="task-toggle" data-v="${t.id}" aria-label="${t.done ? 'Da rifare' : 'Fatto'}">${t.done ? '✓' : ''}</button>
    <div class="main" data-act="task-toggle" data-v="${t.id}"><div class="title">${esc(t.title)}</div>
      <div class="meta">${t.due ? `<span class="badge ${late ? 'red' : isToday ? 'orange' : 'blue'}">${late ? 'scaduto · ' : isToday ? 'oggi · ' : ''}${fmtDay(t.due)}</span> ` : ''}${t.assignee ? `per ${esc(nameOf(t.assignee))}` : 'per entrambi'}</div></div>
    <button class="x" data-act="task-del" data-v="${t.id}" aria-label="Elimina">✕</button></li>`;
}

function viewFuori() {
  const today = ymd(new Date());
  const todo = S.tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const done = S.tasks.filter((t) => t.done);
  const people = Object.entries(S.profiles);
  return `<h1>📋 Fuori casa</h1><div class="small muted">Commissioni, appuntamenti, scadenze: le vedete entrambi</div>
    <form class="card" data-form="task-add">
      <input id="t-title" name="title" placeholder="es. Ritirare le analisi, pediatra, posta…" maxlength="120" required autocomplete="off">
      <div class="row" style="margin-top:8px">
        <input id="t-due" name="due" type="date" aria-label="Entro il">
        <select id="t-who" name="assignee"><option value="">Per entrambi</option>${people.map(([id, n]) =>
          `<option value="${id}">${id === S.user.id ? 'Per me' : 'Per ' + esc(n)}</option>`).join('')}</select>
        <button class="btn">Aggiungi</button>
      </div></form>
    <div class="card">${todo.length ? `<ul class="list">${todo.map((t) => taskRow(t, today)).join('')}</ul>` : '<span class="muted">Tutto fatto 🎉</span>'}</div>
    ${done.length ? `<div class="card"><details><summary>✓ Fatti negli ultimi 7 giorni (${done.length})</summary>
      <ul class="list">${done.map((t) => taskRow(t, today)).join('')}</ul></details></div>` : ''}`;
}

// ---------- azioni ----------
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, v } = el.dataset;
  try {
    switch (act) {
      case 'tab': S.tab = v; store.set('tab', v); render(); window.scrollTo(0, 0); break;
      case 'htab': S.htab = v; store.set('htab', v); render(); break;
      case 'dweek': S.dietWeek = +v; render(); break;
      case 'filter': S.shopFilter = v; render(); break;
      case 'logout': await sb.auth.signOut(); break;

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

      case 'w-del':
      case 'bp-del':
      case 'wg-del': {
        if (!confirm('Eliminare questa registrazione?')) return;
        const [table, key] = { 'w-del': ['weights', 'weights'], 'bp-del': ['blood_pressure', 'bp'], 'wg-del': ['wegovy_log', 'wegovy'] }[act];
        check(await sb.from(table).delete().eq('id', +v));
        await reload(key);
        break;
      }
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
  const fd = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button');
  if (btn) btn.disabled = true;
  try {
    switch (form.dataset.form) {
      case 'login': {
        store.set('remember', fd.remember ? '1' : '0');
        const { data, error } = await sb.auth.signInWithPassword({ email: fd.email.trim(), password: fd.password });
        if (error) { toast('Email o password sbagliate'); break; }
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
        check(await sb.from('tasks').insert({ title: fd.title.trim(), due: fd.due || null, assignee: fd.assignee || null }));
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
