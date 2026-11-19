// The real taping slate, in one place. The Business Plan (business-plan/content.js) and the
// YouTube Strategy page read it; the Listen page (episodes/) has its own cards for the same
// tapings. When a 2027 topic locks, add it here and update SLATE_AS_OF.
// Sources (11/19/26): Tim's calendar (GI Taping events, Lucky 13 Studios) and the Dec 12 topics
// all three partners signed off on Nov 17-18.

export const SLATE_AS_OF = 'Nov 19, 2026';
export const GUEST_FORM = 'https://forms.gle/4qjmLzJieGN4hJWg6';

export const SLATE = [
  { when: 'Sat Nov 21, 2026', time: '10:00 AM', ep: 'Episode 001', topic: 'AI', status: 'Taping this Saturday' },
  { when: 'Sat Dec 12, 2026', time: '10:00 AM', ep: 'Episode 002', topic: 'Home Schooling vs. Public School', status: 'Casting now' },
  { when: 'Sat Dec 12, 2026', time: '1:00 PM', ep: 'Episode 003', topic: 'Is cancel culture accountability or censorship?', status: 'Casting now' },
  { when: 'Sat Dec 12, 2026', time: '4:00 PM', ep: 'Episode 004', topic: 'Sticks & Stones: do we have entire generations of snowflakes?', status: 'Casting now' },
  { when: '2027', time: '', ep: 'Next tapings', topic: 'Topics coming soon', status: 'Dates are on the guest form' },
];

// Rows for a bp-table: When · Episode · Topic · Status.
export const slateRows = () =>
  SLATE.map((s) => [s.time ? `${s.when} · ${s.time}` : s.when, s.ep, s.topic, s.status]);

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Draws the slate as the site's stacking table into el (pages outside the Business Plan).
export function renderSlate(el) {
  if (!el) return;
  const headers = ['When', 'Episode', 'Topic', 'Status'];
  el.innerHTML =
    '<table class="bp-table gi-slate"><thead><tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr></thead><tbody>' +
    slateRows().map((r) => '<tr>' + r.map((c, i) => `<td data-label="${headers[i]}">${esc(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>';
}
