#!/usr/bin/env node
/* Screenshots of the quoters at desktop and phone width, for checking the design.
     node tools/shots.mjs <out-dir> [brand]
   Fills a sample motor and health quote first (prices from the real engine).
   Writes motor-desktop.png, motor-phone.png, health-desktop.png, health-phone.png, client.png. */
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser } from '../tests/browser.mjs';

const out = process.argv[2] || 'shots';
const brand = process.argv[3] || '';
fs.mkdirSync(out, { recursive: true });
const b = await openBrowser();
const q = brand ? '?brand=' + brand : '';
async function shot(name, w, h, full = true) {
  if (full) {
    const height = await b.evaluate('Math.max(document.documentElement.scrollHeight, ' + h + ')');
    await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(height, 6000), deviceScaleFactor: 1, mobile: w < 768 });
    await b.sleep(250);
  }
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64'));
  console.log('  ' + name + '.png');
}
const MOTOR = `(async function(){
  const set=(id,v)=>{const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  set('year','2024'); set('value','28000'); set('brand','Toyota'); set('driverAge','38');
  document.activeElement && document.activeElement.blur();
  await new Promise(r=>setTimeout(r,250));
  const o=[...document.querySelectorAll('#opts .opt')].filter(x=>!x.classList.contains('dead')&&!x.classList.contains('twinonly'))[1];
  if(o) o.click();
  document.getElementById('broClient').value='Rida Family';
  await new Promise(r=>setTimeout(r,400)); window.scrollTo(0,0); return 1; })()`;
const HEALTH = `(async function(){
  document.querySelector('#segMode [data-v="family"]').click();
  const a=document.querySelectorAll('#members .mage'); [[0,41],[1,38]].forEach(([i,v])=>{a[i].value=v; a[i].dispatchEvent(new Event('input'));});
  document.activeElement && document.activeElement.blur();
  await new Promise(r=>setTimeout(r,250));
  const l=document.querySelectorAll('#levels button')[1]; if(l) l.click();
  await new Promise(r=>setTimeout(r,400)); window.scrollTo(0,0); return 1; })()`;
try {
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    await b.goto('motor/index.html' + q, { width: w, height: h });
    await b.evaluate(MOTOR); await shot('motor-' + tag, w, h);
    await b.goto('health/index.html' + q, { width: w, height: h });
    await b.evaluate(HEALTH); await shot('health-' + tag, w, h);
  }
  await b.goto('motor/index.html' + q, { width: 1440, height: 900 });
  await b.evaluate(MOTOR);
  await b.evaluate("document.getElementById('qShow').click(); 1");
  await b.sleep(400); await shot('client', 1440, 900, false);
  await b.goto('motor/index.html' + q, { width: 1440, height: 900 });
  await shot('motor-empty', 1440, 900);
} finally { await b.close(); }
