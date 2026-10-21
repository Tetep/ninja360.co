// One Cloudflare Pages project, two jobs, one file: Pages reads a single functions/_middleware.js,
// so both live here and run in order (see the onRequest list at the bottom) —
//   1. the Dojo password gate, then
//   2. the ninja360.org host router that serves the run sheet.

// ───────────────────────────── 1. THE DOJO GATE ─────────────────────────────
// HTTP Basic Auth for the private Dojo. Credentials live in Pages env vars DOJO_USER / DOJO_PASS
// (set both for Production and Preview). Nothing secret in this file.
//
// Everything this project serves is behind the password EXCEPT two things that are public on purpose:
//   - ninja360.org (and www): the crew's run sheet, used in the field, behind its own crew key (/api/state)
//   - /gi/site/...: the public Generationally Incorrect site — the audition form, and the campaign
//     links (?src=northland, chamber, aca, realtor, social, card) all land there
// To open another path later, add it to OPEN_PATH. To drop the gate, take dojoGate out of the
// onRequest list at the bottom of this file; nothing else to undo.

const OPEN_HOST = /(^|\.)ninja360\.org$/i;
const OPEN_PATH = /^\/gi\/site(\/|$)/;
const ENCODED_SEPARATOR = /%2f|%5c/i;   // an encoded slash never gets to talk its way into an open path

const unauthorized = () =>
  new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Ninja 360 Dojo", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

// Constant-time string compare so a wrong guess doesn't leak length/timing.
const safeEqual = (a, b) => {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
};

async function dojoGate({ request, env, next }) {
  const url = new URL(request.url);
  if (OPEN_HOST.test(url.hostname)) return next();
  if (OPEN_PATH.test(url.pathname) && !ENCODED_SEPARATOR.test(url.pathname)) return next();

  const user = env.DOJO_USER;
  const pass = env.DOJO_PASS;

  // Fail closed: if the secrets aren't configured, nobody gets in.
  if (!user || !pass) return unauthorized();

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded = '';
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const idx = decoded.indexOf(':');
  if (idx < 0) return unauthorized();

  const givenUser = decoded.slice(0, idx);
  const givenPass = decoded.slice(idx + 1);

  if (!safeEqual(givenUser, user) || !safeEqual(givenPass, pass)) return unauthorized();

  const response = await next();
  // Belt and braces: keep the Dojo out of search even when authenticated.
  const out = new Response(response.body, response);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

// ─────────────────────── 2. THE RUN-SHEET HOST (ninja360.org) ───────────────────────
// ninja360.org serves the run sheet.
//
// Same Cloudflare Pages project, same build — only the hostname differs. Attach
// ninja360.org (and www) as custom domains on the ninja360-co project and this
// middleware answers them with /verizon.html, so there is one source of truth
// and no second repo to keep in sync. ninja360.co and dojo.ninja360.co are
// not touched by this router: the host check fails and the request falls through
// to static (they are the gated Dojo — see section 1).

const TRACKER_HOST = /(^|\.)ninja360\.org$/i;
const TRACKER_PATH = /^\/(map|runsheet|verizon)?\/?$/i;
// What the run sheet loads for itself. /api/ is the crew sync and /share/ is the footer
// badge's stylesheet and script — redirect either of those to the page and the run sheet
// renders with a raw 256px image and no styles at all.
const PASS_THROUGH = /^\/(assets\/|share\/|api\/|favicon\.svg$)/;

async function trackerHost({ request, next, env }) {
  const url = new URL(request.url);
  if (!TRACKER_HOST.test(url.hostname)) return next();

  if (TRACKER_PATH.test(url.pathname)) {
    const asset = new URL('/verizon', url);
    const res = await env.ASSETS.fetch(new Request(asset, { headers: request.headers }));
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  }

  if (PASS_THROUGH.test(url.pathname)) return next();

  return Response.redirect(new URL('/', url).toString(), 302);
}

// Pages runs these in order: the gate first, then the host router.
export const onRequest = [dojoGate, trackerHost];
