/* UFA · Motor Tariff, 01.07.2026.
   Premium = vehicle value x rate%, floored at the plan minimum.
   Loaded by tariffs/load.js; the quoter reads window.BROCARE_TARIFFS.motor.ufa.
   Format: tariffs/README.md. Edit rates here only, then run the tariff check. */
(window.BROCARE_TARIFFS = window.BROCARE_TARIFFS || { motor: {}, health: {} }).motor.ufa = {
  key:'ufa', name:'UFA', tariffTag:'July 2026 tariff', maxValue:150000,
  biPrivate:45,                 /* compulsory bodily injury (إلزامي), private car: Motor Tariff 01.07.2026, section I */
  referNote:'Refer to UFA',
  blurb:[
    ['Standard Plan','Comprehensive cover for cars up to USD 50,000. Spare parts depreciate, no agency repair, and SRCC or natural-hazard damage is capped at USD 1,000.'],
    ['Lux Plan','Higher limits (third-party USD 1.5m), scratching and denting covered, natural hazards up to the full car value, replacement car at USD 50 a day.'],
    ['Lux Plan + Agency Repair','The Lux Plan with repairs at the official dealer, for cars made 2024–2027 only.'],
    ['Lux Plan (Electric)','The Lux Plan on UFA’s separate electric-vehicle tariff. The battery is covered when damaged in an accident.'],
    ['Total Loss','Pays out only on a write-off, with a 10% deductible on own-damage total loss.']
  ],
  products:[
    { id:'ufa-std', name:'Standard Plan', min:615, agency:false, fuels:['Gasoline','Hybrid'],
      note:'Comprehensive · up to USD 50,000 · no agency repair',
      bands:[[0,20000],[20001,50000]],
      years:[
        { from:2022, to:2027, rates:[3.00,2.50] },
        { from:2018, to:2021, rates:[3.20,2.70] },
        { from:2014, to:2017, rates:[3.50,2.90] },
        { from:2010, to:2013, rates:[4.00,3.20] }
      ] },
    { id:'ufa-lux', name:'Lux Plan', min:675, agency:false, fuels:['Gasoline','Hybrid'],
      note:'Higher limits · scratching & denting · replacement car USD 50/day',
      bands:[[0,20000],[20001,50000],[50001,70000],[70001,100000],[100001,150000]],
      years:[
        { from:2022, to:2027, rates:[3.20,2.60,2.40,2.30,2.20] },
        { from:2018, to:2021, rates:[3.50,2.90,2.50,2.40,2.30] },
        { from:2014, to:2017, rates:[3.70,3.10,2.60,2.50,2.40] },
        { from:2011, to:2013, rates:[4.20,3.40,2.80,2.60,2.50] }
      ] },
    { id:'ufa-lux-ag', name:'Lux Plan + Agency Repair', min:825, agency:true, pairWith:'ufa-lux', fuels:['Gasoline','Hybrid'],
      note:'Lux cover with official dealer repair · 2024–2027 vehicles only',
      bands:[[0,20000],[20001,50000],[50001,70000],[70001,100000],[100001,150000]],
      years:[ { from:2024, to:2027, rates:[3.50,2.80,2.70,2.40,2.30] } ] },
    { id:'ufa-ev-lux', name:'Lux Plan (Electric)', min:675, agency:false, fuels:['Electric'], approvalToYear:2021,
      note:'Electric-vehicle tariff · battery covered when damaged in an accident',
      bands:[[0,20000],[20001,50000],[50001,70000],[70001,100000],[100001,150000]],
      years:[ { from:2020, to:2027, rates:[3.20,2.50,2.40,2.30,2.20] } ] },
    { id:'ufa-ev-lux-ag', name:'Lux Plan (Electric) + Agency Repair', min:825, agency:true, pairWith:'ufa-ev-lux', fuels:['Electric'],
      note:'Electric Lux cover with official dealer repair · 2024–2027 only',
      bands:[[0,20000],[20001,50000],[50001,70000],[70001,100000],[100001,150000]],
      years:[ { from:2024, to:2027, rates:[3.50,2.80,2.70,2.40,2.30] } ] },
    { id:'ufa-total', name:'Total Loss', min:225, agency:false,
      note:'Write-off cover only · 10% deductible on own-damage total loss',
      bands:[[0,25000],[25001,50000],[50001,100000]],
      years:[ { from:2017, to:2027, rates:[1.75,1.50,1.30] }, { from:2001, to:2016, rates:[2.00,1.75,1.50] } ] }
  ],
  /* UFA's tariff sets no driver-age bands — it requires a valid licence only. */
  driverRules:[],
  sportsMinAge:0,
  /* "Subject to UFA Special Approval" (Motor All Risk, general guidelines): Chinese cars and
     High-End Agency vehicles. BUMC is read as Lexus (Boustany United Machineries is the Toyota/Lexus
     importer) — Toyota itself is NOT treated as high-end; confirm with UFA. */
  referMakes:{
    'BYD':'UFA needs special approval for Chinese cars.', 'Chery':'UFA needs special approval for Chinese cars.',
    'MG':'UFA needs special approval for Chinese cars.', 'Geely':'UFA needs special approval for Chinese cars.',
    'Mercedes':'UFA needs special approval for High-End Agency vehicles (T. Gargour).',
    'Land Rover':'UFA needs special approval for High-End Agency vehicles (Tewtel).',
    'Range Rover':'UFA needs special approval for High-End Agency vehicles (Tewtel).',
    'Lexus':'UFA needs special approval for High-End Agency vehicles (BUMC).'
  },
  noAgencyMakes:{ 'Tesla':'Tesla has no authorized dealer in Lebanon.' },
  agencyNeedsDealer:'UFA agency repair is for 2024–2027 cars of makes with an authorized dealer in Lebanon.',
  makeNotes:{
    'Kia':'UFA requires an agency-fitted (or UFA-certified) anti-theft alarm and immobilizer on Kia SUVs.',
    'Hyundai':'UFA requires an agency-fitted (or UFA-certified) anti-theft alarm and immobilizer on Hyundai SUVs.'
  },
  /* Compulsory motor third-party liability (MTPL): flat premiums per vehicle category.
     UFA Motor Tariff 01.07.2026, section I. */
  mtpl: {
    driverNote:'Material-damage cover on commercial and taxi vehicles includes bodily injury for the driver: medical USD 1,500 and death/PTD USD 2,500 per person.',
    options:[
      { cat:'Private Cars', label:'Private car, TPL 500,000', md:55, mdSI:500000, bi:45, biSI:500000,
        medical:2000, death:4000, towing:'Unlimited accident towing, unlimited mileage (incl. telescopic).' },
      { cat:'Private Cars', label:'Private car, TPL 750,000', md:65, mdSI:750000, bi:45, biSI:500000,
        medical:2500, death:5000, towing:'Accident towing plus one breakdown tow up to 75 km.' },
      { cat:'Private Cars', label:'Private car, TPL 1,000,000', md:75, mdSI:1000000, bi:45, biSI:500000,
        medical:5000, death:10000, towing:'Accident towing plus two breakdown tows (100 km, then 50 km).' },
      { cat:'Taxis', label:'Taxi', md:80, mdSI:150000, bi:90, biSI:500000,
        towing:'Accident towing plus one breakdown tow up to 35 km.' },
      { cat:'Mini Vans', label:'Mini van', md:80, mdSI:150000, bi:90, biSI:500000,
        towing:'Accident towing plus one breakdown tow up to 35 km.' },
      { cat:'Buses & Vans', label:'Bus / van, up to 11 passengers', md:70, mdSI:100000, bi:135, biSI:500000,
        towing:'Accident towing plus one breakdown tow up to 35 km.' },
      { cat:'Buses & Vans', label:'Bus / van, 12 to 24 passengers', md:80, mdSI:100000, bi:200, biSI:665000,
        towing:'No towing service.' },
      { cat:'Buses & Vans', label:'Bus / van, 25 passengers or more', md:130, mdSI:100000, bi:300, biSI:1000000,
        towing:'No towing service.' },
      { cat:'Pick-ups', label:'Pick-up (Tundra, Tacoma, Ford…)', md:80, mdSI:50000, bi:90, biSI:500000,
        towing:'Accident towing, unlimited mileage.' },
      { cat:'Pick-ups', label:'Pick-up up to 5 tons', md:80, mdSI:50000, bi:90, biSI:500000,
        towing:'Accident towing plus one breakdown tow up to 35 km.' },
      { cat:'Pick-ups', label:'Pick-up 5 to 10 tons', md:170, mdSI:50000, bi:200, biSI:500000,
        towing:'No towing service.' },
      { cat:'Motorcycles', label:'Motorcycle / scooter up to 125 cc', md:30, mdSI:30000, bi:25, biSI:500000,
        towing:'No towing service.' },
      { cat:'Motorcycles', label:'Motorcycle / scooter over 125 cc', md:35, mdSI:30000, bi:35, biSI:500000,
        towing:'No towing service.' },
      { cat:'Refer', label:'Trucks, tankers, tractors, bulldozers, mixers', refer:true },
      { cat:'Refer', label:'Agricultural, excavators, heavy-duty equipment', refer:true }
    ]
  },
  fuelHint: 'UFA prices electric vehicles on a separate tariff, so this changes which plans you see.'
};
