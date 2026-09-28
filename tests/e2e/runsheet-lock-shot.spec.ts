import { test, expect, Page } from '@playwright/test';

// The run sheet (public/verizon.html — ninja360.org). Two acts that used to be one button:
//   LOCK PLAN  commits a day's date and stop list. Stops become PLANNED; nothing is banked and
//              the drive/clock math stays live.
//   SHOT       a stop is done. It banks the points, leaves the live route, and is dated by the
//              day it sits on — or by today, after a confirm, if that day has not come yet.
// The saved state is seeded straight into localStorage, the way the app itself writes it.

const LSKEY = 'ninja360-runsheet-v2';
const ROUTE = '/verizon.html';
const TOPEKA = '2026-4049';   // Russell Cellular 131502 — Topeka, KS (Open, not loaded in IDS Capture)
const MARYSVILLE = '2026-8652';  // Victra 122254 — Marysville, KS (Open, not loaded)
const SALINA = '2026-8093';   // Victra 109861 — Salina, KS (Return Owed, three-item punch list)

const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const mdy = (s: string) => s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4);
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const today = () => shift(0);
const tomorrow = () => shift(1);
const yesterday = () => shift(-1);
// "Thursday 9/24" — the way the IDS email names a day
const dayLabel = (s: string) => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('en-US', { weekday: 'long' }) + ' ' + (d.getMonth() + 1) + '/' + d.getDate(); };

const day = (over: Record<string, unknown> = {}) => ({
  id: 'dtest', date: tomorrow(), startKey: 'home', startTime: 8, endKey: 'home', ids: [TOPEKA, MARYSVILLE],
  startCharge: 100, crew: null, pace: 'split', ...over,
});

function state(extra: Record<string, unknown> = {}) {
  return {
    days: [day()],
    active: 0, activeDate: tomorrow(),
    sv: {}, loaded: {}, status: {}, notes: {}, timers: {}, punch: {}, locks: {}, showBanked: false,
    here: { key: 'home', time: 8 }, nav: 'plan', custom: [], places: {}, lastRequest: null, evRange: 260, chargeAt: {},
    who: 'tim', by: {}, oath: { who: 'tim', at: 1 },           // signed in and past the Philosophy gate
    idsSync: '2026-09-17', sync: { key: '', v: 0, at: 0 }, geo: {},
    mig: { cameron0915: 1, planlock0923: 1, lincoln0925: 1, pastruns0926: 3, logmi0926: 1 },   // migrations already applied — the plan is exactly what is seeded
    binds: [], checkin: {}, report: { to: '', cc: '', sent: {} },
    ...extra,
  };
}

// the number under a strip label ("Miles", "Finish", …) — the label is the first line of the cell
const cell = async (page: Page, scope: string, label: string) => {
  const cells = await page.locator(scope + ' .mcell').allInnerTexts();
  const hit = cells.find(t => t.split('\n')[0].trim().toLowerCase() === label.toLowerCase());
  expect(hit, 'a "' + label + '" cell in ' + scope).toBeTruthy();
  return hit!.split('\n').slice(1).join(' ').trim();
};

async function open(page: Page, seed: Record<string, unknown>, tab = '#s-plan') {
  // the app geocodes rows, loads tiles and chargers, and fetches fonts on start: none of it is under test,
  // and any of it can re-render the page mid-click
  await page.route(/nominatim\.openstreetmap\.org|tile\.openstreetmap\.org|api\.openchargemap\.io|fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // seed once: a reload must find what the app saved, not the seed again
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [LSKEY, seed] as const);
  const res = await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  expect(res?.status(), 'the run sheet should resolve').toBeLessThan(400);
  await expect(page.locator(tab)).toBeVisible();
}

const saved = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), LSKEY);

const milesOnPlan = async (page: Page) => parseInt((await cell(page, '#s-plan', 'Miles')).split(' ')[0].replace(/[^0-9]/g, ''), 10);
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
    const milesBefore = await milesOnPlan(page);
    expect(milesBefore).toBeGreaterThan(0);
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
    expect(await milesOnPlan(page)).toBe(milesBefore);
    expect(await cell(page, '#s-plan', 'Finish')).not.toBe('08:00');   // the leave time — a route with no live stops would finish where it started
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    expect(await shotCount(page)).toBe(shotBefore);

    // SHOT on a stop parked on tomorrow: the app asks, and dates it today when told yes
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.accept(); });
    await page.locator('#stops [data-shot]').first().click();
    await expect.poll(() => asked).toContain('is planned for');
    expect(asked).toContain('Russell 131502');   // it names the store, not just the city
    await expect(page.locator('#stops .stop.done')).toHaveCount(1);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(1);
    expect(await shotCount(page)).toBe(shotBefore + 1);
    let s = await saved(page);
    expect(Object.keys(s.locks)).toHaveLength(1);
    expect(s.locks[TOPEKA].d).toBe(today());
    expect(s.days[0].locked).toBeTruthy();

    // the IDS tab now has one onsite date to report, and the email says so — under the day it was shot
    await page.locator('#nav button[data-s="app"]').click();
    await expect(page.locator('#s-app')).toBeVisible();
    await noSidewaysScroll(page, 'IDS tab');
    await expect(page.locator('#s-app .idsrow', { hasText: TOPEKA })).toContainText(mdy(today()));
    const msg = await page.locator('#idsMsg').innerText(), lines = msg.split('\n');
    expect(msg).toContain('COMPLETED — ' + dayLabel(today()).toUpperCase());
    expect(lines.find(l => l.includes('(Loc ' + TOPEKA + ')'))).toBeTruthy();       // the shot stop is reported…
    expect(lines.find(l => l.startsWith(TOPEKA))).toBeUndefined();                  // …not asked for
    expect(msg).toContain('PLEASE LOAD IN IDS CAPTURE');
    expect(lines.find(l => l.startsWith(MARYSVILLE))).toContain('Marysville');           // the unshot one is asked for, under its day
    expect(msg).toContain('Tim Petet');

    // undo puts back exactly what was there — no confirm, no re-dating
    await page.locator('#nav button[data-s="plan"]').click();
    await page.locator('#stops [data-shot]', { hasText: 'undo' }).click();
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    expect(await shotCount(page)).toBe(shotBefore);
    await page.locator('.toast button').click();   // Undo the undo: back to shot, dated today — not the planned day
    await expect(page.locator('#stops .stop.done')).toHaveCount(1);
    s = await saved(page);
    expect(s.locks[TOPEKA].d).toBe(today());
    await page.locator('#stops [data-shot]', { hasText: 'undo' }).click();   // and off again for the rest

    // the lock survives a reload; the unlock is kept as a fact
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await page.locator('#bUnlock').click();
    await expect(page.locator('#lockbar')).toHaveCount(0);
    await expect(page.locator('#bLock')).toBeVisible();
    s = await saved(page);
    expect(s.days[0].locked).toBeNull();
    expect(s.days[0].unlocked.by).toBe('tim');
    expect(s.days[0].unlocked.at).toBeGreaterThan(0);
  });

  test('cancelling the future-date question banks nothing', async ({ page }) => {
    await open(page, state());
    await page.locator('#bLock').click();
    const shotBefore = await shotCount(page);
    page.once('dialog', d => d.dismiss());
    await page.locator('#stops [data-shot]').first().click();
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    expect(await shotCount(page)).toBe(shotBefore);
    await expect(page.locator('.toast')).not.toContainText('SHOT —');
    expect(Object.keys((await saved(page)).locks)).toHaveLength(0);
  });

  test('a stop locked before its day becomes a locked plan, not a shot — and stays converted', async ({ page }) => {
    const AT = Date.now() - 60_000;
    // what the old LOCK button did to tomorrow's plan: a lock stamped today for tomorrow's date
    await open(page, state({
      locks: { [TOPEKA]: { d: tomorrow(), pts: 100, by: 'tim', with: '', at: AT } },
      status: { [TOPEKA]: 'captured' }, by: { [TOPEKA]: 'tim' },
      mig: { cameron0915: 1, lincoln0925: 1, pastruns0926: 3, logmi0926: 1 },   // everything but planlock0923 — that one must run
    }));
    await expect(page.locator('.toast')).toContainText('now PLANNED');   // first thing after load — the toast is short-lived
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(2);
    await expect(page.locator('#stops [data-shot]', { hasText: 'undo' })).toHaveCount(0);
    const s = await saved(page);
    expect(s.locks[TOPEKA]).toBeUndefined();
    expect(s.status[TOPEKA]).toBeUndefined();
    expect(s.by[TOPEKA]).toBeUndefined();
    expect(s.days[0].locked).toMatchObject({ at: AT, by: 'tim' });   // the plan lock carries the old lock's stamp
    expect(s.mig.planlock0923).toBe(1);
  });

  test('a real shot from yesterday stays a shot', async ({ page }) => {
    const AT = new Date(yesterday() + 'T15:00:00').getTime();
    await open(page, state({
      days: [day({ date: yesterday(), ids: [TOPEKA] })], activeDate: yesterday(),
      locks: { [TOPEKA]: { d: yesterday(), pts: 100, by: 'tim', with: '', at: AT } },
      status: { [TOPEKA]: 'captured' }, by: { [TOPEKA]: 'tim' },
    }));
    // yesterday is History's now — off the Plan rail — and the shot is still a shot, not turned into a plan lock
    await expect(page.locator('#s-plan .dchip[data-i]')).toHaveCount(1);   // the fresh day Plan opened on, not yesterday
    const s0 = await saved(page);
    expect(s0.locks[TOPEKA].d).toBe(yesterday());
    expect(s0.days.find((d: any) => d.date === yesterday()).locked).toBeFalsy();
    // History costs the day as it was driven, not the (empty) run still ahead
    await page.locator('#nav button[data-s="history"]').click();
    await page.locator('#s-history [data-hrow]').first().click();   // newest day first — yesterday; rows open on tap
    const route = page.locator('#s-history .hroute').first();
    await expect(route).toHaveText(/[1-9]\d* mi/);   // retried until the row has painted its route line
  });

  test('↑/↓ move the stop on the row, and Undo of a SHOT puts the stop back where it was', async ({ page }) => {
    const t = today(), AT = Date.now() - 60_000;
    await open(page, state({
      days: [day({ date: t, ids: [TOPEKA, MARYSVILLE, SALINA] })], activeDate: t,
      locks: { [TOPEKA]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } },
      status: { [TOPEKA]: 'captured' }, by: { [TOPEKA]: 'tim' },
    }));
    // a shot stop that is NOT at the bottom of the list (a stop added after it, a list cleared…)
    await page.evaluate(ids => { const w = window as any; w.eval('S.days[0].ids=' + JSON.stringify(ids)); w.render(); }, [TOPEKA, MARYSVILLE, SALINA]);
    await page.locator('#stops [data-dn="' + MARYSVILLE + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([SALINA, MARYSVILLE, TOPEKA]);
    await page.locator('#stops [data-up="' + MARYSVILLE + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([MARYSVILLE, SALINA, TOPEKA]);
    // the shot row cannot be moved up into the live ones, and the last live row cannot be moved under it
    await expect(page.locator('#stops [data-up="' + TOPEKA + '"]')).toBeDisabled();
    await expect(page.locator('#stops [data-dn="' + SALINA + '"]')).toBeDisabled();
    // SHOT sinks Marysville under the live stops; Undo brings it back to the top, not to "after Salina"
    await page.locator('#stops [data-shot="' + MARYSVILLE + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([SALINA, MARYSVILLE, TOPEKA]);
    await page.locator('.toast button').click();
    expect((await saved(page)).days[0].ids).toEqual([MARYSVILLE, SALINA, TOPEKA]);
    expect((await saved(page)).locks[MARYSVILLE]).toBeUndefined();
  });

  test('a locked plan cannot be edited through the back doors', async ({ page }) => {
    const B = shift(2);
    await open(page, state({
      days: [day({ id: 'dA', date: tomorrow(), ids: [TOPEKA] }), day({ id: 'dB', date: B, ids: [MARYSVILLE], locked: { at: 1, by: 'tim' } })],
    }));
    await page.locator('#stops [data-mv]').first().click();        // move Topeka onto the locked day
    await page.locator('.sheet [data-day="1"]').click();
    await expect(page.locator('.toast')).toContainText('locked');
    const s = await saved(page);
    expect(s.days.find((d: any) => d.date === B).ids).toEqual([MARYSVILLE]);
    expect(s.days.find((d: any) => d.date === tomorrow()).ids).toEqual([TOPEKA]);
  });

  test('a go-back is shot only when its list is clear, and the revisit is dated', async ({ page }) => {
    await open(page, state({ days: [day({ date: today(), ids: [SALINA] })], activeDate: today() }));
    // list open: no SHOT button, a go-back list button instead — and no way round it from the Score table or the status dropdown
    await expect(page.locator('#stops [data-shot]')).toHaveCount(0);
    await expect(page.locator('#stops [data-note="' + SALINA + '"]').filter({ hasText: '3 left' })).toBeVisible();
    await page.locator('#nav button[data-s="board"]').click();
    await page.locator('#sbMoreWrap > summary').click();   // the list lives behind Score's "more" disclosure now
    await page.locator('#s-board [data-bf="returns"]').click();
    await expect(page.locator('#s-board [data-shot="' + SALINA + '"]')).toHaveCount(0);
    await expect(page.locator('#s-board [data-note="' + SALINA + '"]')).toBeVisible();
    expect(await page.evaluate(id => (window as any).markShot(id, true), SALINA)).toBe(false);
    expect((await saved(page)).locks[SALINA]).toBeUndefined();
    await page.locator('#nav button[data-s="plan"]').click();
    await page.locator('#stops [data-note="' + SALINA + '"]').filter({ hasText: '3 left' }).click();
    await expect(page.locator('.sheet #jsShot')).toHaveCount(0);
    for (let i = 0; i < 3; i++) await page.locator('.sheet [data-pl]').nth(i).check();
    // the last box re-opens the sheet so MARK SHOT is there
    await expect(page.locator('.sheet #jsShot')).toBeVisible();
    await page.locator('.sheet #jsShot').click();
    const s = await saved(page);
    expect(s.locks[SALINA].d).toBe(today());
    // IDS keeps the first visit as the sheet's Onsite Date: 9/10, not the revisit — so nothing "completed" today
    await page.locator('#nav button[data-s="app"]').click();
    const msg = await page.locator('#idsMsg').innerText();
    expect(msg).not.toContain('COMPLETED — ' + dayLabel(today()).toUpperCase());
    const goBacks = (msg.split('GO-BACKS')[1] || '').split('\n\n')[0];
    expect(goBacks).not.toContain(SALINA);   // and the list is cleared, so Salina is no longer under GO-BACKS either
  });

  test('IDS tab: dates to report shrink when sent, come back on undo, and survive a merge', async ({ page }) => {
    const y = yesterday(), AT = new Date(y + 'T15:00:00').getTime();
    await open(page, state({
      days: [day({ date: y, ids: [TOPEKA] })], activeDate: y,
      locks: { [TOPEKA]: { d: y, pts: 100, by: 'tim', with: '', at: AT } },
      status: { [TOPEKA]: 'captured' }, by: { [TOPEKA]: 'tim' },
      nav: 'app',
    }), '#s-app');
    await noSidewaysScroll(page, 'IDS tab');
    const row = page.locator('#s-app .idsrow', { hasText: TOPEKA });
    await expect(row).toContainText(mdy(y));
    // the first-run seed: everything already on the sheet is "sent" — date AND invoice, stamped before
    // any real send — and the 19 it is missing are not, so the list opens at 19 + Topeka
    let s = await saved(page);
    expect(s.report.seeded).toBe('0928');
    expect(s.report.sent['2026-0000']).toMatchObject({ d: '2026-09-10', seed: 1, at: 0 });
    expect(typeof s.report.sent['2026-0000'].inv).toBe('string');
    expect(s.report.sent['2026-5178']).toMatchObject({ d: '2026-09-16', seed: 1 });   // Chillicothe: on the sheet since the 9/23 cleanup
    expect(s.report.sent['2026-1388']).toMatchObject({ d: '2026-08-21', seed: 1 });   // seeded with the sheet's wrong date, so it lists as a fix
    expect(s.report.sent['2026-3142']).toBeUndefined();                               // Gap 1211 is on neither tab
    expect(s.report.sent['2026-7106']).toBeUndefined();
    // Topeka (shot yesterday) + Gap 1211 + the eight dates the sheet has wrong + the stops the sheet holds with no date
    const n = await page.evaluate(() => (window as any).datesToReport().length);
    expect(n).toBeGreaterThanOrEqual(12);
    await expect(page.locator('#s-app .badge', { hasText: 'invoice # new' })).toHaveCount(0);
    await expect(page.locator('#s-app .badge', { hasText: 'sheet has 08/21' })).toHaveCount(2);
    await expect(page.locator('#s-app .badge', { hasText: 'sheet has 09/10' })).toHaveCount(0);   // the Manhattan / Salina run was 9/10 — book and sheet agree now
    for (const id of ['2026-3142', '2026-4479', '2026-4522'])   // Gap (on neither tab), Lansing (no date on Master), Osage City (shot 9/24)
      await expect(page.locator('#s-app .idsrow', { hasText: id }).locator('.badge', { hasText: 'new' })).toHaveCount(1);

    await page.locator('#datesSent').click();
    await expect(row).toHaveCount(0);
    s = await saved(page);
    expect(s.report.sent[TOPEKA]).toMatchObject({ d: y });

    await page.locator('.toast button').click();   // Undo
    await expect(row).toContainText(mdy(y));
    s = await saved(page);
    expect(s.report.sent[TOPEKA].d).toBe('');       // a tombstone, not a deletion — a crew merge cannot resurrect the old entry

    // a reload keeps the seed flag, so the seed does not run again and the tombstone stands
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#s-app')).toBeVisible();
    s = await saved(page);
    expect(s.report.seeded).toBe('0928');
    expect(s.report.sent[TOPEKA].d).toBe('');
    expect(await page.evaluate(() => (window as any).datesToReport().length)).toBe(n);
  });

  test('crew merge: a lock is kept, the later unlock wins, a stale build\'s future lock is converted', async ({ page }) => {
    await open(page, state());
    const r = await page.evaluate(([tm, osage, td]) => {
      const clone = () => JSON.parse(JSON.stringify((window as any).eval('S.days[0]')));
      const G: any = window;
      const out: any = {};
      // a) this device locked at t=200; the crew copy has an older unlock at t=100 → the lock stays
      G.eval('S.days[0].locked={at:200,by:"tim"}; S.days[0].unlocked=null');
      G.mergeShared({ days: [Object.assign(clone(), { id: 'x', locked: null, unlocked: { at: 100, by: 'gabe' } })] });
      out.a = !!G.eval('S.days[0].locked');
      // b) this device locked at t=100; the crew copy unlocked at t=300 → the unlock wins
      G.eval('S.days[0].locked={at:100,by:"tim"}; S.days[0].unlocked=null');
      G.mergeShared({ days: [Object.assign(clone(), { id: 'x', locked: null, unlocked: { at: 300, by: 'gabe' } })] });
      out.b = !!G.eval('S.days[0].locked');
      // c) a phone on the old build hands back a lock dated tomorrow, stamped today → converted again
      G.eval('S.days[0].locked=null; S.days[0].unlocked=null');
      G.mergeShared({ days: [clone()], locks: { [osage]: { d: tm, pts: 100, by: 'gabe', with: '', at: Date.now() } } });
      out.c = { lockGone: !G.eval('S.locks["' + osage + '"]'), planLocked: !!G.eval('S.days[0].locked') };
      // d) this device shot it for real today (t=500); the crew copy still carries the old build's future
      //    lock, stamped EARLIER (t=400) — the real shot wins, and nothing gets converted away
      G.eval('S.days[0].locked=null; S.days[0].unlocked=null; S.locks={"' + osage + '":{d:"' + td + '",pts:100,by:"tim",with:"",at:500,sd:"' + td + '"}}; S.status["' + osage + '"]="captured"');
      G.mergeShared({ days: [clone()], locks: { [osage]: { d: tm, pts: 100, by: 'gabe', with: '', at: 400 } } });
      const isShot = () => G.eval('shot("' + osage + '")');
      out.d = { d: G.eval('S.locks["' + osage + '"]&&S.locks["' + osage + '"].d'), shot: isShot() };
      // e) the other phone un-shot it AFTER this one shot it → the un-shot wins, points come off the board
      G.mergeShared({ days: [clone()], locks: { [osage]: { d: td, pts: 100, by: 'tim', with: '', at: 500, sd: td } }, status: { [osage]: 'captured' }, unshot: { [osage]: { at: 600, by: 'gabe' } } });
      out.e = { lockGone: !G.eval('S.locks["' + osage + '"]'), shot: isShot(), status: G.eval('S.status["' + osage + '"]') };
      // f) …and a re-shot stamped after the tombstone beats it
      G.eval('S.locks["' + osage + '"]={d:"' + td + '",pts:100,by:"tim",with:"",at:700,sd:"' + td + '"}');
      G.mergeShared({ days: [clone()], locks: {}, status: {}, unshot: { [osage]: { at: 600, by: 'gabe' } } });
      out.f = isShot();
      return out;
    }, [tomorrow(), TOPEKA, today()] as const);
    expect(r.a).toBe(true);
    expect(r.b).toBe(false);
    expect(r.c).toEqual({ lockGone: true, planLocked: true });
    expect(r.d).toEqual({ d: today(), shot: true });
    expect(r.e).toEqual({ lockGone: true, shot: false, status: undefined });
    expect(r.f).toBe(true);
  });

  test('un-shot on one phone survives a pull on the other', async ({ page }) => {
    const t = today(), AT = Date.now() - 60_000;   // stamped a minute ago — "09:00 today" is in the future on an early CI run
    await open(page, state({
      days: [day({ date: t, ids: [TOPEKA] })], activeDate: t,
      locks: { [TOPEKA]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } },
      status: { [TOPEKA]: 'captured' }, by: { [TOPEKA]: 'tim' },
    }));
    // this phone un-shoots: a tombstone is written, and it rides the crew sync
    await page.locator('#stops [data-shot="' + TOPEKA + '"]').click();
    const s = await saved(page);
    expect(s.locks[TOPEKA]).toBeUndefined();
    expect(s.unshot[TOPEKA].at).toBeGreaterThan(AT);
    // the crew copy still holds the lock (pushed before the un-shot) → the pull does NOT bring it back
    const back = await page.evaluate(([id, at, d]) => {
      const G: any = window;
      G.mergeShared({ locks: { [id]: { d, pts: 100, by: 'tim', with: '', at, sd: d } }, status: { [id]: 'captured' }, by: { [id]: 'tim' }, unshot: {} });
      return { lock: !!G.eval('S.locks["' + id + '"]'), shot: G.eval('shot("' + id + '")') };
    }, [TOPEKA, AT, t] as const);
    expect(back).toEqual({ lock: false, shot: false });
  });

  test('the Manhattan / Salina run moves to 9/10 on a phone that has the 9/9 frozen day', async ({ page }) => {
    // what the 9/26 past-runs migration left on Tim's phone: a locked 9/9 day with its own stamp
    const nine = { ...day({ id: 'dMan', date: '2026-09-09', ids: ['2026-0000', '2026-0938', '2026-1896', '2026-6911'], crew: 'gabe' }),
      locked: { at: Date.parse('2026-09-09T23:00:00Z'), by: 'tim' }, logMi: 448 };
    await open(page, state({ days: [nine, day()], active: 1, activeDate: tomorrow() }));
    const s = await saved(page);
    const run = s.days.filter((d: any) => d.date === '2026-09-09' || d.date === '2026-09-10');
    expect(run).toHaveLength(1);
    expect(run[0]).toMatchObject({ date: '2026-09-10', crew: 'gabe', logMi: 448 });
    expect(run[0].ids).toContain('2026-8093');   // Salina's Victra rode that run too
    expect(s.mig.manhattan0910).toBe(1);
  });

  test('Score: the Verizon running total adds up, and moves when a stop is shot', async ({ page }) => {
    const y = yesterday();
    await open(page, state({ days: [day({ date: y, ids: [TOPEKA] })], activeDate: y, nav: 'board' }), '#s-board');
    await noSidewaysScroll(page, 'Score tab');
    await expect(page.locator('#vzTotal')).toBeVisible();
    const read = async () => ({
      done: +(await page.locator('#vzDone').innerText()),
      all: +(await page.locator('#vzAll').innerText()),
      left: +(await page.locator('#vzLeft').innerText()),
      hold: (await page.locator('#vzHold').count()) ? +(await page.locator('#vzHold').innerText()) : 0,
    });
    const before = await read();
    // every Verizon-channel stop on the board, counted from the app's own data
    const total = await page.evaluate(() => (window as any).eval("J.filter(j=>!j.wp&&j.ch==='Verizon'&&j.st!=='Removed').length"));
    expect(before.all).toBe(total);
    expect(before.all).toBeGreaterThan(100);
    expect(before.done + before.left + before.hold).toBe(before.all);   // the three always add up
    // shooting one Verizon stop moves exactly one from left to done
    await page.evaluate(id => { const w = window as any; w.markShot(id, true); w.render(); }, TOPEKA);
    const after = await read();
    expect(after.all).toBe(before.all);
    expect(after.done).toBe(before.done + 1);
    expect(after.left).toBe(before.left - 1);
    await expect(page.locator('#vzTotal .vzpie')).toHaveAttribute('aria-label', new RegExp(after.done + ' of ' + after.all));
    // the pie is the ninja under a fog: the "left" cover is there while stops remain, with the red count on it
    await expect(page.locator('#vzTotal .vzpie image')).toHaveCount(1);
    await expect(page.locator('#vzTotal .vzpie [data-cover="left"]')).toHaveCount(1);
    await expect(page.locator('#vzTotal .vzpie text')).toContainText(String(after.left));
  });

  test('Plan starts from today: past days, finished trips and stale route names are gone, and a stop left on a past day is back in the pool', async ({ page }) => {
    await open(page, state({
      days: [day({ id: 'dPast', date: yesterday(), ids: [TOPEKA] }), day({ id: 'dNow', date: today(), ids: [MARYSVILLE] })],
      active: 1, activeDate: today(),
      binds: [{ id: '2026-09-25:06:00:W/Cody', date: '2026-09-25', ids: [MARYSVILLE], stops: 1, shot: 0, pay: 100, net: 100, at: 1 }],
    }));
    await expect(page.locator('#s-plan .dchip[data-i]')).toHaveCount(1);                       // today only — yesterday is History's
    await expect(page.locator('#s-plan')).not.toContainText('Route bindings');
    await expect(page.locator('#s-plan')).not.toContainText('Route names');
    await expect(page.locator('#s-plan [data-run]', { hasText: 'Wichita' })).toHaveCount(0);     // a finished trip is not a run to load
    const r = await page.evaluate(([tp, ms]) => { const G: any = window;
      return {
        pool: G.eval('unscheduled().map(j=>j.id)').includes(tp),
        planned: G.eval('PLANNED("' + tp + '")'),
        map: G.eval('(()=>{const v=mapVisible(day()); return [BY["' + tp + '"],BY["' + ms + '"],BY["2026-4522"]].map(v)})()'),
      }; }, [TOPEKA, MARYSVILLE] as const);
    expect(r.pool).toBe(true);                    // Topeka was never shot yesterday — it is back to be picked
    expect(r.planned).toBe(false);
    expect(r.map).toEqual([true, true, false]);   // Topeka to pick, Marysville on the day, Osage City shot 9/24 — not on the map
  });

  test('Today: the day in drive order with SHOT; GO LIVE writes the journal and marks sent only on a yes', async ({ page }) => {
    const t = today(), AT = Date.now() - 3600_000;
    const posted: any[] = [];
    // the crew copy and the journal, stubbed: an empty crew copy, and a journal that says yes
    await page.route('**/api/state', r => r.request().method() === 'GET'
      ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 0, updatedAt: 0, state: null }) })
      : r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 1, updatedAt: Date.now() }) }));
    await page.route('**/api/journal', r => { posted.push(JSON.parse(r.request().postData() || '{}'));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, n: posted.length, at: Date.now() }) }); });
    await open(page, state({
      days: [day({ date: t, ids: [TOPEKA, MARYSVILLE], locked: { at: 1, by: 'tim' } })], activeDate: t,
      locks: { [TOPEKA]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } }, status: { [TOPEKA]: 'captured' }, by: { [TOPEKA]: 'tim' },
      sync: { key: 'test-crew-key-0925', v: 0, at: 0 },
      nav: 'now',                                            // an old build's tab lands on Today
    }), '#s-today');
    await noSidewaysScroll(page, 'Today tab');
    await expect(page.locator('#nav button[data-s="run"]')).toHaveCount(0);
    await expect(page.locator('#s-today .runrow')).toHaveCount(2);
    await expect(page.locator('#s-today .runrow.done')).toHaveCount(1);
    await expect(page.locator('#s-today .runrow').first()).toContainText('Marysville');   // the live stop leads, the shot one sinks
    await expect(page.locator('#s-today [data-shot="' + MARYSVILLE + '"]')).toBeVisible();
    await expect(page.locator('#crewChip')).toContainText('Crew ✓');
    // GO LIVE: Osage City shot, Emporia carried — the journal gets the day, the email is confirmed, the date is marked sent
    await page.locator('#tGoLive').click();
    await expect(page.locator('.sheet #glGo')).toBeVisible();
    await expect(page.locator('.sheet input[name="gl-' + MARYSVILLE + '"][value="carry"]')).toBeChecked();
    page.once('dialog', d => d.accept());
    await page.locator('.sheet #glGo').click();
    await expect(page.locator('#s-today .golivecard')).toContainText('email ✓ sent');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ date: t, carried: [MARYSVILLE], skipped: [] });
    expect(posted[0].shot.map((x: any) => x.id)).toEqual([TOPEKA]);
    let s = await saved(page);
    expect(s.nav).toBe('today');
    expect(s.published[t]).toMatchObject({ shot: [TOPEKA], carried: [MARYSVILLE], email: 'sent', n: 1 });
    expect(s.report.sent[TOPEKA]).toMatchObject({ d: t });
    // the server refuses → nothing re-published, the first receipt stands, nothing else marked sent
    await page.unroute('**/api/journal');
    await page.route('**/api/journal', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"no-store"}' }));
    await page.locator('#tGoLive').click();
    await page.locator('.sheet input[name="gl-' + MARYSVILLE + '"][value="skip"]').check();
    await page.locator('.sheet #glGo').click();
    await expect(page.locator('.sheet #glStatus')).toContainText('nothing published');
    s = await saved(page);
    expect(s.published[t].skipped).toEqual([]);
  });
});
