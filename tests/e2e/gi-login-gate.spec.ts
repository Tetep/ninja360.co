import { test, expect } from '@playwright/test';
// The Dojo gate is the first handler Pages runs (functions/_middleware.js). Called directly here:
// no browser, no server, just "does this path ask for the login or not".
import { onRequest } from '../../functions/_middleware.js';

const gate = onRequest[0] as (ctx: unknown) => Promise<Response>;
const env = { DOJO_USER: 'ninja', DOJO_PASS: 'test-pass', GI_LOGINS: 'Erik:redcup; Gabriel:bluechair' };
const login = 'Basic ' + btoa('ninja:test-pass');
const as = (user: string, pass: string) => 'Basic ' + btoa(user + ':' + pass);

async function status(path: string, auth?: string, extraEnv: Record<string, string> = {}) {
  const headers = new Headers(auth ? { Authorization: auth } : {});
  const request = new Request('https://dojo.ninja360.co' + path, { headers });
  const res = await gate({ request, env: { ...env, ...extraEnv }, next: async () => new Response('page', { status: 200 }) });
  return res.status;
}

// One visit, with the sheet stubbed: returns the rows the gate sent.
async function rowsFor(path: string, auth: string, headers: Record<string, string> = {}, opts: { url?: string; status?: number } = {}) {
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
    const logEnv = 'url' in opts ? (opts.url ? { GI_LOG_URL: opts.url } : {}) : { GI_LOG_URL: 'https://script.example/exec' };
    await gate({
      request,
      env: { ...env, ...logEnv },
      next: async () => new Response('page', { status: opts.status ?? 200 }),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
  } finally {
    globalThis.fetch = realFetch;
  }
  return sent;
}

// Only the menu's pages are open (Home, Listen, Rate the Topics), plus the promo Home plays in a
// frame and the shared files under /assets/ that those pages load.
const OPEN = [
  '/gi/site', '/gi/site/', '/gi/site/index.html', '/gi/site/?src=chamber',
  '/gi/site/episodes', '/gi/site/episodes/', '/gi/site/rate-the-topics/', '/gi/site/promo/',
  '/gi/site/assets/gi-site.css', '/gi/site/assets/gi-theme.js', '/gi/site/assets/gi-intro.mp4',
  '/gi/site/assets/logo-v3b-light.png', '/gi/site/assets/topics/poster.jpg',
  '/gi/site/assets/business-plan-logo.png', // the Ninja logo on Listen is the door itself
];

// Everything not on the menu.
const LOCKED = [
  '/gi/site/business-plan', '/gi/site/business-plan/', '/gi/site/business-plan/content.js',
  '/gi/site/business-plan/youtube-strategy/', '/gi/site/business-plan/youtube-strategy/diagram.html',
  '/gi/site/strategy/', '/gi/site/call/', '/gi/site/dashboard/',
  '/gi/site/assets/docs/', '/gi/site/assets/docs/anything.pdf', '/gi/site/assets/DOCS/anything.pdf', '/gi/site/assets/',
  // the footer pages
  '/gi/site/about/', '/gi/site/membership/', '/gi/site/contact/', '/gi/site/question-of-the-week/',
  '/gi/site/about', '/gi/site/contact/index.html',
  // not on the menu either
  '/gi/site/be-on-the-show/', '/gi/site/be-on-the-show/?src=card', '/gi/site/apply', '/gi/site/audition/',
  '/gi/site/comingsoon/', '/gi/site/episodes/_template/', '/gi/site/a-page-added-later/',
  // locked pages, dressed up
  '/gi/site/Business-Plan/', '/gi/site//business-plan/', '/gi/site/%62usiness-plan/', '/gi/site/business-plan.html',
  '/gi/site/promo/../call/', '/gi/site/%2e%2e/site/strategy/', '/gi/site/assets/%2e%2e/call/',
  '/gi/site/episodes%2f..%2fcall/', '/gi/site/assets/%2E./docs/x.pdf',
  '/gi/site/%E0%A4%A/', // won't decode: stays locked
];

test.describe('GI login: only the menu pages are open, everything else asks for the Dojo login', () => {
  test('open pages need no login', async () => {
    for (const p of OPEN) expect(await status(p), p).toBe(200);
  });

  test('locked pages answer 401 without the login, and open with it', async () => {
    for (const p of LOCKED) expect(await status(p), p).toBe(401);
    for (const p of ['/gi/site/business-plan/', '/gi/site/about/', '/gi/site/be-on-the-show/', '/gi/site/assets/docs/x.pdf']) {
      expect(await status(p, login), p).toBe(200);
    }
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

test.describe('GI named logins: first name + a word per person, GI pages only', () => {
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

  test('no GI_LOGINS set: only the Dojo login works', async () => {
    expect(await status('/gi/site/call/', as('Erik', 'redcup'), { GI_LOGINS: '' })).toBe(401);
    expect(await status('/gi/site/call/', login, { GI_LOGINS: '' })).toBe(200);
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
