# Tariffs, and how a new insurer's demo is made

One quoter, many insurers. Each insurer is **data**: a settings file (brand) and a
tariff file per line. The quoter pages never name an insurer.

| What | Where | Published? |
|---|---|---|
| Tariffs on the Brocare site (Fidelity, UFA) | `tariffs/<line>/<insurer>.js` | yes |
| Their test quotes | `tariffs/<line>/<insurer>.cases.json` | yes |
| An insurer's demo: settings | `brands/<key>.js` | **never** (`brands/` is git-ignored) |
| An insurer's demo: home page, logo, own tariff, test quotes | `brands/<key>/` | **never** |
| Tariff-check reports | `reports/` | **never** |

`tariffs/load.js` puts the right tariffs on each page: Fidelity + UFA on the Brocare
tools, or the one insurer whose brand is open (`?brand=<key>`).

## Making a demo for a meeting

1. **Brand kit in.** Logo (PNG, SVG or JPG; a light version for dark backgrounds if
   they have one), colours if their guide gives them, legal name, address, phone,
   company WhatsApp, email, website, and the name of the agent to show.
2. **Build the demo.**
   ```
   python tools/new_insurer.py acme --name "Acme" --tagline "Insurance" --legal-name "Acme Insurance SAL" \
     --logo path/to/logo.png --address "..." --phone "..." --whatsapp "..." --email "..." --website "..." --agent "..."
   ```
   Colours come from `--colors "#main,#second"`, else from the logo. Every text
   colour is checked for contrast and printed. Run it again any time to change
   something; it keeps what you do not pass.
   If the insurer's tariff is already on the site: `--tariff-from fidelity`.
3. **Tariff in.** Fill `brands/<key>/motor.js` and `health.js` from their own
   tariff document, in the format below.
4. **Prove it.**
   ```
   node tools/check-tariff.mjs acme --suggest 25     drafts 25 test quotes per line
   ```
   Type the price **from their own sheet** into each `expect` (motor: All Risk
   premium before BI; health: yearly total including policy cost), or `"refused"`.
   ```
   node tools/check-tariff.mjs acme
   ```
   Every quote is checked three ways: their sheet, the app, and an independent
   calculation from the tariff file. It must end **"Every quote matches the
   insurer's sheet. Ready."** The report in `reports/` is the page to show them.
5. **Look at it.** Open `/brands/<key>/` on the preview server: a motor and a
   health quote, Send on WhatsApp, Show the client, Quote PDF (their letterhead).

## Motor tariff: `window.BROCARE_TARIFFS.motor.<key>`

```js
{
  key, name, tariffTag: 'April 2026 tariff',
  maxValue: 300000,                 // above this: refer
  biPrivate: 45,                    // compulsory bodily injury on a private car, added to quotes
  referNote: 'Refer to X',
  blurb: [ [plan, one line], ... ], // "More information"
  products: [{
    id, name, min,                  // minimum premium
    agency: true|false, pairWith,   // agency plan and its no-agency twin (for "agency costs +$x")
    fuels: ['Gasoline','Hybrid'] | ['Electric'],   // omit = any fuel
    approvalToYear: 2021,           // optional: cars up to this year need special approval
    note,
    bands: [[0,19999],[20000,49999],...],          // vehicle value, whole dollars
    years: [{ from, to, rates: [3.75, 3.25, ...] }] // rate % per band; null = not sold
  }],
  driverRules: [{ min, max, age }], // no driver under `age` for values min..max
  sportsMinAge, referMakes: { make: reason }, noAgencyMakes: { make: reason },
  agencyNeedsDealer, makeNotes: { make: note },
  mtpl: null | { options: [{ cat, label, md, bi, ... }] },  // compulsory tariff, if supplied
  fuelHint                          // one line under the fuel buttons
}
```
Premium = value × rate %, floored at `min`. A value with cents goes to the next
whole dollar for the band.

## Medical tariff: `window.BROCARE_TARIFFS.health.<key>`

```js
{
  key, name, tariffTag,
  costOfPolicy: 30,                 // once per policy
  sizeMode: 'band' | 'count',       // band: 1&2 / 3+ rates; count: each age holds [size1..size6]
  maxEntryAge: 65,                  // optional: oldest new business
  ambStyle: 'tier' | 'plan',        // out-patient book names: 'AMB Smart 85%' (tier) or 'Smart 85%' (plan)
  levelOrder: ['Prime','Smart Plus','Smart'],   // best cover first
  hospExclOption, reducedWaitOption,            // optional out-patient variants (UFA style)
  networks: { 'Smart': 'hospital sentence', 'SP Prime': '...' },   // printed on the document
  blurb: [ [level, one line], ... ],
  books: { new|renewal: {
    inpatient:  { 'A Prime': { '1&2': { 'Co-Nil': { '0': 570, ... } }, '3+': {...} } },   // band
                // count:  { 'A Optimum': { 'Co-Nil': { '0': [s1..s6], ... } } }
    ambulatory: { 'AMB Prime 85%': { '0': 130, ... } }   // count: arrays by size too
  } }
}
```
Level names are `<class> <plan>`: A / B / SP, then the plan word. Ages are the keys.

## Rules the engine knows, and what would need code

Known: value bands × year rows with a minimum; fuel-specific plans; agency repair and
its dealer conditions; driver-age limits by value; makes referred or refused; special
approval up to a year; maximum value; compulsory BI added; flat compulsory (TPL) table.
Medical: per-age rates, family priced by 1&2 / 3+ bands or by exact size 1..6, policy
cost, entry age, co-pay options, 85 / 100 / no out-patient, renewal rates.

New rule = a few days of code once, then free for every later insurer. Examples:
deductible choices, no-claims discount, regional pricing, a family discount
calculated differently, size bands other than 1&2 / 3+, loadings by occupation.
