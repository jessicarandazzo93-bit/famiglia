// Finto Supabase in memoria, solo per provare l'interfaccia in locale (tools/test.html).
const ME = 'u-me', HIM = 'u-him';
const db = {
  profiles: [{ id: ME, name: 'Mamma' }, { id: HIM, name: 'Papà' }],
  app_settings: [{ key: 'rifiuti', value: { days: { 0: ['umido', 'pannolini'], 1: ['carta'], 2: ['indiff', 'pannolini'], 3: ['umido', 'vetro'], 4: ['plastica', 'pannolini'], 5: ['umido'] }, alt: { 2: '2026-10-07' }, when: 'sera', time: '20:30' } }],
  user_settings: [{ user_id: ME, follows_diet: true, height_cm: 159, goal_kg: 90 }],
  shopping_items: [
    { id: 1, name: 'Pannolini', category: 'bambini', week_start: '2026-09-28', done: false, done_at: null, created_by: HIM, created_at: '2026-09-27T10:00:00Z' },
  ],
  diet_weeks_loaded: [],
  tasks: [
    { id: 1, title: 'Ritirare analisi', due: '2026-10-04', assignee: ME, done: false, created_by: ME, created_at: '2026-10-01T10:00:00Z' },
    { id: 2, title: 'Posta', due: null, assignee: null, done: false, created_by: HIM, created_at: '2026-10-02T10:00:00Z' },
  ],
  weights: [{ id: 1, day: '2026-09-21', kg: 115.2 }, { id: 2, day: '2026-09-28', kg: 114.6 }, { id: 3, day: '2026-10-05', kg: 114 }],
  blood_pressure: [{ id: 1, measured_at: new Date().toISOString(), sys: 142, dia: 92, pulse: 80, note: null }],
  wegovy_log: [{ id: 1, day: '2026-10-05', dose: '0,25 mg', notes: null }],
  events: [{ id: 1, title: 'Pediatra', day: '2026-10-07', time: '15:30:00', who: 'Bimbi', note: null }],
  diary: [{ id: 1, day: '2026-10-05', mood: 2, tags: ['Nausea'], notes: 'Un po stanca' }],
  cycle_log: [{ id: 1, start_day: '2026-09-12' }, { id: 2, start_day: '2026-08-15' }],
};
let seq = 100;
const PK = { profiles: 'id', app_settings: 'key', user_settings: 'user_id', diet_weeks_loaded: 'week_start', diary: 'day', cycle_log: 'start_day' };

function q(table) {
  let rows = () => db[table];
  const filters = [];
  let op = 'select', payload = null, single = false, orders = [], lim = null, ret = false;
  const api = {
    select() { ret = true; return api; },
    or(expr) {
      const parts = expr.split(',').map((p) => p.split('.'));
      filters.push((r) => parts.some(([k, o, ...v]) => { const val = v.join('.'); return o === 'eq' ? String(r[k]) === val : r[k] && r[k] >= val; }));
      return api;
    },
    eq(k, v) { filters.push((r) => r[k] === v); return api; },
    gte(k, v) { filters.push((r) => r[k] >= v); return api; },
    in(k, vs) { filters.push((r) => vs.includes(r[k])); return api; },
    order(k, o = {}) { orders.push([k, o.ascending !== false]); return api; },
    limit(n) { lim = n; return api; },
    maybeSingle() { single = true; return api; },
    insert(p) { op = 'insert'; payload = [].concat(p); return api; },
    upsert(p) { op = 'upsert'; payload = [].concat(p); return api; },
    update(p) { op = 'update'; payload = p; return api; },
    delete() { op = 'delete'; return api; },
    then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const match = (r) => filters.every((f) => f(r));
    if (op === 'select') {
      let out = rows().filter(match);
      for (const [k, asc] of orders.slice().reverse()) out = out.slice().sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1));
      if (lim) out = out.slice(0, lim);
      return { data: single ? out[0] || null : out.map((r) => ({ ...r })), error: null };
    }
    if (op === 'insert') {
      const pk = PK[table];
      for (const p of payload) if (pk && db[table].some((r) => r[pk] === p[pk])) return { data: null, error: { code: '23505', message: 'duplicate' } };
      const added = payload.map((p) => ({ id: ++seq, done: false, created_by: ME, user_id: ME, created_at: new Date().toISOString(), measured_at: new Date().toISOString(), ...p }));
      db[table].push(...added);
      return { data: ret ? added : null, error: null };
    }
    if (op === 'upsert') {
      const pk = PK[table];
      for (const p of payload) {
        const ex = db[table].find((r) => r[pk] === p[pk]);
        if (ex) Object.assign(ex, p); else db[table].push({ ...p });
      }
      return { data: null, error: null };
    }
    if (op === 'update') { db[table].filter(match).forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
    if (op === 'delete') { db[table] = db[table].filter((r) => !match(r)); return { data: null, error: null }; }
  }
  return api;
}

export function createClient() {
  const user = { id: ME, email: 'mamma@example.com' };
  return {
    from: q,
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { user }, error: null }),
      signOut: async () => ({ error: null }),
    },
    channel() { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel() {},
  };
}
