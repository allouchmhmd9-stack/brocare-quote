/* Quoter interface behaviour, shared by motor/ and health/ (the Design session's makeover).
   It never prices anything: it reads what the page's own engine has rendered.

   · top bar: logo home, Motor / Health switch, tariff chip, the signed-in person's initials
   · steps: one open at a time; a finished step folds into summary chips with an Edit link
   · receipt: progress until the quote is complete, then the price
   · send: one main action (WhatsApp) and a quiet icon row (PDF, Show client, Save, Copy;
     Brocare's own tools add Comparison and Invoice, insurer demos never show them)
   · phone: a bar at the bottom with the price and Send */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var MODE = $('sumBig') ? 'motor' : ($('priceBig') ? 'health' : null);
  if (!MODE) return;
  var BRAND = window.BROCARE_BRAND || null;
  var root = new URL('..', document.currentScript ? document.currentScript.src : location.href).href;

  /* who the quote is from: the insurer of a demo, else BroCare and the signed-in person */
  function sender() {
    if (BRAND) return BRAND;
    var me = window.BrocareAuth && BrocareAuth.current();
    return { key: 'brocare', name: 'BroCare', legalName: 'BroCare Insurance Brokerage s.a.r.l', logo: 'brocare-logo.png',
      disclaimer: 'Indicative quote, subject to underwriting.', validDays: 15,
      agent: { name: me ? me.name : '', phone: me ? me.whatsapp : '' } };
  }

  /* ---------------- top bar ---------------- */
  (function topbar() {
    var bar = document.querySelector('.brandbar');
    if (!bar) return;
    var key = BRAND ? '?brand=' + encodeURIComponent(BRAND.key) : '';
    bar.querySelectorAll('.qlines a').forEach(function (a) {
      var line = a.getAttribute('data-line');
      a.href = root + line + '/' + key;
      a.classList.toggle('on', line === MODE);
      if (BRAND && BRAND.products && BRAND.products.indexOf(line) < 0) a.remove();
    });
    var av = $('qAvatar'), me = window.BrocareAuth && BrocareAuth.current();
    if (av && me && !BRAND) {
      av.textContent = me.name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
      av.title = me.name; av.hidden = false;
    }
    /* the logo goes where "back" goes (brand.js points that at the insurer's home page) */
    document.addEventListener('DOMContentLoaded', function () {
      var back = document.querySelector('.backlink'), home = bar.querySelector('.brandhome');
      if (back && home) home.href = back.href;
    });
  })();

  /* ---------------- steps: one open at a time ---------------- */
  var steps = [].slice.call(document.querySelectorAll('.step[data-acc]'));
  steps.forEach(function (s) {
    var head = s.querySelector('.stephead'), echo = head.querySelector('.stepecho');
    var sum = document.createElement('span'); sum.className = 'stepsum';
    var edit = document.createElement('span'); edit.className = 'stepedit'; edit.textContent = 'Edit';
    head.appendChild(sum); head.appendChild(edit);
    head.setAttribute('role', 'button'); head.tabIndex = 0;
    var paintSum = function () {
      sum.innerHTML = (echo ? echo.textContent : '').split(/\s+·\s+/).filter(Boolean)
        .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    };
    if (echo) new MutationObserver(paintSum).observe(echo, { childList: true, characterData: true, subtree: true });
    paintSum();
    var go = function () { if (!s.classList.contains('off')) open(s); };
    head.addEventListener('click', go);
    head.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  function visible(s) { return s.offsetParent !== null || s.style.display !== 'none'; }
  function open(s) { steps.forEach(function (x) { x.classList.toggle('open', x === s); }); }
  function current() { return steps.filter(function (x) { return x.classList.contains('open'); })[0]; }
  function firstTodo() {
    var live = steps.filter(function (x) { return visible(x) && !x.classList.contains('off'); });
    return live.filter(function (x) { return !x.classList.contains('done'); })[0] || live[live.length - 1];
  }
  /* a finished step folds and the next one opens, once the person has left it */
  function advance() {
    var cur = current();
    if (!cur || cur.classList.contains('off')) { var t = firstTodo(); if (t) open(t); return; }
    if (!cur.classList.contains('done') || cur.contains(document.activeElement)) return;
    var after = steps.slice(steps.indexOf(cur) + 1).filter(function (x) { return !x.classList.contains('off') && !x.classList.contains('done'); })[0];
    if (after) open(after);
  }
  steps.forEach(function (s) {
    new MutationObserver(function () { setTimeout(advance, 0); }).observe(s, { attributes: true, attributeFilter: ['class'] });
    s.addEventListener('focusout', function () { setTimeout(advance, 150); });
  });
  if (steps.length) open(firstTodo() || steps[0]);

  /* ---------------- receipt: progress, then the price ---------------- */
  var card = MODE === 'motor' ? $('s4') : $('priceCard');
  var prog = $('qProg');
  function complete() {
    if (MODE === 'motor') return !$('s4').classList.contains('off') && /\d/.test($('sumBig').textContent);
    return /\d/.test($('priceBig').textContent) && !$('priceCard').classList.contains('error');
  }
  function paintProgress() {
    if (!card || !prog) return;
    var done = steps.filter(function (x) { return x.classList.contains('done'); }).length, n = steps.length || 1;
    var pending = !complete();
    if (card.classList.contains('qpending') !== pending) card.classList.toggle('qpending', pending);
    if (!pending) return;
    var next = steps.filter(function (x) { return !x.classList.contains('done'); })[0];
    setIf(prog.querySelector('i').style, 'width', Math.round(100 * done / n) + '%');
    setIf($('qProgN'), 'textContent', done + ' of ' + n + ' steps done');
    setIf($('qProgT'), 'textContent', next ? 'Next: ' + next.querySelector('.steptitle').textContent.toLowerCase() : 'Almost there.');
  }
  /* write only a real change: these nodes sit inside what the observers below watch */
  function setIf(o, k, v) { if (o[k] !== v) o[k] = v; }

  /* ---------------- phone bar ---------------- */
  var qbar = document.createElement('div');
  qbar.className = 'qbar'; qbar.hidden = true;
  qbar.innerHTML = '<div><div class="p" id="qBarP"></div><div class="s" id="qBarS">per year</div></div>' +
    '<button type="button" class="btn primary" id="qBarSend">Send</button>';
  document.body.appendChild(qbar);
  function paintBar() {
    var ok = complete();
    qbar.hidden = !ok; document.body.classList.toggle('qhasbar', ok);
    if (!ok) return;
    $('qBarP').textContent = bigPrice();
    $('qBarS').textContent = (MODE === 'motor' ? planName() : (typeof state !== 'undefined' && state.level) || '') + ' · per year';   /* eslint-disable-line no-undef */
  }
  function bigPrice() { return ($(MODE === 'motor' ? 'sumBig' : 'priceBig').textContent || '').replace(/\s*\/\s*year.*$/i, '').trim(); }
  function planName() {
    if (typeof TARIFF === 'undefined' || typeof S === 'undefined') return '';                     /* eslint-disable-line no-undef */
    var p = TARIFF.products.filter(function (x) { return x.id === S.product; })[0];                  /* eslint-disable-line no-undef */
    return p ? p.name : '';
  }
  function repaint() { paintProgress(); paintBar(); }
  /* the step and card states (classes) and the price text; never the subtrees repaint writes to */
  var rp = new MutationObserver(repaint);
  [card].concat(steps).forEach(function (el) { if (el) rp.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }); });
  var big = $(MODE === 'motor' ? 'sumBig' : 'priceBig');
  if (big) rp.observe(big, { childList: true, characterData: true, subtree: true });
  repaint();

  /* ---------------- what the page shows, as a quote ---------------- */
  function readQuote() {
    var rows = [], price, sub;
    if (MODE === 'motor') {
      price = $('sumBig').textContent.replace(/\s+/g, ' ').trim();
      sub = ($('sumSub') && $('sumSub').textContent.trim()) || 'Annual premium';
      document.querySelectorAll('#sumRows .srow:not(.calc)').forEach(function (r) {
        var k = r.querySelector('.k'), v = r.querySelector('.v');
        if (k && v && !(BRAND && k.textContent.trim() === 'Insurer')) rows.push([k.textContent.trim(), v.textContent.trim()]);
      });
    } else {
      price = $('priceBig').textContent.replace(/\s+/g, ' ').trim();
      sub = $('priceSub').textContent.trim() || 'Price per year';
      document.querySelectorAll('#priceRows .prow:not(.total)').forEach(function (r) {
        var k = r.querySelector('.k'), v = r.querySelector('.v');
        if (k && v) rows.push([k.textContent.trim(), v.textContent.trim()]);
      });
    }
    var ok = complete() && !(MODE === 'motor' && $('s4').style.display === 'none');            /* never on the TPL screen */
    return { ok: ok, type: MODE === 'motor' ? 'Motor All Risk' : 'Health', mode: MODE, price: price, sub: sub, lines: rows };
  }

  /* ---------------- send this quote ---------------- */
  var panel = $('broPanel');
  if (panel) {
    var msg = $('qMsg');
    var say = function (t, bad) {
      msg.textContent = t; msg.className = 'brandmsg' + (bad ? ' bad' : '');
      if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ''; }, 3500);
    };
    var build = function () {
      var q = readQuote();
      if (!q.ok) { say('Get a price above first.', true); return null; }
      q.client = $('broClient').value.trim(); q.phone = ($('qPhone') && $('qPhone').value.trim()) || ''; q.t = new Date().toISOString();
      return q;
    };
    if (BRAND) {   /* an insurer's agent quotes; the insurer bills: no broker comparison, invoice or discount */
      panel.querySelectorAll('.qbro').forEach(function (el) { el.classList.add('hidden'); });
      $('qActions').classList.remove('n6');
    }
    $('qWhatsApp').onclick = function () { var q = build(); if (q) window.open(BrocareBrand.waUrl(BrocareBrand.message(sender(), q), q.phone), '_blank', 'noopener'); };
    $('qShow').onclick = function () { var q = build(); if (q) showClient(q); };
    $('qSave').onclick = function () {
      var q = build(); if (!q) return;
      BrocareBrand.save(q, sender().key);
      say('Saved. It is under My quotes on the ' + (BRAND ? BRAND.name + ' ' : '') + 'home page.');
    };
    $('qCopy').onclick = function () {
      var q = build(); if (!q) return;
      if (!BRAND && $('copyBtn')) { $('copyBtn').click(); say('Copied.'); return; }   /* Brocare's own detailed copy */
      var t = BrocareBrand.message(sender(), q);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { say('Copied.'); }, function () { window.prompt('Copy the quote:', t); });
      else window.prompt('Copy the quote:', t);
    };
    $('qBarSend').onclick = function () { $('qWhatsApp').click(); };
  }

  /* ---------------- show the client ---------------- */
  function shortDate(d) { return d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'long' }) + ' ' + d.getFullYear(); }
  function showClient(q) {
    var b = sender(), until = new Date(); until.setDate(until.getDate() + (b.validDays || 15));
    var line, tiles, forWhat;
    if (MODE === 'motor') {
      var p = TARIFF.products.filter(function (x) { return x.id === S.product; })[0];                   /* eslint-disable-line no-undef */
      forWhat = S.year + ' ' + S.brand + (S.models && S.models.length ? ' ' + S.models.join(', ') : '');  /* eslint-disable-line no-undef */
      line = p.name + ', All Risk' + (S.bi && TARIFF.biPrivate ? ' with bodily injury cover' : '');       /* eslint-disable-line no-undef */
      tiles = [['Car value', '$' + Math.round(S.value).toLocaleString('en-US')], ['Cover', p.name], ['Valid until', shortDate(until)]];   /* eslint-disable-line no-undef */
    } else {
      var fam = state.mode === 'family';                                                                  /* eslint-disable-line no-undef */
      var n = fam ? members.filter(function (m) { return m.age !== null && m.age >= 0; }).length : 1;     /* eslint-disable-line no-undef */
      forWhat = fam ? n + ' member' + (n === 1 ? '' : 's') : 'age ' + state.age;                          /* eslint-disable-line no-undef */
      line = state.level + ', ' + (state.amb === 'none' ? 'no out-patient' : state.amb + '% out-patient');  /* eslint-disable-line no-undef */
      tiles = [[fam ? 'Members' : 'Age', fam ? String(n) : String(state.age)], ['Plan', state.level], ['Valid until', shortDate(until)]];   /* eslint-disable-line no-undef */
    }
    var big = q.price.replace(/\s*\/\s*year\s*$/i, '');
    var logo = b.logo ? '<img src="' + esc(/^(data:|https?:|\/)/.test(b.logo) ? b.logo : root + b.logo) + '" alt="' + esc(b.name) + '">'
      : '<div class="brandword"><b>' + esc(b.name) + '</b>' + (b.tagline ? '<i>' + esc(b.tagline) + '</i>' : '') + '</div>';
    var el = document.createElement('div');
    el.className = 'qclient'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Quote for the client');
    el.innerHTML = '<button type="button" class="btn qclose">Close</button><div class="qclient-in"><div class="ql">' + logo + '</div>' +
      '<h2>Your ' + (MODE === 'motor' ? 'motor' : 'health') + ' insurance quote</h2>' +
      '<div class="for">' + (q.client ? 'Prepared for ' + esc(q.client) + ' · ' : '') + esc(forWhat) + '</div>' +
      '<div class="big">' + esc(big) + ' <small>per year</small></div><div class="for">' + esc(line) + '</div>' +
      '<div class="qclient-grid">' + tiles.map(function (t) { return '<div><span>' + esc(t[0]) + '</span><b>' + esc(t[1]) + '</b></div>'; }).join('') + '</div>' +
      '<small class="fine">' + esc(b.disclaimer || 'Indicative quote, subject to underwriting.') + ' ' + esc(b.legalName || b.name) + '</small></div>';
    var prev = document.documentElement.style.overflow;
    var close = function () { el.remove(); document.documentElement.style.overflow = prev; document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    el.querySelector('.qclose').onclick = close;
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(el);
    el.querySelector('.qclose').focus();
  }

  window.QuoterUI = { readQuote: readQuote, showClient: showClient, repaint: repaint, open: function (id) { var s = $(id); if (s) open(s); } };
})();
