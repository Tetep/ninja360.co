/* Shared crew state — the run sheet on every device.
 *
 * The sheet has always kept its plan in localStorage, which is per-device by definition:
 * Tim plans on the laptop, picks up the phone, and it looks like the plan vanished. This
 * gives the crew one copy.
 *
 * Storage is a KV namespace bound as RUNSHEET. Without that binding this returns 503 and
 * the app carries on exactly as it did before — local only, nothing lost.
 *
 * ninja360.org is a public host with no Access in front of it, and the sheet carries IDS
 * location ids, store addresses and payouts. So every request needs the crew key: it is
 * hashed to form the storage key, so a wrong key reads an empty slot rather than someone
 * else's data, and it is never stored anywhere in the clear.
 *
 * Concurrency: PUT carries the version the client last saw. If the stored version has moved
 * on, the write is refused with 409 and the current state comes back, so the client can
 * merge rather than clobber.
 */

const MIN_KEY = 8;
const MAX_BODY = 2 * 1024 * 1024;   // a full book with notes is ~200KB; this is generous

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

async function slot(key) {
  const bytes = new TextEncoder().encode('ninja360-runsheet:' + key);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'crew:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (!env.RUNSHEET) {
    return json({ error: 'no-store', detail: 'KV namespace RUNSHEET is not bound to this project yet.' }, 503);
  }

  const key = request.headers.get('x-crew-key') || '';
  if (key.length < MIN_KEY) {
    return json({ error: 'no-key', detail: `Send x-crew-key, at least ${MIN_KEY} characters.` }, 401);
  }
  const id = await slot(key);

  if (request.method === 'GET') {
    const stored = await env.RUNSHEET.get(id, { type: 'json' });
    if (!stored) return json({ v: 0, updatedAt: 0, state: null });
    return json(stored);
  }

  if (request.method === 'PUT') {
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: 'too-big' }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad-json' }, 400);
    }
    if (!body || typeof body.state !== 'object' || body.state === null) {
      return json({ error: 'bad-body', detail: 'Expected {state, base}.' }, 400);
    }

    const current = await env.RUNSHEET.get(id, { type: 'json' });
    const have = current ? current.v : 0;
    const base = Number.isFinite(body.base) ? body.base : 0;
    if (have !== base) {
      // somebody else wrote since this device last read — hand back what is there
      return json({ error: 'stale', v: have, updatedAt: current ? current.updatedAt : 0, state: current ? current.state : null }, 409);
    }

    const next = { v: have + 1, updatedAt: Date.now(), by: String(body.by || '').slice(0, 24), state: body.state };
    await env.RUNSHEET.put(id, JSON.stringify(next));
    return json({ v: next.v, updatedAt: next.updatedAt });
  }

  return json({ error: 'method' }, 405);
}
