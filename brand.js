/* Brand layer: the same quoters, in one insurer's name.

   A brand is a settings file, brands/<key>.js, that sets window.BROCARE_BRAND (name,
   colours, logo, which insurer's tariff, footer wording). Open a quoter with
   ?brand=<key> and this file does the rest:

     · loads that settings file (only if it exists on this server),
     · recolours the page and swaps the Brocare logo for the insurer's,
     · locks the quoter to the insurer's own tariff: no insurer switch, no
       "Fidelity vs UFA" comparison, none of the broker's discount or invoice tools,
     · replaces them with what an insurer's agent needs: send the quote on WhatsApp,
       save it, copy it, and (from the brand's home page) set a renewal reminder.

   No brand file, no change: the Brocare tools look and work exactly as before.

   A brand file with demo:true also switches the Brocare sign-in off (auth.js reads
   it). That is safe only because a brand file exists only on a server that has one:
   adding ?brand=anything to the public site loads nothing and changes nothing. */
(function () {
  'use strict';
  var here = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href : '';
  var asked = new URLSearchParams(location.search).get('brand') || '';
  var key = /^[a-z0-9-]{1,30}$/.test(asked) ? asked : '';
  /* a plain write, so the brand file is loaded before the page's own scripts run */
  if (key && !window.BROCARE_BRAND) document.write('<script src="' + here + 'brands/' + key + '.js"><\/script>');

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function brand() { return window.BROCARE_BRAND || null; }

  /* ---------------- saved quotes (this device only) ---------------- */
  function storeKey() { var b = brand(); return 'brocare.brand.' + (b ? b.key : '') + '.quotes'; }
  function quotes() { try { return JSON.parse(localStorage.getItem(storeKey()) || '[]'); } catch (e) { return []; } }
  function put(list) { try { localStorage.setItem(storeKey(), JSON.stringify(list.slice(0, 200))); } catch (e) {} }
  function save(q) {
    q.id = q.id || String(Date.now()) + Math.random().toString(36).slice(2, 6);
    q.t = q.t || new Date().toISOString();
    var list = quotes(); list.unshift(q); put(list); return q;
  }
  function remove(id) { put(quotes().filter(function (q) { return q.id !== id; })); }

  /* ---------------- WhatsApp ---------------- */
  /* Lebanese numbers typed any way: 03 372 190, 71297529, +961 3 372 190, 00961... */
  function waNumber(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0') d = '961' + d.slice(1);
    else if (d.length <= 8) d = '961' + d;
    return d.length >= 9 ? d : '';
  }
  function waUrl(text, phone) { return 'https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(text); }
  function shortDate(d) { return d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' }) + ' ' + d.getFullYear(); }
  function message(b, q) {
    var lines = ['*' + b.name + ' · ' + q.type + ' quote*'];
    if (q.client) lines.push('Client: ' + q.client);
    q.lines.forEach(function (r) { lines.push(r[0] + ': ' + r[1]); });
    var price = /year/i.test(q.sub) ? q.price.replace(/\s*\/\s*year\s*$/i, '') : q.price;   /* the label already says "per year" */
    lines.push('', '*' + q.sub + ': ' + price + '*', '');
    lines.push(b.disclaimer || 'Indicative quote, subject to underwriting.');
    var days = b.validDays || 15, until = new Date(q.t ? Date.parse(q.t) : Date.now()); until.setDate(until.getDate() + days);
    lines.push('Valid until ' + shortDate(until) + '.');
    if (b.agent && b.agent.name) lines.push('', '— ' + b.agent.name + ', ' + b.name);
    return lines.join('\n');
  }

  /* ---------------- renewal reminder (.ics, opens in any calendar) ---------------- */
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function ymd(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function ics(q, startISO, daysBefore) {
    var b = brand() || { name: '' }, d = new Date(startISO + 'T00:00:00');
    if (isNaN(d)) return null;
    d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - (daysBefore == null ? 30 : daysBefore));
    var next = new Date(d); next.setDate(next.getDate() + 1);
    var title = 'Renewal: ' + (q.client || 'client') + ' · ' + q.type + (b.name ? ' · ' + b.name : '');
    var desc = q.lines.map(function (r) { return r[0] + ': ' + r[1]; }).concat(['', q.sub + ': ' + q.price]).join('\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brocare AI//Quoter//EN', 'BEGIN:VEVENT',
      'UID:' + q.id + '@brocare', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART;VALUE=DATE:' + ymd(d), 'DTEND;VALUE=DATE:' + ymd(next),
      'SUMMARY:' + icsText(title), 'DESCRIPTION:' + icsText(desc),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title), 'TRIGGER;RELATED=START:PT9H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function download(name, text, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/calendar' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- colours ---------------- */
  function themeCss(b) {
    var p = b.palette || {}, light = p.scheme === 'light';
    return ':root:root:root:root{color-scheme:' + (light ? 'light' : 'dark') + ';' +
      '--bg:' + p.bg + ';--surface:' + p.surface + ';--surface2:' + p.surface2 + ';--ink:' + p.ink + ';--ink2:' + p.ink2 + ';--line:' + p.line + ';' +
      '--accent:' + p.accent + ';--accent-ink:' + (p.accentInk || '#fff') + ';--accent-soft:' + (p.accentSoft || 'rgba(255,255,255,.08)') + ';' +
      '--brand:' + (p.brand || p.ink) + ';--price:' + (p.price || p.accent) + ';--warn:' + (p.warn || '#FFB020') + '}' +
      'input,select,textarea{color-scheme:' + (light ? 'light' : 'dark') + '}' +
      '::selection{background:' + (p.accentSoft || 'rgba(255,255,255,.25)') + '}' +
      '.brand-hide{display:none!important}#crossBox{display:none!important}' +
      '.brandword{display:flex;flex-direction:column;line-height:1;gap:5px;flex:none}' +
      '.brandword b{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--brand)}' +
      '.brandword i{font-style:normal;font-size:11.5px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:' + (p.tag || 'var(--accent)') + '}' +
      /* "Show the client": the price alone, full screen, to turn the phone around */
      '.bshow{position:fixed;inset:0;z-index:9998;background:var(--bg);color:var(--ink);overflow:auto;display:flex;flex-direction:column;' +
        'padding:20px 20px calc(26px + env(safe-area-inset-bottom));font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '.bshow .bs-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}' +
      '.bshow .bs-x{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:99px;padding:9px 15px;font:700 13px/1 inherit;font-family:inherit;cursor:pointer}' +
      '.bshow .bs-card{margin:auto;width:min(560px,100%);text-align:center;padding:24px 0}' +
      '.bshow .bs-for{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:' + (p.tag || 'var(--ink2)') + '}' +
      '.bshow .bs-name{font-size:24px;font-weight:800;margin:4px 0 16px;letter-spacing:-.01em}' +
      '.bshow .bs-big{font-size:clamp(58px,17vw,104px);font-weight:800;letter-spacing:-.035em;line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}' +
      '.bshow .bs-per{font-size:16px;font-weight:600;color:var(--ink2);margin:8px 0 22px}' +
      '.bshow .bs-rows{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:4px 18px;text-align:left}' +
      '.bshow .bs-rows div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:12px 0;border-top:1px solid var(--line)}' +
      '.bshow .bs-rows div:first-child{border-top:0}' +
      '.bshow .bs-rows span{color:var(--ink2)}' +
      '.bshow .bs-rows b{text-align:right}' +
      '.bshow .bs-valid{margin-top:16px;font-size:13.5px;color:var(--ink2);line-height:1.5}' +
      '.bshow .bs-agent{margin-top:14px;font-weight:700}' +
      '.bshow .bs-wa{margin-top:18px;border:0;background:var(--accent);color:var(--accent-ink);border-radius:12px;padding:14px 22px;font:800 15px/1 inherit;font-family:inherit;cursor:pointer}' +
      '.brandmsg{font-size:12px;font-weight:700;color:var(--price);margin-top:8px;min-height:16px}' +
      '.brandmsg.bad{color:var(--warn)}';
  }

  /* ---------------- the quoter pages ---------------- */
  function readQuote(mode) {
    var rows = [], price, sub, ok;
    if (mode === 'motor') {
      price = $('sumBig').textContent.replace(/\s+/g, ' ').trim(); sub = ($('sumSub') && $('sumSub').textContent.trim()) || 'Annual premium';
      document.querySelectorAll('#sumRows .srow:not(.calc)').forEach(function (r) {
        var k = r.querySelector('.k'), v = r.querySelector('.v');
        if (k && v && k.textContent.trim() !== 'Insurer') rows.push([k.textContent.trim(), v.textContent.trim()]);
      });
      ok = /\d/.test(price) && !$('s4').classList.contains('off');
    } else {
      price = $('priceBig').textContent.replace(/\s+/g, ' ').trim(); sub = $('priceSub').textContent.trim() || 'Price per year';
      document.querySelectorAll('#priceRows .prow:not(.total)').forEach(function (r) {   /* the total row repeats the price */
        var k = r.querySelector('.k'), v = r.querySelector('.v');
        if (k && v) rows.push([k.textContent.trim(), v.textContent.trim()]);
      });
      ok = /\d/.test(price) && !$('priceCard').classList.contains('error');
    }
    return { ok: ok, type: mode === 'motor' ? 'Motor All Risk' : 'Health', mode: mode, price: price, sub: sub, lines: rows };
  }

  /* the screen the agent turns towards the client: price, what it covers, until when, from whom */
  function showClient(b, q) {
    var m = q.price.match(/^(.*?)\s*\/\s*year\s*$/i), big = m ? m[1] : q.price;
    var until = new Date(); until.setDate(until.getDate() + (b.validDays || 15));
    var rows = q.lines.filter(function (r) { return !/^Cost of that agency repair/i.test(r[0]); });
    var mark = b.logo ? '<img src="' + esc(b.logo) + '" alt="' + esc(b.name) + '" style="height:48px">'
      : '<div class="brandword"><b>' + esc(b.name) + '</b>' + (b.tagline ? '<i>' + esc(b.tagline) + '</i>' : '') + '</div>';
    var el = document.createElement('div'); el.className = 'bshow'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Quote for the client');
    el.innerHTML = '<div class="bs-top">' + mark + '<button type="button" class="bs-x">✕ Back</button></div>' +
      '<div class="bs-card"><div class="bs-for">' + esc(q.type) + ' insurance quote</div>' +
      (q.client ? '<div class="bs-name">' + esc(q.client) + '</div>' : '<div style="height:14px"></div>') +
      '<div class="bs-big">' + esc(big) + '</div><div class="bs-per">' + (m ? 'per year' : esc(q.sub)) + '</div>' +
      (rows.length ? '<div class="bs-rows">' + rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' : '') +
      '<div class="bs-valid">Valid until ' + esc(shortDate(until)) + '. ' + esc(b.disclaimer || 'Indicative quote, subject to underwriting.') + '</div>' +
      (b.agent && b.agent.name ? '<div class="bs-agent">' + esc(b.agent.name) + (b.agent.phone ? ' · ' + esc(b.agent.phone) : '') + ' · ' + esc(b.name) + '</div>' : '') +
      '<button type="button" class="bs-wa">Send it to me on WhatsApp</button></div>';
    var prevOverflow = document.documentElement.style.overflow;
    var close = function () { el.remove(); document.documentElement.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    el.querySelector('.bs-x').onclick = close;
    el.querySelector('.bs-wa').onclick = function () { window.open(waUrl(message(b, q), q.phone), '_blank', 'noopener'); };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(el);
    el.querySelector('.bs-x').focus();
  }

  function apply() {
    var b = brand(); if (!b) return;
    var mode = $('sumBig') ? 'motor' : ($('priceBig') ? 'health' : null);
    if (!mode) return;

    var st = document.createElement('style'); st.id = 'brand-theme'; st.textContent = themeCss(b); document.head.appendChild(st);
    document.title = b.name + ' · ' + (mode === 'motor' ? 'Motor Quoter' : 'Health Quoter');

    /* name and logo */
    var img = document.querySelector('.brandbar .brandlogo');
    if (img) {
      if (b.logo) { img.src = b.logo; img.alt = b.name; }
      else { var w = document.createElement('div'); w.className = 'brandword'; w.innerHTML = '<b>' + esc(b.name) + '</b>' + (b.tagline ? '<i>' + esc(b.tagline) + '</i>' : ''); img.replaceWith(w); }
    }
    var back = document.querySelector('.backlink');
    if (back) { back.textContent = '‹ ' + b.name + ' home'; back.href = here + 'brands/' + b.key + '/'; }

    /* one insurer: its own tariff, and no way to switch */
    var seg = $('segInsurer');
    if (seg) {
      var want = seg.querySelector('[data-v="' + b.insurer + '"]');
      if (want && !want.classList.contains('on')) want.click();
      seg.querySelectorAll('button').forEach(function (x) { if (x !== want) x.remove(); });
      if (want) want.disabled = true;
      var lbl = seg.previousElementSibling;
      if (lbl && lbl.classList.contains('insurerlbl')) lbl.textContent = 'Insurer';
    }
    try {
      var book = (typeof INSURERS !== 'undefined') && INSURERS[b.insurer];
      var tpl = document.querySelector('#segCoverType [data-v="mtpl"]');
      if (book && !book.mtpl && tpl) tpl.remove();
    } catch (e) {}

    /* the broker's tools out, the agent's tools in */
    var panel = $('broPanel');
    if (panel) {
      ['broCompare', 'broInvoice', 'broAdd', 'broDiscs', 'broCmpBox', 'broFinal'].forEach(function (id) {
        var el = $(id); if (!el) return;
        (id === 'broFinal' ? el.closest('.bf') : el).classList.add('brand-hide');
      });
      var tot = panel.querySelector('.tot'); if (tot) tot.classList.add('brand-hide');
      var head = panel.querySelector('.bh'); if (head) head.textContent = 'Send this quote';
      var cb = $('copyBtn'); if (cb) cb.classList.add('brand-hide');

      var clientBf = $('broClient').closest('.bf');
      clientBf.querySelector('label').textContent = 'Client name';
      var ph = document.createElement('div'); ph.className = 'bf';
      ph.innerHTML = '<label for="brandPhone">Client WhatsApp (optional)</label><input id="brandPhone" type="tel" inputmode="tel" placeholder="e.g. 03 123 456">';
      clientBf.after(ph);

      var offer = $('broOffer'), btns = offer.parentNode, wa = offer.cloneNode(true);
      wa.textContent = 'Send on WhatsApp'; offer.replaceWith(wa);
      var saveB = document.createElement('button'); saveB.type = 'button'; saveB.className = 'act'; saveB.textContent = 'Save quote';
      var copyB = document.createElement('button'); copyB.type = 'button'; copyB.className = 'act'; copyB.textContent = 'Copy text';
      var showB = document.createElement('button'); showB.type = 'button'; showB.className = 'act'; showB.textContent = 'Show the client';
      btns.append(showB, saveB, copyB);
      var msg = document.createElement('div'); msg.className = 'brandmsg'; msg.setAttribute('aria-live', 'polite'); btns.after(msg);
      var say = function (t, bad) { msg.textContent = t; msg.className = 'brandmsg' + (bad ? ' bad' : ''); if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ''; }, 3500); };
      var build = function () {
        var q = readQuote(mode);
        if (!q.ok) { say('Get a price above first.', true); return null; }
        q.client = $('broClient').value.trim(); q.phone = $('brandPhone').value.trim(); q.t = new Date().toISOString();
        return q;
      };
      wa.onclick = function () { var q = build(); if (q) window.open(waUrl(message(b, q), q.phone), '_blank', 'noopener'); };
      showB.onclick = function () { var q = build(); if (q) showClient(b, q); };
      saveB.onclick = function () { var q = build(); if (q) { save(q); say('Saved. Find it under My quotes on the ' + b.name + ' home page.'); } };
      copyB.onclick = function () {
        var q = build(); if (!q) return; var t = message(b, q);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { say('Copied.'); }, function () { window.prompt('Copy the quote:', t); });
        else window.prompt('Copy the quote:', t);
      };
    }

    /* footer */
    var foot = document.querySelector('.foot');
    if (foot) foot.innerHTML = esc(b.footer || '') + '<br>Powered by <b>Brocare AI</b>';
  }

  window.BrocareBrand = { quotes: quotes, save: save, remove: remove, waUrl: waUrl, waNumber: waNumber, message: message, ics: ics, download: download, themeCss: themeCss, esc: esc };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
