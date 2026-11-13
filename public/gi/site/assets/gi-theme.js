/* Generationally Incorrect — color-scheme and font-set pickers (vote tools).
   Loaded in <head> (no defer) so data-theme and data-font are on <html> before
   first paint: no flash of the wrong scheme or fonts. Each choice is remembered
   in localStorage. Switching only changes that one attribute.
     colors: data-theme a|b|c, default b   (gi-theme.css)
     fonts:  data-font  a|b|c, default a   (gi-fonts.css) */
(function () {
  'use strict';

  var PICKERS = [
    {
      key: 'gi-theme', attr: 'data-theme', btnAttr: 'data-theme-set', def: 'b', label: 'Color scheme',
      items: [
        { id: 'a', label: 'A · Original' },
        { id: 'b', label: 'B · Our Pick' },
        { id: 'c', label: 'C · Paper' }
      ]
    },
    {
      key: 'gi-font', attr: 'data-font', btnAttr: 'data-font-set', def: 'a', label: 'Font set',
      items: [
        { id: 'a', label: 'A · Current' },
        { id: 'b', label: 'B · Louder' },
        { id: 'c', label: 'C · Cleaner' }
      ]
    }
  ];
  var root = document.documentElement;

  function valid(v) { return v === 'a' || v === 'b' || v === 'c'; }

  function read(p) {
    try {
      var v = localStorage.getItem(p.key);
      return valid(v) ? v : p.def;
    } catch (e) { return p.def; }
  }

  function save(p, v) {
    try { localStorage.setItem(p.key, v); } catch (e) { /* private mode: the choice just won't persist */ }
  }

  function apply(p, v) {
    root.setAttribute(p.attr, v);
    var btns = document.querySelectorAll('.theme-switch button[' + p.btnAttr + ']');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute(p.btnAttr) === v ? 'true' : 'false');
    }
  }

  PICKERS.forEach(function (p) { apply(p, read(p)); });

  function makeGroup(p) {
    var group = document.createElement('div');
    group.className = 'theme-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', p.label);

    var label = document.createElement('span');
    label.className = 'theme-switch-label';
    label.textContent = p.label;
    group.appendChild(label);

    p.items.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute(p.btnAttr, s.id);
      b.textContent = s.label;
      b.addEventListener('click', function () {
        save(p, s.id);
        apply(p, s.id);
      });
      group.appendChild(b);
    });
    return group;
  }

  function build() {
    if (document.querySelector('.theme-switch')) return;

    var groups = PICKERS.map(makeGroup);

    var mount = document.querySelector('[data-theme-switch-mount]');
    var footers = document.querySelectorAll('footer');
    var footer = footers.length ? footers[footers.length - 1] : null;
    var target;
    if (mount) {
      target = mount;
    } else if (footer) {
      target = footer.querySelector('.wrap') || footer;
    } else {
      /* a page with no footer gets a footer-style bar of its own */
      target = document.createElement('div');
      target.className = 'theme-switch-bar';
      document.body.appendChild(target);
    }
    groups.forEach(function (g) { target.appendChild(g); });
    PICKERS.forEach(function (p) { apply(p, read(p)); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  /* another tab changed a choice */
  window.addEventListener('storage', function (e) {
    PICKERS.forEach(function (p) {
      if (e.key === p.key && valid(e.newValue)) apply(p, e.newValue);
    });
  });
})();
