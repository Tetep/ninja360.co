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
//   - the Generationally Incorrect pages on the site's menu (below)
// To drop the gate, take dojoGate out of the onRequest list at the bottom of this file; nothing
// else to undo.
//
// GI (Tim, 11/14/26): "I don't want them to be able to access any page that is not on the menu."
// So the GI site is an allow-list. Open with no login:
//   - the menu's pages: Home and Listen (/episodes/). The menu's other two items are not pages
//     here: Be on the Show is the Google Form, Contact is an email link. Rate the Topics is locked
//     and off the menu (Tim, 11/20/26).
//   - the promo, because Home plays it in a frame
//   - /gi/site/assets/: the shared styles, scripts, images and video those pages load, except
//     /assets/docs/ (the PDF decks)
// Every other GI page asks for a login: the Business Plan (the Ninja logo on Listen) and all
// under it, The Plan and its decks, the Partner Call, the Dashboard, the footer pages (About,
// Membership, Contact & Sponsors, the Weekly opt-in), Be on the Show (and /apply, /audition),
// Coming Soon, and any page added later. The footer links stay; they ask for the login. To make a
// page public, add it to GI_PUBLIC_PAGE.
//
// Who can sign in to those GI pages:
//   - the Dojo login (DOJO_USER / DOJO_PASS), which opens everything, GI included. Since the
//     lockdown (Tim, 11/20/26) this is the ONLY login: the partner and named logins below are off.
//     They come back only if the Pages env var GI_PARTNER_LOGINS is set to "on".
//   - a partner login (Tim, 11/19/26): Erik and Gabe each sign in with their first name and the
//     word Tim gave them. Built in below as PARTNER_LOGINS, so it works with no Cloudflare setup.
//     Only SHA-256 fingerprints of "name:word" live in this file (the repo is public), never the
//     words themselves. "Gabriel" works as well as "Gabe".
//   - any extra named login from the Pages secret GI_LOGINS: one person per line (or ';'), written
//     FirstName:password. Optional.
//   A partner or named login opens the GI site only (/gi/site/...), never the rest of the Dojo.
//   Name and password are matched ignoring case and stray spaces, so a phone's automatic capital
//   letter can't lock anyone out.
//
// The sheet (Tim, 11/14/26): with GI_LOG_URL set (the web-app URL of Tim's private Google Sheet,
// "GI — Who Looked"), every GI page a partner or named login opens adds a row there: when, who,
// which page, what device, the IP address, and the city / region / country Cloudflare places it in. Pages opened in a frame inside another page (the deck previews on The Plan, the
// diagram in YouTube Strategy) are not counted, so a row means that person opened it. The Dojo
// login is not logged (Tim's own visits, and the daily smoke test). The URL is used here on the
// server only and never reaches a browser; a slow or broken sheet never delays or blocks a page.

const OPEN_HOST = /(^|\.)ninja360\.org$/i;
const GI_PUBLIC_PAGE = /^\/gi\/site(\/(episodes|promo))?(\/(index\.html)?)?$/i;
const GI_PUBLIC_FILE = /^\/gi\/site\/assets\/(?!docs(\/|$))[^/]/i;
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$)/;
const ENCODED_SEPARATOR = /%2f|%5c/i;   // an encoded slash never gets to talk its way into an open path

// The path as the static server will read it: percent-escapes decoded, doubled slashes folded, so
// %62usiness-plan or //business-plan can't slip a locked page out through the open door. null (and
// so never open, and never inside the GI area for a named login) when it won't decode, carries an
// encoded slash, or still has a dot segment.
function servedPath(pathname) {
  if (ENCODED_SEPARATOR.test(pathname)) return null;
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  path = path.replace(/\/{2,}/g, '/');
  return DOT_SEGMENT.test(path) ? null : path;
}

const isOpenPath = (path) => path !== null && (GI_PUBLIC_PAGE.test(path) || GI_PUBLIC_FILE.test(path));
const GI_AREA = /^\/gi\/site(\/|$)/i;

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

// The name and password from a Basic login header, or null.
function basicLogin(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return null;
  let decoded = '';
  try {
    decoded = atob(header.slice(6));
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

// The partners' logins: SHA-256 of "name:word", both lowercase. The sheet logs the name shown.
const PARTNER_LOGINS = [
  { name: 'Erik', sha256: '7e489788b58017be510a669fe7d86797a895460b107850fb99e986f1b61a6a4c' },
  { name: 'Gabe', sha256: '729ce47d2ea5044548d2c7bf0adadf01a73eab79d9921c84fd21e481e1d6d104' },
  { name: 'Gabe', sha256: '0c0b18e065d65358c331e1d5f5a6b005988ae03687f17a539c0df47c01e8cbdc' }, // "Gabriel"
];

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Who a partner or named GI login belongs to, or null.
async function giPerson(list, user, pass) {
  const u = user.trim().toLowerCase();
  const p = pass.trim().toLowerCase();
  if (!u || !p) return null;
  let who = null;
  for (const entry of String(list || '').split(/[;\n]/)) {
    const idx = entry.indexOf(':');
    if (idx < 0) continue;
    const name = entry.slice(0, idx).trim();
    const word = entry.slice(idx + 1).trim();
    if (!name || !word) continue;
    if (safeEqual(u, name.toLowerCase()) && safeEqual(p, word.toLowerCase())) who = name;
  }
  if (who) return who;
  const print = await sha256Hex(`${u}:${p}`);
  for (const login of PARTNER_LOGINS) if (safeEqual(print, login.sha256)) who = login.name;
  return who;
}

// ── The sheet ──
const PAGE_NAMES = [
  [/^\/gi\/site\/business-plan\/youtube-strategy\/diagram\.html$/i, 'YouTube Strategy (diagram on its own)'],
  [/^\/gi\/site\/business-plan\/youtube-strategy\/?(index\.html)?$/i, 'YouTube Strategy'],
  [/^\/gi\/site\/business-plan\/man-on-the-street\/?(index\.html)?$/i, 'Man on the Street'],
  [/^\/gi\/site\/business-plan\/?(index\.html)?$/i, 'Business Plan'],
  [/^\/gi\/site\/strategy\/?(index\.html)?$/i, 'The Plan (decks page)'],
  [/^\/gi\/site\/assets\/docs\/GI-YouTube-Strategy\.pdf$/i, 'Deck: YouTube Strategy (PDF)'],
  [/^\/gi\/site\/assets\/docs\/GI-Man-on-the-Street-Strategy\.pdf$/i, 'Deck: Man on the Street (PDF)'],
  [/^\/gi\/site\/call\/?(index\.html)?$/i, 'Partner Call'],
  [/^\/gi\/site\/dashboard\/?(index\.html)?$/i, 'Dashboard'],
  [/^\/gi\/site\/about\/?(index\.html)?$/i, 'About'],
  [/^\/gi\/site\/membership\/?(index\.html)?$/i, 'Membership'],
  [/^\/gi\/site\/contact\/?(index\.html)?$/i, 'Contact & Sponsors'],
  [/^\/gi\/site\/question-of-the-week\/?(index\.html)?$/i, 'Weekly opt-in'],
  [/^\/gi\/site\/be-on-the-show\/?(index\.html)?$/i, 'Be on the Show'],
  [/^\/gi\/site\/comingsoon\/?(index\.html)?$/i, 'Coming Soon'],
];
const pageName = (path) => (PAGE_NAMES.find(([re]) => re.test(path)) || [null, path])[1];

function deviceName(ua) {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Linux/i.test(ua)) return 'Linux PC';
  return 'Other';
}

// A page the person opened: a GET that loaded (or came from cache) as the page itself, not a frame
// inside another page, a prefetch, a style or script, or a redirect on the way to the page.
function isPageView(request, path, response) {
  if (request.method !== 'GET') return false;
  const dest = request.headers.get('Sec-Fetch-Dest');
  if (dest && dest !== 'document') return false;
  if (/prefetch|prerender/i.test(request.headers.get('Sec-Purpose') || request.headers.get('Purpose') || '')) return false;
  if (response.status !== 200 && response.status !== 304) return false;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last === '' || !last.includes('.') || /\.(html|pdf)$/i.test(last);
}

function logView(ctx, who, path) {
  const target = ctx.env.GI_LOG_URL;
  if (!target) return;
  const cf = ctx.request.cf || {};
  const row = {
    when: new Date().toISOString(),
    who,
    page: pageName(path),
    device: deviceName(ctx.request.headers.get('User-Agent') || ''),
    ip: ctx.request.headers.get('CF-Connecting-IP') || '',
    location: [cf.city, cf.region, cf.country].filter(Boolean).join(', '),
  };
  const sent = fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  }).catch(() => {});
  if (typeof ctx.waitUntil === 'function') ctx.waitUntil(sent);
}

async function dojoGate(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  if (OPEN_HOST.test(url.hostname)) return next();
  const path = servedPath(url.pathname);
  if (isOpenPath(path)) return next();

  const login = basicLogin(request);
  if (!login) return unauthorized();

  // The Dojo login opens everything. Fail closed: if its secrets aren't configured, it opens nothing.
  const dojo =
    !!env.DOJO_USER && !!env.DOJO_PASS && safeEqual(login.user, env.DOJO_USER) && safeEqual(login.pass, env.DOJO_PASS);
  // A named GI login opens the GI site and nothing else, and only while GI_PARTNER_LOGINS is "on".
  // Lockdown (Tim, 11/20/26): it isn't set, so only the Dojo login gets in.
  const partnersOn = String(env.GI_PARTNER_LOGINS || '').trim().toLowerCase() === 'on';
  const person =
    partnersOn && !dojo && path !== null && GI_AREA.test(path) ? await giPerson(env.GI_LOGINS, login.user, login.pass) : null;
  if (!dojo && !person) return unauthorized();

  const response = await next();
  if (person && isPageView(request, path, response)) logView(ctx, person, path);
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

// Link previews: whose run sheet this link is for. The link Tim texts Cody ends in ?who=cody, the one he saves for
// himself in ?who=tim. A text message or a home-screen shortcut reads the page head without running the page, so the
// head is rewritten here: that person's badge is the preview image and the icon. The crew key rides after the # and
// never reaches this code. Any other ?who= is ignored and the page goes out as it is.
const PERSON = {
  tim: { name: 'Tim', title: 'Tim’s run sheet', badge: 'Tim Petet’s badge', home: 'Tim Runs' },
  cody: { name: 'Cody', title: 'Cody’s run sheet', badge: 'Cody Petet’s badge', home: 'Cody Runs' },
};

function personalize(res, url) {
  const who = (url.searchParams.get('who') || '').toLowerCase();
  const p = Object.hasOwn(PERSON, who) ? PERSON[who] : null;
  if (!p || res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  const icon = (file) => `/assets/crew/icons/${who}-${file}`;
  const head = [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Ninja 360 Run Sheet">',
    `<meta property="og:title" content="${p.title}">`,
    '<meta property="og:description" content="Your plan, your stops, your route. Open it on your phone.">',
    `<meta property="og:image" content="https://${url.host}${icon('og.jpg')}">`,
    '<meta property="og:image:type" content="image/jpeg">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${p.badge}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="apple-mobile-web-app-title" content="${p.home}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${icon('180.png')}">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${icon('192.png')}">`,
  ].join('');
  return new HTMLRewriter().on('head', { element: (el) => el.append(head, { html: true }) }).transform(res);
}

async function trackerHost({ request, next, env }) {
  const url = new URL(request.url);
  if (!TRACKER_HOST.test(url.hostname)) return next();

  if (TRACKER_PATH.test(url.pathname)) {
    const asset = new URL('/verizon', url);
    const res = await env.ASSETS.fetch(new Request(asset, { headers: request.headers }));
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'no-store');
    return personalize(new Response(res.body, { status: res.status, headers }), url);
  }

  if (PASS_THROUGH.test(url.pathname)) return next();

  return Response.redirect(new URL('/', url).toString(), 302);
}

// Pages runs these in order: the gate first, then the host router.
export const onRequest = [dojoGate, trackerHost];
