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
  newton1107: 1, ovn1106: 1, ovn1110: 1, qb1110: 1, sheetsync1110: 1,
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
    // every Verizon-channel stop on the board, counted from the app's own data — a stop taken off the run sheet that is banked still counts
    const total = await page.evaluate(() => (window as any).eval("ledgerRows().filter(j=>!j.wp&&j.ch==='Verizon'&&j.st!=='Removed').length"));
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
    // the red count sits on the fog while a quarter or more of the ninja is still covered; below that (34 of 175 after the 11/10 sync) the
    // numbers under the pie carry it and the pie has no label
    if (after.left / after.all >= 0.25) await expect(page.locator('#vzTotal .vzpie text')).toContainText(String(after.left));
    else await expect(page.locator('#vzTotal .vzpie text')).toHaveCount(0);
    await expect(page.locator('#vzLeft')).toHaveText(String(after.left));
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

  // Tim, 11/7: Cody's Kansas day pays 150, not 125 — it was an overnight, and the motel receipt is covered. Tim, 11/10: the room in
  // El Dorado was THURSDAY night (11/5). The 150 follows the room: Cody's Thursday if the phone has one, else the Friday route day.
  test('Cody’s overnight: the room was Thursday night 11/5, so Thursday pays 150 and carries the receipt note; Friday and every other day stay at 125', async ({ page }) => {
    const fri = day({ id: 'dfri', date: '2026-11-06', driver: 'cody', vehicle: 'own', ids: [BOLIVAR], note: 'Kansas run.' });
    const thu = day({ id: 'dthu', date: '2026-11-05', driver: 'cody', vehicle: 'own', ids: [BUFFALO], note: 'Topeka.' });
    const timThu = day({ id: 'dtim', date: '2026-11-05', ids: [PARKCITY] });
    await open(page, state({ days: [thu, fri, timThu], mig: migBut('ovn1110') }));
    const d = (id: string) => 'S.days.find(x=>x.id==="' + id + '")';
    // the numbers: a table of Tim's rulings, so they hold with or without the day's note — and only one day gets the 150
    expect(JSON.parse(await ev(page, 'JSON.stringify([dayCosts(' + d('dthu') + ').crew, dayCosts(' + d('dfri') + ').crew, dayCosts(' + d('dtim') + ').crew])')))
      .toEqual([150, 125, 0]);
    // the words: Thursday's day carries the ruling and the receipt, once; Friday's note is untouched
    const note = () => ev(page, d('dthu') + '.note') as Promise<string>;
    expect((await note()).startsWith('Topeka. · Overnight in El Dorado: the room was Thursday night 11/5 (Tim, 11/10), so this day pays 150 pts, not 125.')).toBe(true);
    expect(await note()).toContain('Motel receipt covered');
    expect(await note()).toContain('photo still owed');
    expect(await ev(page, d('dfri') + '.note')).toBe('Kansas run.');
    expect(await ev(page, 'S.mig.ovn1110')).toBe(1);
    await page.reload();
    expect(((await note()).match(/Overnight in El Dorado/g) || []).length).toBe(1);
  });

  test('Cody’s overnight: with no Thursday on the phone the Friday route day carries the 150, and the 11/7 note that named Friday night is replaced', async ({ page }) => {
    const old = 'Overnight in El Dorado: the day pays 150 pts, not 125 (Tim, 11/7). Motel receipt covered — Cody says 90 pts; booked at what the receipt says, photo still owed.';
    const fri = day({ id: 'dfri', date: '2026-11-06', driver: 'cody', vehicle: 'own', ids: [BOLIVAR], note: 'Kansas run. · ' + old });
    await open(page, state({ days: [fri], mig: migBut('ovn1110') }));
    expect(await ev(page, 'dayCosts(S.days.find(x=>x.id==="dfri")).crew')).toBe(150);
    const note = (await ev(page, 'S.days.find(x=>x.id==="dfri").note')) as string;
    expect(note.startsWith('Kansas run. · Overnight in El Dorado: the room was Thursday night 11/5')).toBe(true);
    expect(note).not.toContain('(Tim, 11/7)');
    expect((note.match(/Overnight in El Dorado/g) || []).length).toBe(1);
    // and the moment the phone gets a Cody Thursday the 150 moves to it — never both
    await page.evaluate(() => { const G = window as any; G.eval('S.days.push(Object.assign(blankDay("2026-11-05"),{id:"dlate",driver:"cody",vehicle:"own"}))'); });
    expect(JSON.parse(await ev(page, 'JSON.stringify([dayCosts(S.days.find(x=>x.id==="dlate")).crew, dayCosts(S.days.find(x=>x.id==="dfri")).crew])'))).toEqual([150, 125]);
  });

  test('Cody’s overnight note waits for the day: no Thursday or Friday on the phone sets no flag, and the 125 stands elsewhere', async ({ page }) => {
    await open(page, state({ days: [day({ id: 'dwed', date: '2026-11-04', driver: 'cody', vehicle: 'own', ids: [BUFFALO] })], mig: migBut('ovn1110') }));
    expect(await ev(page, '!!S.mig.ovn1110')).toBe(false);
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
    // 34 stops, 3,400 pts: the book carries the STL run and the weekend banked since the 11/10 sync (the fixture has no field locks, so it read 60 before)
    await expect(page.locator('#counters')).toContainText(/LEFT TO SHOOT\s*3,400 pts\s*34 stops/i);
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

  // ── 11/10: the book is synced to the IDS Completed tab and to QuickBooks ─────────────────────────────────────────────
  // Tim: "OK, sync". The baked book had last been read from the sheet on 10/22. Missing or on field locks only: the STL run (10/27-29), the
  // weekend's eight. Stale: three 10/20 stops still named INV-000143 to 145, which QuickBooks voided and replaced with INV-000146.
  const STL_1029 = ['2026-6662', '2026-8213', '2026-6046', '2026-7464', '2026-6238', '2026-1430'];   // Arnold, Saint Louis ×3, Washington, Kirkwood
  const WEEKEND_BANKED: Record<string, string> = {                                                    // the eight on the Completed tab, with the book's onsite dates
    '2026-1339': '2026-11-04', '2026-7375': '2026-11-07', '2026-4909': '2026-11-07', '2026-5726': '2026-11-07',
    // the Kansas four: Friday 11/6 (Tim, 11/10: "Friday I believe"); the sheet has Sunday 11/08, which the IDS tab lists as a date to correct
    '2026-1224': '2026-11-06', '2026-7983': '2026-11-06', '2026-1376': '2026-11-06', '2026-7106': '2026-11-06' };

  test('sync 11/10: the book carries the Completed tab — the 10/29 six, the weekend’s eight, INV-000146 on the three 10/20 stops, INV-000150 on the weekend', async ({ page }) => {
    await open(page, state());
    for (const id of STL_1029)
      expect(await ev(page, 'JSON.stringify([BY["' + id + '"].st,BY["' + id + '"].dt,BY["' + id + '"].inv])'), id).toBe('["Invoiced","2026-10-29","INV-000146"]');
    for (const [id, dt] of Object.entries(WEEKEND_BANKED)) {
      expect(await ev(page, 'JSON.stringify([BY["' + id + '"].st,BY["' + id + '"].dt,BY["' + id + '"].inv])'), id).toBe('["Invoiced","' + dt + '","INV-000150"]');
      expect(await ev(page, 'J.some(j=>j.id==="' + id + '")'), id + ' is still off the run sheet').toBe(false);
      expect(await ev(page, 'LOCKED("' + id + '")&&ledgerRows().some(j=>j.id==="' + id + '")'), id + ' is banked and counted').toBe(true);
    }
    for (const id of ['2026-6557', '2026-8597', '2026-6398']) expect(await ev(page, 'BY["' + id + '"].inv'), id).toBe('INV-000146');
    expect(await ev(page, 'BY["2026-8597"].hs.includes("INV-000144")'), 'the note on the stop no longer names the voided invoice').toBe(false);
    // Lawrence and Newton are not on the Completed tab: still open, still off the run sheet, not banked, not "left to shoot"
    for (const id of ['2026-0747', '2026-5976']) {
      expect(await ev(page, 'LOCKED("' + id + '")'), id + ' is not banked').toBe(false);
      expect(await ev(page, 'ledgerRows().some(j=>j.id==="' + id + '")||counters().openJobs.some(j=>j.id==="' + id + '")'), id + ' is in neither count').toBe(false);
    }
    // the ledger: Banked (Plan counters), History's points and Score all say the same thing
    expect(await ev(page, 'JSON.stringify([counters().bankedJobs.length,counters().bankedPay,allLocks().length,allLocks().reduce((t,l)=>t+l.pts,0),counters().openJobs.length])'))
      .toBe('[148,24900,148,24900,34]');
  });

  test('sync 11/10: Score reads 137 done, 34 left, 4 on hold of 175 — the weekend’s eight are done, and Kirkwood is no longer on hold', async ({ page }) => {
    await open(page, state({ nav: 'board' }), '#s-board');
    await expect(page.locator('#vzDone')).toHaveText('137');
    await expect(page.locator('#vzLeft')).toHaveText('34');
    await expect(page.locator('#vzHold')).toHaveText('4');
    await expect(page.locator('#vzAll')).toHaveText('175');
    expect(await ev(page, 'HOLD(BY["2026-1430"])||counters().heldJobs.some(j=>j.id==="2026-1430")'), 'Kirkwood TCC 74639 was shot 10/29, so it is not on hold').toBe(false);
    // History shows the days the book had missed
    expect(await ev(page, 'JSON.stringify(historyDays().filter(d=>d.d>="2026-10-29").map(d=>[d.d,d.n,d.pts]))'))
      .toBe('[["2026-11-07",3,300],["2026-11-06",4,400],["2026-11-04",1,100],["2026-10-29",6,600]]');
  });

  test('sync 11/10: the IDS tab asks only for what the sheet lacks — INV-000150 on the weekend’s eight, and the Kansas four’s Friday date', async ({ page }) => {
    await open(page, state({ mig: migBut('sheetsync1110') }));
    const ids = JSON.parse(await ev(page, 'JSON.stringify(datesToReport().map(l=>l.id))')) as string[];
    // the STL run and the three 10/20 stops are on the sheet as the book has them: not asked for again
    for (const id of [...STL_1029, '2026-0853', '2026-8514', '2026-6557', '2026-8597', '2026-6398']) expect(ids, id).not.toContain(id);
    // the weekend's eight are asked for: the sheet has no invoice number on them yet
    for (const id of Object.keys(WEEKEND_BANKED)) expect(ids, id).toContain(id);
    // the Kansas four: onsite Friday 11/6 here, Sunday 11/8 on the sheet — a date to correct
    for (const id of ['2026-1224', '2026-7983', '2026-1376', '2026-7106'])
      expect(await ev(page, 'JSON.stringify([onsiteOf("' + id + '"),idsSent()["' + id + '"].d])'), id).toBe('["2026-11-06","2026-11-08"]');
    // the other four: the date matches the sheet and only the invoice is new
    for (const id of ['2026-1339', '2026-7375', '2026-4909', '2026-5726'])
      expect(await ev(page, 'idsSent()["' + id + '"].d===onsiteOf("' + id + '")&&!idsSent()["' + id + '"].inv'), id).toBe(true);
    expect(await ev(page, 'S.mig.sheetsync1110')).toBe(1);
  });

  test('sync 11/10: a send Tim made after the sheet was read stands, and an older one that names the voided invoice is replaced', async ({ page }) => {
    const later = Date.parse('2026-11-10T20:00:00Z'), earlier = Date.parse('2026-10-31T12:00:00Z');
    await open(page, state({ mig: migBut('sheetsync1110'), report: { to: '', cc: '', sent: {
      '2026-0853': { d: '2026-10-27', inv: '', at: later },                    // sent after the read
      '2026-6557': { d: '2026-10-20', inv: 'INV-000143', at: earlier } } } }));  // sent when the book still had the voided number
    expect(await ev(page, 'JSON.stringify(idsSent()["2026-0853"])')).toBe(JSON.stringify({ d: '2026-10-27', inv: '', at: later }));
    expect(await ev(page, 'JSON.stringify([idsSent()["2026-6557"].inv,idsSent()["2026-6557"].d])')).toBe('["INV-000146","2026-10-20"]');
  });

  // QuickBooks is Tim's car only — Cody's miles are the count Cody gives, typed in (Tim, 11/10). Where QuickBooks has Tim's day it wins over
  // a number typed or baked earlier ("qb": 9/17 is 610 not 810, 9/30 is 29.5 not 205). A day it has no trips for stays the map's estimate.
  test('QuickBooks miles: qb1110 puts the log on Tim’s days, 9/17 and 9/30 take QuickBooks over the old number, and Cody’s day on the same date is untouched', async ({ page }) => {
    const t = (id: string, date: string, extra: Record<string, unknown> = {}) => day({ id, date, ids: [], ...extra });
    await open(page, state({ days: [
      t('d917', '2026-09-17', { logMi: 810 }), t('d930', '2026-09-30', { logMi: 205 }),
      t('dcody', '2026-10-13', { driver: 'cody', vehicle: 'own' }), t('dtim', '2026-10-13'), t('d1020', '2026-10-20'),
    ], mig: migBut('qb1110') }));
    const mi = (id: string) => ev(page, 'S.days.find(x=>x.id==="' + id + '").logMi');
    expect(await mi('d917')).toBe(610);
    expect(await mi('d930')).toBe(29.5);
    expect(await mi('dtim')).toBe(45.1);
    expect(await mi('dcody'), 'Cody’s miles are never QuickBooks’').toBeFalsy();
    expect(await mi('d1020'), '10/20: QuickBooks tracked nothing, so the estimate stands').toBeFalsy();
    expect(await ev(page, 'S.mig.qb1110')).toBe(1);
    await page.reload();
    expect(await mi('d917'), 'a second boot does not run it again').toBe(610);
  });

  test('QuickBooks miles on the Score: Tim’s days read the log, the drive down and back are their own lines, the weekend’s drivers are the ones Tim named', async ({ page }) => {
    await open(page, state());
    const rec = async (date: string) => JSON.parse(await ev(page, 'JSON.stringify(drivenDays().filter(d=>d.date==="' + date + '").map(d=>({who:d.driver,mi:d.miles,logged:d.logged,stops:d.ids.length})))'));
    expect(await rec('2026-10-28')).toEqual([{ who: 'tim', mi: 183.8, logged: true, stops: 13 }]);       // no plan day on this phone: read from the table
    expect(await rec('2026-10-29')).toEqual([{ who: 'tim', mi: 305.4, logged: true, stops: 6 }]);
    expect(await rec('2026-11-07')).toEqual([{ who: 'tim', mi: 365.2, logged: true, stops: 3 }]);         // Stockton, Branson West, Ava
    expect(await rec('2026-10-12')).toEqual([{ who: 'tim', mi: 184, logged: true, stops: 0 }]);           // the drive down to Springfield
    expect(await rec('2026-10-18')).toEqual([{ who: 'tim', mi: 203.1, logged: true, stops: 0 }]);         // and the drive back
    const kansas = await rec('2026-11-06');
    expect(kansas).toHaveLength(1);
    expect(kansas[0]).toMatchObject({ who: 'cody', logged: false, stops: 4 });                           // the Kansas four, Friday (Tim, 11/10): Cody’s route, Cody’s count is typed in
    expect(await rec('2026-11-08'), 'the sheet’s Sunday for them is not a drive').toEqual([]);
    expect(await rec('2026-11-04')).toMatchObject([{ who: 'cody', logged: false, stops: 1 }]);            // Topeka was Cody’s (Tim, 11/10)
    expect(await rec('2026-10-20')).toMatchObject([{ who: 'tim', logged: false }]);                       // QuickBooks has nothing for 10/20: still the estimate
  });

  test('QuickBooks import lands on Tim’s day, never on Cody’s plan for the same date', async ({ page }) => {
    const cody = day({ id: 'dcody', date: '2026-10-14', driver: 'cody', vehicle: 'own', ids: [BUFFALO] });   // Cody’s plan comes FIRST in the list
    const tim = day({ id: 'dtim', date: '2026-10-14', ids: [BOLIVAR] });
    await open(page, state({ days: [cody, tim] }));
    const r = JSON.parse(await ev(page, 'JSON.stringify(qbMileage("Date,Type,Trip Purpose,Distance\\n2026-10-14,BUSINESS,x,50.04\\n2026-10-14,UNREVIEWED,y,10\\n2026-10-14,PERSONAL,z,9\\n",true))'));
    expect(r.days).toBe(1);
    expect(await ev(page, 'S.days.find(x=>x.id==="dtim").logMi')).toBe(60);
    expect(await ev(page, 'S.days.find(x=>x.id==="dcody").logMi'), 'Cody’s plan keeps no QuickBooks number').toBeFalsy();
  });

  test('the Logged miles box says whose number it is: QuickBooks for Tim, Cody’s count for Cody', async ({ page }) => {
    const cody = day({ id: 'dcody', date: tomorrow(), driver: 'cody', vehicle: 'own', ids: [BUFFALO] });
    await open(page, state({ days: [cody, day({ id: 'dtim', date: shift(2) })], active: 0, activeDate: tomorrow() }));
    await expect(page.locator('#fLogMi')).toHaveAttribute('placeholder', 'Cody’s count');
    await page.evaluate(() => (window as any).eval('setDay(1);render()'));
    await expect(page.locator('#fLogMi')).toHaveAttribute('placeholder', 'from QuickBooks');
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

// ---------------------------------------------------------------------------------------------------------------------
// POTENTIAL stores — 41 Verizon-agent stores from Tim's email of Fri 11/13 (southern Illinois, southwest Indiana). They are a
// teal-blue map layer and nothing else: not in the book, so no points, no route, no invoice, no count. The rows below are the
// email's own text; the app's table has to match them exactly, in order.
// ---------------------------------------------------------------------------------------------------------------------
const EMAIL_ROWS = `TCC|80617|3373 S Us Highway 41|Terre Haute|IN
Verizon|74614|2902 1/2 W Deyoung St|Marion|IL
TCC|75214|2001 N Green River Rd|Evansville|IN
Verizon|74613|1230 E Main St Space 25|Carbondale|IL
TCC|120420|402 N Commercial St|Harrisburg|IL
Wireless Zone|130544|1125 State St|Lawrenceville|IL
Victra|77393|1501 Willow St|Vincennes|IN
TCC|76777|2339 S State Road 46|Terre Haute|IN
TCC|94127|1017 Commerce Dr|Fairfield|IL
Wireless Zone|130823|935 N Route 49|Casey|IL
TCC|75160|34 Southtowne Shopping Center|Du Quoin|IL
Russell Cellular|125748|808 Lehman Dr|Chester|IL
Russell Cellular|125746|1418 Sparta Centre Dr|Sparta|IL
BeMobile|94037|2128 N Main St|Princeton|IL
TCC|76778|5000 W Lloyd Expy|Evansville|IN
TCC|120419|1340 Il Highway 1 Ste G|Carmi|IL
Gee Papa Ent, Inc DBA Team Wireless|130494|541 N West St|Olney|IL
TCC|81341|2709 W Broadway St Ste B|Princeton|IN
TCC|75159|109 N Central St|Benton|IL
Gee Papa Ent, Inc DBA Team Wireless|130496|812 E Main St|Robinson|IL
Russell Cellular|130937|110 S Henrietta St|Effingham|IL
TCC|76772|2603 Hart Street|Vincennes|IN
Wireless Zone|76244|900 E Fayette Ave.|Effingham|IL
Victra|109238|125 Leigh Ste A|Anna|IL
TCC|75164|1445B West Whittaker|Salem|IL
TCC|142228|4201 Broadway St Ste B|Mount Vernon|IL
Wireless Zone|91609|1304 Thelma Keller Ave.|Effingham|IL
TCC|75166|1144 W Mccord St|Centralia|IL
Cellular Sales of Knoxville|130459|1452 Fort Harrison Rd|Terre Haute|IN
TCC|130377|1323 E Hackberry St Unit 101|Salem|IN
Wireless Zone|129473|1201 E. 5Th St|Metropolis|IL
Russell Cellular|110134|301 Mattes Ave. Ste 307|Vandalia|IL
Russell Cellular|125745|252 South Mill St|Nashville|IL
TCC|81319|1230 N. Baldwin Avenue|Marion|IN
TCC|110361|939 N Burkhardt Rd Ste C|Evansville|IN
TCC|75158|230 E 9Th St|Mount Carmel|IL
Gee Papa Ent, Inc DBA Team Wireless|130488|1304 N Michigan Ave|Marshall|IL
TCC|75162|1190 Franklin St|Carlyle|IL
TCC|95393|8300 Bell Oaks Drive Ste C|Newburgh|IN
Wireless Zone|127937|118 W Washington St|Newton|IL
Wireless Zone|127338|1480 N Worthey St|Flora|IL`.split('\n');

const NEW_HOME = '3205 NE 70th Terrace, Gladstone, MO 64119';
const TEAL = 'rgb(10, 157, 181)';   // #0A9DB5 — the POTENTIAL pins
// Leaflet comes from its CDN. A machine that cannot reach the CDN points LEAFLET_JS at a local copy of leaflet.js (npm pack leaflet@1.9.4).
const LEAFLET_JS = process.env.LEAFLET_JS || '';
async function openMap(page: Page, seed: Record<string, unknown>) {
  if (LEAFLET_JS) await page.route(/leaflet(\.min)?\.js/, r => r.fulfill({ path: LEAFLET_JS, contentType: 'application/javascript' }));
  await open(page, seed);
  const hasL = await page.evaluate(() => typeof (window as any).L !== 'undefined' && !!(window as any).L.map);
  test.skip(!hasL, 'Leaflet did not load (no CDN and no LEAFLET_JS) — there is no map to draw pins on');
  await page.locator('#lmap').scrollIntoViewIfNeeded();
  await expect(page.locator('#lmap .leaflet-tile-pane')).toHaveCount(1);
}
const ev = (page: Page, code: string) => page.evaluate(c => (window as any).eval(c), code);
// the container pixel of a POTENTIAL store on the map, as page coordinates — what a thumb would touch
const potPoint = (page: Page, id: string, above = 20) => page.evaluate(([i, a]) => {
  const G: any = window, p = G.eval('PBY[' + JSON.stringify(i) + ']'), q = G.eval('LMAP').latLngToContainerPoint(p.ll), b = document.querySelector('#lmap')!.getBoundingClientRect();
  return { x: b.left + q.x, y: b.top + q.y - (a as number) };
}, [id, above] as const);

test.describe('run sheet — POTENTIAL stores: teal pins on the map, apart from the book', () => {
  test('the 41 stores are exactly the email, none is a job, and nothing counts them', async ({ page }) => {
    await open(page, state());
    expect(await ev(page, "POTENTIAL.map(p=>[p.cl,p.site,p.a,p.c,p.s].join('|'))")).toEqual(EMAIL_ROWS);
    expect(await ev(page, 'new Set(POTENTIAL.map(p=>p.id)).size')).toBe(41);
    expect(await ev(page, "POTENTIAL.reduce((m,p)=>(m[p.s]=(m[p.s]||0)+1,m),{})")).toEqual({ IL: 29, IN: 12 });
    // the dealer reads short on the pin and the sheet; the legal name rides along
    expect(await ev(page, "POTENTIAL.filter(p=>p.dl==='Team Wireless').map(p=>p.cl)")).toEqual(Array(3).fill('Gee Papa Ent, Inc DBA Team Wireless'));
    // not a job: not in the book, not in J / BY, and no store number or address of theirs is in it either
    expect(await ev(page, 'POTENTIAL.filter(p=>BY[p.id]||J.some(j=>String(j.site)===p.site)||DATA.jobs.some(j=>String(j.site)===p.site)).length')).toBe(0);
    expect(await ev(page, 'J.length===DATA.jobs.filter(j=>!RETIRED[j.id]).length')).toBe(true);
    // every one starts at its town's centre, inside the two states, until the app places the address
    expect(await ev(page, 'POTENTIAL.every(p=>p.geo===0&&p.ll[0]>36.9&&p.ll[0]<41.8&&p.ll[1]>-91.6&&p.ll[1]<-85.0)')).toBe(true);
    // hiding or showing the layer moves no number on the sheet
    const before = await page.locator('#counters').innerText();
    await page.locator('#potTog').click();
    await page.locator('#potTog').click();
    expect(await page.locator('#counters').innerText()).toBe(before);
  });

  test('the legend names POTENTIAL, the list opens to 41 rows, and a row opens the store', async ({ page }) => {
    await open(page, state());
    const leg = page.locator('#potLeg');
    await expect(leg).toContainText('POTENTIAL');
    await expect(leg).toContainText('not on the run sheet');
    await expect(leg).toContainText('41 stores');
    await expect(leg.locator('i')).toHaveCSS('background-color', TEAL);
    await expect(page.locator('#potTog')).toHaveText('Hide');
    await expect(page.locator('#potFit')).toBeEnabled();
    await expect(page.locator('#potList summary')).toContainText('The 41 POTENTIAL stores');
    await expect(page.locator('#potList summary')).toContainText('29 IL · 12 IN');
    await expect(page.locator('#potList')).not.toHaveAttribute('open', '');
    await page.locator('#potList summary').click();
    await expect(page.locator('#potList [data-pot]')).toHaveCount(41);
    await expect(page.locator('#potList [data-pot]').first()).toContainText('Victra 109238');   // Illinois first, then by town: Anna
    await expect(page.locator('#potList [data-pot]').first()).toContainText('Anna, IL');
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await noSidewaysScroll(page, 'Plan tab with the POTENTIAL list open at ' + width);
    }
    await page.locator('#potList [data-pot]').first().click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toContainText('POTENTIAL · Victra 109238');
    await expect(sheet).toContainText('125 Leigh Ste A, Anna, IL');
    await expect(sheet).toContainText('not on the run sheet yet');
    await expect(sheet).toContainText('No points, no route and no invoice');
    await expect(sheet.locator('a.pdir')).toHaveAttribute('href', /destination=125%20Leigh%20Ste%20A%2C%20Anna%2C%20IL$/);
    // the sheet sits on top of the page and the page still fits
    await noSidewaysScroll(page, 'the POTENTIAL sheet');
  });

  test('teal pins, one per place, with a count where a town has several; the map still opens on the route', async ({ page }) => {
    await openMap(page, state());
    // the opening frame is today's route (Bolivar and Buffalo, MO) — the potential stores do not pull it east
    expect(await ev(page, 'LMAP.getBounds().contains(BASE)')).toBe(true);
    expect(await ev(page, "LMAP.getBounds().contains(PBY['pot:80617'].ll)")).toBe(false);
    await page.locator('#potFit').click();
    expect(await ev(page, "[...POTENTIAL.map(p=>p.ll)].every(ll=>LMAP.getBounds().contains(ll))&&LMAP.getBounds().contains(BASE)")).toBe(true);
    // 41 stores in 34 towns: 34 pins, all teal
    const pins = page.locator('#lmap .leaflet-marker-icon.pot');
    await expect(pins).toHaveCount(34);
    const colours = await pins.evaluateAll(els => els.map(e => { const d = e.querySelector('.ndot, .npin .head') as HTMLElement; return getComputedStyle(d).backgroundImage; }));
    expect(colours.every(c => c.includes('rgb(10, 157, 181)'))).toBe(true);
    // zoom to Effingham (three stores) — a teardrop with a 3 on it, teal head and tail
    await ev(page, "LMAP.setView(PBY['pot:76244'].ll,12,{animate:false})");
    const eff = page.locator('#lmap .leaflet-marker-icon.pot:has(.nbadge .pn)').filter({ hasText: '3' });
    await expect(eff.locator('.npin .head')).toHaveCount(3);   // Effingham, Evansville and Terre Haute all hold three
    expect(await eff.first().locator('.npin .head').evaluate(e => getComputedStyle(e).backgroundImage)).toContain(TEAL);
    expect(await eff.first().locator('.npin .tail').evaluate(e => getComputedStyle(e).backgroundImage)).toContain(TEAL);
    // the book's own pins are unchanged: still brand colours, never teal
    const jobs = page.locator('#lmap .leaflet-marker-icon.npx:not(.pot)');
    expect(await jobs.count()).toBeGreaterThan(0);
    expect(await jobs.evaluateAll(els => els.some(e => { const d = e.querySelector('.head, .ndot') as HTMLElement | null; return !!d && getComputedStyle(d).backgroundImage.includes('rgb(10, 157, 181)'); }))).toBe(false);
  });

  test('tapping a pin opens the store; a town with three stores opens all three', async ({ page }) => {
    await openMap(page, state());
    await page.locator('#potFit').click();
    await ev(page, "LMAP.setView(PBY['pot:76244'].ll,12,{animate:false})");
    await page.locator('#lmap').scrollIntoViewIfNeeded();
    const pt = await potPoint(page, 'pot:76244');
    await page.mouse.click(pt.x, pt.y);
    const sheet = page.locator('.sheet');
    await expect(sheet).toContainText('POTENTIAL · Effingham, IL');
    await expect(sheet).toContainText('3 stores here');
    for (const t of ['Russell Cellular 130937', 'Wireless Zone 76244', 'Wireless Zone 91609', '110 S Henrietta St, Effingham, IL', '900 E Fayette Ave., Effingham, IL', '1304 Thelma Keller Ave., Effingham, IL'])
      await expect(sheet).toContainText(t);
    // "Show on map" closes the sheet and centres that store
    await sheet.getByRole('button', { name: 'Show on map' }).first().click();
    await expect(page.locator('.sheet')).toHaveCount(0);
    expect(await ev(page, "(()=>{const c=LMAP.getCenter(),p=PBY['pot:130937'].ll; return Math.abs(c.lat-p[0])<1e-3&&Math.abs(c.lng-p[1])<1e-3})()")).toBe(true);
    expect(await ev(page, 'LMAP.getZoom()')).toBe(12);   // the address has not been placed yet, so it stops at the town, not the door
  });

  test('Hide takes the layer off the map, Show brings it back, and the choice stays on this device', async ({ page }) => {
    await openMap(page, state());
    await page.locator('#potFit').click();
    await expect(page.locator('#lmap .leaflet-marker-icon.pot')).toHaveCount(34);
    await page.locator('#potTog').click();
    await expect(page.locator('#potTog')).toHaveText('Show');
    await expect(page.locator('#potFit')).toBeDisabled();
    await expect(page.locator('#lmap .leaflet-marker-icon.pot')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('ninja360-potential-view'))).toBe('off');
    expect(JSON.stringify(await saved(page))).not.toContain('ninja360-potential-view');   // a view setting: not in the synced state
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#potTog')).toHaveText('Show');
    await expect(page.locator('#lmap .leaflet-marker-icon.pot')).toHaveCount(0);
    await page.locator('#potTog').click();
    await expect(page.locator('#potTog')).toHaveText('Hide');
    await page.locator('#potFit').click();
    await expect(page.locator('#lmap .leaflet-marker-icon.pot')).toHaveCount(34);
  });

  test('the app places each store at its street address, once, and drops an answer from the wrong place', async ({ page }) => {
    await open(page, state());
    const pot = await ev(page, 'POTENTIAL.map(p=>p.id)') as string[];
    const jobsToPlace = await ev(page, 'J.filter(j=>j.geo===0).map(j=>j.id)') as string[];
    const asked: string[] = [];
    await page.route(/nominatim\.openstreetmap\.org/, r => {
      const q = decodeURIComponent(new URL(r.request().url()).searchParams.get('q') || ''); asked.push(q);
      const hit = (lat: number, lon: number) => r.fulfill({ json: [{ lat: String(lat), lon: String(lon), place_rank: 30 }] });
      if (/^935 N Route 49, Casey, IL/.test(q)) return hit(39.3005, -87.9911);
      if (q === '1340 Il Highway 1 Ste G, Carmi, IL') return r.fulfill({ json: [] });          // the suite defeats the geocoder…
      if (q === '1340 Il Highway 1, Carmi, IL') return hit(38.085, -88.17);                    // …so it is asked again without it
      if (/^118 W Washington St, Newton, IL/.test(q)) return hit(30.84, -93.75);              // a Newton, Texas — 800 miles off
      return r.fulfill({ json: [] });
    });
    // the book's rows, the house and every store but three are already placed, so only those three are looked up
    const leave = new Set(['pot:130823', 'pot:120419', 'pot:127937']);
    const geo: Record<string, unknown> = { home: [39.2201, -94.5199], homeFor: NEW_HOME, 'place:crane': [36.9, -93.57] };
    jobsToPlace.forEach(id => { geo[id] = [38.9, -92.3]; });
    pot.filter(id => !leave.has(id)).forEach(id => { geo[id] = [38.5, -89.0]; });
    await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [LSKEY, state({ geo })] as const);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => { const g = (await saved(page)).geo || {}; return ['pot:130823', 'pot:120419'].every(k => g[k]); }, { timeout: 20_000 }).toBe(true);
    const g = (await saved(page)).geo;
    expect(g['pot:130823']).toEqual([39.3005, -87.9911]);
    expect(g['pot:120419']).toEqual([38.085, -88.17]);
    expect(g['pot:127937'], 'the Texas answer is dropped, so Newton stays at its town centre to be tried again').toBeUndefined();
    expect(await ev(page, "PBY['pot:130823'].geo")).toBe(1);
    expect(await ev(page, "PBY['pot:127937'].geo")).toBe(0);
    expect(await ev(page, "PBY['pot:80617'].ll")).toEqual([38.5, -89.0]);                    // a placed one comes back from the saved state
    expect(asked.filter(q => /Carmi/.test(q))).toEqual(['1340 Il Highway 1 Ste G, Carmi, IL', '1340 Il Highway 1, Carmi, IL']);
    expect(asked.filter(q => /Casey/.test(q))).toHaveLength(1);
  });

  test('the house: the address Tim gave, looked up again once, and only street-level answers replace a saved fix', async ({ page }) => {
    await open(page, state());
    expect(await ev(page, 'HOME_ADDR')).toBe(NEW_HOME);
    const asked: string[] = [];
    let rank = 30;
    await page.route(/nominatim\.openstreetmap\.org/, r => {
      const q = decodeURIComponent(new URL(r.request().url()).searchParams.get('q') || ''); asked.push(q);
      return r.fulfill({ json: q.startsWith('3205 NE 70th Terrace') ? [{ lat: '39.2201', lon: '-94.5199', place_rank: rank }] : [] });
    });
    // a fix saved under the old spelling — Kansas City, no ZIP — is looked up once more with the new address…
    await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [LSKEY, state({ geo: { home: [39.185, -94.546] } })] as const);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (await saved(page)).geo?.homeFor, { timeout: 15_000 }).toBe(NEW_HOME);
    expect((await saved(page)).geo.home).toEqual([39.2201, -94.5199]);
    expect(await ev(page, 'BASE')).toEqual([39.2201, -94.5199]);
    expect(asked[0]).toBe(NEW_HOME);
    // …and not again on the next load
    const n = asked.filter(q => q.startsWith('3205')).length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_500);
    expect(asked.filter(q => q.startsWith('3205')).length).toBe(n);
  });

  test('the house: a town-level answer never replaces the saved fix', async ({ page }) => {
    await open(page, state());
    const asked: string[] = [];
    await page.route(/nominatim\.openstreetmap\.org/, r => {
      const q = decodeURIComponent(new URL(r.request().url()).searchParams.get('q') || ''); asked.push(q);
      return r.fulfill({ json: q.startsWith('3205 NE 70th Terrace') ? [{ lat: '39.2039', lon: '-94.5547', place_rank: 16 }] : [] });   // just "Gladstone"
    });
    await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [LSKEY, state({ geo: { home: [39.2201, -94.5199], homeFor: 'an older spelling' } })] as const);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => asked.filter(q => q.startsWith('3205 NE 70th Terrace')).length, { timeout: 15_000 }).toBe(2);   // as written, then under its post-office city
    expect(asked[1]).toBe('3205 NE 70th Terrace, Kansas City, MO 64119');
    const g = (await saved(page)).geo;
    expect(g.home).toEqual([39.2201, -94.5199]);
    expect(g.homeFor).toBe('an older spelling');
    expect(await ev(page, 'BASE')).toEqual([39.2201, -94.5199]);
  });
});
