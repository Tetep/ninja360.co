/* Shared site-wide footer easter egg badge — included by static public pages. */
(function () {
  var eggBadge = document.getElementById('egg-badge');
  var eggPop = document.getElementById('egg-pop');
  if (!eggBadge || !eggPop) return;

  function setOpen(on) {
    eggPop.classList.toggle('show', on);
    eggBadge.classList.toggle('on', on);   // the badge stays lit while the card is up
    eggBadge.setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  // A page with its own fixed bottom bar (the run sheet's nav) would bury the badge.
  // Measure it once and lift the badge clear of it.
  (function lift() {
    var bar = document.getElementById('nav');
    if (!bar || getComputedStyle(bar).position !== 'fixed') return;
    var h = Math.round(bar.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--egg-lift', h + 'px');
  })();

  eggBadge.setAttribute('role', 'button');
  eggBadge.setAttribute('tabindex', '0');
  eggBadge.setAttribute('aria-expanded', 'false');

  eggBadge.addEventListener('click', function () { setOpen(!eggPop.classList.contains('show')); });
  eggBadge.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!eggPop.classList.contains('show')); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', function (e) {
    if (!eggBadge.contains(e.target) && !eggPop.contains(e.target)) setOpen(false);
  });
})();
