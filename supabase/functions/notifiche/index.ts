// Servizio notifiche push della Famiglia.
// - Chiamato ogni 5 minuti da pg_cron (header x-cron-secret): manda gli avvisi di differenziata e impegni.
// - Chiamato dall'app con il login (body {test:true}): manda una notifica di prova ai telefoni di chi la chiede.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const RIFIUTI: Record<string, string> = {
  umido: '🍂 Organico', plastica: '🧴 Plastica', carta: '📦 Carta e cartone', vetro: '🍾 Vetro', indiff: '🗑️ Indifferenziata', pannolini: '👶 Pannolini',
};
const WINDOW = 30 * 60000; // un avviso "scaduto" da più di 30 minuti non si manda più
const DAY = 86400000;

// Orari "da orologio di Roma" rappresentati come millisecondi UTC (così niente problemi di fuso)
function romeNow(): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t: string) => +parts.find((p) => p.type === t)!.value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
}
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (day: string, hm: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = (hm || '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, mi);
};
const wdIdx = (t: number) => (new Date(t).getUTCDay() + 6) % 7;

function easter(y: number): number {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Date.UTC(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}
function isHoliday(t: number): boolean {
  const y = new Date(t).getUTCFullYear();
  const fixed = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].map((md) => `${y}-${md}`);
  return fixed.includes(ymd(t)) || ymd(easter(y) + DAY) === ymd(t);
}
// deve restare uguale a rifOn() in app.js
function rifOn(t: number, r: any): string[] {
  if (isHoliday(t)) return [];
  const i = wdIdx(t);
  const types: string[] = r.days?.[i] || [];
  const anchor = r.alt?.[i];
  if (types.length && anchor) {
    const diff = Math.round((t - at(anchor, '00:00')) / DAY);
    if (((diff % 14) + 14) % 14 !== 0) return [];
  }
  return types;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const { data: cfgRows, error: cfgErr } = await sb.from('push_config').select('key,value');
  if (cfgErr) return json({ error: 'config' }, 500);
  const cfg = Object.fromEntries(cfgRows.map((r) => [r.key, r.value]));

  const isCron = req.headers.get('x-cron-secret') === cfg.cron_secret;
  let testUser: string | null = null;
  if (!isCron) {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data } = await sb.auth.getUser(token);
    if (!data?.user) return json({ error: 'non autorizzato' }, 401);
    testUser = data.user.id;
  }

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  const { data: subs } = await sb.from('push_subscriptions').select('*');
  let sent = 0;
  const errors: string[] = [];
  const send = async (userId: string, payload: Record<string, unknown>) => {
    for (const s of (subs || []).filter((x) => x.user_id === userId)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
        else errors.push(`${e?.statusCode || ''} ${e?.body || e?.message || e}`.trim());
      }
    }
  };

  if (testUser) {
    await send(testUser, { title: '🔔 Prova riuscita', body: 'Le notifiche della Famiglia funzionano su questo telefono.', tag: 'prova' });
    return json({ ok: true, devices: (subs || []).filter((s) => s.user_id === testUser).length, sent, errors });
  }

  // --- giro automatico ---
  const now = romeNow();
  const today = ymd(now);
  const users = [...new Set((subs || []).map((s) => s.user_id))];
  if (!users.length) return json({ ok: true, sent: 0 });

  const [{ data: settings }, { data: prefs }, { data: events }] = await Promise.all([
    sb.from('app_settings').select('key,value').eq('key', 'rifiuti'),
    sb.from('user_settings').select('user_id,reminders').in('user_id', users),
    sb.from('events').select('id,title,day,time,who').gte('day', ymd(now - DAY)).lte('day', ymd(now + 2 * DAY)),
  ]);
  const r = { days: {}, alt: {}, when: 'sera', time: '', ...(settings?.[0]?.value || {}) };
  const once = async (key: string) => !(await sb.from('notifications_sent').insert({ key })).error;
  const due = (alarm: number) => alarm <= now && now - alarm < WINDOW;
  const dayLabel = (d: string) => (d === today ? 'Oggi' : d === ymd(now + DAY) ? 'Domani' : new Date(at(d, '12:00')).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));

  for (const user of users) {
    const rem = { before: 60, allday: 'sera', alldayTime: '20:00', ...(prefs?.find((p) => p.user_id === user)?.reminders || {}) };

    // Differenziata
    const rifTime = rem.rif || r.time || (r.when === 'sera' ? '20:30' : '07:00');
    const rAlarm = at(today, rifTime);
    if (due(rAlarm)) {
      const collect = r.when === 'sera' ? rAlarm + DAY : rAlarm;
      const types = rifOn(at(ymd(collect), '00:00'), r);
      if (types.length && (await once(`rif:${user}:${today}`))) {
        await send(user, {
          title: '♻️ Differenziata',
          body: `${r.when === 'sera' ? 'Stasera porta fuori' : 'Stamattina porta fuori'}: ${types.map((k) => RIFIUTI[k] || k).join(', ')}`,
          tag: `rif-${today}`,
        });
      }
    }

    // Impegni
    for (const e of events || []) {
      const alarm = e.time
        ? at(e.day, e.time.slice(0, 5)) - (+rem.before || 60) * 60000
        : rem.allday === 'mattina' ? at(e.day, rem.alldayTime) : at(e.day, rem.alldayTime) - DAY;
      if (due(alarm) && (await once(`ev:${user}:${e.id}:${alarm}`))) {
        await send(user, {
          title: `📅 ${e.title}`,
          body: `${dayLabel(e.day)}${e.time ? ` alle ${e.time.slice(0, 5)}` : ''}${e.who ? ` · per ${e.who}` : ''}`,
          tag: `ev-${e.id}`,
        });
      }
    }
  }

  // pulizia del registro avvisi (una volta al giorno, verso le 4)
  if (new Date(now).getUTCHours() === 4 && new Date(now).getUTCMinutes() < 5) {
    await sb.from('notifications_sent').delete().lt('sent_at', new Date(Date.now() - 30 * DAY).toISOString());
  }
  return json({ ok: true, sent, errors });
});
