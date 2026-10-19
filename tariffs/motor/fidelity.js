/* Fidelity · Motor All Risk tariff, November 1st 2026 (ET-LI-11 ed.30), and its
   Electric & Chinese cars tariff (ET-LI-27 ed.09). Applies to policies starting on or after
   1 November 2026. The April 2026 tariff stays under `previous` for earlier policies.
   Premium = vehicle value x rate%, floored at the plan minimum.
   Political Violence is an option: +0.25% where the tariff says so, free where it says so.
   Loaded by tariffs/load.js; the quoter reads window.BROCARE_TARIFFS.motor.fidelity.
   Format: tariffs/README.md. Edit rates here only, then run the tariff check. */
(window.BROCARE_TARIFFS = window.BROCARE_TARIFFS || { motor: {}, health: {} }).motor.fidelity = {
  key:'fidelity', name:'Fidelity', tariffTag:'November 2026 tariff', maxValue:300000,
  biPrivate:45,                 /* compulsory bodily injury (إلزامي), private car */
  referNote:'Refer to Fidelity',
  blurb:[
    ['Prime Drive','Widest cover. Agency dealer repair, no depreciation on new spare parts, third-party material damage up to $1,000,000.'],
    ['Smart Drive','Comprehensive cover without agency repair. From 2022 models no depreciation on new spare parts when used ones are not available; older models follow the depreciation scale up to 50%.'],
    ['Collision','Collision damage only, third-party material damage up to $500,000, for older or lower-value cars.'],
    ['Total Loss','Pays out only if the car is a write-off (repairs reaching 65% of its value).'],
    ['Political Violence','Optional. +0.25% of the value for cars between $50,000 and $99,999, free from $100,000 on Prime, Smart and the electric and Chinese plans. On Collision and Total Loss: +0.25% above $50,000. Excludes South Lebanon, Bekaa and Dahieh; 10% deductible on a total loss.'],
    ['Electric & Chinese Drive Plus','Fidelity’s tariff for electric cars and Chinese cars of any fuel, with agency dealer repair where the make has an authorized dealer in Lebanon. Tesla and Xiaomi are excluded.'],
    ['Electric & Chinese Drive','The same tariff without agency repair; spare parts follow the depreciation scale. Tesla and Xiaomi are excluded.']
  ],
  /* Chinese makes of any fuel are priced on the electric tariff (Electric & Chinese Drive). */
  evTariffMakes:['BYD','Chery','Geely','MG','Changan','Haval','Great Wall','Jetour','JAC','Dongfeng','GAC',
                 'Exeed','Jaecoo','Omoda','Hongqi','Zeekr','Xpeng','Leapmotor','Voyah','BAIC','M Hero'],
  products:[
    { id:'prime', name:'Prime Drive', min:805, agency:true, pairWith:'smart',
      note:'Widest cover · agency dealer repair · no depreciation on new spare parts',
      bands:[[0,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2024, to:2027, rates:[3.75,2.75,2.50] },
        { from:2022, to:2023, rates:[4.25,3.00,2.75] },
        { from:2020, to:2021, rates:[null,3.50,2.95] }
      ],
      pv:[ { min:50000, max:99999, add:0.25 }, { min:100000, max:300000, add:0 } ] },
    { id:'smart', name:'Smart Drive', min:705, agency:false,
      note:'Comprehensive cover · no agency repair · depreciation scale on spare parts for 2021 and older',
      bands:[[0,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2024, to:2027, rates:[2.75,2.25,2.00] },
        { from:2022, to:2023, rates:[3.25,2.50,2.25] },
        { from:2020, to:2021, rates:[3.75,3.00,2.75] },
        { from:2011, to:2019, rates:[4.00,3.25,3.00] }
      ],
      pv:[ { min:50000, max:99999, add:0.25 }, { min:100000, max:300000, add:0 } ] },
    { id:'collision', name:'Collision', min:405, agency:false,
      note:'Collision damage cover',
      bands:[[0,Infinity]],
      years:[ { from:2017, to:2027, rates:[1.75] }, { from:2006, to:2016, rates:[2.00] } ],
      pv:[ { min:50000, max:Infinity, add:0.25 } ] },
    { id:'total', name:'Total Loss', min:305, agency:false,
      note:'Total loss cover only',
      bands:[[0,Infinity]],
      years:[ { from:2017, to:2027, rates:[1.25] }, { from:2006, to:2016, rates:[1.75] } ],
      pv:[ { min:50000, max:Infinity, add:0.25 } ] },
    /* Electric & Chinese cars tariff (November 1st, 2026): no Collision or Total Loss plan,
       Tesla and Xiaomi excluded, agency repair only on Drive Plus, subject to a dealer. */
    { id:'fid-ev-plus', name:'Electric & Chinese Drive Plus', min:855, agency:true, pairWith:'fid-ev', evTariff:true,
      note:'Electric and Chinese cars · agency dealer repair · only where the make has an authorized dealer in Lebanon',
      bands:[[0,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2024, to:2027, rates:[4.75,3.75,3.00] },
        { from:2022, to:2023, rates:[null,4.00,3.25] }
      ],
      pv:[ { min:50000, max:99999, add:0.25 }, { min:100000, max:300000, add:0 } ] },
    { id:'fid-ev', name:'Electric & Chinese Drive', min:755, agency:false, evTariff:true,
      note:'Electric and Chinese cars · no agency repair · depreciation scale on spare parts',
      bands:[[0,49999],[50000,99999],[100000,300000]],
      years:[
        { from:2024, to:2027, rates:[3.50,3.00,2.50] },
        { from:2022, to:2023, rates:[4.00,3.25,2.75] }
      ],
      pv:[ { min:50000, max:99999, add:0.25 }, { min:100000, max:300000, add:0 } ] }
  ],
  driverRules:[ { min:50000, max:100000, age:21 }, { min:100001, max:Infinity, age:26 } ],
  sportsMinAge:30,
  /* Fidelity's own sports and luxury referral list: the motor tariff's list plus the electric tariff's additions. */
  sports:{
    'Acura':'ALL','Aston Martin':'ALL','Bentley':'ALL','Bugatti':'ALL','Ferrari':'ALL',
    'Lamborghini':'ALL','Lotus':'ALL','McLaren':'ALL','Porsche':'ALL','Rolls Royce':'ALL','M Hero':'ALL',
    'Audi':['RS models','R8'],
    'BMW':['M models','GT'],
    'BYD':['Seal Performance'],
    'Chevrolet':['Camaro','Corvette'],
    'Dodge':['Viper','SRT','Demon','Challenger'],
    'Ford':['Mustang'],
    'Infiniti':['G35','G37'],
    'Jeep':['SRT'],
    'Maserati':['MC20'],
    'Mercedes':['SLR','AMG (excl. SUV)','Maybach','Brabus'],
    'MG':['Cyberster'],
    'Mitsubishi':['Evolution'],
    'Nissan':['350Z','370Z','GTR','Skyline'],
    'Volkswagen':['GTI-R'],
    'Zeekr':['001 FR','7X','9X']
  },
  /* Makes Fidelity will not quote at all, and makes with no authorized dealer (so no agency repair). */
  referMakes:{ 'Tesla':'Fidelity’s electric and Chinese cars tariff excludes Tesla.',
               'Xiaomi':'Fidelity’s electric and Chinese cars tariff excludes Xiaomi.' },
  noAgencyMakes:{ 'Tesla':'Tesla has no authorized dealer in Lebanon.' },
  agencyNeedsDealer:'Fidelity agency repair is subject to an existing authorized dealer in Lebanon for this make. Confirm before promising it.',
  /* Fidelity's compulsory (TPL) tariff has not been supplied yet. */
  mtpl: null,
  fuelHint: 'Electric cars and Chinese cars of any fuel use Fidelity’s Electric & Chinese tariff (Tesla and Xiaomi excluded); other hybrids use the standard tariff.',
  /* Policies starting before this date are priced on the previous tariff below. */
  effectiveFrom:'2026-11-01',
  previous: {
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
}
};
