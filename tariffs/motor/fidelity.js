/* Fidelity · Motor All Risk tariff, April 1st 2026 (and its electric-car tariff).
   Premium = vehicle value x rate%, floored at the plan minimum.
   Loaded by tariffs/load.js; the quoter reads window.BROCARE_TARIFFS.motor.fidelity.
   Format: tariffs/README.md. Edit rates here only, then run the tariff check. */
(window.BROCARE_TARIFFS = window.BROCARE_TARIFFS || { motor: {}, health: {} }).motor.fidelity = {
  key:'fidelity', name:'Fidelity', tariffTag:'April 2026 tariff', maxValue:300000,
  biPrivate:45,                 /* compulsory bodily injury (إلزامي), private car */
  referNote:'Refer to Fidelity',
  blurb:[
    ['Prime Drive','Widest cover. Agency dealer repair included, and no depreciation on new spare parts.'],
    ['Smart Drive','Comprehensive cover, but spare parts follow a depreciation scale and there is no agency repair.'],
    ['Collision','Collision damage only, a cut-down cover for older or lower-value cars.'],
    ['Total Loss','Pays out only if the car is a write-off (repairs reaching 65% of its value).'],
    ['Electric Drive Plus','Fidelity’s electric-car tariff with agency dealer repair, which is only available where the make has an authorized dealer in Lebanon. Tesla is excluded.'],
    ['Electric Drive','Fidelity’s electric-car tariff without agency repair. Tesla is excluded. Fidelity sells no Collision or Total Loss plan on electric cars.']
  ],
  products:[
    { id:'prime', name:'Prime Drive', min:785, agency:true, pairWith:'smart', fuels:['Gasoline','Hybrid'],
      note:'Widest cover · agency dealer repair · no depreciation on new spare parts',
      bands:[[0,19999],[20000,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2023, to:2026, rates:[3.75,3.25,2.65,2.50] },
        { from:2020, to:2022, rates:[4.25,3.75,3.00,2.75] },
        { from:2018, to:2019, rates:[null,4.50,3.50,2.95] }
      ] },
    { id:'smart', name:'Smart Drive', min:675, agency:false, fuels:['Gasoline','Hybrid'],
      note:'Comprehensive cover · depreciation scale on spare parts',
      bands:[[0,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2023, to:2026, rates:[2.50,2.25,2.00] },
        { from:2020, to:2022, rates:[3.00,2.50,2.25] },
        { from:2018, to:2019, rates:[3.50,3.00,2.75] },
        { from:2010, to:2017, rates:[3.80,3.25,3.00] }
      ] },
    { id:'collision', name:'Collision', min:405, agency:false, fuels:['Gasoline','Hybrid'],
      note:'Collision damage cover',
      bands:[[0,Infinity]],
      years:[ { from:2016, to:2026, rates:[1.75] }, { from:2005, to:2015, rates:[2.00] } ] },
    { id:'total', name:'Total Loss', min:305, agency:false, fuels:['Gasoline','Hybrid'],
      note:'Total loss cover only',
      bands:[[0,Infinity]],
      years:[ { from:2016, to:2026, rates:[1.25] }, { from:2005, to:2015, rates:[1.75] } ] },
    /* Fidelity's separate electric-car tariff (April 1st, 2026): no Collision or Total Loss plan,
       Tesla excluded from both, agency repair only on Electric Drive Plus. */
    { id:'fid-ev-plus', name:'Electric Drive Plus', min:785, agency:true, pairWith:'fid-ev', fuels:['Electric'],
      note:'Electric-car cover · agency dealer repair · only where the make has an authorized dealer in Lebanon',
      bands:[[0,19999],[20000,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2023, to:2026, rates:[3.75,3.25,2.65,2.50] },
        { from:2020, to:2022, rates:[4.25,3.75,3.00,2.75] }
      ] },
    { id:'fid-ev', name:'Electric Drive', min:705, agency:false, fuels:['Electric'],
      note:'Electric-car cover · no agency repair',
      bands:[[0,49999],[50000,300000]],
      years:[ { from:2020, to:2026, rates:[3.75,3.25] } ] }
  ],
  driverRules:[ { min:50000, max:100000, age:21 }, { min:100001, max:Infinity, age:26 } ],
  sportsMinAge:30,
  /* Makes Fidelity will not quote at all, and makes with no authorized dealer (so no agency repair). */
  referMakes:{ 'Tesla':'Fidelity’s electric-car tariff excludes Tesla.' },
  noAgencyMakes:{ 'Tesla':'Tesla has no authorized dealer in Lebanon.' },
  agencyNeedsDealer:'Fidelity agency repair is subject to an existing authorized dealer in Lebanon for this make. Confirm before promising it.',
  /* Fidelity's compulsory (TPL) tariff has not been supplied yet. */
  mtpl: null,
  fuelHint: 'Fidelity prices electric cars on a separate tariff (Tesla excluded); hybrids use the standard private-car tariff.'
};
