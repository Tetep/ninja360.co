/* Generationally Incorrect — color-scheme picker.
   Loaded in <head> (no defer) so data-theme is on <html> before first paint:
   no flash of the wrong scheme. The choice is remembered in localStorage;
   Scheme B is the default. Switching only changes that one attribute. */
(function () {
  'use strict';

  var KEY = 'gi-theme';
  var DEFAULT = 'b';
  var SCHEMES = [
    { id: 'a', label: 'A · Original' },
    { id: 'b', label: 'B · Our Pick' },
    { id: 'c', label: 'C · Paper' }
  ];
  var root = document.documentElement;

  function valid(v) { return v === 'a' || v === 'b' || v === 'c'; }

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return valid(v) ? v : DEFAULT;
    } catch (e) { return DEFAULT; }
  }

  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the choice just won't persist */ }
  }

  function apply(v) {
    root.setAttribute('data-theme', v);
    var btns = document.querySelectorAll('.theme-switch button[data-theme-set]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-theme-set') === v ? 'true' : 'false');
    }
  }

  apply(read());

  function build() {
    if (document.querySelector('.theme-switch')) return;

    var group = document.createElement('div');
    group.className = 'theme-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Color scheme');

    var label = document.createElement('span');
    label.className = 'theme-switch-label';
    label.textContent = 'Color scheme';
    group.appendChild(label);

    SCHEMES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-theme-set', s.id);
      b.textContent = s.label;
      b.addEventListener('click', function () {
        save(s.id);
        apply(s.id);
      });
      group.appendChild(b);
    });

    var mount = document.querySelector('[data-theme-switch-mount]');
    var footers = document.querySelectorAll('footer');
    var footer = footers.length ? footers[footers.length - 1] : null;
    if (mount) {
      mount.appendChild(group);
    } else if (footer) {
      (footer.querySelector('.wrap') || footer).appendChild(group);
    } else {
      /* a page with no footer gets a footer-style bar of its own */
      var bar = document.createElement('div');
      bar.className = 'theme-switch-bar';
      bar.appendChild(group);
      document.body.appendChild(bar);
    }
    apply(read());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  /* another tab changed the scheme */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && valid(e.newValue)) apply(e.newValue);
  });
})();
