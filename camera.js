/* Guided camera for photographing a card, and a quality check for any photo.

     const files = await BrocareCamera.open({ title, aspect, rules, multi });
        null  = no camera here (caller falls back to the phone's camera app)
        []    = the person closed it
        [File, File, ...]  = photos, already cropped to the guide frame

     BrocareCamera.quality(canvasOrBitmap)  ->  { sharp, mean, glare, long, verdict:{...}, problems:[...] }

   First the rules are shown and must be accepted. Then the live view draws a frame the
   card has to fill, and four checks run several times a second on what is inside it:
   light, focus, glare and steadiness. The photo is taken by itself once all four are
   good, or by the button at any time. The photo is cropped to the frame, so the card
   fills the picture and the reader gets as many pixels on the text as the camera has. */
(function () {
  var CSS = '\
.bcam{position:fixed;inset:0;z-index:9999;background:#02040d;color:#eaf1ff;display:flex;flex-direction:column;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}\
.bcam *{box-sizing:border-box}\
.bcam button{font:inherit;cursor:pointer}\
.bcam-rules{margin:auto;width:min(520px,94vw);max-height:96dvh;overflow:auto;padding:20px 18px;background:#0d1440;border:1px solid #1e3a6e;border-radius:16px}\
.bcam-rules h2{margin:0 0 4px;font-size:19px}\
.bcam-rules p{margin:0 0 12px;color:#93a7cc}\
.bcam-rules ol{margin:0 0 16px;padding:0;list-style:none;display:grid;gap:9px;counter-reset:r}\
.bcam-rules li{counter-increment:r;display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start}\
.bcam-rules li::before{content:counter(r);width:28px;height:28px;border-radius:50%;background:#2d6fff;color:#fff;font-weight:800;display:grid;place-items:center}\
.bcam-rules li b{display:block}\
.bcam-rules li span{color:#93a7cc;font-size:13px}\
.bcam-row{display:flex;gap:9px;flex-wrap:wrap}\
.bcam-go{flex:1 1 200px;border:0;background:#2d6fff;color:#fff;font-weight:800;padding:13px 16px;border-radius:11px}\
.bcam-ghost{border:1px solid #1e3a6e;background:transparent;color:#eaf1ff;padding:13px 16px;border-radius:11px;font-weight:700}\
.bcam-live{display:flex;flex-direction:column;flex:1;min-height:0}\
.bcam-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:#02040d}\
.bcam-title{font-weight:800}\
.bcam-x{border:0;background:#131d55;color:#eaf1ff;width:36px;height:36px;border-radius:50%;font-size:18px}\
.bcam-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:#000}\
.bcam-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\
.bcam-frame{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:10px;box-shadow:0 0 0 100vmax rgba(2,4,13,.62);border:2px dashed rgba(255,255,255,.35);transition:border-color .15s}\
.bcam-frame.ok{border:2px solid #31d07f}\
.bcam-frame i{position:absolute;width:26px;height:26px;border:4px solid #fff;transition:border-color .15s}\
.bcam-frame.ok i{border-color:#31d07f}\
.bcam-frame i:nth-child(1){left:-3px;top:-3px;border-right:0;border-bottom:0;border-top-left-radius:10px}\
.bcam-frame i:nth-child(2){right:-3px;top:-3px;border-left:0;border-bottom:0;border-top-right-radius:10px}\
.bcam-frame i:nth-child(3){left:-3px;bottom:-3px;border-right:0;border-top:0;border-bottom-left-radius:10px}\
.bcam-frame i:nth-child(4){right:-3px;bottom:-3px;border-left:0;border-top:0;border-bottom-right-radius:10px}\
.bcam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s}\
.bcam-flash.on{opacity:.85;transition:none}\
.bcam-hint{padding:9px 14px;text-align:center;font-weight:700;background:#02040d;min-height:42px}\
.bcam-hint.ok{color:#31d07f}\
.bcam-hint.bad{color:#ffb020}\
.bcam-chips{display:flex;justify-content:center;gap:7px;padding:0 10px 8px;background:#02040d;flex-wrap:wrap}\
.bcam-chips span{font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;background:#131d55;color:#93a7cc}\
.bcam-chips span.ok{background:rgba(49,208,127,.16);color:#31d07f}\
.bcam-chips span.bad{background:rgba(255,176,32,.16);color:#ffb020}\
.bcam-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px calc(14px + env(safe-area-inset-bottom));background:#02040d}\
.bcam-shot{width:68px;height:68px;border-radius:50%;border:4px solid #fff;background:#2d6fff;padding:0}\
.bcam-shot:active{transform:scale(.94)}\
.bcam-side{flex:1;display:flex;align-items:center;gap:8px;min-width:0}\
.bcam-side.r{justify-content:flex-end}\
.bcam-thumbs{display:flex;gap:5px}\
.bcam-thumbs img{width:40px;height:26px;object-fit:cover;border-radius:4px;border:1px solid #31d07f}\
.bcam-done{border:0;background:#31d07f;color:#02150c;font-weight:800;padding:10px 14px;border-radius:10px}\
.bcam-done[disabled]{background:#131d55;color:#93a7cc}\
.bcam-torch{border:1px solid #1e3a6e;background:transparent;color:#eaf1ff;padding:9px 11px;border-radius:10px;font-weight:700}\
.bcam-torch.on{background:#ffb020;color:#1b1200;border-color:#ffb020}';

  /* ---------------- quality of a picture ---------------- */
  function sample(src, sx, sy, sw, sh, outW) {
    var s = outW / sw, w = Math.round(outW), h = Math.max(8, Math.round(sh * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }
  /* Looks only at the picture itself: how bright, how much of it is blown-out white,
     and how crisp the edges are (variance of the Laplacian). */
  function measure(src, rect, outW) {
    var sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    var r = rect || { x: 0, y: 0, w: sw, h: sh };
    var d = sample(src, r.x, r.y, r.w, r.h, outW || 480), p = d.data, w = d.width, h = d.height;
    var g = new Float32Array(w * h), sum = 0, hot = 0;
    for (var i = 0, j = 0; i < p.length; i += 4, j++) {
      var l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      g[j] = l; sum += l; if (l > 247) hot++;
    }
    /* crispness = variance of the Laplacian, taken tile by tile; the 80th-percentile tile
       is the text area, so a dark table around the card does not hide a blurry card */
    var gx = 6, gy = 4, tiles = [];
    for (var ty = 0; ty < gy; ty++) for (var tx = 0; tx < gx; tx++) {
      var x0 = Math.floor(tx * w / gx) + 1, x1 = Math.floor((tx + 1) * w / gx) - 1, y0 = Math.floor(ty * h / gy) + 1, y1 = Math.floor((ty + 1) * h / gy) - 1;
      var s = 0, s2 = 0, n = 0;
      for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
        var k = y * w + x, v = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - w] - g[k + w];
        s += v; s2 += v * v; n++;
      }
      if (n) tiles.push(s2 / n - (s / n) * (s / n));
    }
    tiles.sort(function (a, b) { return a - b; });
    var sharp = tiles.length ? tiles[Math.floor(0.8 * (tiles.length - 1))] : 0;
    return { mean: sum / g.length, glare: hot / g.length, sharp: sharp, px: g, w: w, h: h };
  }
  /* Does the card sit on the frame lines? Just inside each edge of the frame the colour
     should be the card, and just outside it the table: where the two look alike the card
     is too small (table on both sides) or too big (card on both sides). Three of four
     edges must show the step; an edge that cannot be sampled does not count against. */
  function fit(src, r0, r1) {
    var W = 240, d = sample(src, r1.x, r1.y, r1.w, r1.h, W), p = d.data, w = d.width, h = d.height;
    var sx = w / r1.w, sy = h / r1.h;
    var X0 = (r0.x - r1.x) * sx, Y0 = (r0.y - r1.y) * sy, X1 = X0 + r0.w * sx, Y1 = Y0 + r0.h * sy;
    function mean(ax, ay, bx, by) {
      ax = Math.max(0, Math.round(ax)); ay = Math.max(0, Math.round(ay)); bx = Math.min(w, Math.round(bx)); by = Math.min(h, Math.round(by));
      if (bx - ax < 2 || by - ay < 2) return null;
      var r = 0, g = 0, b = 0, n = 0, l = 0, l2 = 0;
      for (var y = ay; y < by; y++) for (var x = ax; x < bx; x++) {
        var i = (y * w + x) * 4; r += p[i]; g += p[i + 1]; b += p[i + 2]; n++;
        var lu = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; l += lu; l2 += lu * lu;
      }
      var lm = l / n;
      return [r / n, g / n, b / n, Math.sqrt(Math.max(0, l2 / n - lm * lm))];   /* mean colour, and how much it varies */
    }
    /* the card need not be exactly on the line: try the edges moved 4% in and 4% out */
    var best = null;
    [0, 0.04, -0.04].forEach(function (shift) {
      var x0 = X0 + shift * (X1 - X0), x1 = X1 - shift * (X1 - X0), y0 = Y0 + shift * (Y1 - Y0), y1 = Y1 - shift * (Y1 - Y0);
      var bw = Math.max(3, 0.05 * (x1 - x0)), bh = Math.max(3, 0.07 * (y1 - y0));
      var pairs = [
        [mean(x0 + 2, y0 + bh, x0 + 2 + bw, y1 - bh), mean(x0 - 2 - bw, y0 + bh, x0 - 2, y1 - bh)],   /* left  */
        [mean(x1 - 2 - bw, y0 + bh, x1 - 2, y1 - bh), mean(x1 + 2, y0 + bh, x1 + 2 + bw, y1 - bh)],   /* right */
        [mean(x0 + bw, y0 + 2, x1 - bw, y0 + 2 + bh), mean(x0 + bw, y0 - 2 - bh, x1 - bw, y0 - 2)],   /* top   */
        [mean(x0 + bw, y1 - 2 - bh, x1 - bw, y1 - 2), mean(x0 + bw, y1 + 2, x1 - bw, y1 + 2 + bh)]    /* bottom */
      ];
      var stepped = 0, known = 0;
      pairs.forEach(function (pr) {
        if (!pr[0] || !pr[1]) return;
        known++;
        var dist = Math.sqrt(Math.pow(pr[0][0] - pr[1][0], 2) + Math.pow(pr[0][1] - pr[1][1], 2) + Math.pow(pr[0][2] - pr[1][2], 2));
        if (dist > 28 && pr[1][3] < 24) stepped++;   /* a step, onto a plain surface: the table */
      });
      if (!best || stepped > best.stepped) best = { stepped: stepped, known: known };
    });
    return { stepped: best.stepped, known: best.known, ok: best.known < 3 || best.stepped >= 3 };
  }
  var LIMITS = { dark: 70, bright: 215, glare: 0.035, soft: 120 };   /* soft: measured on real card photos (sharp 500-1000, mildly blurred ~80) */
  function judge(q) {
    var v = {
      light: q.mean < LIMITS.dark ? 'dark' : q.mean > LIMITS.bright ? 'bright' : 'ok',
      glare: q.glare > LIMITS.glare ? 'glare' : 'ok',
      focus: q.sharp < LIMITS.soft ? 'soft' : 'ok'
    };
    var problems = [];
    if (v.light === 'dark') problems.push('too dark: use more light');
    if (v.light === 'bright') problems.push('too bright: move away from direct light');
    if (v.glare === 'glare') problems.push('a reflection covers part of the card: tilt it slightly or change the light');
    if (v.focus === 'soft') problems.push('blurry: hold still, closer, and let it focus');
    return { verdict: v, problems: problems };
  }
  /* for a finished photo: also warns when the picture is small, because the date is
     only a few pixels tall when the card was photographed from far away */
  function quality(src) {
    var q = measure(src, null, 480), j = judge(q), long = Math.max(src.videoWidth || src.width, src.videoHeight || src.height);
    if (long < 800) j.problems.push('low resolution (' + long + ' px): the card is probably too far away or the photo was shrunk');
    return { sharp: q.sharp, mean: q.mean, glare: q.glare, long: long, verdict: j.verdict, problems: j.problems };
  }

  /* ---------------- the guided camera ---------------- */
  var DEFAULT_RULES = [
    ['Good, even light', 'Daylight or a bright lamp. No shadow across the card and no shiny reflection on the plastic.'],
    ['Flat, on a dark surface', 'Lay the card on a table. Take the front, the side with the date of birth. One card per photo.'],
    ['Fill the frame, close', 'The four corners of the card must touch the lines. If the card is small in the frame, the date cannot be read: move closer.'],
    ['Straight from above, hold still', 'Keep the phone parallel to the card, not at an angle. Wait one second until the frame turns green.']
  ];

  function open(opt) {
    opt = opt || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(null);
    var aspect = opt.aspect || 1.586, multi = opt.multi !== false, rules = opt.rules || DEFAULT_RULES;
    if (!document.getElementById('bcam-css')) {
      var st = document.createElement('style'); st.id = 'bcam-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    return new Promise(function (resolve) {
      var root = document.createElement('div'); root.className = 'bcam'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
      var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      root.innerHTML =
        '<div class="bcam-rules"><h2>' + esc(opt.title || 'Photograph the card') + '</h2>' +
        '<p>Four things make the difference between a perfect reading and a wrong one:</p><ol>' +
        rules.map(function (r) { return '<li><div><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div></li>'; }).join('') +
        '</ol><div class="bcam-row"><button type="button" class="bcam-go">I understand, open the camera</button><button type="button" class="bcam-ghost" data-x>Cancel</button></div></div>';
      document.body.appendChild(root);
      var prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';

      var stream = null, timer = 0, files = [], closed = false;
      function finish(result) {
        if (closed) return; closed = true; clearInterval(timer);
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        document.documentElement.style.overflow = prevOverflow; root.remove(); resolve(result);
      }
      root.querySelector('[data-x]').onclick = function () { finish([]); };
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape') finish(files.slice()); });
      root.querySelector('.bcam-go').onclick = start;

      async function start() {
        var go = root.querySelector('.bcam-go'); go.disabled = true; go.textContent = 'Opening the camera…';
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
        } catch (e) { finish(null); return; }
        var track = stream.getVideoTracks()[0];
        try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
        root.innerHTML =
          '<div class="bcam-live"><div class="bcam-top"><span class="bcam-title">' + esc(opt.title || 'Photograph the card') + '</span><button type="button" class="bcam-x" aria-label="Close">✕</button></div>' +
          '<div class="bcam-stage"><video playsinline muted autoplay></video><div class="bcam-frame"><i></i><i></i><i></i><i></i></div><div class="bcam-flash"></div></div>' +
          '<div class="bcam-hint" aria-live="polite">Fit the card inside the frame</div>' +
          '<div class="bcam-chips"><span data-c="light">Light</span><span data-c="focus">Focus</span><span data-c="glare">Reflection</span><span data-c="steady">Steady</span><span data-c="fit">Fits frame</span></div>' +
          '<div class="bcam-bar"><div class="bcam-side"><div class="bcam-thumbs"></div></div><button type="button" class="bcam-shot" aria-label="Take the photo"></button>' +
          '<div class="bcam-side r"><button type="button" class="bcam-torch" hidden>Light</button><button type="button" class="bcam-done" disabled>Done</button></div></div></div>';
        var video = root.querySelector('video'), stage = root.querySelector('.bcam-stage'), frame = root.querySelector('.bcam-frame'),
            hint = root.querySelector('.bcam-hint'), flash = root.querySelector('.bcam-flash'), thumbs = root.querySelector('.bcam-thumbs'),
            done = root.querySelector('.bcam-done'), torchBtn = root.querySelector('.bcam-torch');
        video.srcObject = stream; try { await video.play(); } catch (_) {}
        root.querySelector('.bcam-x').onclick = function () { finish(files.slice()); };
        var caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.torch) {
          torchBtn.hidden = false; var on = false;
          torchBtn.onclick = async function () { on = !on; try { await track.applyConstraints({ advanced: [{ torch: on }] }); torchBtn.classList.toggle('on', on); } catch (_) { on = !on; } };
        }
        function layout() {   /* the frame: as large as fits, card-shaped */
          var w = stage.clientWidth * 0.84, h = w / aspect;
          if (h > stage.clientHeight * 0.84) { h = stage.clientHeight * 0.84; w = h * aspect; }
          frame.style.width = Math.round(w) + 'px'; frame.style.height = Math.round(h) + 'px';
        }
        layout(); window.addEventListener('resize', layout);
        /* where the frame is, in the camera's own pixels (the video is shown cropped to fill) */
        function frameRect(margin) {
          var vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
          var sr = stage.getBoundingClientRect(), fr = frame.getBoundingClientRect(), sc = Math.max(sr.width / vw, sr.height / vh);
          var ox = (vw * sc - sr.width) / 2, oy = (vh * sc - sr.height) / 2, m = margin * fr.width;
          var x0 = (fr.left - sr.left - m + ox) / sc, y0 = (fr.top - sr.top - m + oy) / sc, x1 = (fr.right - sr.left + m + ox) / sc, y1 = (fr.bottom - sr.top + m + oy) / sc;
          x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(vw, x1); y1 = Math.min(vh, y1);
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        var prev = null, good = 0, armed = true, lastShot = 0, holdUntil = 0, fitBadSince = 0, canAuto = opt.auto !== false;
        function setChip(name, ok) { root.querySelector('[data-c=' + name + ']').className = ok ? 'ok' : 'bad'; }
        function say(text, bad, hold) { if (!hold && Date.now() < holdUntil) return; if (hold) holdUntil = Date.now() + 1800; hint.textContent = text; hint.className = 'bcam-hint ' + (bad ? 'bad' : 'ok'); }
        function tick() {
          var r = frameRect(0); if (!r || r.w < 50) return;
          var q = measure(video, r, 480), j = judge(q), v = j.verdict, steady = true;
          var r1 = frameRect(0.12), fitOk = r1 ? fit(video, r, r1).ok : true;
          if (prev && prev.length === q.px.length) {
            var d = 0; for (var i = 0; i < q.px.length; i += 7) d += Math.abs(q.px[i] - prev[i]);
            d /= q.px.length / 7; steady = d < 5; if (d > 14) armed = true;   /* the card moved: ready for the next one */
          }
          prev = q.px;
          setChip('light', v.light === 'ok'); setChip('focus', v.focus === 'ok'); setChip('glare', v.glare === 'ok'); setChip('steady', steady); setChip('fit', fitOk);
          var all = v.light === 'ok' && v.focus === 'ok' && v.glare === 'ok' && steady && (fitOk || opt.requireFit === false);
          frame.classList.toggle('ok', all);
          if (v.light === 'dark') say('Too dark. Add light, or tap Light.', true);
          else if (v.light === 'bright') say('Too bright. Move away from the direct light.', true);
          else if (v.glare === 'glare') say('A reflection is on the card. Tilt it a little.', true);
          else if (!fitOk) {
            fitBadSince = fitBadSince || Date.now();
            say(Date.now() - fitBadSince > 9000 ? 'Cannot see the card edges? If the card fills the frame, tap the round button.' : 'Fit the whole card to the frame: all four corners on the lines.', true);
          }
          else if (v.focus === 'soft') say('Not sharp. Move closer and wait for it to focus.', true);
          else if (!steady) say('Hold still…', true);
          else say(armed && canAuto ? 'Good. Taking the photo…' : 'Good. Tap the button, or Done.', false);
          if (fitOk) fitBadSince = 0;
          good = all ? good + 1 : 0;
          if (all && armed && canAuto && good >= 4 && Date.now() - lastShot > 1800) capture();
        }
        function capture() {
          var r = frameRect(0.05); if (!r) return;
          var c = document.createElement('canvas'); c.width = Math.round(r.w); c.height = Math.round(r.h);
          c.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
          lastShot = Date.now(); armed = false; good = 0;
          flash.classList.add('on'); setTimeout(function () { flash.classList.remove('on'); }, 60);
          c.toBlob(function (b) {
            if (!b) return;
            files.push(new File([b], 'card-' + (files.length + 1) + '.jpg', { type: 'image/jpeg' }));
            var im = new Image(); im.src = URL.createObjectURL(b); thumbs.appendChild(im);
            done.disabled = false; done.textContent = 'Done (' + files.length + ')';
            say('✓ Photo ' + files.length + ' saved. Next card, or tap Done.', false, true);
            if (!multi) finish(files.slice());
          }, 'image/jpeg', 0.93);
        }
        root.querySelector('.bcam-shot').onclick = capture;
        done.onclick = function () { finish(files.slice()); };
        timer = setInterval(tick, 220);
      }
    });
  }

  window.BrocareCamera = { open: open, quality: quality, measure: measure, judge: judge, fit: fit, limits: LIMITS };
})();
