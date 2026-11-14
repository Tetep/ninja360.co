import { test, expect } from '@playwright/test';
// The Dojo gate is the first handler Pages runs (functions/_middleware.js). Called directly here:
// no browser, no server, just "does this path ask for the login or not".
import { onRequest } from '../../functions/_middleware.js';

const gate = onRequest[0] as (ctx: unknown) => Promise<Response>;
const env = { DOJO_USER: 'ninja', DOJO_PASS: 'test-pass' };
const login = 'Basic ' + btoa('ninja:test-pass');

async function status(path: string, auth?: string) {
  const headers = new Headers(auth ? { Authorization: auth } : {});
  const request = new Request('https://dojo.ninja360.co' + path, { headers });
  const res = await gate({ request, env, next: async () => new Response('page', { status: 200 }) });
  return res.status;
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
