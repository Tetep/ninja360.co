/* The crew journal — what GO LIVE writes.
 *
 * The run sheet keeps its plan on the phone; the crew copy (state.js) is the same plan mirrored.
 * Neither is a record of what happened. This is: one entry per published day — which stops were
 * shot (with the ledger's stamps), which were carried, which were skipped, who published, from
 * which device, when. The app keeps only the receipt; anything that wants the truth of a day (the
 * sheet update, the Score tab, a person asking "what did you run Thursday") reads it here.
 *
 * Same key discipline as state.js: the crew key is hashed into the storage key, never stored, and
 * a wrong key reads an empty journal rather than someone else's.
 *
 * Every entry is its own KV key — `<crew slot>:<receivedAt, zero-padded>-<random>` — so two devices
 * publishing in the same second both land: nothing is read, modified and written back, nothing is
 * trimmed, and the key's timestamp orders the journal. KV listing is eventually consistent, so a
 * new entry can take up to a minute to show in GET; it is never lost. Entries the first build wrote
 * (one JSON list under the bare slot key) are still read.
 *
 *   GET  /api/journal            -> { n, entries: [...] } newest first (up to 200); ?date=YYYY-MM-DD filters
 *   POST /api/journal  {entry}   -> { ok, id, at }   appends; id is the entry's own key
 */

const MIN_KEY = 8;
const MAX_ENTRY = 16 * 1024;   // a day is a few hundred bytes; this is generous
const READ_MAX = 200;          // entries returned by one GET
const ID = /^[a-z0-9-]{1,24}$/i, DATE = /^\d{4}-\d{2}-\d{2}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function slot(key) {
  const bytes = new TextEncoder().encode('ninja360-journal:' + key);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'journal:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const ids = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && ID.test(x)).slice(0, 200) : [];

// keep only the fields an entry is allowed to have, in the shape the app writes them
function clean(body) {
  if (!body || typeof body !== 'object') return null;
  if (!DATE.test(String(body.date || ''))) return null;
  const shot = Array.isArray(body.shot) ? body.shot
    .filter(x => x && typeof x === 'object' && typeof x.id === 'string' && ID.test(x.id))
    .slice(0, 200).map(x => ({ id: x.id, at: Number.isFinite(x.at) ? x.at : 0, d: DATE.test(String(x.d || '')) ? x.d : '' })) : [];
  return {
    date: body.date, name: String(body.name || '').slice(0, 48), by: String(body.by || '').slice(0, 24),
    dev: String(body.dev || '').slice(0, 24), devName: String(body.devName || '').slice(0, 24),   // which of Tim's devices published it
    at: Number.isFinite(body.at) ? body.at : Date.now(),
    shot, carried: ids(body.carried), skipped: ids(body.skipped),
    pts: Number.isFinite(body.pts) ? body.pts : 0, miles: Number.isFinite(body.miles) ? body.miles : 0,
  };
}

export async function onRequest({ request, env }) {
  if (!env.RUNSHEET) return json({ error: 'no-store', detail: 'KV namespace RUNSHEET is not bound to this project yet.' }, 503);

  const key = request.headers.get('x-crew-key') || '';
  if (key.length < MIN_KEY) return json({ error: 'no-key', detail: `Send x-crew-key, at least ${MIN_KEY} characters.` }, 401);
  const id = await slot(key);

  if (request.method === 'GET') {
    const date = new URL(request.url).searchParams.get('date');
    const keys = [];
    let cursor;
    do {
      const page = await env.RUNSHEET.list({ prefix: id + ':', cursor });
      keys.push(...page.keys);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    // keys list in lexical order, and the zero-padded timestamp makes that time order: newest last
    const wanted = keys.filter(k => !date || (k.metadata && k.metadata.date === date)).slice(-READ_MAX).reverse();
    const fresh = (await Promise.all(wanted.map(k => env.RUNSHEET.get(k.name, { type: 'json' })))).filter(Boolean);
    const legacy = (await env.RUNSHEET.get(id, { type: 'json' })) || [];
    const old = (date ? legacy.filter(e => e && e.date === date) : legacy).slice().reverse();
    return json({ n: keys.length + legacy.length, entries: fresh.concat(old).slice(0, READ_MAX) });
  }

  if (request.method === 'POST') {
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_ENTRY) return json({ error: 'too-big' }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad-json' }, 400);
    }
    const entry = clean(body);
    if (!entry) return json({ error: 'bad-entry', detail: 'Expected {date: YYYY-MM-DD, shot: [{id,at,d}], carried: [], skipped: []}.' }, 400);

    entry.receivedAt = Date.now();
    entry.id = String(entry.receivedAt).padStart(15, '0') + '-' + crypto.randomUUID().slice(0, 8);
    await env.RUNSHEET.put(id + ':' + entry.id, JSON.stringify(entry), { metadata: { date: entry.date } });
    return json({ ok: true, id: entry.id, at: entry.receivedAt });
  }

  return json({ error: 'method' }, 405);
}
