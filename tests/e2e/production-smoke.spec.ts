import { test, expect } from '@playwright/test';

const routes = [
  '/',
  '/vision',
  '/money',
  '/assets',
  '/forge',
  '/alliance',
  '/crew',
  '/floor',
  '/roadmaps/gabe',
  '/roadmaps/pavan',
  '/gameplan',
  '/domain-strategy',
  '/pipeline',
  '/scrolls',
  '/social-hub',
  '/sprint',
  '/roadmaps/assets',
  '/roadmaps/erik',
  '/roadmaps/tim',
  '/scrolls/kpi-gameplan',
  '/scrolls/lucky13-brief',
  '/scrolls/mission-board',
  '/scrolls/operating-rhythm',
  '/scrolls/three-doors',
  '/scrolls/warp-speed',
  '/legacy/roadmaps/gabe',
  '/legacy/roadmaps/pavan',
];

test.describe('production smoke checks', () => {
  for (const route of routes) {
    test(route + ' responds and remains mobile-safe', async ({ page, baseURL }) => {
      const first = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(first, 'No response returned from server').not.toBeNull();
      expect(first?.ok(), 'Route returned non-2xx status').toBeTruthy();

      if (route === '/') {
        // Ensure unlocked state before asserting scroll and overflow.
        await page.evaluate(() => {
          localStorage.setItem('dojo:identity', 'tim');
          localStorage.setItem('dojo:accepted', 'true');
        });
        const second = await page.goto(route, { waitUntil: 'domcontentloaded' });
        expect(second, 'No response returned from server after unlock state').not.toBeNull();
        expect(second?.ok(), 'Home route failed after unlock state').toBeTruthy();
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        return {
          title: document.title,
          overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
          htmlOverflowY: getComputedStyle(doc).overflowY,
          bodyOverflowY: getComputedStyle(body).overflowY,
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
          startY: window.scrollY,
          path: location.pathname,
        };
      });

      expect(metrics.title, 'Page title should exist').toBeTruthy();
      expect(metrics.overflowX, 'Horizontal overflow detected').toBeLessThanOrEqual(1);

      if (metrics.scrollHeight > metrics.clientHeight + 4) {
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await page.waitForTimeout(160);
        const endY = await page.evaluate(() => window.scrollY);
        expect(endY, 'Vertical scroll movement failed').toBeGreaterThan(metrics.startY);
      }

      // Keep this assertion only for non-home routes.
      if (route !== '/') {
        expect(metrics.htmlOverflowY, 'Unexpected html overflow lock').not.toBe('hidden');
        expect(metrics.bodyOverflowY, 'Unexpected body overflow lock').not.toBe('hidden');
      }

      // Emit useful debug context when workflow logs are reviewed.
      test.info().annotations.push({
        type: 'route-check',
        description: `${baseURL}${route} => ${metrics.path}`,
      });
    });
  }
});
