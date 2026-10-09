/* Test helper: serves this repo on 127.0.0.1 and drives headless Chrome over the
   DevTools protocol (Node 22+ has fetch and WebSocket built in, so no packages).
   Chrome:        BROCARE_CHROME          (default: the usual Windows install path)
   Profile dir:   BROCARE_CHROME_PROFILE  (default: a folder in the OS temp dir)  */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.BROCARE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = process.env.BROCARE_CHROME_PROFILE || path.join(os.tmpdir(), 'brocare-quote-tests');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.onnx': 'application/octet-stream' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

export async function openBrowser() {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  /* a profile folder serves one Chrome at a time: if another run holds it, wait for it */
  let proc, target;
  const lock = path.join(PROFILE, 'lockfile');
  const busy = () => { if (!fs.existsSync(lock)) return false; try { fs.closeSync(fs.openSync(lock, 'r+')); return false; } catch (_) { return true; } };
  for (let attempt = 0; attempt < 30 && !target; attempt++) {
    for (let w = 0; w < 120 && busy(); w++) await sleep(2500);
    const port = 9400 + Math.floor(Math.random() * 400);
    proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=' + port, '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(250);
      try { target = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find((t) => t.type === 'page'); } catch (_) {}
    }
    if (!target) { proc.kill(); await sleep(5000); }
  }
  if (!target) { srv.close(); throw new Error('Chrome did not start (is another run using ' + PROFILE + '?)'); }
  const exited = new Promise((r) => proc.once('exit', r));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');
  /* window.open records the url instead of opening a tab */
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__opened=[];window.open=function(u){window.__opened.push(String(u));return null;};' });

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const ex = r.result && r.result.exceptionDetails;
    if (ex) throw new Error('page error: ' + ((ex.exception && ex.exception.description) || ex.text));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  /* preload: a script run before the page's own (e.g. to set window.BROCARE_BRAND) */
  async function goto(rel, { signedIn = true, width = 1280, height = 900, preload = '' } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await send('Page.navigate', { url: base + 'index.html' });
    await sleep(300);
    await evaluate(signedIn
      ? "localStorage.setItem('brocare.session', JSON.stringify({user:'ali', exp:Date.now()+3600e3})); localStorage.removeItem('brocare.brand.test.quotes'); sessionStorage.clear(); 1"
      : "localStorage.removeItem('brocare.session'); sessionStorage.clear(); 1");
    const pre = preload ? (await send('Page.addScriptToEvaluateOnNewDocument', { source: preload })).result.identifier : null;
    await send('Page.navigate', { url: base + rel });
    for (let i = 0; i < 60; i++) {
      await sleep(100);
      try { if (await evaluate('document.readyState') === 'complete') break; } catch (_) {}
    }
    if (pre) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: pre });
    await sleep(150);
  }
  async function close() {
    try { await Promise.race([send('Browser.close'), sleep(2000)]); } catch (_) {}
    try { ws.close(); } catch (_) {}
    proc.kill(); srv.closeAllConnections(); srv.close();
    await Promise.race([exited, sleep(5000)]);
    proc.unref();
  }
  return { base, send, evaluate, goto, close, sleep };
}
