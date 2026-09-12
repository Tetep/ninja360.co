import { test, expect } from '@playwright/test';

// Covers the mobile hamburger/drawer nav added to the GI internal dashboard
// reference page (public/gi/site/dashboard/index.html, generated from the
// build_dashboard.py scratchpad script). mobile-scroll-overflow.spec.ts only
// checks for absence of *document-level* horizontal overflow, which this page
// always passed even before the fix (the 1440px-wide screens scroll inside
// their own `.dc-wrap{overflow-x:auto}`, not the document) — it never
// exercised the nav itself. This test clicks through it instead.

test.describe('GI dashboard — mobile nav', () => {
  test('hamburger opens a drawer, switches screens, and closes', async ({ page }) => {
    // No trailing slash: with trailingSlash:'never', astro preview's local
    // dev-style routing 404s the "/…/dashboard/" form (themed 404 page, not
    // a redirect) even though the same dist/ file serves fine without the
    // slash — and in production, where this page actually lives. See the
    // matching note in mobile-scroll-overflow.spec.ts.
    const response = await page.goto('/gi/site/dashboard', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);

    const toggle = page.locator('#dash-menu-toggle');
    const drawer = page.locator('#dash-mobile-nav');
    const backdrop = page.locator('#dash-mobile-backdrop');

    // Desktop sidebar is hidden at mobile widths; the toggle is the only way in.
    await expect(page.locator('.dash-sidebar').first()).toBeHidden();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Reachable without first having to horizontally scroll the 1440px canvas.
    const viewport = page.viewportSize();
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toHaveClass(/open/);
    await expect(backdrop).toHaveClass(/show/);

    const commandItem = drawer.locator('.mobile-navbtn[data-tab="command"]');
    const pipelineItem = drawer.locator('.mobile-navbtn[data-tab="pipeline"]');
    await expect(commandItem).toHaveClass(/active/);
    await expect(pipelineItem).not.toHaveClass(/active/);
    await expect(page.locator('#screen-command')).toBeVisible();

    // Tapping a section switches screens, updates the active item, and
    // auto-closes the drawer.
    await pipelineItem.click();
    await expect(page.locator('#screen-command')).toBeHidden();
    await expect(page.locator('#screen-pipeline')).toBeVisible();
    await expect(pipelineItem).toHaveClass(/active/);
    await expect(commandItem).not.toHaveClass(/active/);
    await expect(drawer).not.toHaveClass(/open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Backdrop click also closes it, without switching screens. Click the
    // bottom-right corner — clear of the left-anchored drawer (<=300px wide)
    // and the top-right toggle — so it actually lands on the backdrop.
    await toggle.click();
    await expect(drawer).toHaveClass(/open/);
    const vp = page.viewportSize()!;
    await backdrop.click({ position: { x: vp.width - 10, y: vp.height - 10 }, force: true });
    await expect(drawer).not.toHaveClass(/open/);
    await expect(page.locator('#screen-pipeline')).toBeVisible();
  });
});
