import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// These pages are served with a trailing slash in production (Cloudflare Pages)
// and their relative asset paths ("../assets/gi-theme.js") assume it. astro
// preview 404s that URL, and without the slash the assets resolve one level
// too high and never load. So: request the real trailing-slash URL and answer
// it with the built file, exactly as production would.
async function open(page: Page, route: string, query = '') {
  const url = route + '/';
  const file = path.join(process.cwd(), 'dist', route, 'index.html');
  await page.route((u) => u.pathname === url, async (r) => {
    await r.fulfill({ status: 200, contentType: 'text/html', body: await readFile(file, 'utf8') });
  });
  await page.goto(url + query, { waitUntil: 'load' });
}

const pages = ['/gi/site', '/gi/site/about', '/gi/site/contact'];

const BG = {
  a: 'rgb(17, 19, 24)', // #111318
  b: 'rgb(11, 11, 11)', // #0B0B0B
  c: 'rgb(217, 207, 186)', // #D9CFBA
};

test.describe('GI color-scheme selector', () => {
  for (const route of pages) {
    test(`${route}: defaults to B, has three 44px buttons, switches without reload`, async ({ page }) => {
      await open(page, route);

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'b');
      await expect(page.locator('body')).toHaveCSS('background-color', BG.b);

      const buttons = page.locator('.theme-switch[aria-label="Color scheme"] button');
      await expect(buttons).toHaveText(['A · Original', 'B · Our Pick', 'C · Paper']);
      for (let i = 0; i < 3; i++) {
        const box = await buttons.nth(i).boundingBox();
        expect(box?.height ?? 0, `button ${i} is at least 44px tall`).toBeGreaterThanOrEqual(44);
      }
      await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');

      await page.evaluate(() => { (window as any).__noReload = true; });
      await buttons.nth(2).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'c');
      await expect(page.locator('body')).toHaveCSS('background-color', BG.c);
      await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);

      await buttons.nth(0).click();
      await expect(page.locator('body')).toHaveCSS('background-color', BG.a);
    });
  }

  test("the visitor's choice survives a reload and carries to another page", async ({ page }) => {
    await open(page, '/gi/site/about');
    await page.locator('.theme-switch button[data-theme-set="c"]').click();
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'c');
    await open(page, '/gi/site/contact');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'c');
  });

  test('a garbage stored value falls back to B', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('gi-theme', 'nope'));
    await open(page, '/gi/site');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'b');
  });

  test('the six generation cards render in order with the TECH legend', async ({ page }) => {
    await open(page, '/gi/site/about');
    const names = await page.locator('.gen-card .gen-name').allInnerTexts();
    expect(names.map((n) => n.replace(/\s+/g, ' ').trim().toLowerCase())).toEqual([
      'gen z', 'millennial', 'gen x', 'boomer', 'silent generation', 'greatest generation',
    ]);
    await expect(page.locator('.tech-list li')).toHaveCount(6);
    await expect(page.locator('.tech-count')).toContainText('6 Generations');
    await expect(page.locator('.tech-count')).toContainText('4 Seats');
  });

  test('font picker: second group, default C · Cleaner, switches data-font only, persists', async ({ page }) => {
    await open(page, '/gi/site');
    const group = page.locator('.theme-switch[aria-label="Font set"]');
    await expect(group).toHaveCount(1);
    await expect(group.locator('button')).toHaveText(['A · Current', 'B · Louder', 'C · Cleaner']);
    await expect(page.locator('html')).toHaveAttribute('data-font', 'c');
    await expect(group.locator('button').nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('h1').first()).toHaveCSS('font-family', /Oswald/);
    await group.locator('button[data-font-set="b"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-font', 'b');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'b'); // colors untouched
    await expect(page.locator('h1').first()).toHaveCSS('font-family', /Bebas Neue/);
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('data-font', 'b');
  });

  test('the saved look: B · Our Pick, C · Cleaner, D · On Air for everyone, once', async ({ page }) => {
    // a partner who clicked around during the vote still has their old picks stored
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('gi-theme', 'c');
      localStorage.setItem('gi-font', 'a');
      localStorage.setItem('gi-logo', 'b');
    });
    await open(page, '/gi/site');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'b');
    await expect(html).toHaveAttribute('data-font', 'c');
    await expect(html).toHaveAttribute('data-logo', 'd');
    for (const sel of ['[data-theme-set="b"]', '[data-font-set="c"]', '[data-logo-set="d"]']) {
      await expect(page.locator(`.theme-switch button${sel}`)).toHaveAttribute('aria-pressed', 'true');
    }
    // a pick made after the save still sticks
    await page.locator('.theme-switch button[data-font-set="a"]').click();
    await page.reload({ waitUntil: 'load' });
    await expect(html).toHaveAttribute('data-font', 'a');
    await expect(html).toHaveAttribute('data-theme', 'b');
  });

  test('Home plays only the logo intro; Explainer plays the rest in the same frame', async ({ page }) => {
    await open(page, '/gi/site');
    const frame = page.locator('#trailer iframe');
    await expect(frame).toHaveAttribute('data-src', '/gi/site/promo/?part=intro');
    const buttons = page.locator('[data-gi-explainer]');
    await expect(buttons).toHaveCount(2);
    await expect(buttons).toHaveText(['▶ Explainer', '▶ Explainer']);
    await expect(page.locator('#trailer .trailer-actions a.btn-red')).toHaveAttribute('href', 'https://forms.gle/4qjmLzJieGN4hJWg6');
    await page.locator('#trailer [data-gi-explainer]').click();
    await expect(frame).toHaveAttribute('src', '/gi/site/promo/?part=explainer');
  });

  test('promo parts: intro is the logo video only, explainer skips it, no part is the full promo', async ({ page }) => {
    await open(page, '/gi/site/promo', '?part=intro');
    await expect(page.locator('.gi-embed')).toHaveClass(/gi-part-intro/);
    await expect(page.locator('.gi-a-out video')).toHaveCount(1);
    for (const sel of ['.gi-board', '.gi-b-out', '.gi-c-out', '.gi-close', '.gi-bug']) {
      await expect(page.locator(sel)).toBeHidden();
    }

    await open(page, '/gi/site/promo', '?part=explainer');
    await expect(page.locator('html')).toHaveAttribute('data-ready', '1', { timeout: 10000 });
    await expect(page.locator('.gi-embed')).toHaveClass(/gi-play/);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.locator('.gi-a-out')).toBeHidden();
    const at = await page.evaluate(() => Math.min(...document.getAnimations().map((a) => Number(a.currentTime))));
    expect(at).toBeGreaterThanOrEqual(9000); // starts at the whiteboard, not the intro

    await open(page, '/gi/site/promo');
    await expect(page.locator('.gi-embed')).not.toHaveClass(/gi-part-/);
    await expect(page.locator('.gi-a-out video')).toHaveCount(1);
    await expect(page.locator('.gi-close')).toHaveCount(1);
  });

  test('link preview (texts, social): the clean logo on white, 1200x630, on every open page', async ({ page }) => {
    const img = 'https://dojo.ninja360.co/gi/site/assets/og-logo-white.png';
    for (const route of ['/gi/site', '/gi/site/episodes', '/gi/site/rate-the-topics']) {
      await open(page, route);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', img);
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', img);
      await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
      await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
    }
    const png = await readFile(path.join(process.cwd(), 'dist', 'gi', 'site', 'assets', 'og-logo-white.png'));
    expect(png.readUInt32BE(16)).toBe(1200); // PNG header width
    expect(png.readUInt32BE(20)).toBe(630); // PNG header height
  });

  test('/strategy: both decks have View (new tab) and Download buttons', async ({ page }) => {
    await open(page, '/gi/site/strategy');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
    await expect(page.locator('.deck-card')).toHaveCount(2);
    await expect(page.locator('.deck-card a[target="_blank"]')).toHaveCount(2);
    await expect(page.locator('.deck-card a[download]')).toHaveCount(2);
  });

  test('logo-background picker: four options, default D · On Air, A/B/C unchanged', async ({ page }) => {
    await open(page, '/gi/site');
    const group = page.locator('.theme-switch[aria-label="Logo background"]');
    await expect(group.locator('button')).toHaveText(['A · White', 'B · Grey', 'C · Clear', 'D · On Air']);
    await expect(page.locator('html')).toHaveAttribute('data-logo', 'd');
    const mark = page.locator('.brand .mark:not(.mark-light)');
    const light = page.locator('.brand .mark-light');
    // On Air on a dark scheme: white-lettered logo, no plate, layered red glow
    await expect(light).toBeVisible();
    await expect(mark).toBeHidden();
    await expect(light).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const glow = await light.evaluate((el) => getComputedStyle(el).filter);
    expect((glow.match(/drop-shadow/g) || []).length).toBe(3);
    // host circles carry the lighter bloom (on the circle itself, so it is not cropped)
    const hostFilter = await page.locator('.host-photo').first().evaluate((el) => getComputedStyle(el).filter);
    expect((hostFilter.match(/drop-shadow/g) || []).length).toBe(3);
    // A, B and C are exactly as before: no filter at all
    await group.locator('button[data-logo-set="c"]').click();
    await expect(light).toBeVisible();
    expect(await light.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    await group.locator('button[data-logo-set="b"]').click();
    await expect(mark).toBeVisible();
    await expect(mark).toHaveCSS('background-color', 'rgb(175, 175, 175)');
    expect(await mark.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    await group.locator('button[data-logo-set="a"]').click();
    await expect(mark).toHaveCSS('background-color', 'rgb(255, 245, 236)');
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('data-logo', 'a');
  });

  test('On Air on Paper: the original logo with one tight shadow, not a glow', async ({ page }) => {
    await open(page, '/gi/site');
    await page.locator('.theme-switch button[data-theme-set="c"]').click();
    const mark = page.locator('.brand .mark:not(.mark-light)');
    await expect(mark).toBeVisible();
    const glow = await mark.evaluate((el) => getComputedStyle(el).filter);
    expect((glow.match(/drop-shadow/g) || []).length).toBe(1);
  });

  test('Man on the Street: the deck as a page, all twelve sections, linked from the Business Plan and The Plan', async ({ page }) => {
    await open(page, '/gi/site/business-plan/man-on-the-street');
    await expect(page.locator('h1')).toHaveText('Man on the Street');
    await expect(page.locator('.bp-section')).toHaveCount(12);
    await expect(page.locator('.bp-section h2').first()).toHaveText('We take the table to the street');
    await expect(page.locator('.bp-section h2').last()).toHaveText('Five decisions to hit the road');
    await expect(page.locator('.mots-actions a').first()).toHaveAttribute('href', '../../assets/docs/GI-Man-on-the-Street-Strategy.pdf');
    await open(page, '/gi/site/strategy');
    await expect(page.locator('.deck-card a', { hasText: 'Read it on the site' })).toHaveAttribute('href', '/gi/site/business-plan/man-on-the-street/');
    const content = await readFile(path.join(process.cwd(), 'dist/gi/site/business-plan/content.js'), 'utf8');
    expect(content).toContain("href: '/gi/site/business-plan/man-on-the-street/'");
  });

  test('Business Plan page: the image button opens The Plan (strategy decks)', async ({ page }) => {
    await open(page, '/gi/site/business-plan');
    const door = page.locator('.bizplan-full a.bizplan-door');
    await expect(door).toHaveAttribute('href', '/gi/site/strategy/');
    await expect(door.locator('img')).toBeVisible();
  });

  test('/call: six steps, pickers inline, links open in a new tab', async ({ page }) => {
    await open(page, '/gi/site/call');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
    await expect(page.locator('.call-step')).toHaveCount(6);
    await expect(page.locator('.call-pickers .theme-switch')).toHaveCount(3);
    const links = page.locator('.call-step a.btn');
    const n = await links.count();
    for (let i = 0; i < n; i++) await expect(links.nth(i)).toHaveAttribute('target', '_blank');
    await page.locator('#callChecks input[data-k="colors"]').check();
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#callChecks input[data-k="colors"]')).toBeChecked();
  });

  test('Be on the Show goes to the current guest form (second draft, Nov 18) everywhere, never the old one', async ({ page }) => {
    const NEW = 'https://forms.gle/4qjmLzJieGN4hJWg6';
    await open(page, '/gi/site');
    await expect(page.locator('#gi-menu a', { hasText: 'Be on the Show' })).toHaveAttribute('href', NEW);
    const { readdir } = await import('node:fs/promises');
    const root = path.join(process.cwd(), 'dist/gi/site');
    const files = (await readdir(root, { recursive: true })).filter((f) => String(f).endsWith('.html'));
    for (const f of files) {
      const html = await readFile(path.join(root, String(f)), 'utf8');
      expect(html, `${f} still links the old guest form`).not.toContain('1FAIpQLScvfwAtkcMGAXOii7GNK6kHzBYgyU6exOj1wUhE2TpkPkq_Ew');
    }
  });

  test('the real slate: Listen shows Episode 001 and the three Dec 12 tapings, the plans show the calendar', async ({ page }) => {
    await open(page, '/gi/site/episodes');
    await expect(page.locator('.ep-card')).toHaveCount(5);
    await expect(page.locator('.ep-title')).toHaveText([
      'Episode 001 · AI',
      'Episode 002 · Home Schooling vs. Public School',
      'Episode 003 · Is cancel culture accountability or censorship?',
      'Episode 004 · Sticks & Stones: do we have entire generations of snowflakes?',
      'More tapings in 2027',
    ]);
    await expect(page.getByText('Example · Being voted on')).toHaveCount(0);
    await open(page, '/gi/site/business-plan');
    const table = page.locator('#plan .bp-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(table).toContainText('Home Schooling vs. Public School');
    await open(page, '/gi/site/business-plan/youtube-strategy');
    await expect(page.locator('.gi-slate tbody tr')).toHaveCount(5);
    await expect(page.locator('#ytsSlateTitle')).toContainText('as of');
  });

  test('home: Upcoming Episodes are still cards that open each episode on Listen (no marquee)', async ({ page }) => {
    await open(page, '/gi/site');
    await expect(page.locator('.topics-track')).toHaveCount(0);
    const cards = page.locator('.ep-tease');
    await expect(cards).toHaveCount(4);
    for (const [i, n] of ['001', '002', '003', '004'].entries()) {
      await expect(cards.nth(i)).toHaveAttribute('href', `/gi/site/episodes/#ep-${n}`);
    }
    await expect(cards.nth(1)).toContainText('Home Schooling vs. Public School');
    await expect(cards.nth(1)).toContainText('Sat Dec 12 · 10:00 AM');
    const anim = await cards.first().evaluate((el) => getComputedStyle(el.parentElement!).animationName);
    expect(anim).toBe('none');
    await open(page, '/gi/site/episodes');
    for (const id of ['ep-001', 'ep-002', 'ep-003', 'ep-004', 'ep-2027']) await expect(page.locator(`#${id}.ep-card`)).toHaveCount(1);
  });

  test('GHL forms live behind the scenes only: never on a page the home page or menu reaches', async () => {
    const pub = ['', 'episodes', 'rate-the-topics', 'about', 'contact', 'membership', 'question-of-the-week'];
    for (const r of pub) {
      const html = await readFile(path.join(process.cwd(), 'dist/gi/site', r, 'index.html'), 'utf8');
      expect(html, `/gi/site/${r} has no GHL form`).not.toContain('links.ninja360.net');
    }
  });

  test('Be on the Show (behind the scenes): the real GHL form, with the QR ?src= tag passed through', async ({ page }) => {
    const ghl = 'https://links.ninja360.net/widget/form/OSSMxHOfrwmxYsYrYiIY';
    await page.route('https://links.ninja360.net/**', (r) => r.abort()); // never load GHL in a test
    await open(page, '/gi/site/be-on-the-show');
    const btn = page.locator('#gi-ghl-signup');
    await expect(btn).toHaveAttribute('href', ghl);
    await expect(btn).toHaveAttribute('target', '_blank');
    await expect(page.locator('.signup-panel a[href*="docs.google.com/forms"]')).toHaveCount(0);
    await open(page, '/gi/site/be-on-the-show', '?src=chamber');
    await expect(btn).toHaveAttribute('href', ghl + '?src=chamber');
  });

  test('Business Plan and Partner Call send Be on the Show to the GHL page, not the Google Form', async ({ page }) => {
    await open(page, '/gi/site/business-plan');
    await expect(page.locator('.cta-band a', { hasText: 'Be on the Show' })).toHaveAttribute('href', '/gi/site/be-on-the-show/');
    await open(page, '/gi/site/call');
    await expect(page.locator('#s5 a', { hasText: 'Be on the Show' })).toHaveAttribute('href', '/gi/site/be-on-the-show/');
  });
});
