/* Line reader for Arabic and Latin print, including Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩).
   PaddleOCR PP-OCRv5 "arabic" recognition model (Apache-2.0), run inside the page
   with onnxruntime-web (MIT). Tesseract's Arabic model cannot read those digits; this
   one has all ten in its character set and reports how sure it is of each character.
   Nothing is uploaded: the model file is served from this site (models/).

     await BrocarePaddle.read(canvas)  ->  { text, chars:[{ch, conf}], min }

   `canvas` holds ONE line of text. Characters come back in the order they appear on
   screen from left to right, so a date printed 2004/08/13 reads as ٢٠٠٤٠٨١٣. */
(function () {
  var BASE = new URL('.', document.currentScript.src).href;
  var ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js';
  var MODEL = BASE + 'models/arabic_PP-OCRv5_mobile_rec.onnx';
  var DICT = BASE + 'models/arabic_PP-OCRv5_mobile_rec.dict.json';
  var ready = null, queue = Promise.resolve();

  function loadScript(src) {
    return new Promise(function (ok, no) {
      if (window.ort) return ok();
      var s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = function () { no(new Error('The reader could not be downloaded.')); };
      document.head.appendChild(s);
    });
  }
  function load() {
    if (ready) return ready;
    ready = (async function () {
      await loadScript(ORT);
      ort.env.wasm.numThreads = 1; ort.env.logLevel = 'error';   /* one thread needs no special server headers */
      var parts = await Promise.all([
        ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'] }),
        fetch(DICT).then(function (r) { if (!r.ok) throw new Error('dictionary'); return r.json(); })
      ]);
      return { session: parts[0], dict: parts[1] };
    })();
    ready.catch(function () { ready = null; });   /* try again next time */
    return ready;
  }

  async function run(canvas) {
    var m = await load(), H = 48;
    var W = Math.max(48, Math.min(3200, Math.ceil(H * canvas.width / canvas.height)));
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, W, H);
    var px = g.getImageData(0, 0, W, H).data, a = new Float32Array(3 * H * W);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4;
      for (var ch = 0; ch < 3; ch++) a[ch * H * W + y * W + x] = (px[i + (2 - ch)] / 255 - 0.5) / 0.5;   /* BGR, like the model was trained */
    }
    var out = (await m.session.run({ x: new ort.Tensor('float32', a, [1, 3, H, W]) }))[m.session.outputNames[0]];
    var T = out.dims[1], C = out.dims[2], d = out.data, prev = -1, chars = [];
    for (var t = 0; t < T; t++) {   /* greedy CTC: best class per step, drop repeats and the blank (0) */
      var bi = 0, bv = -1;
      for (var k = 0; k < C; k++) { var v = d[t * C + k]; if (v > bv) { bv = v; bi = k; } }
      if (bi !== prev && bi !== 0) chars.push({ ch: m.dict[bi - 1] !== undefined ? m.dict[bi - 1] : ' ', conf: bv });
      prev = bi;
    }
    return {
      text: chars.map(function (x) { return x.ch; }).join(''),
      chars: chars,
      min: chars.length ? Math.min.apply(null, chars.map(function (x) { return x.conf; })) : 0
    };
  }
  /* the model runs one line at a time */
  function read(canvas) {
    var p = queue.then(function () { return run(canvas); });
    queue = p.catch(function () {});
    return p;
  }
  window.BrocarePaddle = { load: load, read: read };
})();
