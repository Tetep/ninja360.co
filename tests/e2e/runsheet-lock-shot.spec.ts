import { test, expect, Page } from '@playwright/test';

// The run sheet (public/verizon.html — ninja360.org). Two acts that used to be one button:
//   LOCK PLAN  commits a day's date and stop list. Stops become PLANNED; nothing is banked and
//              the drive/clock math stays live.
//   SHOT       a stop is done. It banks the points, leaves the live route, and is dated by the
//              day it sits on — or by today, after a confirm, if that day has not come yet.
// The saved state is seeded straight into localStorage, the way the app itself writes it.

const LSKEY = 'ninja360-runsheet-v2';
const ROUTE = '/verizon.html';
// The three fixture stops follow the book in verizon.html (the DATA line). Topeka, Marysville and Salina,
// the September fixtures, were shot and invoiced 10/13 — there is nothing left to plan or go back to on them.
// (Stockton, MO was the first fixture until 11/9, when it was shot and taken off the run sheet with the weekend's stops; Bolivar
// takes its place — the same MO-13 run, Open, no onsite date.)
const BOLIVAR = '2026-7587';    // Cellular Sales 108862 — Bolivar, MO (Open, no onsite date, not loaded in IDS Capture)
const BUFFALO = '2026-6607';    // Russell 102763 — Buffalo, MO (Open, not loaded — the same MO-13 run as Bolivar)
const PARKCITY = '2026-8317';   // Victra 138836 — Park City, KS (Return Owed: shot 9/20, INV-000083, one item owed — the VDS video)

const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const mdy = (s: string) => s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4);
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const today = () => shift(0);
const tomorrow = () => shift(1);
const yesterday = () => shift(-1);
// "Thursday 9/24" — the way the IDS email names a day
const dayLabel = (s: string) => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('en-US', { weekday: 'long' }) + ' ' + (d.getMonth() + 1) + '/' + d.getDate(); };

const day = (over: Record<string, unknown> = {}) => ({
  id: 'dtest', date: tomorrow(), startKey: 'home', startTime: 8, endKey: 'home', ids: [BOLIVAR, BUFFALO],
  startCharge: 100, crew: null, pace: 'split', ...over,
});

// Every one-time migration the app knows today (migrate() in verizon.html), marked applied: a flag the app
// looks for and does not find makes it rewrite the seeded plan — run1020 alone would clear every lock on the
// MO-13 stops. A test that wants one of them to run leaves that flag out.
const MIG = {
  cameron0915: 1, lincoln0925: 1, notshot98172: 1, shoot98172: 1, notsun98172: 1, notshot4049: 1,
  plan1007: 1, vehicle1007: 1, run1008: 1, run1013: 1, run1016: 1, run1020: 1,
  pastruns0926: 12, logmi0926: 1, logmi1006: 1, manhattan0910: 1, manhattan0909: 1, planlock0923: 1, sheetdates1003: 1, sync1021: 1, stl1027: 1, stl1029: 2,
  newton1107: 1, ovn1106: 1,
};
const migBut = (...skip: string[]) => Object.fromEntries(Object.entries(MIG).filter(([k]) => !skip.includes(k)));

function state(extra: Record<string, unknown> = {}) {
  return {
    days: [day()],
    active: 0, activeDate: tomorrow(),
    sv: {}, loaded: {}, status: {}, notes: {}, timers: {}, punch: {}, locks: {}, showBanked: false,
    here: { key: 'home', time: 8 }, nav: 'plan', custom: [], places: {}, lastRequest: null, evRange: 260, chargeAt: {},
    who: 'tim', by: {}, oath: { who: 'tim', at: 1 },           // signed in and past the Philosophy gate
    idsSync: '2026-09-17', sync: { key: '', v: 0, at: 0 }, geo: {},
    mig: MIG,                                                   // every migration already applied — the plan is exactly what is seeded
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

async function open(page: Page, seed: Record<string, unknown>, tab = '#s-plan', route = ROUTE) {
  // the app geocodes rows, loads tiles and chargers, and fetches fonts on start: none of it is under test,
  // and any of it can re-render the page mid-click
  await page.route(/nominatim\.openstreetmap\.org|tile\.openstreetmap\.org|api\.openchargemap\.io|fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // seed once: a reload must find what the app saved, not the seed again
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [LSKEY, seed] as const);
  const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
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
    await expect.poll(() => milesOnPlan(page)).toBeGreaterThan(0);   // the strip paints its miles a beat after the page
    const milesBefore = await milesOnPlan(page);
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
    expect(asked).toContain('Cellular Sales 108862');   // it names the store, not just the city
    await expect(page.locator('#stops .stop.done')).toHaveCount(1);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(1);
    expect(await shotCount(page)).toBe(shotBefore + 1);
    let s = await saved(page);
    expect(Object.keys(s.locks)).toHaveLength(1);
    expect(s.locks[BOLIVAR].d).toBe(today());
    expect(s.days[0].locked).toBeTruthy();

    // the IDS tab now has one onsite date to report, and the email says so — under the day it was shot
    await page.locator('#nav button[data-s="app"]').click();
    await expect(page.locator('#s-app')).toBeVisible();
    await noSidewaysScroll(page, 'IDS tab');
    await expect(page.locator('#s-app .idsrow', { hasText: BOLIVAR })).toContainText(mdy(today()));
    const msg = await page.locator('#idsMsg').innerText(), lines = msg.split('\n');
    expect(msg).toContain('COMPLETED — ' + dayLabel(today()).toUpperCase());
    expect(lines.find(l => l.includes('(Loc ' + BOLIVAR + ')'))).toBeTruthy();       // the shot stop is reported…
    expect(lines.find(l => l.startsWith(BOLIVAR))).toBeUndefined();                  // …not asked for
    expect(msg).toContain('PLEASE LOAD IN IDS CAPTURE');
    expect(lines.find(l => l.startsWith(BUFFALO))).toContain('Buffalo');             // the unshot one is asked for, under its day
    expect(msg).toContain('Tim Petet');

    // undo puts back exactly what was there — no confirm, no re-dating
    await page.locator('#nav button[data-s="plan"]').click();
    await page.locator('#stops [data-shot]', { hasText: 'undo' }).click();
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    expect(await shotCount(page)).toBe(shotBefore);
    await page.locator('.toast button').click();   // Undo the undo: back to shot, dated today — not the planned day
    await expect(page.locator('#stops .stop.done')).toHaveCount(1);
    s = await saved(page);
    expect(s.locks[BOLIVAR].d).toBe(today());
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
      locks: { [BOLIVAR]: { d: tomorrow(), pts: 100, by: 'tim', with: '', at: AT } },
      status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'tim' },
      mig: migBut('planlock0923'),   // everything but planlock0923 — that one must run
    }));
    await expect(page.locator('.toast')).toContainText('now PLANNED');   // first thing after load — the toast is short-lived
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(2);
    await expect(page.locator('#stops [data-shot]', { hasText: 'undo' })).toHaveCount(0);
    const s = await saved(page);
    expect(s.locks[BOLIVAR]).toBeUndefined();
    expect(s.status[BOLIVAR]).toBeUndefined();
    expect(s.by[BOLIVAR]).toBeUndefined();
    expect(s.days[0].locked).toMatchObject({ at: AT, by: 'tim' });   // the plan lock carries the old lock's stamp
    expect(s.mig.planlock0923).toBe(1);
  });

  test('a real shot from yesterday stays a shot', async ({ page }) => {
    const AT = new Date(yesterday() + 'T15:00:00').getTime();
    await open(page, state({
      days: [day({ date: yesterday(), ids: [BOLIVAR] })], activeDate: yesterday(),
      locks: { [BOLIVAR]: { d: yesterday(), pts: 100, by: 'tim', with: '', at: AT } },
      status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'tim' },
    }));
    // yesterday is History's now — off the Plan rail — and the shot is still a shot, not turned into a plan lock
    await expect(page.locator('#s-plan .dchip[data-i]')).toHaveCount(1);   // the fresh day Plan opened on, not yesterday
    const s0 = await saved(page);
    expect(s0.locks[BOLIVAR].d).toBe(yesterday());
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
      days: [day({ date: t, ids: [BOLIVAR, BUFFALO, PARKCITY] })], activeDate: t,
      locks: { [BOLIVAR]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } },
      status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'tim' },
    }));
    // a shot stop that is NOT at the bottom of the list (a stop added after it, a list cleared…)
    await page.evaluate(ids => { const w = window as any; w.eval('S.days[0].ids=' + JSON.stringify(ids)); w.render(); }, [BOLIVAR, BUFFALO, PARKCITY]);
    await page.locator('#stops [data-dn="' + BUFFALO + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([PARKCITY, BUFFALO, BOLIVAR]);
    await page.locator('#stops [data-up="' + BUFFALO + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([BUFFALO, PARKCITY, BOLIVAR]);
    // the shot row cannot be moved up into the live ones, and the last live row cannot be moved under it
    await expect(page.locator('#stops [data-up="' + BOLIVAR + '"]')).toBeDisabled();
    await expect(page.locator('#stops [data-dn="' + PARKCITY + '"]')).toBeDisabled();
    // SHOT sinks Buffalo under the live stops; Undo brings it back to the top, not to "after Park City"
    await page.locator('#stops [data-shot="' + BUFFALO + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([PARKCITY, BUFFALO, BOLIVAR]);
    await page.locator('.toast button').click();
    expect((await saved(page)).days[0].ids).toEqual([BUFFALO, PARKCITY, BOLIVAR]);
    expect((await saved(page)).locks[BUFFALO]).toBeUndefined();
  });

  test('a locked plan cannot be edited through the back doors', async ({ page }) => {
    const B = shift(2);
    await open(page, state({
      days: [day({ id: 'dA', date: tomorrow(), ids: [BOLIVAR] }), day({ id: 'dB', date: B, ids: [BUFFALO], locked: { at: 1, by: 'tim' } })],
    }));
    await page.locator('#stops [data-mv]').first().click();        // move Bolivar onto the locked day
    await page.locator('.sheet [data-day="1"]').click();
    await expect(page.locator('.toast')).toContainText('locked');
    const s = await saved(page);
    expect(s.days.find((d: any) => d.date === B).ids).toEqual([BUFFALO]);
    expect(s.days.find((d: any) => d.date === tomorrow()).ids).toEqual([BOLIVAR]);
  });

  test('a go-back is shot only when its list is clear, and the revisit is dated', async ({ page }) => {
    await open(page, state({ days: [day({ date: today(), ids: [PARKCITY] })], activeDate: today() }));
    // list open: no SHOT button, a go-back list button instead — and no way round it from the Score table or the status dropdown
    await expect(page.locator('#stops [data-shot]')).toHaveCount(0);
    await expect(page.locator('#stops [data-note="' + PARKCITY + '"]').filter({ hasText: '1 left' })).toBeVisible();
    await page.locator('#nav button[data-s="board"]').click();
    await page.locator('#sbMoreWrap > summary').click();   // the list lives behind Score's "more" disclosure now
    await page.locator('#s-board [data-bf="returns"]').click();
    await expect(page.locator('#s-board [data-shot="' + PARKCITY + '"]')).toHaveCount(0);
    await expect(page.locator('#s-board [data-note="' + PARKCITY + '"]')).toBeVisible();
    expect(await page.evaluate(id => (window as any).markShot(id, true), PARKCITY)).toBe(false);
    expect((await saved(page)).locks[PARKCITY]).toBeUndefined();
    await page.locator('#nav button[data-s="plan"]').click();
    await page.locator('#stops [data-note="' + PARKCITY + '"]').filter({ hasText: '1 left' }).click();
    await expect(page.locator('.sheet #jsShot')).toHaveCount(0);
    await expect(page.locator('.sheet [data-pl]')).toHaveCount(1);   // the one thing owed: the VDS video
    await page.locator('.sheet [data-pl]').first().check();
    // the last box re-opens the sheet so MARK SHOT is there
    await expect(page.locator('.sheet #jsShot')).toBeVisible();
    await page.locator('.sheet #jsShot').click();
    const s = await saved(page);
    expect(s.locks[PARKCITY].d).toBe(today());
    // IDS keeps the first visit as the sheet's Onsite Date: 9/20, not the revisit — so nothing "completed" today
    await page.locator('#nav button[data-s="app"]').click();
    const msg = await page.locator('#idsMsg').innerText();
    expect(msg).not.toContain('COMPLETED — ' + dayLabel(today()).toUpperCase());
    const goBacks = (msg.split('GO-BACKS')[1] || '').split('\n\n')[0];
    expect(goBacks).not.toContain(PARKCITY);   // and the list is cleared, so Park City is no longer under GO-BACKS either
  });

  test('IDS tab: dates to report shrink when sent, come back on undo, and survive a merge', async ({ page }) => {
    const y = yesterday(), AT = new Date(y + 'T15:00:00').getTime();
    await open(page, state({
      days: [day({ date: y, ids: [BOLIVAR] })], activeDate: y,
      locks: { [BOLIVAR]: { d: y, pts: 100, by: 'tim', with: '', at: AT } },
      status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'tim' },
      nav: 'app', mig: migBut('sheetdates1003'),   // the 10/3 sheet-dates fix runs on top of the seed, as on a fresh device
    }), '#s-app');
    await noSidewaysScroll(page, 'IDS tab');
    const row = page.locator('#s-app .idsrow', { hasText: BOLIVAR });
    await expect(row).toContainText(mdy(y));
    // the first-run seed: everything on the sheet at the 9/24 read is "sent" — date AND invoice, stamped before
    // any real send — and what it is missing or has wrong is not, so that is what the list opens at, plus Bolivar
    let s = await saved(page);
    expect(s.report.seeded).toBe('0928');
    expect(s.report.sent['2026-0000']).toMatchObject({ d: '2026-09-10', seed: 1, at: 0 });   // Target 1821 Manhattan: the sheet's 9/10, over the book's 9/9
    expect(typeof s.report.sent['2026-0000'].inv).toBe('string');
    expect(s.report.sent['2026-5178']).toMatchObject({ d: '2026-09-16', seed: 1 });   // Chillicothe: on the sheet since the 9/23 cleanup
    expect(s.report.sent['2026-1388']).toMatchObject({ d: '2026-08-21', seed: 1 });   // seeded with the sheet's wrong date, so it lists as a fix
    expect(s.report.sent['2026-3142']).toBeUndefined();                               // Gap 1211 is on neither tab
    expect(s.report.sent['2026-7106']).toBeUndefined();
    // Bolivar (shot yesterday) + Gap 1211 + the dates the sheet has wrong + the undated Master rows + every stop shot since the 9/24 read
    const n = await page.evaluate(() => (window as any).datesToReport().length);
    expect(n).toBeGreaterThanOrEqual(12);
    await expect(page.locator('#s-app .badge', { hasText: 'invoice # new' })).toHaveCount(0);
    await expect(page.locator('#s-app .badge', { hasText: 'sheet has 08/21' })).toHaveCount(2);
    // the Manhattan / Salina run: the GPS log has it on Wed 9/9 (the book, since 10/3), the sheet still says 9/10 — five fixes to send
    await expect(page.locator('#s-app .badge', { hasText: 'sheet has 09/10' })).toHaveCount(5);
    await expect(page.locator('#s-app .idsrow', { hasText: PARKCITY }).locator('.badge', { hasText: 'sheet has 09/19' })).toHaveCount(1);   // Park City: shot 9/20, reported to IDS as 9/19
    for (const id of ['2026-3142', '2026-4479', '2026-4522'])   // Gap (on neither tab), Lansing (no date on Master), Osage City (shot 9/24)
      await expect(page.locator('#s-app .idsrow', { hasText: id }).locator('.badge', { hasText: 'new' })).toHaveCount(1);

    await page.locator('#datesSent').click();
    await expect(row).toHaveCount(0);
    s = await saved(page);
    expect(s.report.sent[BOLIVAR]).toMatchObject({ d: y });

    await page.locator('.toast button').click();   // Undo
    await expect(row).toContainText(mdy(y));
    s = await saved(page);
    expect(s.report.sent[BOLIVAR].d).toBe('');       // a tombstone, not a deletion — a crew merge cannot resurrect the old entry

    // a reload keeps the seed flag, so the seed does not run again and the tombstone stands
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#s-app')).toBeVisible();
    s = await saved(page);
    expect(s.report.seeded).toBe('0928');
    expect(s.report.sent[BOLIVAR].d).toBe('');
    expect(await page.evaluate(() => (window as any).datesToReport().length)).toBe(n);
  });

  test('crew merge: a lock is kept, the later unlock wins, a stale build\'s future lock is converted', async ({ page }) => {
    await open(page, state());
    const r = await page.evaluate(([tm, stop, td]) => {
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
      G.mergeShared({ days: [clone()], locks: { [stop]: { d: tm, pts: 100, by: 'gabe', with: '', at: Date.now() } } });
      out.c = { lockGone: !G.eval('S.locks["' + stop + '"]'), planLocked: !!G.eval('S.days[0].locked') };
      // d) this device shot it for real today (t=500); the crew copy still carries the old build's future
      //    lock, stamped EARLIER (t=400) — the real shot wins, and nothing gets converted away
      G.eval('S.days[0].locked=null; S.days[0].unlocked=null; S.locks={"' + stop + '":{d:"' + td + '",pts:100,by:"tim",with:"",at:500,sd:"' + td + '"}}; S.status["' + stop + '"]="captured"');
      G.mergeShared({ days: [clone()], locks: { [stop]: { d: tm, pts: 100, by: 'gabe', with: '', at: 400 } } });
      const isShot = () => G.eval('shot("' + stop + '")');
      out.d = { d: G.eval('S.locks["' + stop + '"]&&S.locks["' + stop + '"].d'), shot: isShot() };
      // e) the other phone un-shot it AFTER this one shot it → the un-shot wins, points come off the board
      G.mergeShared({ days: [clone()], locks: { [stop]: { d: td, pts: 100, by: 'tim', with: '', at: 500, sd: td } }, status: { [stop]: 'captured' }, unshot: { [stop]: { at: 600, by: 'gabe' } } });
      out.e = { lockGone: !G.eval('S.locks["' + stop + '"]'), shot: isShot(), status: G.eval('S.status["' + stop + '"]') };
      // f) …and a re-shot stamped after the tombstone beats it
      G.eval('S.locks["' + stop + '"]={d:"' + td + '",pts:100,by:"tim",with:"",at:700,sd:"' + td + '"}');
      G.mergeShared({ days: [clone()], locks: {}, status: {}, unshot: { [stop]: { at: 600, by: 'gabe' } } });
      out.f = isShot();
      return out;
    }, [tomorrow(), BOLIVAR, today()] as const);
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
      days: [day({ date: t, ids: [BOLIVAR] })], activeDate: t,
      locks: { [BOLIVAR]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } },
      status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'tim' },
    }));
    // this phone un-shoots: a tombstone is written, and it rides the crew sync
    await page.locator('#stops [data-shot="' + BOLIVAR + '"]').click();
    const s = await saved(page);
    expect(s.locks[BOLIVAR]).toBeUndefined();
    expect(s.unshot[BOLIVAR].at).toBeGreaterThan(AT);
    // the crew copy still holds the lock (pushed before the un-shot) → the pull does NOT bring it back
    const back = await page.evaluate(([id, at, d]) => {
      const G: any = window;
      G.mergeShared({ locks: { [id]: { d, pts: 100, by: 'tim', with: '', at, sd: d } }, status: { [id]: 'captured' }, by: { [id]: 'tim' }, unshot: {} });
      return { lock: !!G.eval('S.locks["' + id + '"]'), shot: G.eval('shot("' + id + '")') };
    }, [BOLIVAR, AT, t] as const);
    expect(back).toEqual({ lock: false, shot: false });
  });

  test('the Manhattan / Salina run goes back to 9/9 on a phone that still has the 9/10 day', async ({ page }) => {
    // what the 9/28 migration left on Tim's phone: the run moved to 9/10 under its own stamp. Tim, 10/3: the GPS
    // log has it on Wed 9/9 — the log is the truth — so the 10/3 migration moves it back. (The sheet's 9/10 is
    // the date to fix, which is the IDS tab's job: the 'sheet has 09/10' badges above.)
    const MAN = ['2026-0000', '2026-0938', '2026-1896', '2026-6911', '2026-8093'];   // Target 1821, Verizon 99246, Victra 118415 in Manhattan; Verizon 99240, Victra 109861 in Salina
    const ten = { ...day({ id: 'dMan', date: '2026-09-10', ids: MAN, crew: 'gabe' }),
      locked: { at: Date.parse('2026-09-10T23:00:00Z'), by: 'tim' }, logMi: 448 };
    await open(page, state({ days: [ten, day()], active: 1, activeDate: tomorrow(), mig: migBut('manhattan0909') }));
    const s = await saved(page);
    const run = s.days.filter((d: any) => d.date === '2026-09-09' || d.date === '2026-09-10');
    expect(run).toHaveLength(1);
    expect(run[0]).toMatchObject({ date: '2026-09-09', crew: 'gabe', logMi: 448, locked: { at: Date.parse('2026-09-09T23:00:00Z'), by: 'tim' } });
    expect(run[0].ids).toEqual(expect.arrayContaining(MAN));   // every stop rode along, Salina's Victra included
    expect(s.mig.manhattan0909).toBe(1);
  });

  test('Score: the Verizon running total adds up, and moves when a stop is shot', async ({ page }) => {
    const y = yesterday();
    await open(page, state({ days: [day({ date: y, ids: [BOLIVAR] })], activeDate: y, nav: 'board' }), '#s-board');
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
    await page.evaluate(id => { const w = window as any; w.markShot(id, true); w.render(); }, BOLIVAR);
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
      days: [day({ id: 'dPast', date: yesterday(), ids: [BOLIVAR] }), day({ id: 'dNow', date: today(), ids: [BUFFALO] })],
      active: 1, activeDate: today(),
      binds: [{ id: '2026-09-25:06:00:W/Cody', date: '2026-09-25', ids: [BUFFALO], stops: 1, shot: 0, pay: 100, net: 100, at: 1 }],
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
      }; }, [BOLIVAR, BUFFALO] as const);
    expect(r.pool).toBe(true);                    // Bolivar was never shot yesterday — it is back to be picked
    expect(r.planned).toBe(false);
    expect(r.map).toEqual([true, true, false]);   // Bolivar to pick, Buffalo on the day, Osage City shot 9/24 — not on the map
  });

  test('Now: the clock, this device, and the stop in hand — the GPS says you are there, start, stop, complete, on to the next', async ({ page }) => {
    const t = today();
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 37.6054, longitude: -93.40684 });   // standing at Cellular Sales 108862, Bolivar (the book's lat/lon)
    await open(page, state({ days: [day({ date: t, ids: [BOLIVAR, BUFFALO], locked: { at: 1, by: 'tim' } })], activeDate: t, nav: 'today' }), '#s-today');
    const card = page.locator('#s-today .nowcard');
    await expect(card.locator('[data-clock]')).toHaveText(/\d{1,2}:\d{2}/);
    const dev = await page.evaluate(() => JSON.parse(localStorage.getItem('ninja360-device') || '{}'));
    expect(dev.id).toMatch(/^dev-/);
    await expect(page.locator('#devChip')).toContainText(dev.name);
    await expect(card).toContainText('At the stop');          // the GPS put him there — nothing to tap, nothing typed
    await expect(card).toContainText('You are here');
    await expect(card).toContainText('Bolivar');
    await page.locator('#nowStart').click();
    await expect(card).toContainText('Shooting');
    let s = await saved(page);
    expect(s.timers[BOLIVAR].startedAt).toBeTruthy();
    expect(s.checkin[BOLIVAR].dev).toBe(dev.id);
    await page.locator('#nowStop').click();
    await expect(card).toContainText('Shot — confirm');
    await page.locator('#nowDone').click();
    await expect(card).toContainText('Heading to');             // on to the next
    await expect(card).toContainText('2 of 2');
    await expect(card).toContainText('Buffalo');
    await expect(card).toContainText('mi away');
    s = await saved(page);
    expect(s.locks[BOLIVAR]).toMatchObject({ d: t, dev: dev.id });
    expect(s.timers[BOLIVAR].startedAt).toBeUndefined();
    expect(s.devices[dev.id]).toMatchObject({ name: dev.name });
    // one tap names the device, and it stays named
    await page.locator('#devChip').click();
    await page.locator('.sheet [data-devname="iPhone"]').click();
    await page.locator('.sheet #devSave').click();
    await expect(page.locator('#devChip')).toContainText('iPhone');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ninja360-device') || '{}').name)).toBe('iPhone');
  });

  test('Time check: a device clock minutes off says so on Now', async ({ page }) => {
    await page.route('**/verizon.html', r => r.request().method() === 'HEAD'
      ? r.fulfill({ status: 200, headers: { date: new Date(Date.now() - 10 * 60_000).toUTCString() }, body: '' })
      : r.continue());
    const t = today();
    await open(page, state({ days: [day({ date: t, ids: [BOLIVAR] })], activeDate: t, nav: 'today' }), '#s-today');
    await expect(page.locator('#s-today .nowcard')).toContainText('10 min fast');
  });

  test('GO LIVE waits for a date: an undated day says so instead of offering to publish', async ({ page }) => {
    await open(page, state({ days: [day({ date: '', ids: [BOLIVAR] })], activeDate: '', nav: 'today' }), '#s-today');
    await expect(page.locator('#tGoLive')).toHaveCount(0);
    await expect(page.locator('#s-today .golivecard')).toContainText('no date yet');
  });

  test('Today: the day in drive order with SHOT; GO LIVE writes the journal and marks sent only on a yes', async ({ page }) => {
    const t = today(), AT = Date.now() - 3600_000;
    const posted: any[] = [];
    // the crew copy and the journal, stubbed: an empty crew copy, and a journal that says yes
    await page.route('**/api/state', r => r.request().method() === 'GET'
      ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 0, updatedAt: 0, state: null }) })
      : r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 1, updatedAt: Date.now() }) }));
    await page.route('**/api/journal', r => { posted.push(JSON.parse(r.request().postData() || '{}'));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'x' + posted.length, at: Date.now() }) }); });
    await open(page, state({
      days: [day({ date: t, ids: [BOLIVAR, BUFFALO], locked: { at: 1, by: 'tim' } })], activeDate: t,
      locks: { [BOLIVAR]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } }, status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'tim' },
      sync: { key: 'test-crew-key-0925', v: 0, at: 0 },
      nav: 'now',                                            // an old build's tab lands on Today
    }), '#s-today');
    await noSidewaysScroll(page, 'Today tab');
    await expect(page.locator('#nav button[data-s="run"]')).toHaveCount(0);
    await expect(page.locator('#s-today .runrow')).toHaveCount(2);
    await expect(page.locator('#s-today .runrow.done')).toHaveCount(1);
    await expect(page.locator('#s-today .runrow').first()).toContainText('Buffalo');   // the live stop leads, the shot one sinks
    await expect(page.locator('#s-today [data-shot="' + BUFFALO + '"]')).toBeVisible();
    await expect(page.locator('#crewChip')).toContainText('Crew ✓');
    // GO LIVE: Bolivar shot, Buffalo carried — the journal gets the day, the email is confirmed, the date is marked sent
    await page.locator('#tGoLive').click();
    await expect(page.locator('.sheet #glGo')).toBeVisible();
    await expect(page.locator('.sheet input[name="gl-' + BUFFALO + '"][value="carry"]')).toBeChecked();
    page.once('dialog', d => d.accept());
    await page.locator('.sheet #glGo').click();
    await expect(page.locator('#s-today .golivecard')).toContainText('email ✓ sent');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ date: t, carried: [BUFFALO], skipped: [] });
    expect(posted[0].shot.map((x: any) => x.id)).toEqual([BOLIVAR]);
    let s = await saved(page);
    expect(s.nav).toBe('today');
    expect(s.published[t]).toMatchObject({ shot: [BOLIVAR], carried: [BUFFALO], email: 'sent', entry: 'x1' });
    expect(s.report.sent[BOLIVAR]).toMatchObject({ d: t });
    // the server refuses → nothing re-published, the first receipt stands, nothing else marked sent
    await page.unroute('**/api/journal');
    await page.route('**/api/journal', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"no-store"}' }));
    await page.locator('#tGoLive').click();
    await page.locator('.sheet input[name="gl-' + BUFFALO + '"][value="skip"]').check();
    await page.locator('.sheet #glGo').click();
    await expect(page.locator('.sheet #glStatus')).toContainText('nothing published');
    s = await saved(page);
    expect(s.published[t].skipped).toEqual([]);
  });

  test('sign-in offers only Tim and Cody; the rest of the crew stays in the book', async ({ page }) => {
    // Tim, 11/7: "everyone but me and Brandon". CREW still holds Gabe, Pavan and Erik — History, Score and the
    // crew-mate picker name them on old runs — but nobody can sign in as them, by tap or by an Access name-match.
    await open(page, state());
    await page.locator('#whoChip').click();
    const names = page.locator('.sheet .shbtn.who');
    await expect(names).toHaveCount(2);
    await expect(names.nth(0)).toContainText('Tim Petet');
    await expect(names.nth(1)).toContainText('Cody Petet');
    const offered = await page.evaluate(() => (window as any).eval('signable().map(x=>x[0])'));
    expect(offered).toEqual(['tim', 'cody']);
    const matched = await page.evaluate(() => {
      const w = window as any;
      return [w.matchCrew('', 'Gabriel Miller'), w.matchCrew('', 'Pavan Ganta'), w.matchCrew('', 'Erik Juergensen'), w.matchCrew('', 'Cody Petet'), w.matchCrew('', 'Tim Petet')];
    });
    expect(matched).toEqual([null, null, null, 'cody', 'tim']);
    const kept = await page.evaluate(() => Object.keys((window as any).eval('CREW')));
    expect(kept).toEqual(['tim', 'gabe', 'cody', 'pavan', 'erik']);
  });

  test('a link made for Cody signs a fresh phone in as Cody, and never overrides a phone that already has somebody', async ({ page, browser }) => {
    // fresh phone (nobody asked yet) opened from Cody's link
    await open(page, state({ who: null, oath: null }), '#s-plan', ROUTE + '?who=cody');
    await expect(page.locator('#whoChip img')).toHaveAttribute('alt', 'Cody');
    expect((await saved(page)).who).toBe('cody');
    // ?who= for somebody the sign-in no longer offers is ignored: a fresh phone starts as Tim
    const p2 = await (await browser.newContext()).newPage();
    await open(p2, state({ who: null, oath: null }), '#s-plan', ROUTE + '?who=gabe');
    expect((await saved(p2)).who).toBe('tim');
    // a phone that is already Tim stays Tim when it opens Cody's link
    const p3 = await (await browser.newContext()).newPage();
    await open(p3, state(), '#s-plan', ROUTE + '?who=cody');
    expect((await saved(p3)).who).toBe('tim');
  });

  test('crew sync: each person gets their own link, ?who= before the # and the key after it', async ({ page }) => {
    await open(page, state({ sync: { key: 'test-crew-key-0925', v: 0, at: 0 }, nav: 'now' }), '#s-today');
    await page.locator('#crewChip').click();
    const cody = page.locator('.sheet #liveLink-cody'), tim = page.locator('.sheet #liveLink-tim');
    await expect(cody).toHaveText(/\/verizon\.html\?who=cody#crew=test-crew-key-0925$/);
    await expect(tim).toHaveText(/\/verizon\.html\?who=tim#crew=test-crew-key-0925$/);
    // the other person's link leads (it is the one you send); your own follows
    await expect(page.locator('.sheet .lab').filter({ hasText: /link$/ })).toHaveText(['Cody’s link', 'Your link']);
    await expect(page.locator('.sheet [data-lcopy="cody"]')).toHaveClass(/prim/);
    await expect(page.locator('.sheet [data-lcopy="tim"]')).toHaveClass(/ghost/);
  });

  // Sign out: the end of the day from the phone in the field — where, miles, room — to the journal, with a text to Tim as the second channel.
  const codyDay = (t: string, AT: number) => state({
    who: 'cody', oath: { who: 'cody', at: 1 }, nav: 'today', activeDate: t,
    sync: { key: 'test-crew-key-0925', v: 0, at: 0 },
    report: { to: '', cc: '', sms: '+1 (555) 010-2030', sent: {} },
    days: [day({ date: t, ids: [BOLIVAR, BUFFALO], driver: 'cody', vehicle: 'own', locked: { at: 1, by: 'tim' } })],
    locks: { [BOLIVAR]: { d: t, pts: 100, by: 'cody', with: '', at: AT, sd: t } }, status: { [BOLIVAR]: 'captured' }, by: { [BOLIVAR]: 'cody' },
  });
  const stubCrewCopy = (page: Page) => page.route('**/api/state', r => r.request().method() === 'GET'
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 0, updatedAt: 0, state: null }) })
    : r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 1, updatedAt: Date.now() }) }));

  test('sign out: location, miles and room go to the journal, and the text to Tim opens already written', async ({ page }) => {
    const t = today(), AT = Date.now() - 3600_000, posted: any[] = [];
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 37.8175, longitude: -96.8829 });   // standing at Victra 118409, El Dorado, KS
    await stubCrewCopy(page);
    await page.route('**/api/journal', r => { posted.push(JSON.parse(r.request().postData() || '{}'));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'so1', at: Date.now() }) }); });
    await open(page, codyDay(t, AT), '#s-today');
    // Cody gets the one end-of-day button: no GO LIVE, no IDS email
    await expect(page.locator('#tGoLive')).toHaveCount(0);
    await page.locator('#tSignOut').click();
    await expect(page.locator('.sheet #soLoc')).toContainText('Near El Dorado, KS');
    await expect(page.locator('.sheet #soPlace')).toHaveValue('El Dorado, KS');
    expect(parseInt(await page.locator('.sheet #soMiles').inputValue(), 10)).toBeGreaterThan(50);   // worked out from the stop he shot
    await page.locator('.sheet [data-room="hotel"]').click();
    await page.locator('.sheet #soCost').fill('90');
    await page.locator('.sheet #soGo').click();
    await expect(page.locator('.sheet #soStatus')).toContainText('Saved to the crew journal');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: 'signout', by: 'cody', date: t, milesSrc: 'est',
      loc: { place: 'El Dorado, KS' }, room: { type: 'hotel', cost: 90, place: 'El Dorado, KS' }, carried: [], skipped: [] });
    expect(posted[0].loc.lat).toBeCloseTo(37.8175, 3);
    expect(posted[0].shot.map((x: any) => x.id)).toEqual([BOLIVAR]);
    expect(posted[0].cid).toMatch(/^so-[a-z0-9]+$/);
    // the second channel: a text to the saved number, already written
    const href = await page.locator('.sheet #soText').getAttribute('href');
    expect(href).toMatch(/^sms:\+15550102030\?&body=/);
    const body = decodeURIComponent(href!.split('&body=')[1]);
    expect(body).toContain('Cody signed out');
    expect(body).toContain('El Dorado, KS');
    expect(body).toContain('Hotel / motel $90');
    expect(body).toContain('1 shot in the app');
    await page.locator('.sheet #soClose').click();
    await expect(page.locator('#soCard')).toContainText('journal ✓');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ninja360-runsheet-outbox') || '[]'))).toEqual([]);
  });

  test('sign out: a journal that says no keeps the report on the phone, the text still works, and it goes out later', async ({ page }) => {
    const t = today(), AT = Date.now() - 3600_000, posted: any[] = []; let up = false;
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 37.8175, longitude: -96.8829 });
    await stubCrewCopy(page);
    await page.route('**/api/journal', r => up
      ? (posted.push(JSON.parse(r.request().postData() || '{}')), r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'so2', at: Date.now() }) }))
      : r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"no-store"}' }));
    await open(page, codyDay(t, AT), '#s-today');
    await page.locator('#tSignOut').click();
    await expect(page.locator('.sheet #soPlace')).toHaveValue('El Dorado, KS');
    await page.locator('.sheet #soMiles').fill('312');                       // typed: the odometer wins over the estimate
    await page.locator('.sheet #soGo').click();
    await expect(page.locator('.sheet #soStatus')).toContainText('journal refused');
    await expect(page.locator('.sheet #soStatus')).toContainText('Kept on this phone');
    await expect(page.locator('.sheet #soText')).toBeVisible();              // the backup channel is right there
    let box = await page.evaluate(() => JSON.parse(localStorage.getItem('ninja360-runsheet-outbox') || '[]'));
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({ kind: 'signout', miles: 312, milesSrc: 'typed' });
    await page.locator('.sheet #soClose').click();
    await expect(page.locator('#soCard')).toContainText('not sent yet');
    await expect(page.locator('#soCard')).toContainText('1 report waiting');
    // the journal comes back: the saved report goes out once, and the outbox empties
    up = true;
    expect(await page.evaluate(() => (window as any).flushOutbox())).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: 'signout', miles: 312, by: 'cody' });
    box = await page.evaluate(() => JSON.parse(localStorage.getItem('ninja360-runsheet-outbox') || '[]'));
    expect(box).toEqual([]);
    expect(await page.evaluate(() => (window as any).flushOutbox())).toBe(0);   // nothing left to send twice
  });

  test('Crew journal lists what the phones reported, and the text number rides the crew sync', async ({ page }) => {
    const t = today(), now = Date.now();
    await stubCrewCopy(page);
    await page.route('**/api/journal', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ n: 2, entries: [
      { kind: 'signout', by: 'cody', date: t, at: now - 60_000, miles: 312, milesSrc: 'est', shot: [{ id: BOLIVAR, at: 1, d: t }],
        loc: { lat: 37.8175, lon: -96.8829, acc: 30, place: 'El Dorado, KS' }, room: { type: 'hotel', cost: 90, place: 'El Dorado, KS' } },
      { kind: 'golive', by: 'tim', date: t, at: now - 3600_000, miles: 120, shot: [{ id: BOLIVAR, at: 1, d: t }, { id: BUFFALO, at: 1, d: t }] },
    ] }) }));
    await open(page, state({ sync: { key: 'test-crew-key-0925', v: 0, at: 0 }, nav: 'now' }), '#s-today');
    await page.locator('#crewChip').click();
    await page.locator('.sheet #liveSmsTo').fill('816 555 0100');
    await page.locator('.sheet #liveSmsSave').click();
    expect((await saved(page)).report.sms).toBe('816 555 0100');
    await page.evaluate(() => (window as any).closeSheet());
    await page.locator('#crewChip').click();
    await page.locator('.sheet #liveJournal').click();
    const rows = page.locator('.sheet #jrList .idsrow');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Cody');
    await expect(rows.nth(0)).toContainText('signed out');
    await expect(rows.nth(0)).toContainText('El Dorado, KS');
    await expect(rows.nth(0)).toContainText('312 mi (est.)');
    await expect(rows.nth(0)).toContainText('Hotel / motel $90');
    await expect(rows.nth(0).locator('a')).toHaveAttribute('href', /maps\.google\.com\/\?q=37\.8175,-96\.8829/);
    await expect(rows.nth(1)).toContainText('GO LIVE');
    await expect(rows.nth(1)).toContainText('2 shot');
  });

  // ── Tim, 11/7: the newer Cody badge, Newton tagged, and the overnight for the books ──────────────────────────────
  const ev = (page: Page, code: string) => page.evaluate(c => (window as any).eval(c), code);

  test('Cody’s badge is the newer one on the header chip, the who sheet and the banner, and the files load', async ({ page }) => {
    await open(page, state({ who: 'cody', oath: { who: 'cody', at: 1 } }));
    expect(await ev(page, '[CREW.cody.emblem, CREW.cody.badge, CREW.cody.banner].join("|")'))
      .toBe('/assets/crew/web/crew-cody-badge-96.webp|/assets/crew/web/crew-cody-badge-320.webp|/assets/crew/web/crew-cody-badge-320.webp');
    const chip = page.locator('#whoChip img');
    await expect(chip).toHaveAttribute('src', '/assets/crew/web/crew-cody-badge-96.webp');
    await expect.poll(() => chip.evaluate((i: HTMLImageElement) => i.complete ? i.naturalWidth : 0)).toBe(96);
    // the sheet that offers the badge at 320 — fetched for real, a webp with a clear background
    const res = await page.request.get('/assets/crew/web/crew-cody-badge-320.webp');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/webp');
  });

  const NEWTON = '2026-5976';   // Victra 118416 — Newton, KS

  test('Newton is tagged "Need to discuss with Tim" once, and its status and ledger do not move', async ({ page }) => {
    await open(page, state({ mig: migBut('newton1107'), notes: {} }));
    const note = () => ev(page, 'S.notes["' + NEWTON + '"]') as Promise<string>;
    expect(await note()).toContain('Need to discuss with Tim');
    expect(await note()).toContain('no 360');
    expect(await ev(page, 'S.mig.newton1107')).toBe(1);
    expect(await ev(page, 'JSON.stringify([S.status["' + NEWTON + '"]||null, S.locks["' + NEWTON + '"]||null])')).toBe('[null,null]');
    await page.reload();
    expect(((await note()).match(/Need to discuss with Tim/g) || []).length).toBe(1);
  });

  test('Newton: a note somebody already wrote on the stop stays, and the tag follows it', async ({ page }) => {
    await open(page, state({ mig: migBut('newton1107'), notes: { [NEWTON]: 'Gate code 4411' } }));
    const n = await ev(page, 'S.notes["' + NEWTON + '"]') as string;
    expect(n.startsWith('Gate code 4411 · Need to discuss with Tim')).toBe(true);
  });

  test('Cody’s Friday 11/6 overnight pays 150 and carries the receipt note; every other day stays at 125', async ({ page }) => {
    const fri = day({ id: 'dfri', date: '2026-11-06', driver: 'cody', vehicle: 'own', ids: [BOLIVAR], note: 'Kansas run.' });
    const thu = day({ id: 'dthu', date: '2026-11-05', driver: 'cody', vehicle: 'own', ids: [BUFFALO], note: 'Topeka.' });
    const timFri = day({ id: 'dtim', date: '2026-11-06', ids: [PARKCITY] });
    await open(page, state({ days: [thu, fri, timFri], mig: migBut('ovn1106') }));
    const d = (id: string) => 'S.days.find(x=>x.id==="' + id + '")';
    // the numbers: a table of Tim's rulings, so they hold with or without the day's note
    expect(JSON.parse(await ev(page, 'JSON.stringify([dayCosts(' + d('dfri') + ').crew, dayCosts(' + d('dthu') + ').crew, dayCosts(' + d('dtim') + ').crew])')))
      .toEqual([150, 125, 0]);
    // the words: Friday's day carries the ruling and the receipt, once; Thursday's note is untouched
    const note = () => ev(page, d('dfri') + '.note') as Promise<string>;
    expect((await note()).startsWith('Kansas run. · Overnight in El Dorado: the day pays 150 pts, not 125 (Tim, 11/7).')).toBe(true);
    expect(await note()).toContain('Motel receipt covered');
    expect(await note()).toContain('photo still owed');
    expect(await ev(page, d('dthu') + '.note')).toBe('Topeka.');
    expect(await ev(page, 'S.mig.ovn1106')).toBe(1);
    await page.reload();
    expect(((await note()).match(/Overnight in El Dorado/g) || []).length).toBe(1);
  });

  test('Cody’s overnight note waits for the day: no Friday on the phone sets no flag, and the 125 stands elsewhere', async ({ page }) => {
    await open(page, state({ days: [day({ id: 'dwed', date: '2026-11-04', driver: 'cody', vehicle: 'own', ids: [BUFFALO] })], mig: migBut('ovn1106') }));
    expect(await ev(page, '!!S.mig.ovn1106')).toBe(false);
    expect(await ev(page, 'dayCosts(S.days.find(x=>x.id==="dwed")).crew')).toBe(125);
  });

  // ── phone widths (Tim, 11/7: "check mobile responsiveness") ────────────────────────────────────────────────────
  // A phone that is handed a page wider than itself grows its layout viewport to fit, so clientWidth follows the overflow and
  // noSidewaysScroll() cannot see it: these compare the page against the width the phone really is.
  const TABS = ['today', 'plan', 'clusters', 'app', 'board', 'history', 'oct'];
  const showTab = (page: Page, tab: string) => page.evaluate(t => (document.querySelector('#nav button[data-s="' + t + '"]') as HTMLElement).click(), tab);

  test('phone widths: no tab scrolls sideways at 320, 360 or 390 px', async ({ page }) => {
    await open(page, state());
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const tab of TABS) {
        await showTab(page, tab);
        await page.waitForTimeout(200);
        const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
        expect(sw, tab + ' tab at ' + width + ' px must fit the screen').toBeLessThanOrEqual(width);
      }
    }
  });

  test('phone widths: the header keeps its title and its buttons apart, and stays readable in the light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, state());
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);
      const g = await page.evaluate(() => {
        const rect = (e: Element) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const text = (sel: string) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(sel)!); return rect(rg as unknown as Element); };
        const rgb = (getComputedStyle(document.querySelector('header .hrow')!).backgroundColor.match(/\d+/g) || ['255', '255', '255']).map(Number);
        return { words: [text('.hbrand h1'), text('.hbrand .sub')], btns: [...document.querySelectorAll('.hbtns button')].map(rect),
          lum: (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 };
      });
      const hit = g.btns.some(b => g.words.some(w => b.l < w.r && b.r > w.l && b.t < w.b && b.b > w.t));
      expect(hit, 'title or tagline under a button at ' + width + ' px').toBe(false);
      expect(g.lum, 'a dark box behind the header\'s light text at ' + width + ' px').toBeLessThan(0.3);
    }
  });

  test('phone sheets: fields are 16 px so the page does not zoom, the number field is styled, and the journal map link is a real target', async ({ page }) => {
    const t = today();
    await stubCrewCopy(page);
    await page.route('**/api/journal', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ n: 1, entries: [
      { kind: 'signout', by: 'cody', date: t, at: Date.now() - 60_000, miles: 312, milesSrc: 'est', shot: [],
        loc: { lat: 37.8175, lon: -96.8829, acc: 30, place: 'El Dorado, KS' }, room: { type: 'hotel', cost: 90, place: 'El Dorado, KS' } }] }) }));
    await open(page, state({ who: 'cody', oath: { who: 'cody', at: 1 }, sync: { key: 'test-crew-key-0925', v: 0, at: 0 }, nav: 'now' }), '#s-today');
    await page.setViewportSize({ width: 360, height: 740 });
    const metrics = (sel: string) => page.locator(sel).evaluate((e: Element) => ({ font: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, border: getComputedStyle(e).borderTopWidth }));
    await page.locator('#tSignOut').click();
    for (const id of ['#soPlace', '#soMiles']) {
      const m = await metrics('.sheet ' + id);
      expect(m.font, id + ' font size').toBeGreaterThanOrEqual(16);
      expect(m.h, id + ' height').toBeGreaterThanOrEqual(36);
    }
    await page.evaluate(() => (window as any).closeSheet());
    await page.locator('#crewChip').click();
    const sms = await metrics('.sheet #liveSmsTo');
    expect(sms.font, 'number field font size').toBeGreaterThanOrEqual(16);
    expect(sms.h, 'number field height').toBeGreaterThanOrEqual(36);
    expect(sms.border, 'number field is styled like the others, not the browser default').toBe('1px');
    await page.locator('.sheet #liveJournal').click();
    const link = await metrics('.sheet #jrList a');
    expect(link.w, 'map link width').toBeGreaterThanOrEqual(36);
    expect(link.h, 'map link height').toBeGreaterThanOrEqual(30);
  });

  // ── 11/9: the weekend's stops come off the run sheet ─────────────────────────────────────────────────────────────
  // Tim: remove the ten stops shot this weekend; keep Lawrence TCC 74630 and Newton Victra 118416 in an "Open follow-up" section;
  // log what came off and when; touch nothing else. The IDS Master Sheet is not touched (this is the run sheet only).
  const WEEKEND = ['2026-0747', '2026-1224', '2026-7983', '2026-1376', '2026-5976', '2026-7106', '2026-7375', '2026-4909', '2026-5726', '2026-1339'];
  const LAWRENCE_132065 = '2026-5092';   // TCC 132065 — Lawrence, KS: a different store, an outstanding go-back, stays
  const TOPEKA_RUSSELL = '2026-4049';    // Russell 131502 — Topeka, KS: same city as Verizon 74651, different retailer, stays

  test('weekend removal: the ten stops are off the book and the counts, nothing else moved, and the log is on the Plan', async ({ page }) => {
    await open(page, state());
    expect(await ev(page, 'J.length')).toBe(181);                                 // 191 in the book before
    expect(await ev(page, 'RETIRED_ROWS.length')).toBe(10);
    for (const id of WEEKEND) expect(await ev(page, 'J.some(j=>j.id==="' + id + '")'), id + ' is off the book').toBe(false);
    expect(await ev(page, 'J.some(j=>j.id==="' + LAWRENCE_132065 + '")'), 'TCC 132065 Lawrence stays').toBe(true);
    expect(await ev(page, 'J.some(j=>j.id==="' + TOPEKA_RUSSELL + '")'), 'Russell 131502 Topeka stays').toBe(true);
    await expect(page.locator('#counters')).toContainText(/LEFT TO SHOOT\s*6,000 pts\s*60 stops/i);   // 68 stops, 6,800 pts before
    // the follow-up section: the two that still need work, in Tim's words
    const fu = page.locator('#followUp');
    await expect(fu).toBeVisible();
    await expect(fu.locator('.furow')).toHaveCount(2);
    await expect(fu).toContainText('TCC 74630 - Lawrence, KS');
    await expect(fu).toContainText('Lawrence may need a go-back');
    await expect(fu).toContainText('Victra 118416 - Newton, KS');
    await expect(fu).toContainText('Images incomplete');
    // the log: what came off, with the date
    await fu.locator('.rmlog summary').click();
    await expect(fu.locator('.rmlog .idsrow')).toHaveCount(10);
    for (const id of WEEKEND) await expect(fu.locator('.rmlog')).toContainText(id);
    await expect(fu.locator('.rmlog .idsrow').first()).toContainText('11/9');
  });

  test('weekend removal: a saved plan that still names a removed stop comes back without it, and a SHOT tap on one still counts', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const t = today(), AT = new Date(yesterday() + 'T15:00:00').getTime();
    await open(page, state({
      days: [day({ date: t, ids: ['2026-7375', BOLIVAR, '2026-5976', BUFFALO, '2026-0747'] })], activeDate: t,
      locks: { '2026-7375': { d: yesterday(), pts: 100, by: 'cody', with: '', at: AT, sd: yesterday() } },
      notes: { '2026-5976': 'Gate code 4411' },
    }));
    expect(await ev(page, 'S.days[0].ids.join()')).toBe([BOLIVAR, BUFFALO].join());                  // order kept, the three taken out
    expect(await ev(page, 'S.days[0].retired.join()')).toBe(['2026-7375', '2026-5976', '2026-0747'].join());   // and remembered on the day
    expect(await ev(page, 'S.locks["2026-7375"].by'), 'the SHOT tap is kept').toBe('cody');
    expect(await ev(page, 'allLocks().some(l=>l.id==="2026-7375")'), 'and still counted').toBe(true);
    expect(await ev(page, 'S.notes["2026-5976"]'), 'notes stay in the saved state').toBe('Gate code 4411');
    for (const tab of TABS) { await showTab(page, tab); await page.waitForTimeout(150); }   // every screen still draws
    await page.reload();
    expect(await ev(page, 'S.days[0].retired.length'), 'a second boot does not add them twice').toBe(3);
    expect(errors, 'no page errors with removed stops in the saved state').toEqual([]);
  });

  // ── 11/9: the Go Backs page ──────────────────────────────────────────────────────────────────────────────────────
  // The IDS Master Sheet's "Verizon Feedback" tab on a page of its own: off until the purple button on the Plan opens it, Outstanding
  // only until the filter says otherwise, read-only, and the known data problems on the page rather than behind it.
  const gpCards = (page: Page) => page.locator('#gpList .gpcard');

  test('Go Backs: off by default, a purple button on the Plan opens its own page, and a reload does not keep it open', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, state());
    await expect(page.locator('#s-gobacks')).toBeHidden();
    await expect(page.locator('#s-plan')).toBeVisible();
    expect(await page.locator('#nav button').count(), 'it is not a tab').toBe(7);
    const btn = page.getByRole('button', { name: 'Go Backs' });
    await expect(btn).toBeVisible();
    await expect(btn).toHaveCSS('background-color', 'rgb(139, 47, 201)');
    await expect(page.locator('#s-plan [data-gp]')).toHaveCount(0);             // not a list on the main plan
    await btn.click();
    await expect(page.locator('#s-gobacks')).toBeVisible();
    await expect(page.locator('#s-plan')).toBeHidden();
    await expect(page.locator('#s-gobacks h2')).toHaveText('Go Backs');
    await page.reload();
    await expect(page.locator('#s-plan')).toBeVisible();
    await expect(page.locator('#s-gobacks')).toBeHidden();
    await page.getByRole('button', { name: 'Go Backs' }).click();
    await page.locator('#gpBack').click();
    await expect(page.locator('#s-plan')).toBeVisible();
    await expect(page.locator('#s-gobacks')).toBeHidden();
  });

  test('Go Backs: Outstanding only by default, and the filter shows Resolved, No status and All', async ({ page }) => {
    await open(page, state());
    await page.getByRole('button', { name: 'Go Backs' }).click();
    const chip = (k: string) => page.locator('#s-gobacks [data-gpf="' + k + '"]');
    await expect(chip('out')).toHaveAttribute('aria-pressed', 'true');
    await expect(gpCards(page)).toHaveCount(14);
    await expect(page.locator('#gpList .gppill.out')).toHaveCount(14);
    const lawrence = page.locator('.gpcard[data-gp="' + LAWRENCE_132065 + '"]');
    await expect(lawrence).toContainText('TCC 132065 - Lawrence, KS');
    await expect(lawrence).toContainText('Missed the Sidewalk sign');
    await expect(lawrence).toContainText('Outstanding');
    await expect(lawrence).toContainText('No return visit scheduled');
    await chip('res').click();
    await expect(gpCards(page)).toHaveCount(1);
    await expect(gpCards(page).first()).toContainText('Victra 109861 - Salina, KS');
    await expect(gpCards(page).first()).toContainText('Resolved');
    await chip('none').click();
    await expect(gpCards(page)).toHaveCount(3);
    await chip('all').click();
    await expect(gpCards(page)).toHaveCount(18);
    await chip('out').click();
    await expect(gpCards(page)).toHaveCount(14);
    // closing and opening again lands back on Outstanding
    await chip('all').click();
    await page.locator('#gpBack').click();
    await page.getByRole('button', { name: 'Go Backs' }).click();
    await expect(chip('out')).toHaveAttribute('aria-pressed', 'true');
    await expect(gpCards(page)).toHaveCount(14);
  });

  test('Go Backs: a return visit shows as scheduled only when the stop itself is on a plan day that has not passed', async ({ page }) => {
    const PARK = '2026-8317', MARSHALL = '2026-5264';
    await open(page, state({
      days: [day({ id: 'dnext', date: tomorrow(), ids: [PARK, BUFFALO], locked: { at: 1, by: 'tim' } }),
             day({ id: 'dold', date: yesterday(), ids: [MARSHALL] }),
             // TCC 74630 Lawrence is off the run sheet: its plan day cannot make TCC 132065 Lawrence look scheduled
             day({ id: 'dlaw', date: shift(2), ids: ['2026-0747'] })],
    }));
    await page.getByRole('button', { name: 'Go Backs' }).click();
    const niceShort = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
    await expect(page.locator('.gpcard[data-gp="' + PARK + '"] .gpvisit')).toContainText('Scheduled · ' + niceShort(tomorrow()));
    await expect(page.locator('.gpcard[data-gp="' + PARK + '"] .gpvisit')).toContainText('plan locked');
    await expect(page.locator('.gpcard[data-gp="' + MARSHALL + '"] .gpvisit')).toContainText('No return visit scheduled');   // a day that has gone by plans nothing
    await expect(page.locator('.gpcard[data-gp="' + LAWRENCE_132065 + '"] .gpvisit')).toContainText('No return visit scheduled');
    expect(await ev(page, 'S.days.find(d=>d.id==="dlaw").ids.length')).toBe(0);
  });

  test('Go Backs: the known data problems are on the page, not hidden', async ({ page }) => {
    await open(page, state());
    await page.getByRole('button', { name: 'Go Backs' }).click();
    const issues = page.locator('#gpIssues');
    await expect(issues).toBeVisible();                                           // visible even though Salina is Resolved and filtered out
    await expect(issues).toContainText('Victra 109861 - Salina, KS');
    await expect(issues).toContainText('Marked Resolved here, but the Completed tab still says');
    await expect(issues).toContainText('return trip needed');
    await expect(issues).toContainText('TCC 132065 - Lawrence, KS');
    await expect(issues).toContainText('A different store from TCC 74630 - Lawrence, KS');
    await expect(issues).toContainText('TCC 133817 - Moberly, MO');                // Outstanding here, the run sheet has no go-back for it
    await expect(issues).toContainText('The run sheet shows no go-back owed here');
    await expect(issues).toContainText('Wireless Zone 125062 - Granite City, IL');
    await expect(issues).toContainText('No return trip needed');
    await expect(issues).toContainText('TCC 118085 - Collinsville, IL');
    await expect(issues).toContainText('TCC 138618 - Shiloh, IL');
    // and on the rows themselves
    await expect(page.locator('.gpcard[data-gp="' + LAWRENCE_132065 + '"] .gpflag')).toContainText('different store from TCC 74630');
    await page.locator('#s-gobacks [data-gpf="res"]').click();
    await expect(page.locator('.gpcard[data-gp="2026-8093"] .gpflag').first()).toContainText('Completed tab still says');
    await page.locator('#s-gobacks [data-gpf="none"]').click();
    await expect(page.locator('#gpList .gpflag', { hasText: 'No status on the tab' })).toHaveCount(3);
    // the run sheet's own list sits behind the row, with what is still owed
    await page.locator('#s-gobacks [data-gpf="out"]').click();
    await page.locator('.gpcard[data-gp="' + LAWRENCE_132065 + '"] .gpown summary').click();
    await expect(page.locator('.gpcard[data-gp="' + LAWRENCE_132065 + '"] .gpown')).toContainText('Sidewalk sign');
  });

  test('Go Backs: read-only — opening it, filtering and leaving it sends nothing anywhere', async ({ page }) => {
    const sent: string[] = [];
    await stubCrewCopy(page);
    await open(page, state({ sync: { key: 'test-crew-key-0925', v: 0, at: 0 } }));
    await page.waitForTimeout(2600);   // the boot's own save goes out 1.2 s after load: let it, so what follows is only this page
    page.on('request', r => { const u = r.url(); if (r.method() !== 'GET' || /sheets\.googleapis|docs\.google|drive\.google/.test(u)) sent.push(r.method() + ' ' + u); });   // a crew-copy pull is a read; a push or the sheet is not
    await page.getByRole('button', { name: 'Go Backs' }).click();
    for (const k of ['res', 'none', 'all', 'out']) await page.locator('#s-gobacks [data-gpf="' + k + '"]').click();
    await page.locator('#gpBack').click();
    await page.waitForTimeout(1800);   // longer than the save delay, so a push this page caused would show
    expect(sent, 'nothing is written or fetched from the sheet or the crew copy').toEqual([]);
  });

  test('Go Backs: a link made for the page opens it, and an ordinary link does not', async ({ page }) => {
    await open(page, state(), '#s-gobacks', ROUTE + '?page=gobacks');
    await expect(page.locator('#s-gobacks h2')).toHaveText('Go Backs');
    await expect(gpCards(page)).toHaveCount(14);
    const p2 = await page.context().newPage();
    await p2.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(p2.locator('#s-plan')).toBeVisible();
    await expect(p2.locator('#s-gobacks')).toBeHidden();
  });

  test('phone widths: Go Backs and the Plan with its follow-up card fit 320, 360 and 390 px', async ({ page }) => {
    await open(page, state());
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)), 'Plan at ' + width).toBeLessThanOrEqual(width);
      await page.getByRole('button', { name: 'Go Backs' }).click();
      for (const k of ['out', 'all']) {
        await page.locator('#s-gobacks [data-gpf="' + k + '"]').click();
        expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)), 'Go Backs (' + k + ') at ' + width).toBeLessThanOrEqual(width);
        const tiny = await page.evaluate(() => [...document.querySelectorAll('#s-gobacks button, #s-gobacks summary')].filter(e => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 40).map(e => e.textContent!.trim().slice(0, 20)));
        expect(tiny, 'every control on the page is a thumb-sized target at ' + width).toEqual([]);
      }
      await page.locator('#gpBack').click();
    }
  });
});
