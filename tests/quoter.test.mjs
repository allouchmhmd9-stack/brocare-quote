/* Quoter regression tests: the motor and medical engines checked against prices
   worked out by hand from the INSURERS tables, plus the faults found in the
   9 October 2026 audit. Run from the repo root:  node --test --test-force-exit   */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { openBrowser } from './browser.mjs';

let b;
before(async () => { b = await openBrowser(); });
after(async () => { if (b) await b.close(); });

const settle = (ms = 1100) => `await new Promise(r=>setTimeout(r,${ms}));`;   /* the doc panel re-reads every 900 ms */
const decodeSent = `(function(){ const u=window.__opened.pop()||''; if(!u) return null;
  return JSON.parse(decodeURIComponent(escape(atob(u.split('#data=')[1])))); })()`;
const MOTOR = `window.T={
  set(id,v){const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));},
  seg(id,v){document.querySelector('#'+id+' [data-v="'+v+'"]').click();},
  pick(name){[...document.querySelectorAll('#opts .opt')].find(x=>x.querySelector('.optname').textContent===name).click();},
  big(){return document.getElementById('sumBig').textContent;},
  car(ins,year,value,fuel,brand){ if(ins!=='fidelity') T.seg('segInsurer',ins); T.set('year',year); T.set('value',value);
    if(fuel!=='Gasoline') T.seg('segFuel',fuel); T.set('brand',brand); T.set('driverAge',40); },
  errs:[] };
  window.addEventListener('error',e=>T.errs.push(e.message)); 1`;
const HEALTH = `window.T={
  seg(id,v){document.querySelector('#'+id+' [data-v="'+v+'"]').click();},
  level(v){[...document.querySelectorAll('#levels button')].find(x=>x.dataset.v===v).click();},
  age(v){const e=document.getElementById('age'); e.value=v; e.dispatchEvent(new Event('input'));},
  mage(i,v){const e=document.querySelectorAll('#members .mage')[i]; e.value=v; e.dispatchEvent(new Event('input'));},
  mdob(i,v){const e=document.querySelectorAll('#members .mdate')[i]; e.value=v; e.dispatchEvent(new Event('change'));},
  big(){return document.getElementById('priceBig').textContent;} }; 1`;
const motor = async (opts) => { await b.goto('motor/index.html', opts); await b.evaluate(MOTOR); };
const health = async (opts) => { await b.goto('health/index.html', opts); await b.evaluate(HEALTH); };

/* ---------- motor: premium = value x rate%, floored at the plan minimum, + $45 BI ---------- */
const MOTOR_CASES = [
  /* insurer, year, value, fuel, make, plan, expected All Risk premium (worked by hand) */
  ['fidelity', 2024, 25000, 'Gasoline', 'Toyota', 'Prime Drive', '$813'],     /* 25,000 x 3.25% = 812.50   */
  ['fidelity', 2015, 60000, 'Gasoline', 'Toyota', 'Smart Drive', '$1,950'],   /* 60,000 x 3.25%            */
  ['fidelity', 2016, 10000, 'Gasoline', 'Toyota', 'Collision', '$405'],       /* 175 is below the $405 min */
  ['fidelity', 2021, 40000, 'Electric', 'Kia', 'Electric Drive', '$1,500'],   /* 40,000 x 3.75%            */
  ['fidelity', 2026, 300000, 'Gasoline', 'Toyota', 'Prime Drive', '$7,500'],  /* top band, 2.50%           */
  ['ufa', 2019, 85000, 'Gasoline', 'Toyota', 'Lux Plan', '$2,040'],           /* 70,001-100,000 band 2.40% */
  ['ufa', 2012, 15000, 'Gasoline', 'Toyota', 'Standard Plan', '$615'],        /* 600 is below the $615 min */
  ['ufa', 2010, 30000, 'Gasoline', 'Toyota', 'Total Loss', '$525'],           /* 2001-2016 row, 1.75%      */
  ['ufa', 2025, 45000, 'Gasoline', 'Toyota', 'Lux Plan + Agency Repair', '$1,260']   /* 2.80%            */
];
test('motor premiums match the hand-worked tariff cases', async () => {
  for (const c of MOTOR_CASES) {
    await motor();
    const got = await b.evaluate(`(function(){ T.car(${c.slice(0, 5).map((x) => JSON.stringify(x)).join(',')}); T.pick(${JSON.stringify(c[5])});
      return [...document.querySelectorAll('#sumRows .srow')].find(r=>r.querySelector('.k').textContent==='All Risk premium').querySelector('.v').textContent; })()`);
    assert.equal(got, c[6], c.join(' '));
  }
});
test('motor: a value with cents is placed in the next whole-dollar band, and BI is added', async () => {
  await motor();
  /* Fidelity Smart 2024: 49,999.50 rounds up into 50,000-99,999 at 2.25% = 1,124.99, + 45 */
  const big = await b.evaluate(`(function(){ T.car('fidelity',2024,49999.5,'Gasoline','Toyota'); T.pick('Smart Drive'); return T.big(); })()`);
  assert.equal(big, '$1,170 / year');
});
test('motor: Fidelity refuses a driver under 26 on a car above $100,000', async () => {
  await motor();
  const r = await b.evaluate(`(function(){ T.car('fidelity',2024,100000.5,'Gasoline','Toyota'); T.set('driverAge',25);
    return {alert:document.getElementById('eligAlert').textContent, opts:document.querySelectorAll('#opts .opt').length}; })()`);
  assert.match(r.alert, /under 26/);
  assert.equal(r.opts, 0);
});

test('motor: switching fuel drops a plan that no longer applies (no gasoline price on an electric car)', async () => {
  await motor();
  const r = await b.evaluate(`(function(){ T.car('fidelity',2024,30000,'Gasoline','Kia'); T.pick('Smart Drive'); T.seg('segFuel','Electric');
    return {product:S.product, s4off:document.getElementById('s4').classList.contains('off')}; })()`);
  assert.equal(r.product, null);
  assert.equal(r.s4off, true);
});
test('motor: moving the year outside the chosen plan does not crash or show $NaN', async () => {
  await motor();
  const r = await b.evaluate(`(function(){ T.car('fidelity',2015,30000,'Gasoline','Kia'); T.pick('Smart Drive'); T.set('year',2008);
    return {errs:T.errs, big:T.big(), product:S.product}; })()`);
  assert.deepEqual(r.errs, []);
  assert.doesNotMatch(r.big, /NaN/);
  assert.equal(r.product, null);
});
test('motor: no stale price goes to the Studio after the car is changed to a referred make', async () => {
  await motor();
  const sent = await b.evaluate(`(async function(){ T.car('fidelity',2024,30000,'Gasoline','Kia'); T.pick('Prime Drive'); T.set('brand','Porsche'); ${settle()}
    document.getElementById('broOffer').click(); return {sent:${decodeSent}, warn:document.getElementById('broWarn').style.display}; })()`);
  assert.equal(sent.sent, null);
  assert.equal(sent.warn, 'block');
});
test('motor: the compulsory (TPL) screen never hands over the All Risk price', async () => {
  await motor();
  const sent = await b.evaluate(`(async function(){ T.car('ufa',2024,30000,'Gasoline','Kia'); T.pick('Lux Plan'); T.seg('segCoverType','mtpl'); T.set('mtplPick','0'); ${settle()}
    document.getElementById('broOffer').click(); return ${decodeSent}; })()`);
  assert.equal(sent, null);
});
test('motor: the invoice totals the final price the broker confirmed', async () => {
  await motor();
  const p = await b.evaluate(`(async function(){ T.car('fidelity',2024,30000,'Gasoline','Kia'); T.pick('Prime Drive'); ${settle()}
    const f=document.getElementById('broFinal'); f.value='950'; f.dispatchEvent(new Event('input'));
    document.getElementById('broInvoice').click(); return ${decodeSent}; })()`);
  const sub = p.items.reduce((s, i) => s + i.amount, 0), disc = p.discounts.reduce((s, d) => s + d.amount, 0);
  assert.equal(p.price, 950);
  assert.equal(sub - disc, 950);
});
test('motor brand demo: the TPL screen does not save the All Risk price', async () => {
  const brand = "window.BROCARE_BRAND={key:'test',name:'Test',insurer:'ufa',demo:true,palette:{}};";
  await motor({ preload: brand });
  const r = await b.evaluate(`(function(){ T.car('ufa',2024,30000,'Gasoline','Kia'); T.pick('Lux Plan'); T.seg('segCoverType','mtpl'); T.set('mtplPick','0');
    [...document.querySelectorAll('#broPanel button')].find(x=>x.textContent==='Save quote').click(); return BrocareBrand.quotes().length; })()`);
  assert.equal(r, 0);
});

/* ---------- medical: in-patient + out-patient per member, + Fidelity's $30 policy cost ---------- */
test('medical premiums match the hand-worked tariff cases', async () => {
  const cases = [
    /* Fidelity A Prime 85%: age 35 = 1290 + 315, + 30 */
    ['fid individual 35', `T.age(35); T.level('A Prime'); T.seg('segAmb','85');`, '$1,635 / year'],
    /* two members use the 1&2 rates: (1290+315) + (1360+370) + 30 */
    ['fid family 35,40', `T.seg('segMode','family'); T.mage(0,35); T.mage(1,40); T.level('A Prime'); T.seg('segAmb','85');`, '$3,365 / year'],
    /* an empty third row must not move two people to the 3+ rates */
    ['fid family 35,40 + empty row', `T.seg('segMode','family'); document.getElementById('addMember').click(); T.mage(0,35); T.mage(1,40); T.level('A Prime'); T.seg('segAmb','85');`, '$3,365 / year'],
    /* three members use 3+: (1125+315) + (1190+370) + (570+130) + 30 */
    ['fid family 35,40,5', `T.seg('segMode','family'); document.getElementById('addMember').click(); T.mage(0,35); T.mage(1,40); T.mage(2,5); T.level('A Prime'); T.seg('segAmb','85');`, '$3,730 / year'],
    /* UFA A Optimum 85%, family of 3 = size-3 column: (1287+298) + (1432+338) + (573+142), no policy cost */
    ['ufa family 35,40,5', `T.seg('segInsurer','ufa'); T.seg('segMode','family'); document.getElementById('addMember').click(); T.mage(0,35); T.mage(1,40); T.mage(2,5); T.level('A Optimum'); T.seg('segAmb','85');`, '$4,070 / year'],
    /* UFA individual 35 = size-1 column: 1393 + 323 */
    ['ufa individual 35', `T.seg('segInsurer','ufa'); T.age(35); T.level('A Optimum'); T.seg('segAmb','85');`, '$1,716 / year']
  ];
  for (const [name, steps, want] of cases) {
    await health();
    assert.equal(await b.evaluate(`(function(){ ${steps} return T.big(); })()`), want, name);
  }
});
test('medical: a refused member (UFA entry age) leaves no stale price for the Studio', async () => {
  await health();
  const sent = await b.evaluate(`(async function(){ T.seg('segInsurer','ufa'); T.seg('segMode','family'); T.mage(0,35); T.mage(1,40); T.level('A Optimum'); T.seg('segAmb','85');
    document.getElementById('addMember').click(); T.mage(2,70); ${settle()}
    document.getElementById('broOffer').click(); return ${decodeSent}; })()`);
  assert.equal(sent, null);
});
test('medical: an individual quote does not print the hidden family rows', async () => {
  await health();
  const p = await b.evaluate(`(async function(){ T.seg('segMode','family'); document.getElementById('addMember').click();
    T.mdob(0,'1990-01-01'); T.mdob(1,'1992-02-02'); T.mdob(2,'2015-03-03');
    T.seg('segMode','individual'); T.age(35); T.level('A Prime'); T.seg('segAmb','85'); ${settle()}
    document.getElementById('broOffer').click(); return ${decodeSent}; })()`);
  assert.equal(p.price, 1635);
  assert.equal(p.sub, 'Medical insurance · 1 member');
  assert.equal(p.members, '');
});
test('medical: a family member born in the future is not silently left out of the price', async () => {
  await health();
  const r = await b.evaluate(`(function(){ T.seg('segMode','family'); document.getElementById('addMember').click();
    T.mage(0,35); T.mage(1,40); T.mdob(2,'2099-01-01'); T.level('A Prime'); T.seg('segAmb','85');
    return {error:document.getElementById('priceCard').classList.contains('error'), msg:document.getElementById('msg').textContent}; })()`);
  assert.equal(r.error, true);
  assert.match(r.msg, /Member 3/);
});

/* ---------- Document Studio ---------- */
const studio = (payload, opts) => b.goto('docs/index.html#data=' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'), opts);
test('studio: a crafted link cannot inject markup through the issue date', async () => {
  await studio({ type: 'card', client: 'A', issued: '<img src=x id=pwn onerror="window.__pwn=1">' });
  await b.sleep(300);
  assert.deepEqual(await b.evaluate(`({pwn:!!window.__pwn, el:!!document.getElementById('pwn')})`), { pwn: false, el: false });
});
test('studio: valid-until and payable-by dates are right in Beirut time', async () => {
  await b.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Beirut' });
  try {
    await studio({ type: 'card', client: 'A', issued: '2026-10-09', validDays: 14 });
    assert.match(await b.evaluate(`document.querySelector('#scaler .valid').textContent`), /23 October 2026/);
    await studio({ type: 'invoice', client: 'A', issued: '2026-10-09', dueDays: 14, items: [{ desc: 'x', amount: 1 }], discounts: [] });
    assert.match(await b.evaluate(`document.querySelector('#scaler').textContent`), /Payable by23 October 2026/);
  } finally { await b.send('Emulation.setTimezoneOverride', { timezoneId: '' }); }
});

test('the issue date is the local day, not the UTC one, just after midnight in Beirut', () => {
  /* 01:30 on 10 October in Beirut is still 9 October in UTC */
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [RealDate.parse('2026-10-09T22:30:00Z')])); } }
  const prevTZ = process.env.TZ;
  process.env.TZ = 'Asia/Beirut';
  try {
    const docs = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
    const ctx = { Date: FakeDate, String };
    vm.runInNewContext(docs.match(/const isoLocal = [^\n]*/)[0] + '\n' + docs.match(/function todayISO\(\)\{[^\n]*\}/)[0] + '; this.r=todayISO();', ctx);
    assert.equal(ctx.r, '2026-10-10', 'studio');
    for (const page of ['motor', 'health']) {
      const src = fs.readFileSync(new URL('../' + page + '/index.html', import.meta.url), 'utf8');
      const c2 = { Date: FakeDate };
      vm.runInNewContext(src.match(/function today\(\)\{[^\n]*\}/)[0] + '; this.r=today();', c2);
      assert.equal(c2.r, '2026-10-10', page);
    }
  } finally { if (prevTZ === undefined) delete process.env.TZ; else process.env.TZ = prevTZ; }
});

/* ---------- sign-in hub: ?next= only ever returns to this site ---------- */
test('hub: ?next= cannot send a signed-in person to another site', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fn = src.match(/function nextPage\(\)\{[\s\S]*?\n {2}\}/)[0];
  const at = (next) => {
    const href = 'https://tools.example/index.html?next=' + encodeURIComponent(next);
    const ctx = { URL, URLSearchParams, location: new URL(href) };
    vm.runInNewContext(fn + '; this.r=nextPage();', ctx);
    return ctx.r;
  };
  assert.equal(at('/motor/index.html?x=1#y'), '/motor/index.html?x=1#y');
  assert.equal(at('//evil.example/'), null);
  assert.equal(at('/\\evil.example/'), null);
  assert.equal(at('/\t/evil.example/'), null);
  assert.equal(at('https://evil.example/'), null);
});

/* ---------- phone width ---------- */
test('every tool page fits a 375px phone without sideways scrolling', async () => {
  for (const p of ['index.html', 'motor/index.html', 'health/index.html', 'docs/index.html']) {
    await b.goto(p, { width: 375, height: 812 });
    assert.equal(await b.evaluate('document.documentElement.scrollWidth'), 375, p);
  }
});
