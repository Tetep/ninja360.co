import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// These pages are served with a trailing slash in production (Cloudflare Pages)
// and their relative asset paths ("../assets/gi-theme.js") assume it. astro
// preview 404s that URL, and without the slash the assets resolve one level
// too high and never load. So: request the real trailing-slash URL and answer
// it with the built file, exactly as production would.
async function open(page: Page, route: string) {
  const url = route + '/';
  const file = path.join(process.cwd(), 'dist', route, 'index.html');
  await page.route('**' + url, async (r) => {
    await r.fulfill({ status: 200, contentType: 'text/html', body: await readFile(file, 'utf8') });
  });
  await page.goto(url, { waitUntil: 'load' });
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
});
