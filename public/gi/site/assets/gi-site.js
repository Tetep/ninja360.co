/* Generationally Incorrect — site behavior
   Spec §6: custom form → GHL inbound webhook, tag taxonomy src-* / generation-*, UTM passthrough.
   GI_GHL_WEBHOOK is the single wiring point: paste the GHL inbound-webhook URL and every form
   on the site goes live. While it's empty, submits fall back to a prefilled email to the show
   inbox so no contact is ever silently dropped. */

var GI_GHL_WEBHOOK = ''; /* ← paste GHL inbound webhook URL here to activate direct capture */
var GI_CONTACT_EMAIL = 'hello@generationallyincorrect.com';

(function () {
  'use strict';

  /* ---- source / UTM passthrough (persists across pages in this tab) ---- */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src'];
  function captureSource() {
    try {
      var params = new URLSearchParams(window.location.search);
      var found = {};
      var any = false;
      UTM_KEYS.forEach(function (k) {
        var v = params.get(k);
        if (v) { found[k] = v.slice(0, 80); any = true; }
      });
      if (any) sessionStorage.setItem('gi:src', JSON.stringify(found));
      return JSON.parse(sessionStorage.getItem('gi:src') || '{}');
    } catch (e) { return {}; }
  }
  var sourceData = captureSource();

  /* ---- rotating tagline (hero) ---- */
  var taglineEl = document.querySelector('[data-taglines]');
  if (taglineEl) {
    var lines;
    try { lines = JSON.parse(taglineEl.getAttribute('data-taglines')); } catch (e) { lines = null; }
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (lines && lines.length > 1 && !reduced) {
      var i = 0;
      setInterval(function () {
        taglineEl.classList.add('fade');
        setTimeout(function () {
          i = (i + 1) % lines.length;
          taglineEl.textContent = '“' + lines[i] + '”';
          taglineEl.classList.remove('fade');
        }, 420);
      }, 5200);
    }
  }

  /* ---- signup forms ---- */
  function slug(v) { return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  document.querySelectorAll('form.gi-form').forEach(function (form) {
    var busy = false;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (busy) return;

      /* honeypot: bots fill it, humans never see it */
      var hp = form.querySelector('input[name="website"]');
      if (hp && hp.value) { showSuccess(form, null); return; }

      var f = new FormData(form);
      var firstName = String(f.get('first_name') || '').trim();
      var email = String(f.get('email') || '').trim();
      var generation = String(f.get('generation') || '').trim();
      var phone = String(f.get('phone') || '').trim();
      var smsConsent = !!f.get('sms_consent');
      if (!firstName || !email || !generation) return;

      var tags = ['src-web', 'generation-' + slug(generation)];
      if (sourceData.src) tags.push('src-' + slug(sourceData.src));

      var payload = {
        first_name: firstName,
        email: email,
        generation: generation,
        phone: phone,
        sms_consent: smsConsent,
        tags: tags,
        page: window.location.pathname,
        utm: sourceData
      };

      if (GI_GHL_WEBHOOK) {
        busy = true;
        var btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
        fetch(GI_GHL_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (!res.ok) throw new Error('bad status');
          showSuccess(form, null);
        }).catch(function () {
          busy = false;
          if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute('data-label') || 'Get the Question'; }
          showSuccess(form, mailtoFallback(payload));
        });
      } else {
        /* No webhook wired yet: hand the visitor a working capture path instead of pretending. */
        showSuccess(form, mailtoFallback(payload));
      }
    });
  });

  function mailtoFallback(p) {
    var subject = 'Question of the Week — add me to the list';
    var body = 'Name: ' + p.first_name +
      '\nEmail: ' + p.email +
      '\nGeneration: ' + p.generation +
      (p.phone ? '\nPhone (SMS ok: ' + (p.sms_consent ? 'yes' : 'no') + '): ' + p.phone : '');
    return 'mailto:' + GI_CONTACT_EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  function showSuccess(form, mailto) {
    var box = document.createElement('div');
    box.className = 'form-success';
    if (mailto) {
      box.innerHTML = '<b>One tap left.</b> Our signup system is being wired up this week — ' +
        'send the prefilled email and we’ll add you by hand, first question included.<br><br>' +
        '<a class="btn btn-red btn-sm" href="' + mailto + '">Send the email →</a>';
    } else {
      box.innerHTML = '<b>You’re in.</b> Watch your inbox — the current Question of the Week is on its way.';
    }
    form.replaceWith(box);
  }
})();
