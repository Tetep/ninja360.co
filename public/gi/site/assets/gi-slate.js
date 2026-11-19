// The real taping slate, in one place. The home page's Upcoming Episodes cards, the Business Plan
// (business-plan/content.js) and the YouTube Strategy page read it; the Listen page (episodes/) has its own cards for the same
// tapings. When a 2027 topic locks, add it here and update SLATE_AS_OF.
// Sources (11/19/26): Tim's calendar (GI Taping events, Lucky 13 Studios) and the Dec 12 topics
// all three partners signed off on Nov 17-18.

export const SLATE_AS_OF = 'Nov 19, 2026';
export const GUEST_FORM = 'https://forms.gle/4qjmLzJieGN4hJWg6';

export const SLATE = [
  { when: 'Sat Nov 21, 2026', time: '10:00 AM', anchor: 'ep-001', ep: 'Episode 001', topic: 'AI', status: 'Taping this Saturday' },
  { when: 'Sat Dec 12, 2026', time: '10:00 AM', anchor: 'ep-002', ep: 'Episode 002', topic: 'Home Schooling vs. Public School', status: 'Casting now' },
  { when: 'Sat Dec 12, 2026', time: '1:00 PM', anchor: 'ep-003', ep: 'Episode 003', topic: 'Is cancel culture accountability or censorship?', status: 'Casting now' },
  { when: 'Sat Dec 12, 2026', time: '4:00 PM', anchor: 'ep-004', ep: 'Episode 004', topic: 'Sticks & Stones: do we have entire generations of snowflakes?', status: 'Casting now' },
  { when: '2027', time: '', anchor: 'ep-2027', ep: 'Next tapings', topic: 'Topics coming soon', status: 'Dates are on the guest form' },
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

// The home page's Upcoming Episodes: one clickable card per taping, each opening its card on the
// Listen page (base + '#' + anchor). Nothing moves on its own.
export function renderEpisodeTeasers(el, base) {
  if (!el) return;
  el.innerHTML = SLATE.filter((s) => s.time)
    .map((s) =>
      `<a class="ep-tease" href="${base}#${s.anchor}">` +
      `<span class="ep-tease-when">${esc(s.when.replace(/, \d{4}$/, ''))} · ${esc(s.time)}</span>` +
      `<span class="ep-tease-num">${esc(s.ep)}</span>` +
      `<span class="ep-tease-title">${esc(s.topic)}</span>` +
      `<span class="ep-tease-go">See the episode &rarr;</span></a>`)
    .join('');
}
