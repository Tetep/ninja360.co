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

// Home and what the menu reaches stay open, plus the guest signup and what Home loads.
const OPEN = [
  '/gi/site', '/gi/site/', '/gi/site/?src=chamber',
  '/gi/site/episodes/', '/gi/site/rate-the-topics/',
  '/gi/site/be-on-the-show/', '/gi/site/be-on-the-show/?src=card', '/gi/site/apply', '/gi/site/audition/',
  '/gi/site/promo/', '/gi/site/comingsoon/',
  '/gi/site/assets/gi-site.css', '/gi/site/assets/gi-intro.mp4', '/gi/site/assets/logo-v3b-light.png',
  '/gi/site/assets/business-plan-logo.png', // the Ninja logo on Listen is the door itself
  '/gi/site/episodes/_template/',
];

// Behind the Ninja logo, and the footer pages.
const LOCKED = [
  '/gi/site/business-plan', '/gi/site/business-plan/', '/gi/site/business-plan/content.js',
  '/gi/site/business-plan/youtube-strategy/', '/gi/site/business-plan/youtube-strategy/diagram.html',
  '/gi/site/strategy/', '/gi/site/call/', '/gi/site/dashboard/',
  '/gi/site/assets/docs/', '/gi/site/assets/docs/anything.pdf',
  '/gi/site/about/', '/gi/site/membership/', '/gi/site/contact/', '/gi/site/question-of-the-week/',
  '/gi/site/about', '/gi/site/contact/index.html', '/gi/site/business-plan.html',
  // the same pages, dressed up
  '/gi/site/Business-Plan/', '/gi/site//business-plan/', '/gi/site/%62usiness-plan/',
  '/gi/site/x/../business-plan/', '/gi/site/%2e%2e/site/strategy/', '/gi/site/business-plan%2fx',
  '/gi/site/%E0%A4%A/', // won't decode: stays locked
];

test.describe('GI login: behind the scenes asks for the Dojo login, the public side does not', () => {
  test('open pages need no login', async () => {
    for (const p of OPEN) expect(await status(p), p).toBe(200);
  });

  test('locked pages answer 401 without the login, and open with it', async () => {
    for (const p of LOCKED) expect(await status(p), p).toBe(401);
    for (const p of ['/gi/site/business-plan/', '/gi/site/about/', '/gi/site/assets/docs/x.pdf']) {
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
