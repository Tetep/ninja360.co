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

      const buttons = page.locator('.theme-switch button');
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
});
