import { test, expect } from '@playwright/test';
// The Dojo gate is the first handler Pages runs (functions/_middleware.js). Called directly here:
// no browser, no server, just "does this path ask for the login or not".
import { onRequest } from '../../functions/_middleware.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const gate = onRequest[0] as (ctx: unknown) => Promise<Response>;
// GI_PARTNER_LOGINS 'on' here so the named-login machinery stays tested; the lockdown tests below
// run with it unset, which is how the live site runs (Tim, 11/20/26).
const env = { DOJO_USER: 'ninja', DOJO_PASS: 'test-pass', GI_LOGINS: 'Erik:redcup; Gabriel:bluechair', GI_PARTNER_LOGINS: 'on' };
const login = 'Basic ' + btoa('ninja:test-pass');
const as = (user: string, pass: string) => 'Basic ' + btoa(user + ':' + pass);

// The basic GI pages are open only until midnight Central, Nov 20/21 (Tim, 11/20/26). The gate
// reads the clock, so these tests pin it: BEFORE unless a test says otherwise.
const CUTOFF = Date.parse('2026-11-21T06:00:00Z'); // 12:00 AM Central, Sat Nov 21
const BEFORE = Date.parse('2026-11-20T20:00:00Z'); // 2 PM Central, Fri Nov 20
async function at<T>(clock: number, fn: () => Promise<T>): Promise<T> {
  const realNow = Date.now;
  Date.now = () => clock;
  try { return await fn(); } finally { Date.now = realNow; }
}

async function status(path: string, auth?: string, extraEnv: Record<string, string> = {}, clock = BEFORE, host = 'dojo.ninja360.co') {
  const headers = new Headers(auth ? { Authorization: auth } : {});
  const request = new Request('https://' + host + path, { headers });
  const res = await at(clock, () => gate({ request, env: { ...env, ...extraEnv }, next: async () => new Response('page', { status: 200 }) }));
  return res.status;
}

// One visit, with the sheet stubbed: returns the rows the gate sent.
async function rowsFor(path: string, auth: string, headers: Record<string, string> = {}, opts: { url?: string; status?: number; cf?: Record<string, string>; env?: Record<string, string> } = {}) {
  const sent: any[] = [];
  const waits: Promise<unknown>[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (target: string, init: RequestInit) => {
    sent.push({ target, row: JSON.parse(String(init.body)) });
    return new Response('ok');
  }) as typeof fetch;
  try {
    const request = new Request('https://dojo.ninja360.co' + path, {
      headers: { Authorization: auth, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ...headers },
    });
    if (opts.cf) Object.defineProperty(request, 'cf', { value: opts.cf });
    const logEnv = 'url' in opts ? (opts.url ? { GI_LOG_URL: opts.url } : {}) : { GI_LOG_URL: 'https://script.example/exec' };
    await at(BEFORE, () => gate({
      request,
      env: { ...env, ...logEnv, ...(opts.env || {}) },
      next: async () => new Response('page', { status: opts.status ?? 200 }),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    }));
    await Promise.all(waits);
  } finally {
    globalThis.fetch = realFetch;
  }
  return sent;
}

// Until the cutoff: the basic pages are open (Home, Listen, the footer pages, Be on the Show and
// Coming Soon), plus the promo Home plays in a frame and the shared files under /assets/.
const OPEN = [
  '/gi/site', '/gi/site/', '/gi/site/index.html', '/gi/site/?src=chamber',
  '/gi/site/episodes', '/gi/site/episodes/', '/gi/site/promo/',
  '/gi/site/about/', '/gi/site/about', '/gi/site/membership/', '/gi/site/contact/', '/gi/site/contact/index.html',
  '/gi/site/question-of-the-week/', '/gi/site/be-on-the-show/', '/gi/site/be-on-the-show/?src=card',
  '/gi/site/apply', '/gi/site/audition/', '/gi/site/comingsoon/',
  '/gi/site/assets/gi-site.css', '/gi/site/assets/gi-theme.js', '/gi/site/assets/gi-intro.mp4',
  '/gi/site/assets/logo-v3b-light.png', '/gi/site/assets/topics/poster.jpg',
  '/gi/site/assets/business-plan-logo.png', // the Ninja logo on Listen is the door itself
  '/gi/site/assets/og-logo-white.png', // the link preview a text message fetches, with no login
];

// The Business Plan side, and anything not a basic page.
const LOCKED = [
  '/gi/site/business-plan', '/gi/site/business-plan/', '/gi/site/business-plan/content.js',
  '/gi/site/business-plan/youtube-strategy/', '/gi/site/business-plan/youtube-strategy/diagram.html',
  '/gi/site/strategy/', '/gi/site/call/', '/gi/site/dashboard/',
  '/gi/site/rate-the-topics/', '/gi/site/rate-the-topics', '/gi/site/rate-the-topics/index.html', // locked 11/20/26
  '/gi/site/assets/docs/', '/gi/site/assets/docs/anything.pdf', '/gi/site/assets/DOCS/anything.pdf', '/gi/site/assets/',
  '/gi/site/episodes/_template/', '/gi/site/a-page-added-later/',
  // locked pages, dressed up
  '/gi/site/Business-Plan/', '/gi/site//business-plan/', '/gi/site/%62usiness-plan/', '/gi/site/business-plan.html',
  '/gi/site/promo/../call/', '/gi/site/%2e%2e/site/strategy/', '/gi/site/assets/%2e%2e/call/',
  '/gi/site/episodes%2f..%2fcall/', '/gi/site/assets/%2E./docs/x.pdf',
  '/gi/site/%E0%A4%A/', // won't decode: stays locked
];

test.describe('GI login (before midnight): the basic pages are open, the Business Plan side asks for the Dojo login', () => {
  test('open pages need no login', async () => {
    for (const p of OPEN) expect(await status(p), p).toBe(200);
  });

  test('locked pages answer 401 without the login, and open with it', async () => {
    for (const p of LOCKED) expect(await status(p), p).toBe(401);
    for (const p of ['/gi/site/business-plan/', '/gi/site/about/', '/gi/site/be-on-the-show/', '/gi/site/assets/docs/x.pdf']) {
      expect(await status(p, login), p).toBe(200);
    }
  });

  test("Tim's rule: nothing on an open page asks for a login except the Ninja 360 button on Listen", async () => {
    const asked: string[] = [];
    for (const [route, file] of [
      ['/gi/site/', ''], ['/gi/site/episodes/', 'episodes'], ['/gi/site/about/', 'about'], ['/gi/site/contact/', 'contact'],
      ['/gi/site/membership/', 'membership'], ['/gi/site/question-of-the-week/', 'question-of-the-week'],
      ['/gi/site/be-on-the-show/', 'be-on-the-show'], ['/gi/site/comingsoon/', 'comingsoon'],
    ]) {
      const html = await readFile(path.join(process.cwd(), 'dist/gi/site', file, 'index.html'), 'utf8');
      for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)/g)) {
        const url = new URL(href, 'https://dojo.ninja360.co' + route);
        if (url.host !== 'dojo.ninja360.co') continue; // the form, YouTube, mailto
        if ((await status(url.pathname)) === 401) asked.push(`${route} -> ${url.pathname}`);
      }
    }
    expect(asked).toEqual(['/gi/site/episodes/ -> /gi/site/business-plan/']);
  });

  test('a wrong password does not open a locked page', async () => {
    expect(await status('/gi/site/call/', 'Basic ' + btoa('ninja:wrong'))).toBe(401);
  });

  test('the rest of the Dojo is still locked', async () => {
    expect(await status('/')).toBe(401);
    expect(await status('/scrolls/')).toBe(401);
    expect(await status('/gi/')).toBe(401);
    expect(await status('/gi/site-x/')).toBe(401);
  });
});

test.describe('midnight (Tim, 11/20/26): "Turn the whole thing off after that"', () => {
  test('the cutoff is 12:00 AM Central, Saturday Nov 21', async () => {
    const src = await readFile(path.join(process.cwd(), 'functions/_middleware.js'), 'utf8');
    expect(src).toContain("const GI_OPEN_UNTIL = Date.parse('2026-11-21T06:00:00Z');");
    expect(new Date(CUTOFF).toLocaleString('en-US', { timeZone: 'America/Chicago' })).toBe('11/21/2026, 12:00:00 AM');
  });

  test('one second before midnight the basic pages are open; at midnight every GI page asks for the login', async () => {
    for (const p of OPEN) {
      expect(await status(p, undefined, {}, CUTOFF - 1000), p).toBe(200);
      expect(await status(p, undefined, {}, CUTOFF), p).toBe(401);
      expect(await status(p, undefined, {}, CUTOFF + 86_400_000), p).toBe(401);
    }
  });

  test('after midnight the Dojo login still opens everything, Erik and Gabe still nothing', async () => {
    const later = CUTOFF + 3_600_000;
    for (const p of [...OPEN, '/gi/site/business-plan/', '/gi/site/rate-the-topics/']) {
      expect(await status(p, login, { GI_PARTNER_LOGINS: '' }, later), p).toBe(200);
      expect(await status(p, as('Erik', 'Juergensen'), { GI_PARTNER_LOGINS: '' }, later), p).toBe(401);
      expect(await status(p, as('Gabe', 'Miller'), { GI_PARTNER_LOGINS: '' }, later), p).toBe(401);
    }
  });

  test("the crew's run sheet on ninja360.org is not part of it: still open after midnight", async () => {
    expect(await status('/', undefined, {}, CUTOFF + 3_600_000, 'ninja360.org')).toBe(200);
  });
});

test.describe('lockdown (Tim, 11/20/26): only the Dojo login opens a private page', () => {
  const off = { GI_PARTNER_LOGINS: '' };
  const partners = [
    as('Erik', 'Juergensen'), as('erik', 'juergensen'), as('Gabe', 'Miller'), as('Gabriel', 'Miller'),
    as('Erik', 'redcup'), as('Gabriel', 'bluechair'), // GI_LOGINS entries
  ];
  const privatePages = [
    '/gi/site/business-plan/', '/gi/site/business-plan/youtube-strategy/', '/gi/site/business-plan/man-on-the-street/',
    '/gi/site/call/', '/gi/site/strategy/', '/gi/site/rate-the-topics/', '/gi/site/assets/docs/GI-YouTube-Strategy.pdf',
  ];

  test('Erik and Gabe are refused everywhere, with every word they had', async () => {
    for (const p of privatePages) for (const a of partners) expect(await status(p, a, off), p).toBe(401);
  });

  test('anything but GI_PARTNER_LOGINS="on" keeps them out', async () => {
    for (const v of ['', 'off', 'yes', 'true', '1', 'ON please']) {
      expect(await status('/gi/site/business-plan/', as('Erik', 'Juergensen'), { GI_PARTNER_LOGINS: v }), v).toBe(401);
    }
  });

  test('the Dojo login still opens every private page, and the open pages still need nothing', async () => {
    for (const p of privatePages) expect(await status(p, login, off), p).toBe(200);
    for (const p of ['/gi/site/', '/gi/site/episodes/', '/gi/site/promo/', '/gi/site/assets/og-logo-white.png']) {
      expect(await status(p, undefined, off), p).toBe(200);
    }
  });

  test('a refused partner adds no row to the sheet', async () => {
    const sent = await rowsFor('/gi/site/business-plan/', as('Erik', 'Juergensen'), { 'Sec-Fetch-Dest': 'document' }, { env: off });
    expect(sent).toHaveLength(0);
  });
});

test.describe('GI named logins (only with GI_PARTNER_LOGINS "on"): first name + a word per person, GI pages only', () => {
  test('each person gets in with their own first name and word, any capitals, stray spaces', async () => {
    for (const a of [as('Erik', 'redcup'), as('erik', 'RedCup'), as(' Erik ', 'redcup '), as('Gabriel', 'bluechair')]) {
      expect(await status('/gi/site/business-plan/', a)).toBe(200);
      expect(await status('/gi/site/assets/docs/GI-YouTube-Strategy.pdf', a)).toBe(200);
    }
  });

  test('wrong word, someone else\'s word, or a nickname does not get in', async () => {
    for (const a of [as('Erik', 'bluechair'), as('Gabe', 'bluechair'), as('Erik', ''), as('', 'redcup'), as('Erik:redcup', 'x')]) {
      expect(await status('/gi/site/business-plan/', a)).toBe(401);
    }
  });

  test('a named login opens the GI site only, never the rest of the Dojo', async () => {
    const erik = as('Erik', 'redcup');
    for (const p of ['/', '/scrolls/', '/gi/', '/money', '/gi/site-x/', '/gi/site/%E0%A4%A/']) expect(await status(p, erik), p).toBe(401);
  });

  test('no GI_LOGINS set: the Dojo login and the built-in partner logins still work, a GI_LOGINS word does not', async () => {
    expect(await status('/gi/site/call/', as('Erik', 'redcup'), { GI_LOGINS: '' })).toBe(401);
    expect(await status('/gi/site/call/', login, { GI_LOGINS: '' })).toBe(200);
    expect(await status('/gi/site/call/', as('Erik', 'Juergensen'), { GI_LOGINS: '' })).toBe(200);
  });

  test('partner logins: Erik / Juergensen and Gabe (or Gabriel) / Miller, any capitals, stray spaces', async () => {
    for (const a of [as('Erik', 'Juergensen'), as('erik', 'JUERGENSEN'), as(' Erik', 'juergensen '), as('Gabe', 'Miller'), as('gabe', 'miller'), as('Gabriel', 'Miller')]) {
      expect(await status('/gi/site/business-plan/', a, { GI_LOGINS: '' })).toBe(200);
      expect(await status('/gi/site/business-plan/man-on-the-street/', a, { GI_LOGINS: '' })).toBe(200);
    }
    for (const a of [as('Erik', 'Miller'), as('Gabe', 'Juergensen'), as('Erik', 'Jurgensen'), as('Gabe', ''), as('', 'Miller'), as('Erik Juergensen', ''), as('Tim', 'Petet')]) {
      expect(await status('/gi/site/business-plan/', a, { GI_LOGINS: '' })).toBe(401);
    }
    for (const p of ['/', '/scrolls/', '/gi/', '/money']) expect(await status(p, as('Gabe', 'Miller'), { GI_LOGINS: '' }), p).toBe(401);
  });

  test('the partner words are not written anywhere in the gate', async () => {
    const src = await readFile(path.join(process.cwd(), 'functions/_middleware.js'), 'utf8');
    expect(src.toLowerCase()).not.toContain('juergensen');
    expect(src.toLowerCase()).not.toMatch(/['"`]miller['"`]/);
  });
});

test.describe('the sheet: one row per page a named login opens', () => {
  test('opening a page sends when, who, page and device', async () => {
    const sent = await rowsFor('/gi/site/business-plan/', as('erik', 'redcup'), { 'Sec-Fetch-Dest': 'document' });
    expect(sent).toHaveLength(1);
    expect(sent[0].target).toBe('https://script.example/exec');
    expect(sent[0].row).toMatchObject({ who: 'Erik', page: 'Business Plan', device: 'iPhone' });
    expect(Date.now() - Date.parse(sent[0].row.when)).toBeLessThan(60_000);
  });

  test('opening a deck counts; the deck preview framed inside The Plan does not', async () => {
    const pdf = '/gi/site/assets/docs/GI-Man-on-the-Street-Strategy.pdf';
    const opened = await rowsFor(pdf, as('Gabriel', 'bluechair'), { 'Sec-Fetch-Dest': 'document' });
    expect(opened.map((x) => x.row.page)).toEqual(['Deck: Man on the Street (PDF)']);
    expect(await rowsFor(pdf, as('Gabriel', 'bluechair'), { 'Sec-Fetch-Dest': 'iframe' })).toHaveLength(0);
    expect(await rowsFor('/gi/site/business-plan/youtube-strategy/diagram.html', as('Erik', 'redcup'), { 'Sec-Fetch-Dest': 'iframe' })).toHaveLength(0);
  });

  test('files, prefetches, redirects and refused logins add no rows', async () => {
    const erik = as('Erik', 'redcup');
    expect(await rowsFor('/gi/site/business-plan/content.js', erik, { 'Sec-Fetch-Dest': 'script' })).toHaveLength(0);
    expect(await rowsFor('/gi/site/business-plan/content.js', erik)).toHaveLength(0);
    expect(await rowsFor('/gi/site/call/', erik, { 'Sec-Purpose': 'prefetch' })).toHaveLength(0);
    expect(await rowsFor('/gi/site/call', erik, {}, { status: 308 })).toHaveLength(0);
    expect(await rowsFor('/gi/site/call/', as('Erik', 'nope'))).toHaveLength(0);
  });

  test('the Dojo login (Tim, the daily smoke test) is never logged; no sheet URL, no rows', async () => {
    expect(await rowsFor('/gi/site/business-plan/', login, { 'Sec-Fetch-Dest': 'document' })).toHaveLength(0);
    expect(await rowsFor('/gi/site/business-plan/', as('Erik', 'redcup'), {}, { url: '' })).toHaveLength(0);
  });

  test('a partner login is logged by name, with the IP and the city, region and country', async () => {
    const sent = await rowsFor('/gi/site/strategy/', as('gabe', 'miller'), { 'Sec-Fetch-Dest': 'document', 'CF-Connecting-IP': '203.0.113.7' }, { cf: { city: 'Gladstone', region: 'Missouri', country: 'US' }, env: { GI_LOGINS: '' } });
    expect(sent).toHaveLength(1);
    expect(sent[0].row).toMatchObject({ who: 'Gabe', page: 'The Plan (decks page)', ip: '203.0.113.7', location: 'Gladstone, Missouri, US' });
    const erik = await rowsFor('/gi/site/business-plan/', as('Erik', 'Juergensen'), {}, { env: { GI_LOGINS: '' } });
    expect(erik[0].row).toMatchObject({ who: 'Erik', ip: '', location: '' });
  });

  test('a page with no friendly name still shows its address', async () => {
    const sent = await rowsFor('/gi/site/a-page-added-later/', as('Erik', 'redcup'));
    expect(sent[0].row.page).toBe('/gi/site/a-page-added-later/');
  });

  test('a sheet that is down never breaks the page', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('sheet down'); }) as typeof fetch;
    try {
      const request = new Request('https://dojo.ninja360.co/gi/site/call/', { headers: { Authorization: as('Erik', 'redcup') } });
      const res = await gate({ request, env: { ...env, GI_LOG_URL: 'https://script.example/exec' }, next: async () => new Response('page'), waitUntil: () => {} });
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
