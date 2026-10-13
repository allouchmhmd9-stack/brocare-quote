#!/usr/bin/env node
/* Tariff check: run an insurer's test quotes through the real quoter pages.

     node tools/check-tariff.mjs fidelity                 every line with a case file
     node tools/check-tariff.mjs fidelity --line motor
     node tools/check-tariff.mjs acme --suggest 25        draft 25 test quotes per line for acme,
                                                          sheet prices left blank to fill in

   Each quote is checked three ways (see tests/cases.mjs): the price on the insurer's
   own sheet, the price the app shows, and an independent calculation from the tariff
   file. Prints a table, writes reports/<insurer>-<line>-check.html (git-ignored),
   and exits 1 if anything disagrees. Quotes with no sheet price yet are listed as
   "needs the sheet price": the demo is not ready until every one is filled in. */
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser } from '../tests/browser.mjs';
import { ROOT, caseFiles, loadTariff, reference, runCase, verdict, brandSettings } from '../tests/cases.mjs';

const args = process.argv.slice(2);
const insurer = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
if (!insurer) { console.error('Usage: node tools/check-tariff.mjs <insurer> [--line motor|health] [--suggest N]'); process.exit(2); }
const lineOnly = opt('line');

/* ---------------- draft test quotes ---------------- */
if (opt('suggest')) {
  const N = Number(opt('suggest')) || 25;
  const brand = brandSettings(insurer) ? insurer : null;
  const ins = (brand && brandSettings(brand).insurer) || insurer;
  for (const line of ['motor', 'health']) {
    if (lineOnly && lineOnly !== line) continue;
    let t;
    try { t = loadTariff(line, ins, brand); } catch (e) { console.log('  ' + line + ': no tariff file, skipped'); continue; }
    const cases = line === 'motor' ? suggestMotor(t.book, N) : suggestHealth(t.book, N);
    const out = brand ? path.join(ROOT, 'brands', brand, line + '.cases.json') : path.join(ROOT, 'tariffs', line, ins + '.cases.json');
    if (fs.existsSync(out) && !opt('force')) { console.log('  ' + path.relative(ROOT, out) + ' exists (use --force to replace)'); continue; }
    fs.writeFileSync(out, JSON.stringify({ insurer: ins, line, source: 'FILL IN: the tariff document and its date', checkedBy: '',
      howTo: 'For each quote, type the price from the insurer\'s own tariff sheet into "expect" (motor: All Risk premium before BI; health: yearly total incl. policy cost), or "refused" if the sheet does not quote it.',
      cases }, null, 2) + '\n');
    console.log('  wrote ' + cases.length + ' draft quotes to ' + path.relative(ROOT, out));
  }
  process.exit(0);
}
function suggestMotor(book, N) {
  const out = [];
  const make = (p) => (p.fuels && p.fuels.indexOf('Electric') >= 0 && p.fuels.indexOf('Gasoline') < 0 ? 'Kia' : 'Toyota');
  /* every plan, every year row, every value band; band edges first, then the middle */
  const pool = [];
  book.products.forEach((p) => p.years.forEach((y) => p.bands.forEach((b, i) => {
    if (y.rates[i] === null) return;
    const hi = Math.min(b[1], book.maxValue), lo = Math.max(b[0], 5000);
    const fuel = p.fuels ? p.fuels[0] : 'Gasoline';
    pool.push({ year: y.to, value: hi, fuel, make: make(p), driverAge: 40, plan: p.name, expect: null, note: 'top of band ' + (i + 1) + ', ' + y.from + '-' + y.to });
    pool.push({ year: y.from, value: Math.round((lo + hi) / 2 / 500) * 500, fuel, make: make(p), driverAge: 40, plan: p.name, expect: null, note: 'middle of band ' + (i + 1) + ', ' + y.from + '-' + y.to });
  })));
  /* a quote at the minimum premium for each plan */
  book.products.forEach((p) => { const y = p.years[0]; pool.push({ year: y.to, value: 5000, fuel: p.fuels ? p.fuels[0] : 'Gasoline', make: make(p), driverAge: 40, plan: p.name, expect: null, note: 'small value: minimum premium' }); });
  const step = Math.max(1, Math.floor(pool.length / N));
  for (let i = 0; i < pool.length && out.length < N; i += step) out.push(pool[i]);
  return out;
}
function suggestHealth(book, N) {
  const T = book.books.new, levels = Object.keys(T.inpatient), out = [];
  const ages = [[0], [18], [35], [50], [64], [35, 33], [40, 38, 10], [45, 43, 15, 12]];
  levels.forEach((lv) => ages.forEach((a) => out.push({ biz: 'new', ages: a, level: lv, amb: '85', expect: null, note: (a.length > 1 ? 'family of ' + a.length : 'individual age ' + a[0]) })));
  if (book.books.renewal) out.push({ biz: 'renewal', ages: [70], level: levels[0], amb: '85', expect: null, note: 'renewal at 70' });
  const step = Math.max(1, Math.floor(out.length / N));
  return out.filter((_, i) => i % step === 0).slice(0, N);
}

/* ---------------- run the check ---------------- */
const files = caseFiles({ insurer, line: lineOnly });
if (!files.length) { console.error('No case file for ' + insurer + '. Draft one with --suggest.'); process.exit(2); }
const b = await openBrowser();
let bad = 0, missing = 0;
try {
  for (const spec of files) {
    const doc = JSON.parse(fs.readFileSync(spec.file, 'utf8'));
    const { book, file } = loadTariff(spec.line, spec.insurer, spec.brand);
    const rows = [];
    console.log('\n' + book.name + ' · ' + spec.line + ' · ' + doc.cases.length + ' quotes · tariff ' + file + (spec.brand ? ' · demo ' + spec.brand : ''));
    for (const c of doc.cases) {
      const app = await runCase(b, spec, c), ref = reference(spec.line, book, c), v = verdict(c, app, ref);
      rows.push({ c, v });
      if (!v.pass) bad++;
      if (v.sheet === null) missing++;
      const mark = !v.pass ? '✗' : v.sheet === null ? '?' : '✓';
      console.log('  ' + mark + ' ' + describe(spec.line, c).padEnd(58) + ' sheet ' + String(c.expect ?? '-').padStart(9) +
        '  app ' + String(v.app).padStart(9) + '  calc ' + String(v.ref).padStart(9) + (v.why && !v.pass ? '  (' + v.why + ')' : ''));
    }
    writeReport(spec, doc, book, rows);
  }
} finally { await b.close(); }
console.log('\n' + (bad ? bad + ' quote(s) DISAGREE. Not ready.' : missing ? 'App and calculation agree on every quote; ' + missing + ' still need the price from the insurer\'s sheet.' : 'Every quote matches the insurer\'s sheet. Ready.'));
process.exit(bad ? 1 : 0);

function describe(line, c) {
  return line === 'motor'
    ? c.plan + ' · ' + c.year + ' · $' + Number(c.value).toLocaleString('en-US') + (c.fuel && c.fuel !== 'Gasoline' ? ' · ' + c.fuel : '') + (c.make && c.make !== 'Toyota' ? ' · ' + c.make : '') + (c.driverAge != null && c.driverAge !== 40 ? ' · driver ' + c.driverAge : '')
    : c.level + ' · ' + (c.ages.length > 1 ? 'family ' + c.ages.join('/') : 'age ' + c.ages[0]) + ' · ' + (c.amb === 'none' ? 'no out-patient' : (c.amb || '85') + '%') + ((c.biz || 'new') === 'renewal' ? ' · renewal' : '');
}
function writeReport(spec, doc, book, rows) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const money = (x) => (x === 'refused' ? 'Refused' : x == null || x === '' ? '–' : '$' + Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const ok = rows.filter((r) => r.v.pass && r.v.sheet === true).length;
  const brand = spec.brand && brandSettings(spec.brand);
  const accent = (brand && brand.palette && brand.palette.accent) || '#14346F';
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(book.name)} tariff check</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;color:#0B1F44;margin:0;background:#F4F7FB}
.w{max-width:980px;margin:0 auto;padding:28px 18px}h1{margin:0 0 4px;font-size:24px}.s{color:#4A6286}
.big{margin:18px 0;padding:16px 18px;border-radius:14px;background:#fff;border:1px solid #C4D8EE;font-size:18px;font-weight:700}
.big b{color:${accent}}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #C4D8EE;border-radius:12px;overflow:hidden;font-size:13.5px}
th,td{padding:9px 11px;border-bottom:1px solid #E3ECF7;text-align:left}th{background:${accent};color:#fff;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
td.n{text-align:right;font-variant-numeric:tabular-nums}.ok{color:#127A4A;font-weight:800}.no{color:#B3261E;font-weight:800}.q{color:#9A6300;font-weight:800}
.f{margin-top:14px;font-size:12.5px;color:#4A6286}</style>
<div class="w"><h1>${esc(book.name)} · ${spec.line === 'motor' ? 'Motor All Risk' : 'Medical'} tariff check</h1>
<div class="s">${esc(doc.source || '')} · tariff file ${esc(book.tariffTag || '')} · run ${new Date().toISOString().slice(0, 10)}</div>
<div class="big"><b>${ok} of ${rows.length}</b> quotes give exactly the price on ${esc(book.name)}'s own tariff sheet.</div>
<table><tr><th>#</th><th>Quote</th><th class="n">Tariff sheet</th><th class="n">App</th><th class="n">Independent calc</th><th>Result</th></tr>
${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(describe(spec.line, r.c))}${r.c.note ? '<br><span class="s">' + esc(r.c.note) + '</span>' : ''}</td>
<td class="n">${money(r.c.expect)}</td><td class="n">${money(r.v.app)}</td><td class="n">${money(r.v.ref)}</td>
<td>${!r.v.pass ? '<span class="no">✗ differs</span>' : r.v.sheet === null ? '<span class="q">needs sheet price</span>' : '<span class="ok">✓ match</span>'}</td></tr>`).join('')}
</table><div class="f">${spec.line === 'motor' ? 'Motor prices are the All Risk premium before the compulsory BI.' : 'Medical prices are the yearly total including the policy cost.'} Checked by ${esc(doc.checkedBy || '–')}.</div></div>`;
  const dir = path.join(ROOT, 'reports'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, (spec.brand || spec.insurer) + '-' + spec.line + '-check.html');
  fs.writeFileSync(f, html);
  console.log('  report: ' + path.relative(ROOT, f));
}
