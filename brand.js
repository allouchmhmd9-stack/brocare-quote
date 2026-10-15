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
  /* a logo path in the settings is relative to the site root (brands/<key>/logo.png) */
  function logoUrl(b) { return !b.logo ? '' : /^(data:|https?:|\/)/.test(b.logo) ? b.logo : here + b.logo; }
  function rgba(hex, a) {
    var h = String(hex || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16); if (isNaN(n) || h.length !== 6) return 'rgba(79,195,247,' + a + ')';
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------------- saved quotes (this device only) ---------------- */
  /* one list per insurer demo, and one for Brocare's own tools ('brocare') */
  function storeKey(k) { var b = brand(); return 'brocare.brand.' + (k || (b ? b.key : 'brocare')) + '.quotes'; }
  function quotes(k) { try { return JSON.parse(localStorage.getItem(storeKey(k)) || '[]'); } catch (e) { return []; } }
  function put(list, k) { try { localStorage.setItem(storeKey(k), JSON.stringify(list.slice(0, 200))); } catch (e) {} }
  function save(q, k) {
    q.id = q.id || String(Date.now()) + Math.random().toString(36).slice(2, 6);
    q.t = q.t || new Date().toISOString();
    var list = quotes(k); list.unshift(q); put(list, k); return q;
  }
  function remove(id, k) { put(quotes(k).filter(function (q) { return q.id !== id; }), k); }

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
    if (b.agent && b.agent.name) lines.push('', b.agent.name + ', ' + b.name);
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
      '.brandword i{font-style:normal;font-size:11.5px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:' + (p.tag || 'var(--accent)') + '}';
  }

  /* ---------------- the quote document (Document Studio) ----------------
     Same templates, the insurer's letterhead: its logo, colours, legal name, address
     and the agent's contact. No Brocare name or address appears. No invoice: an
     insurer's agent quotes, the insurer bills. */
  function applyStudio(b) {
    var p = b.palette || {}, light = p.scheme === 'light', co = b.contact || {}, ag = b.agent || {};
    var dark = p.docDark || (light ? p.ink : p.bg) || '#05081A';      /* card, masthead, footer */
    var hi = p.docHi || p.tag || p.price || '#4FC3F7';                /* highlights on the dark parts */
    var strong = p.docStrong || p.accent || '#1A3BDB';                /* prices and ticks on white */
    var st = document.createElement('style'); st.id = 'brand-theme';
    st.textContent = themeCss(b) +
      '.top{background:var(--surface)!important;border-bottom:1px solid var(--line)}.top .t1{color:var(--ink)}.top .t2{color:var(--ink2)}';
    document.head.appendChild(st);
    document.title = b.name + ' · Quote document';
    /* the reference carries the insurer's prefix, not Brocare's; the comparison starts empty,
       not with another insurer's sample plans */
    if (typeof D !== 'undefined') {                                                         /* eslint-disable-line no-undef */
      var prefix = b.refPrefix || b.key.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
      if (D.ref) D.ref = String(D.ref).replace(/^BRC(?=-)/, prefix);                        /* eslint-disable-line no-undef */
      if (D.options && D.options[0] && D.options[0].name === 'SP Smart Plus') {             /* eslint-disable-line no-undef */
        D.options = [{ name: 'Option 1', tag: '', price: D.price || 0 }, { name: 'Option 2', tag: '', price: 0 }];  /* eslint-disable-line no-undef */
        D.rows = [{ label: 'Cover', values: ['', ''] }];                                     /* eslint-disable-line no-undef */
      }
      if (typeof window.buildForm === 'function') window.buildForm();
    }
    var back = document.querySelector('.backlink');
    if (back) { back.textContent = '‹ ' + b.name + ' home'; back.href = here + 'brands/' + b.key + '/'; }
    var dot = document.querySelector('.top .dot'); if (dot) dot.classList.add('brand-hide');
    var t1 = document.querySelector('.top .t1'), t2 = document.querySelector('.top .t2');
    if (t1) t1.textContent = 'Quote document';
    if (t2) t2.textContent = b.legalName || b.name;
    var inv = document.querySelector('[data-t="invoice"]'); if (inv) inv.classList.add('brand-hide');

    /* colours: added to the sheet styles, so the PDF and the PNG carry them too */
    var sheetCss = $('sheetCSS');
    if (sheetCss) sheetCss.textContent +=
      '.sheet.card,.sheet .mast,.sheet .foot,.sheet table.items thead th{background:' + dark + '}' +
      '.sheet.card .glow{background:radial-gradient(circle,' + rgba(hi, .30) + ',transparent 68%)}' +
      '.sheet.card .hd .r .v,.sheet.card .figw .fig .cur,.sheet.card .chip .k,.sheet.card .cta .l .p,' +
      '.sheet .mast .r .s,.sheet .foot .c b,.sheet .steps .st .n{color:' + hi + '}' +
      '.sheet.card .figw{border-top-color:' + rgba(hi, .3) + '}' +
      '.sheet.card .chip.hl{background:' + rgba(hi, .1) + ';border-color:' + rgba(hi, .34) + '}' +
      '.sheet .callout,.sheet .pay{border-left-color:' + hi + '}' +
      '.sheet .chead{border-bottom-color:' + dark + '}.sheet .chead.a{border-bottom-color:' + hi + '}' +
      '.sheet .chip-rec{background:' + hi + ';color:' + dark + '}' +
      '.sheet .pcol .amt{color:' + dark + '}.sheet .pcol.a .amt,.sheet .yes,.sheet .totrow.grand span:last-child{color:' + strong + '}' +
      '.sheet .totrow.grand{border-top-color:' + dark + '}' +
      /* the logo: on a white plate, because most logos are dark and the card is dark */
      '.sheet .blogo{display:inline-flex;align-items:center;background:#fff;border-radius:9px;padding:7px 12px}' +
      '.sheet .blogo img{height:32px!important;display:block}.sheet .mast .blogo img{height:50px!important}' +
      '.sheet .blogo.bare{background:transparent;padding:0}' +
      '.sheet .bword{display:inline-flex;flex-direction:column;line-height:1;color:#fff}' +
      '.sheet .bword b{font-family:Syne,sans-serif;font-weight:800;font-size:24px;letter-spacing:-.01em}' +
      '.sheet .bword i{font-style:normal;font-size:8px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:' + hi + ';margin-top:5px}';

    var mark = b.logoOnDark ? '<span class="blogo bare"><img src="' + esc(/^(data:|https?:|\/)/.test(b.logoOnDark) ? b.logoOnDark : here + b.logoOnDark) + '" alt="' + esc(b.name) + '"></span>'
      : b.logo ? '<span class="blogo"><img src="' + esc(logoUrl(b)) + '" alt="' + esc(b.name) + '"></span>'
      : '<span class="bword"><b>' + esc(b.name) + '</b>' + (b.tagline ? '<i>' + esc(b.tagline) + '</i>' : '') + '</span>';
    var who = esc(b.legalName || b.name) + (co.address ? '<br>' + esc(co.address) : '');
    var fix = function (html) {
      var L = (typeof LOGO !== 'undefined') ? '<img src="' + LOGO + '" alt="BroCare">' : null;   /* eslint-disable-line no-undef */
      if (L) html = html.split(L).join(mark);
      html = html.split('BroCare Insurance Brokerage SARL<br>Beirut, Ein el Tineh, Mousaitbeh 5046, 4th Floor').join(who);
      html = html.split('<div class="t">We bind the cover</div><div class="d">We place the risk and agree inception with the insurer.</div>')
        .join('<div class="t">We issue the policy</div><div class="d">' + esc(b.name) + ' confirms the cover and the start date.</div>');
      return html;
    };
    ['tplCard', 'tplComparison', 'tplInvoice'].forEach(function (n) {
      var o = window[n]; if (typeof o === 'function') window[n] = function () { return fix(o.apply(this, arguments)); };
    });
    window.signer = function () { return { name: ag.name || b.name, whatsapp: ag.whatsapp || co.whatsapp || '', email: ag.email || co.email || '' }; };
    window.contactHtml = function () {
      var dotSep = ' &nbsp;&middot;&nbsp; ', me = window.signer();
      var l1 = [co.address ? esc(co.address) : '', co.phone ? '<b>' + esc(co.phone) + '</b>' : '', co.whatsapp ? 'WhatsApp <b>' + esc(co.whatsapp) + '</b>' : ''].filter(Boolean).join(dotSep);
      var l2 = [me.whatsapp && me.whatsapp !== co.whatsapp ? 'Agent <b>' + esc(me.whatsapp) + '</b>' : '', me.email ? esc(me.email) : '', co.website ? esc(co.website) : ''].filter(Boolean).join(dotSep);
      return l1 + (l2 ? '<br>' + l2 : '');
    };
    window.replyNumber = function () { return ag.whatsapp || co.whatsapp || co.phone || ''; };
    if (typeof D !== 'undefined' && D.type === 'invoice') D.type = 'card';                    /* eslint-disable-line no-undef */
    if (typeof window.render === 'function') window.render();
  }

  function apply() {
    var b = brand(); if (!b) return;
    if ($('scaler') && $('sheetCSS')) return applyStudio(b);
    var mode = $('sumBig') ? 'motor' : ($('priceBig') ? 'health' : null);
    if (!mode) return;

    var st = document.createElement('style'); st.id = 'brand-theme'; st.textContent = themeCss(b); document.head.appendChild(st);
    document.title = b.name + ' · ' + (mode === 'motor' ? 'Motor Quoter' : 'Health Quoter');

    /* name and logo */
    var img = document.querySelector('.brandbar .brandlogo');
    if (img) {
      if (b.logo) { img.src = logoUrl(b); img.alt = b.name; }
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

    /* footer */
    var foot = document.querySelector('.foot');
    if (foot) foot.innerHTML = esc(b.footer || '') + '<br>Powered by <b>Brocare AI</b>';
  }

  window.BrocareBrand = { quotes: quotes, save: save, remove: remove, waUrl: waUrl, waNumber: waNumber, message: message, ics: ics, download: download, themeCss: themeCss, esc: esc };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
