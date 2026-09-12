/* Shared site-wide footer easter egg badge — included by static public pages. */
(function () {
  var eggBadge = document.getElementById('egg-badge');
  var eggPop = document.getElementById('egg-pop');
  if (eggBadge) {
    eggBadge.addEventListener('click', function () { eggPop.classList.toggle('show'); });
    document.addEventListener('click', function (e) {
      if (!eggBadge.contains(e.target) && !eggPop.contains(e.target)) eggPop.classList.remove('show');
    });
  }
})();
