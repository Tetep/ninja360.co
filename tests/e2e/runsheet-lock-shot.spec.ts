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
const STOCKTON = '2026-7375';   // Russell 102768 — Stockton, MO (Open, no onsite date, not loaded in IDS Capture)
const BUFFALO = '2026-6607';    // Russell 102763 — Buffalo, MO (Open, not loaded — the same MO-13 run as Stockton)
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
  id: 'dtest', date: tomorrow(), startKey: 'home', startTime: 8, endKey: 'home', ids: [STOCKTON, BUFFALO],
  startCharge: 100, crew: null, pace: 'split', ...over,
});

// Every one-time migration the app knows today (migrate() in verizon.html), marked applied: a flag the app
// looks for and does not find makes it rewrite the seeded plan — run1020 alone would clear every lock on the
// MO-13 stops. A test that wants one of them to run leaves that flag out.
const MIG = {
  cameron0915: 1, lincoln0925: 1, notshot98172: 1, shoot98172: 1, notsun98172: 1, notshot4049: 1,
  plan1007: 1, vehicle1007: 1, run1008: 1, run1013: 1, run1016: 1, run1020: 1,
  pastruns0926: 12, logmi0926: 1, logmi1006: 1, manhattan0910: 1, manhattan0909: 1, planlock0923: 1, sheetdates1003: 1, sync1021: 1, stl1027: 1,
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
    expect(asked).toContain('Russell 102768');   // it names the store, not just the city
    await expect(page.locator('#stops .stop.done')).toHaveCount(1);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(1);
    expect(await shotCount(page)).toBe(shotBefore + 1);
    let s = await saved(page);
    expect(Object.keys(s.locks)).toHaveLength(1);
    expect(s.locks[STOCKTON].d).toBe(today());
    expect(s.days[0].locked).toBeTruthy();

    // the IDS tab now has one onsite date to report, and the email says so — under the day it was shot
    await page.locator('#nav button[data-s="app"]').click();
    await expect(page.locator('#s-app')).toBeVisible();
    await noSidewaysScroll(page, 'IDS tab');
    await expect(page.locator('#s-app .idsrow', { hasText: STOCKTON })).toContainText(mdy(today()));
    const msg = await page.locator('#idsMsg').innerText(), lines = msg.split('\n');
    expect(msg).toContain('COMPLETED — ' + dayLabel(today()).toUpperCase());
    expect(lines.find(l => l.includes('(Loc ' + STOCKTON + ')'))).toBeTruthy();       // the shot stop is reported…
    expect(lines.find(l => l.startsWith(STOCKTON))).toBeUndefined();                  // …not asked for
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
    expect(s.locks[STOCKTON].d).toBe(today());
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
      locks: { [STOCKTON]: { d: tomorrow(), pts: 100, by: 'tim', with: '', at: AT } },
      status: { [STOCKTON]: 'captured' }, by: { [STOCKTON]: 'tim' },
      mig: migBut('planlock0923'),   // everything but planlock0923 — that one must run
    }));
    await expect(page.locator('.toast')).toContainText('now PLANNED');   // first thing after load — the toast is short-lived
    await expect(page.locator('#lockbar')).toContainText('PLAN LOCKED');
    await expect(page.locator('#stops .stop.done')).toHaveCount(0);
    await expect(page.locator('#stops .badge.pl')).toHaveCount(2);
    await expect(page.locator('#stops [data-shot]', { hasText: 'undo' })).toHaveCount(0);
    const s = await saved(page);
    expect(s.locks[STOCKTON]).toBeUndefined();
    expect(s.status[STOCKTON]).toBeUndefined();
    expect(s.by[STOCKTON]).toBeUndefined();
    expect(s.days[0].locked).toMatchObject({ at: AT, by: 'tim' });   // the plan lock carries the old lock's stamp
    expect(s.mig.planlock0923).toBe(1);
  });

  test('a real shot from yesterday stays a shot', async ({ page }) => {
    const AT = new Date(yesterday() + 'T15:00:00').getTime();
    await open(page, state({
      days: [day({ date: yesterday(), ids: [STOCKTON] })], activeDate: yesterday(),
      locks: { [STOCKTON]: { d: yesterday(), pts: 100, by: 'tim', with: '', at: AT } },
      status: { [STOCKTON]: 'captured' }, by: { [STOCKTON]: 'tim' },
    }));
    // yesterday is History's now — off the Plan rail — and the shot is still a shot, not turned into a plan lock
    await expect(page.locator('#s-plan .dchip[data-i]')).toHaveCount(1);   // the fresh day Plan opened on, not yesterday
    const s0 = await saved(page);
    expect(s0.locks[STOCKTON].d).toBe(yesterday());
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
      days: [day({ date: t, ids: [STOCKTON, BUFFALO, PARKCITY] })], activeDate: t,
      locks: { [STOCKTON]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } },
      status: { [STOCKTON]: 'captured' }, by: { [STOCKTON]: 'tim' },
    }));
    // a shot stop that is NOT at the bottom of the list (a stop added after it, a list cleared…)
    await page.evaluate(ids => { const w = window as any; w.eval('S.days[0].ids=' + JSON.stringify(ids)); w.render(); }, [STOCKTON, BUFFALO, PARKCITY]);
    await page.locator('#stops [data-dn="' + BUFFALO + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([PARKCITY, BUFFALO, STOCKTON]);
    await page.locator('#stops [data-up="' + BUFFALO + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([BUFFALO, PARKCITY, STOCKTON]);
    // the shot row cannot be moved up into the live ones, and the last live row cannot be moved under it
    await expect(page.locator('#stops [data-up="' + STOCKTON + '"]')).toBeDisabled();
    await expect(page.locator('#stops [data-dn="' + PARKCITY + '"]')).toBeDisabled();
    // SHOT sinks Buffalo under the live stops; Undo brings it back to the top, not to "after Park City"
    await page.locator('#stops [data-shot="' + BUFFALO + '"]').click();
    expect((await saved(page)).days[0].ids).toEqual([PARKCITY, BUFFALO, STOCKTON]);
    await page.locator('.toast button').click();
    expect((await saved(page)).days[0].ids).toEqual([BUFFALO, PARKCITY, STOCKTON]);
    expect((await saved(page)).locks[BUFFALO]).toBeUndefined();
  });

  test('a locked plan cannot be edited through the back doors', async ({ page }) => {
    const B = shift(2);
    await open(page, state({
      days: [day({ id: 'dA', date: tomorrow(), ids: [STOCKTON] }), day({ id: 'dB', date: B, ids: [BUFFALO], locked: { at: 1, by: 'tim' } })],
    }));
    await page.locator('#stops [data-mv]').first().click();        // move Stockton onto the locked day
    await page.locator('.sheet [data-day="1"]').click();
    await expect(page.locator('.toast')).toContainText('locked');
    const s = await saved(page);
    expect(s.days.find((d: any) => d.date === B).ids).toEqual([BUFFALO]);
    expect(s.days.find((d: any) => d.date === tomorrow()).ids).toEqual([STOCKTON]);
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
      days: [day({ date: y, ids: [STOCKTON] })], activeDate: y,
      locks: { [STOCKTON]: { d: y, pts: 100, by: 'tim', with: '', at: AT } },
      status: { [STOCKTON]: 'captured' }, by: { [STOCKTON]: 'tim' },
      nav: 'app', mig: migBut('sheetdates1003'),   // the 10/3 sheet-dates fix runs on top of the seed, as on a fresh device
    }), '#s-app');
    await noSidewaysScroll(page, 'IDS tab');
    const row = page.locator('#s-app .idsrow', { hasText: STOCKTON });
    await expect(row).toContainText(mdy(y));
    // the first-run seed: everything on the sheet at the 9/24 read is "sent" — date AND invoice, stamped before
    // any real send — and what it is missing or has wrong is not, so that is what the list opens at, plus Stockton
    let s = await saved(page);
    expect(s.report.seeded).toBe('0928');
    expect(s.report.sent['2026-0000']).toMatchObject({ d: '2026-09-10', seed: 1, at: 0 });   // Target 1821 Manhattan: the sheet's 9/10, over the book's 9/9
    expect(typeof s.report.sent['2026-0000'].inv).toBe('string');
    expect(s.report.sent['2026-5178']).toMatchObject({ d: '2026-09-16', seed: 1 });   // Chillicothe: on the sheet since the 9/23 cleanup
    expect(s.report.sent['2026-1388']).toMatchObject({ d: '2026-08-21', seed: 1 });   // seeded with the sheet's wrong date, so it lists as a fix
    expect(s.report.sent['2026-3142']).toBeUndefined();                               // Gap 1211 is on neither tab
    expect(s.report.sent['2026-7106']).toBeUndefined();
    // Stockton (shot yesterday) + Gap 1211 + the dates the sheet has wrong + the undated Master rows + every stop shot since the 9/24 read
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
    expect(s.report.sent[STOCKTON]).toMatchObject({ d: y });

    await page.locator('.toast button').click();   // Undo
    await expect(row).toContainText(mdy(y));
    s = await saved(page);
    expect(s.report.sent[STOCKTON].d).toBe('');       // a tombstone, not a deletion — a crew merge cannot resurrect the old entry

    // a reload keeps the seed flag, so the seed does not run again and the tombstone stands
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#s-app')).toBeVisible();
    s = await saved(page);
    expect(s.report.seeded).toBe('0928');
    expect(s.report.sent[STOCKTON].d).toBe('');
    expect(await page.evaluate(() => (window as any).datesToReport().length)).toBe(n);
  });

  // RED on main since #113: mergeShared() in verizon.html reads myDev (the device register) and nothing declares it,
  // so a crew copy with a state in it throws ReferenceError before the locks are unioned. An app bug, not a stale
  // fixture — this test and the un-shot one below stay red on purpose until it is fixed.
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
    }, [tomorrow(), STOCKTON, today()] as const);
    expect(r.a).toBe(true);
    expect(r.b).toBe(false);
    expect(r.c).toEqual({ lockGone: true, planLocked: true });
    expect(r.d).toEqual({ d: today(), shot: true });
    expect(r.e).toEqual({ lockGone: true, shot: false, status: undefined });
    expect(r.f).toBe(true);
  });

  // RED on main since #113 — the same myDev ReferenceError in mergeShared() (see above)
  test('un-shot on one phone survives a pull on the other', async ({ page }) => {
    const t = today(), AT = Date.now() - 60_000;   // stamped a minute ago — "09:00 today" is in the future on an early CI run
    await open(page, state({
      days: [day({ date: t, ids: [STOCKTON] })], activeDate: t,
      locks: { [STOCKTON]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } },
      status: { [STOCKTON]: 'captured' }, by: { [STOCKTON]: 'tim' },
    }));
    // this phone un-shoots: a tombstone is written, and it rides the crew sync
    await page.locator('#stops [data-shot="' + STOCKTON + '"]').click();
    const s = await saved(page);
    expect(s.locks[STOCKTON]).toBeUndefined();
    expect(s.unshot[STOCKTON].at).toBeGreaterThan(AT);
    // the crew copy still holds the lock (pushed before the un-shot) → the pull does NOT bring it back
    const back = await page.evaluate(([id, at, d]) => {
      const G: any = window;
      G.mergeShared({ locks: { [id]: { d, pts: 100, by: 'tim', with: '', at, sd: d } }, status: { [id]: 'captured' }, by: { [id]: 'tim' }, unshot: {} });
      return { lock: !!G.eval('S.locks["' + id + '"]'), shot: G.eval('shot("' + id + '")') };
    }, [STOCKTON, AT, t] as const);
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
    await open(page, state({ days: [day({ date: y, ids: [STOCKTON] })], activeDate: y, nav: 'board' }), '#s-board');
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
    await page.evaluate(id => { const w = window as any; w.markShot(id, true); w.render(); }, STOCKTON);
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
      days: [day({ id: 'dPast', date: yesterday(), ids: [STOCKTON] }), day({ id: 'dNow', date: today(), ids: [BUFFALO] })],
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
      }; }, [STOCKTON, BUFFALO] as const);
    expect(r.pool).toBe(true);                    // Stockton was never shot yesterday — it is back to be picked
    expect(r.planned).toBe(false);
    expect(r.map).toEqual([true, true, false]);   // Stockton to pick, Buffalo on the day, Osage City shot 9/24 — not on the map
  });

  test('Now: the clock, this device, and the stop in hand — the GPS says you are there, start, stop, complete, on to the next', async ({ page }) => {
    const t = today();
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 37.68803, longitude: -93.79939 });   // standing at Russell 102768, Stockton (the book's lat/lon)
    await open(page, state({ days: [day({ date: t, ids: [STOCKTON, BUFFALO], locked: { at: 1, by: 'tim' } })], activeDate: t, nav: 'today' }), '#s-today');
    const card = page.locator('#s-today .nowcard');
    await expect(card.locator('[data-clock]')).toHaveText(/\d{1,2}:\d{2}/);
    const dev = await page.evaluate(() => JSON.parse(localStorage.getItem('ninja360-device') || '{}'));
    expect(dev.id).toMatch(/^dev-/);
    await expect(page.locator('#devChip')).toContainText(dev.name);
    await expect(card).toContainText('At the stop');          // the GPS put him there — nothing to tap, nothing typed
    await expect(card).toContainText('You are here');
    await expect(card).toContainText('Stockton');
    await page.locator('#nowStart').click();
    await expect(card).toContainText('Shooting');
    let s = await saved(page);
    expect(s.timers[STOCKTON].startedAt).toBeTruthy();
    expect(s.checkin[STOCKTON].dev).toBe(dev.id);
    await page.locator('#nowStop').click();
    await expect(card).toContainText('Shot — confirm');
    await page.locator('#nowDone').click();
    await expect(card).toContainText('Heading to');             // on to the next
    await expect(card).toContainText('2 of 2');
    await expect(card).toContainText('Buffalo');
    await expect(card).toContainText('mi away');
    s = await saved(page);
    expect(s.locks[STOCKTON]).toMatchObject({ d: t, dev: dev.id });
    expect(s.timers[STOCKTON].startedAt).toBeUndefined();
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
    await open(page, state({ days: [day({ date: t, ids: [STOCKTON] })], activeDate: t, nav: 'today' }), '#s-today');
    await expect(page.locator('#s-today .nowcard')).toContainText('10 min fast');
  });

  test('GO LIVE waits for a date: an undated day says so instead of offering to publish', async ({ page }) => {
    await open(page, state({ days: [day({ date: '', ids: [STOCKTON] })], activeDate: '', nav: 'today' }), '#s-today');
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
      days: [day({ date: t, ids: [STOCKTON, BUFFALO], locked: { at: 1, by: 'tim' } })], activeDate: t,
      locks: { [STOCKTON]: { d: t, pts: 100, by: 'tim', with: '', at: AT, sd: t } }, status: { [STOCKTON]: 'captured' }, by: { [STOCKTON]: 'tim' },
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
    // GO LIVE: Stockton shot, Buffalo carried — the journal gets the day, the email is confirmed, the date is marked sent
    await page.locator('#tGoLive').click();
    await expect(page.locator('.sheet #glGo')).toBeVisible();
    await expect(page.locator('.sheet input[name="gl-' + BUFFALO + '"][value="carry"]')).toBeChecked();
    page.once('dialog', d => d.accept());
    await page.locator('.sheet #glGo').click();
    await expect(page.locator('#s-today .golivecard')).toContainText('email ✓ sent');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ date: t, carried: [BUFFALO], skipped: [] });
    expect(posted[0].shot.map((x: any) => x.id)).toEqual([STOCKTON]);
    let s = await saved(page);
    expect(s.nav).toBe('today');
    expect(s.published[t]).toMatchObject({ shot: [STOCKTON], carried: [BUFFALO], email: 'sent', entry: 'x1' });
    expect(s.report.sent[STOCKTON]).toMatchObject({ d: t });
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
});
