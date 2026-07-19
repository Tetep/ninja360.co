(function () {
  function wrapTables() {
    var tables = document.querySelectorAll('table');
    tables.forEach(function (table) {
      if (table.closest('.n360-tw, .table-wrap, .tw')) return;
      var wrap = document.createElement('div');
      wrap.className = 'n360-tw';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function closeMobileNavOnTap() {
    var bar = document.querySelector('.n360bar');
    if (!bar) return;
    bar.querySelectorAll('nav a').forEach(function (link) {
      link.addEventListener('click', function () {
        bar.classList.remove('open');
        var toggle = bar.querySelector('.n360toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      wrapTables();
      closeMobileNavOnTap();
    });
  } else {
    wrapTables();
    closeMobileNavOnTap();
  }
})();
