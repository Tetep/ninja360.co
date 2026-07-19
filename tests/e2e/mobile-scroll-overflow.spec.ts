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

test.describe('mobile scroll and overflow guardrails', () => {
  for (const route of routes) {
    test(route + ' allows scrolling and avoids horizontal overflow', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      if (route === '/') {
        // Upstream home intentionally locks scroll during picker/call phases.
        // Force an accepted visitor state, then reload and assert final unlocked page.
        await page.evaluate(() => {
          localStorage.setItem('dojo:identity', 'tim');
          localStorage.setItem('dojo:accepted', 'true');
        });
        await page.goto(route, { waitUntil: 'domcontentloaded' });
      }

      // Reset to top so per-route scroll assertions are deterministic.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        return {
          hasGateLock: doc.classList.contains('gate-locked'),
          htmlOverflowY: getComputedStyle(doc).overflowY,
          bodyOverflowY: getComputedStyle(body).overflowY,
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
          startY: window.scrollY,
        };
      });

      const horizontalOverflowPx = metrics.scrollWidth - metrics.clientWidth;
      expect(horizontalOverflowPx).toBeLessThanOrEqual(1);

      expect(metrics.hasGateLock).toBeFalsy();
      expect(metrics.htmlOverflowY).not.toBe('hidden');
      expect(metrics.bodyOverflowY).not.toBe('hidden');

      if (metrics.scrollHeight > metrics.clientHeight + 4) {
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await page.waitForTimeout(100);

        const scrolled = await page.evaluate(() => window.scrollY);
        expect(scrolled).toBeGreaterThan(metrics.startY);
      }
    });
  }
});
