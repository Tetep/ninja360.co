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

  test('font picker: second group, default A, switches data-font only, persists', async ({ page }) => {
    await open(page, '/gi/site');
    const group = page.locator('.theme-switch[aria-label="Font set"]');
    await expect(group).toHaveCount(1);
    await expect(group.locator('button')).toHaveText(['A · Current', 'B · Louder', 'C · Cleaner']);
    await expect(page.locator('html')).toHaveAttribute('data-font', 'a');
    await expect(group.locator('button').nth(0)).toHaveAttribute('aria-pressed', 'true');
    await group.locator('button[data-font-set="b"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-font', 'b');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'b'); // colors untouched
    await expect(page.locator('h1').first()).toHaveCSS('font-family', /Bebas Neue/);
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('data-font', 'b');
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
