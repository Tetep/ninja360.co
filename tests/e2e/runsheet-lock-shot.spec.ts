import { test, expect, Page } from '@playwright/test';

// The run sheet (public/verizon.html — ninja360.org). Two acts that used to be one button:
//   LOCK PLAN  commits a day's date and stop list. Stops become PLANNED; nothing is banked and
//              the drive/clock math stays live.
//   SHOT       a stop is done. It banks the points, leaves the live route, and is dated by the
//              day it sits on — or by today, after a confirm, if that day has not come yet.
// The saved state is seeded straight into localStorage, the way the app itself writes it.

const LSKEY = 'ninja360-runsheet-v2';
const ROUTE = '/verizon.html';
const OSAGE = '2026-4522';   // Russell Cellular 126883 — Osage City, KS (Open, not loaded in IDS Capture)
const EMPORIA = '2026-8888'; // Cellular Sales 121991 — Emporia, KS (Open, not loaded)

const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const mdy = (s: string) => s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); };

function state(extra: Record<string, unknown> = {}) {
  return {
    days: [{ id: 'dtest', date: tomorrow(), startKey: 'home', startTime: 8, endKey: 'home', ids: [OSAGE, EMPORIA], startCharge: 100, crew: null, pace: 'split' }],
    active: 0, activeDate: tomorrow(),
    sv: {}, loaded: {}, status: {}, notes: {}, timers: {}, punch: {}, locks: {}, showBanked: false,
    here: { key: 'home', time: 8 }, nav: 'plan', custom: [], places: {}, lastRequest: null, evRange: 260, chargeAt: {},
    who: 'tim', by: {}, oath: { who: 'tim', at: 1 },           // signed in and past the Philosophy gate
    idsSync: '2026-09-17', sync: { key: '', v: 0, at: 0 }, geo: {},
    mig: { cameron0915: 1, planlock0923: 1 },                  // migrations already applied — the plan is exactly what is seeded
    binds: [], checkin: {}, report: { to: '', cc: '', sent: {} },
    ...extra,
  };
}

async function open(page: Page, seed: Record<string, unknown>) {
  // seed once: a reload must find what the app saved, not the seed again
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [LSKEY, seed] as const);
  const res = await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  expect(res?.status(), 'the run sheet should resolve').toBeLessThan(400);
  await expect(page.locator('#s-plan')).toBeVisible();
}

const milesOnPlan = async (page: Page) => {
  const t = await page.locator('#s-plan .mcell', { hasText: 'Miles' }).first().innerText();
  return parseInt(t.replace(/[^0-9]/g, ''), 10);
};
// "Banked · N shot" counts every shot stop in the book, IDS-banked ones included — so assert deltas
const shotCount = async (page: Page) => {
  const t = await page.locator('#counters').innerText();
  const m = /(\d+) shot/.exec(t);
  expect(m, 'the Banked counter should say how many stops are shot').toBeTruthy();
  return parseInt(m![1], 10);
};

async function noSidewaysScroll(page: Page, what: string) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(m.sw - m.cw, what + ' must not overflow sideways').toBeLessThanOrEqual(1);
}

test.describe('run sheet — lock the plan, then shoot the stop', () => {
  test('locking a plan keeps the route live; SHOT banks the stop and dates it', async ({ page }) => {
    await open(page, state());
    await noSidewaysScroll(page, 'Plan tab');

    // two live stops (the "Arrive home" tail is a .stop card too), real miles, nothing planned or shot yet
    await expect(page.locator('#stops [data-shot]')).toHaveCount(2);
    expect(await milesOnPlan(page)).toBeGreaterThan(0);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(0);
    await expect(page.locator('#lockbar')).toHaveCount(0);
    const shotBefore = await shotCount(page);

    // LOCK PLAN: planned badges, frozen list, miles unchanged
    await page.locator('#bLock').click();
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await expect(page.locator('#stops .badge.pl')).toHaveCount(2);
    await expect(page.locator('#fDate')).toBeDisabled();
    await expect(page.locator('#bDel')).toHaveCount(0);
    await expect(page.locator('#stops [data-rm]')).toHaveCount(0);
    expect(await milesOnPlan(page)).toBeGreaterThan(0);
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    expect(await shotCount(page)).toBe(shotBefore);

    // SHOT on a stop parked on tomorrow: the app asks, and dates it today when told yes
    page.once('dialog', d => { expect(d.message()).toContain('planned for'); d.accept(); });
    await page.locator('#stops [data-shot]').first().click();
    await expect(page.locator('#stops .stop.done')).toHaveCount(1);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(1);
    expect(await shotCount(page)).toBe(shotBefore + 1);
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), LSKEY);
    expect(Object.keys(saved.locks)).toHaveLength(1);
    expect(saved.locks[OSAGE].d).toBe(iso(new Date()));
    expect(saved.days[0].locked).toBeTruthy();

    // the IDS tab now has one onsite date to report, and it is in the update text
    await page.locator('#nav button[data-s="app"]').click();
    await expect(page.locator('#s-app')).toBeVisible();
    await noSidewaysScroll(page, 'IDS tab');
    await expect(page.locator('#s-app .idsrow', { hasText: OSAGE })).toContainText(mdy(iso(new Date())));
    await expect(page.locator('#idsMsg')).toContainText(OSAGE);
    await expect(page.locator('#idsMsg')).toContainText('onsite ' + mdy(iso(new Date())));
    await expect(page.locator('#idsMsg')).toContainText('PLEASE ADD TO THE APP');

    // undo puts it back on the run
    await page.locator('#nav button[data-s="plan"]').click();
    await page.locator('#stops [data-shot]', { hasText: 'undo' }).click();
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    expect(await shotCount(page)).toBe(shotBefore);

    // the lock survives a reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await page.locator('#bUnlock').click();
    await expect(page.locator('#lockbar')).toHaveCount(0);
    await expect(page.locator('#bLock')).toBeVisible();
  });

  test('a stop locked before its day becomes a locked plan, not a shot', async ({ page }) => {
    // what the old LOCK button did to tomorrow's plan: a lock stamped today for tomorrow's date
    await open(page, state({
      locks: { [OSAGE]: { d: tomorrow(), pts: 100, by: 'tim', with: '', at: Date.now() } },
      status: { [OSAGE]: 'captured' }, by: { [OSAGE]: 'tim' },
      mig: { cameron0915: 1 },
    }));
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(2);
    await expect(page.locator('#stops [data-shot]', { hasText: 'undo' })).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('now PLANNED');
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), LSKEY);
    expect(saved.locks[OSAGE]).toBeUndefined();
    expect(saved.mig.planlock0923).toBe(1);
  });
});
