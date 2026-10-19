/* Tariff check: test quotes for one insurer, run through the real quoter pages.

   A case file holds quotes and the price each one must give:
     tariffs/<line>/<insurer>.cases.json      (tariffs on the site: Fidelity, UFA)
     brands/<key>/<line>.cases.json           (an insurer's own demo, never published)

   Every case is checked three ways:
     expect     the price from the insurer's own tariff sheet (typed in by a person),
     app        what the quoter page shows for those inputs,
     reference  a second, independent calculation straight from the tariff file.
   app = reference proves the quoter reads the tariff correctly; expect = app proves
   the tariff file was typed in correctly. Both must hold before a demo.

   motor case: { year, value, fuel, make, driverAge, plan, pv, expect, note }
               expect = the All Risk premium in dollars (before BI), or "refused";
               with pv:true, the premium with Political Violence added
   health case: { biz:'new'|'renewal', ages:[..], level, amb:'85'|'100'|'none', copay,
                  exclHosp, reducedWait, expect, note }
               expect = the yearly total shown (policy cost included), or "refused"   */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);

/* ---------------- where things are ---------------- */
export function brandSettings(key) {
  const f = P('brands', key + '.js');
  if (!fs.existsSync(f)) return null;
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
  return ctx.window.BROCARE_BRAND || null;
}
/* every case file, or those of one insurer / line */
export function caseFiles({ insurer, line } = {}) {
  const out = [];
  for (const l of ['motor', 'health']) {
    if (line && line !== l) continue;
    const dir = P('tariffs', l);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(.+)\.cases\.json$/);
      if (m && (!insurer || insurer === m[1])) out.push({ file: path.join(dir, f), line: l, insurer: m[1], brand: null });
    }
  }
  const bdir = P('brands');
  if (fs.existsSync(bdir)) for (const key of fs.readdirSync(bdir)) {
    const d = path.join(bdir, key);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const l of ['motor', 'health']) {
      if (line && line !== l) continue;
      const f = path.join(d, l + '.cases.json');
      if (!fs.existsSync(f)) continue;
      const b = brandSettings(key);
      const ins = (b && b.insurer) || key;
      if (insurer && insurer !== key && insurer !== ins) continue;
      out.push({ file: f, line: l, insurer: ins, brand: key });
    }
  }
  return out;
}
/* the rate book a page would load, read straight from its file */
export function loadTariff(line, insurer, brand) {
  let rel = 'tariffs/' + line + '/' + insurer + '.js';
  const b = brand && brandSettings(brand);
  if (b && b.tariffs && b.tariffs[line]) rel = b.tariffs[line];
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(P(rel), 'utf8'), ctx);
  const book = ctx.window.BROCARE_TARIFFS[line][insurer];
  if (!book) throw new Error(rel + ' does not define BROCARE_TARIFFS.' + line + '.' + insurer);
  return { book, file: rel };
}

/* the rate book for a policy starting on this date: the April tariff before 1 November 2026, else the current one */
export const DEFAULT_START = '2026-11-15';
export function bookAt(raw, start) {
  return raw.previous && raw.effectiveFrom && (start || DEFAULT_START) < raw.effectiveFrom ? raw.previous : raw;
}

/* ---------------- the independent calculation ---------------- */
const refused = (why) => ({ refused: why });
export function reference(line, book, c) {
  return line === 'motor' ? refMotor(book, c) : refHealth(book, c);
}
function refMotor(book, c) {
  const p = book.products.find((x) => x.name === c.plan);
  if (!p) return refused('no plan named ' + c.plan);
  if (book.evTariffMakes) {     /* electric cars and the listed (Chinese) makes go on the electric tariff */
    const ev = (c.fuel || 'Gasoline') === 'Electric' || book.evTariffMakes.indexOf(c.make) >= 0;
    if (!!p.evTariff !== ev) return refused(c.plan + (ev ? ' is not the tariff for this car' : ' is for electric and listed makes only'));
  } else if (p.fuels && p.fuels.indexOf(c.fuel || 'Gasoline') < 0) return refused(c.plan + ' is not sold for ' + c.fuel);
  if (book.sports && book.sports[c.make] === 'ALL') return refused('sports and luxury referral list');
  if (book.referMakes && book.referMakes[c.make]) return refused(book.referMakes[c.make]);
  if (c.value > book.maxValue) return refused('above the maximum value');
  const v = Math.ceil(c.value), age = c.driverAge == null ? 40 : c.driverAge;
  for (const r of book.driverRules || []) if (v >= r.min && v <= r.max && age < r.age) return refused('driver under ' + r.age);
  const yr = p.years.find((y) => c.year >= y.from && c.year <= y.to);
  if (!yr) return refused('year not covered');
  if (p.approvalToYear && c.year <= p.approvalToYear) return refused('needs special approval');
  const bi = p.bands.findIndex((b) => v >= b[0] && v <= b[1]);
  if (bi < 0) return refused('value not in the tariff');
  const rate = yr.rates[bi];
  if (rate === null || rate === undefined) return refused('not available');
  const prem = Math.max(c.value * rate / 100, p.min);
  if (c.pv) {                  /* Political Violence switched on: premium + its add-on, rounded once */
    const r = (p.pv || []).find((x) => v >= x.min && v <= x.max);
    if (!r) return refused('Political Violence is not offered at this value');
    return { value: Math.round(prem + c.value * r.add / 100) };
  }
  return { value: Math.round(prem) };   /* the page shows whole dollars */
}
function refHealth(book, c) {
  const biz = c.biz || 'new', T = book.books[biz], ages = c.ages, n = ages.length;
  const byCount = book.sizeMode === 'count', copay = c.copay || 'Co-Nil', amb = c.amb || '85';
  const word = c.level.split(' ').slice(1).join(' ');
  const lvl = T.inpatient[c.level];
  if (!lvl) return refused('no level ' + c.level);
  const size = c.size || (n >= 3 ? '3+' : '1&2');
  const byCopay = byCount ? lvl[copay] : lvl[size] && lvl[size][copay];
  if (!byCopay) return refused('no rate for ' + c.level + ' / ' + copay);
  const style = book.ambStyle || (byCount ? 'plan' : 'tier');
  let plan = null;
  if (amb !== 'none') {
    plan = style === 'tier' ? 'AMB ' + word + ' ' + amb + '%' : word + (c.exclHosp && book.hospExclOption ? ' excl. hospitals' : '') + ' ' + amb + '%' + (c.reducedWait && book.reducedWaitOption ? ' (reduced wait)' : '');
  }
  const pick = (cell) => (Array.isArray(cell) ? cell[Math.min(n, cell.length) - 1] : cell);
  let total = book.costOfPolicy || 0;
  for (const age of ages) {
    if (book.maxEntryAge && biz === 'new' && age > book.maxEntryAge) return refused('age ' + age + ' above the entry age');
    const ip = pick(byCopay[age]);
    if (ip === undefined) return refused('age ' + age + ' out of range');
    let a = 0;
    if (plan) { const pd = T.ambulatory[plan]; if (!pd || pd[age] === undefined) return refused('no out-patient ' + plan); a = pick(pd[age]); }
    total += ip + a;
  }
  return { value: Math.round(total * 100) / 100 };
}

/* ---------------- the page ---------------- */
const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
export async function runCase(b, spec, c) {
  const q = spec.brand ? '?brand=' + encodeURIComponent(spec.brand) : '';
  if (spec.line === 'motor') {
    await b.goto('motor/index.html' + q);
    const r = await b.evaluate(`(function(c, ins){
      const $=id=>document.getElementById(id);
      const set=(id,v)=>{const e=$(id); e.value=v; e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
      const seg=(id,v)=>{const x=document.querySelector('#'+id+' [data-v="'+v+'"]'); if(x && !x.classList.contains('on')) x.click(); return !!x;};
      if(!seg('segInsurer',ins)) return {refused:'insurer '+ins+' is not loaded on the page'};
      set('year',c.year); set('value',c.value); seg('segFuel',c.fuel||'Gasoline'); set('brand',c.make||'Toyota');
      { const d=$('startDate'); d.value=c.start||'2026-11-15'; d.dispatchEvent(new Event('change')); }
      set('driverAge', c.driverAge==null?40:c.driverAge);
      const alert=$('eligAlert').textContent.trim();
      const opt=[...document.querySelectorAll('#opts .opt')].find(x=>x.querySelector('.optname').textContent===c.plan);
      if(!opt) return {refused: alert || 'plan not offered'};
      if(opt.disabled || opt.querySelector('.optprice.na')) return {refused: opt.querySelector('.optprice').textContent};
      opt.click();
      const rowOf=k=>[...document.querySelectorAll('#sumRows .srow')].find(r=>r.querySelector('.k').textContent===k);
      if(c.pv){
        const sw=$('pvOn'), pvr=rowOf('Political Violence');
        if(!pvr) return {refused:'Political Violence is not offered at this value'};
        if(sw && $('pvRow').style.display!=='none' && !sw.checked){ sw.checked=true; sw.dispatchEvent(new Event('change')); }
      }
      const row=rowOf('All Risk premium'), pv=c.pv ? rowOf('Political Violence') : null;
      return {shown: row ? row.querySelector('.v').textContent : null, pv: pv ? pv.querySelector('.v').textContent : null};
    })(${JSON.stringify(c)}, ${JSON.stringify(spec.insurer)})`);
    if (r.refused) return r;
    const pvv = r.pv == null ? 0 : (/free/i.test(r.pv) ? 0 : num(r.pv));
    return { value: num(r.shown) + pvv, shown: r.shown + (r.pv ? ' + PV ' + r.pv : '') };
  }
  await b.goto('health/index.html' + q);
  const r = await b.evaluate(`(function(c, ins){
    const $=id=>document.getElementById(id);
    const seg=(id,v)=>{const x=document.querySelector('#'+id+' [data-v="'+v+'"]'); if(x && !x.classList.contains('on')) x.click(); return !!x;};
    if(!seg('segInsurer',ins)) return {refused:'insurer '+ins+' is not loaded on the page'};
    seg('segBiz', c.biz||'new');
    if(c.ages.length>1){
      seg('segMode','family');
      while(document.querySelectorAll('#members .mage').length<c.ages.length) $('addMember').click();
      c.ages.forEach((a,i)=>{const e=document.querySelectorAll('#members .mage')[i]; e.value=a; e.dispatchEvent(new Event('input'));});
    } else { const e=$('age'); e.value=c.ages[0]; e.dispatchEvent(new Event('input')); }
    if(c.size && c.ages.length===1) seg('segSize', c.size);
    if(c.copay) seg('segCopay', c.copay);
    if(c.exclHosp){ $('ufaExcl').checked=true; $('ufaExcl').dispatchEvent(new Event('change')); }
    if(c.reducedWait){ $('ufaWait').checked=true; $('ufaWait').dispatchEvent(new Event('change')); }
    const lv=[...document.querySelectorAll('#levels button')].find(x=>x.dataset.v===c.level);
    if(!lv) return {refused:'level '+c.level+' is not offered'};
    lv.click();
    seg('segAmb', c.amb||'85');
    if($('priceCard').classList.contains('error')) return {refused:$('msg').textContent};
    return {shown:$('priceBig').textContent};
  })(${JSON.stringify(c)}, ${JSON.stringify(spec.insurer)})`);
  return r.refused ? r : { value: num(r.shown), shown: r.shown };
}

/* ---------------- one verdict per case ---------------- */
const same = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005;
export function verdict(c, app, ref) {
  const wantRefused = c.expect === 'refused';
  const appOk = app.refused ? 'refused' : app.value;
  const refOk = ref.refused ? 'refused' : ref.value;
  const engine = (app.refused && ref.refused) || same(app.value, ref.value);
  let sheet = null;                                     /* null: no sheet price typed in yet */
  if (c.expect !== null && c.expect !== undefined) sheet = wantRefused ? !!app.refused : same(app.value, Number(c.expect));
  return { pass: engine && sheet !== false, engine, sheet, app: appOk, ref: refOk, why: app.refused || ref.refused || '' };
}
