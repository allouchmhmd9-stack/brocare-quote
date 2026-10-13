#!/usr/bin/env python3
"""Make (or update) an insurer's demo from its brand kit.

    python tools/new_insurer.py acme --name "Acme" --logo C:/kits/acme/logo.png
    python tools/new_insurer.py acme --colors "#0B3D91,#F2A900" --scheme light
    python tools/new_insurer.py fidelity --tariff-from fidelity        (a tariff already on the site)

Writes, all under brands/ (git-ignored, never published):
    brands/<key>.js            the settings: name, logo, colours, contact, which tariff
    brands/<key>/index.html    the home page (from tools/templates/brand-home.html)
    brands/<key>/logo.<ext>    the logo, copied
    brands/<key>/motor.js, health.js   tariff drafts to fill in, unless --tariff-from

Colours: --colors wins; else they are read from the logo (its main colour and a
second one); else the existing settings are kept. The palette is built so every text
colour meets WCAG contrast on its background, and printed so you can check it.

Running it again on an existing demo keeps everything you do not pass again.
Then: fill the tariff (tariffs/README.md), draft test quotes with
    node tools/check-tariff.mjs <key> --suggest 25
type the insurer's sheet prices into them, and run
    node tools/check-tariff.mjs <key>
until every quote matches. Only then is the demo ready."""
import argparse, colorsys, json, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRANDS = ROOT / "brands"
TEMPLATE = ROOT / "tools" / "templates" / "brand-home.html"
LINES = ("motor", "health")


# ---------------- colour arithmetic ----------------
def hex2rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        sys.exit(f"Not a colour: {h!r} (use #RRGGBB)")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rgb2hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c * 255))):02X}" for c in rgb)


def hls(h, l, s):
    return rgb2hex(colorsys.hls_to_rgb(h % 1, max(0, min(1, l)), max(0, min(1, s))))


def lum(hexc):
    def ch(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex2rgb(hexc)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def toward(hexc, against, need, darker):
    """Move a colour's lightness until it reaches `need` contrast against `against`."""
    h, l, s = colorsys.rgb_to_hls(*hex2rgb(hexc))
    for _ in range(100):
        c = hls(h, l, s)
        if contrast(c, against) >= need:
            return c
        l += -0.01 if darker else 0.01
        if l <= 0 or l >= 1:
            break
    return "#000000" if darker else "#FFFFFF"


def rgba(hexc, a):
    r, g, b = (round(c * 255) for c in hex2rgb(hexc))
    return f"rgba({r},{g},{b},{a})"


def logo_colours(path):
    """The logo's main colour and a second, different one (ignoring white, near-grey and transparent)."""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    im = Image.alpha_composite(bg, im).convert("RGB").resize((80, 80))
    counts = {}
    pixels = im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()
    for r, g, b in pixels:
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if l > 0.92 or (s < 0.12 and l > 0.25):          # paper, light greys, mid greys
            continue
        key = (r // 24, g // 24, b // 24)
        counts[key] = counts.get(key, 0) + 1
    if not counts:
        return None, None
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    centre = lambda k: rgb2hex(tuple((v * 24 + 12) / 255 for v in k))
    first = centre(ranked[0][0])
    h1, l1, _ = colorsys.rgb_to_hls(*hex2rgb(first))
    # the second colour: a different hue first (the gold beside a green), and only then a
    # lighter or darker shade of the same one; the soft edges of the main colour never count
    second = None
    for want_hue in (True, False):
        for k, n in ranked[1:]:
            if n < 6:
                break
            c = centre(k)
            h2, l2, s2 = colorsys.rgb_to_hls(*hex2rgb(c))
            dh = min(abs(h1 - h2), 1 - abs(h1 - h2))
            if (want_hue and dh > 0.07 and s2 > 0.3) or (not want_hue and abs(l1 - l2) > 0.25):
                second = c
                break
        if second:
            break
    return first, second


def palette(primary, second, scheme):
    h, l, s = colorsys.rgb_to_hls(*hex2rgb(primary))
    s_ui = min(max(s, 0.35), 0.75)
    second = second or hls(h, 0.55, s_ui)
    if scheme == "light":
        bg, surface = hls(h, 0.965, 0.45), "#FFFFFF"
        p = {"scheme": "light", "bg": bg, "surface": surface, "surface2": hls(h, 0.925, 0.45),
             "ink": hls(h, 0.14, min(s_ui, 0.6)), "ink2": hls(h, 0.40, 0.25), "line": hls(h, 0.84, 0.35)}
        p["accent"] = toward(primary, surface, 4.5, darker=True)
        p["accentInk"] = "#FFFFFF"
        p["tag"] = toward(second, surface, 3.0, darker=True)
        p["warn"] = "#C26A00"
    else:
        bg = hls(h, 0.06, 0.45)
        p = {"scheme": "dark", "bg": bg, "surface": hls(h, 0.11, 0.40), "surface2": hls(h, 0.15, 0.40),
             "ink": hls(h, 0.95, 0.30), "ink2": hls(h, 0.68, 0.20), "line": hls(h, 0.22, 0.35)}
        p["accent"] = toward(primary, bg, 4.5, darker=False)
        p["accentInk"] = bg
        p["tag"] = toward(second, bg, 4.5, darker=False)
        p["warn"] = "#FFB020"
    p["accentSoft"] = rgba(p["accent"], 0.10 if scheme == "light" else 0.16)
    p["brand"] = p["ink"]
    p["price"] = p["accent"] if scheme == "light" else p["tag"]
    # the quote document: a dark band in the brand's hue, with a highlight that reads on it
    p["docDark"] = p["ink"] if scheme == "light" else p["bg"]
    p["docHi"] = toward(second, p["docDark"], 4.5, darker=False)
    p["docStrong"] = toward(primary, "#FFFFFF", 4.5, darker=True)
    return p


def complete(p):
    """An older or hand-written palette: add the document colours it does not have yet."""
    light = p.get("scheme") == "light"
    p.setdefault("docDark", p.get("ink") if light else p.get("bg"))
    p.setdefault("docHi", toward(p.get("tag") or p.get("price") or p["accent"], p["docDark"], 4.5, darker=False))
    p.setdefault("docStrong", toward(p["accent"], "#FFFFFF", 4.5, darker=True))
    return p


def report(p):
    pairs = [("ink on bg", p["ink"], p["bg"], 7), ("ink2 on surface", p["ink2"], p["surface"], 4.5),
             ("accent on surface", p["accent"], p["surface"], 4.5), ("button text", p["accentInk"], p["accent"], 4.5),
             ("tag on surface", p["tag"], p["surface"], 3), ("document highlight", p["docHi"], p["docDark"], 4.5)]
    for name, a, b, need in pairs:
        if not (a and b):
            continue
        c = contrast(a, b)
        print(f"   {name:<20} {a} on {b}  {c:4.1f}:1  {'ok' if c >= need else 'LOW, pick other colours'}")


# ---------------- the existing settings, if any ----------------
def read_settings(key):
    f = BRANDS / f"{key}.js"
    if not f.exists():
        return {}
    js = ("const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);"
          f"vm.runInContext(fs.readFileSync({json.dumps(str(f))},'utf8'),c);"
          "process.stdout.write(JSON.stringify(c.window.BROCARE_BRAND||{}));")
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if out.returncode:
        sys.exit("Could not read " + str(f) + ":\n" + out.stderr)
    return json.loads(out.stdout or "{}")


MOTOR_DRAFT = """/* {name} · Motor All Risk tariff: DRAFT, fill in from {name}'s own tariff document.
   Format: tariffs/README.md. Until the tariff check passes, this demo is not ready. */
(window.BROCARE_TARIFFS = window.BROCARE_TARIFFS || {{ motor: {{}}, health: {{}} }}).motor.{key} = {{
  key: '{key}', name: '{name}', tariffTag: 'FILL IN tariff', maxValue: 150000,
  biPrivate: 45,                              /* compulsory bodily injury on a private car */
  referNote: 'Refer to {name}',
  blurb: [ ['EXAMPLE PLAN', 'One line on what this plan covers.'] ],
  products: [
    {{ id: 'example', name: 'EXAMPLE PLAN', min: 600, agency: false, fuels: ['Gasoline', 'Hybrid'],
      note: 'replace with the real plans',
      bands: [[0, 49999], [50000, 150000]],                       /* value bands, whole dollars */
      years: [ {{ from: 2020, to: 2026, rates: [3.00, 2.50] }} ] }} /* rate % per band, per year row */
  ],
  driverRules: [],                            /* {{ min, max, age }}: no driver under `age` for values min..max */
  sportsMinAge: 0,
  referMakes: {{}},                            /* make: reason it must be referred */
  noAgencyMakes: {{ 'Tesla': 'Tesla has no authorized dealer in Lebanon.' }},
  agencyNeedsDealer: '',
  mtpl: null,
  fuelHint: ''
}};
"""
HEALTH_DRAFT = """/* {name} · Medical tariff: DRAFT, fill in from {name}'s own tariff workbook.
   Format: tariffs/README.md. Until the tariff check passes, this demo is not ready. */
(window.BROCARE_TARIFFS = window.BROCARE_TARIFFS || {{ motor: {{}}, health: {{}} }}).health.{key} = {{
  key: '{key}', name: '{name}', tariffTag: 'FILL IN tariff',
  costOfPolicy: 0,
  sizeMode: 'band',                           /* 'band' (1&2 / 3+) or 'count' (exact family size 1..6) */
  ambStyle: 'tier',
  levelOrder: ['Example'],
  networks: {{ 'Example': 'Which hospitals are in and out.' }},
  blurb: [ ['Example', 'One line on this level.'] ],
  books: {{
    new: {{ inpatient: {{ 'A Example': {{ '1&2': {{ 'Co-Nil': {{ '30': 1000 }} }}, '3+': {{ 'Co-Nil': {{ '30': 900 }} }} }} }},
           ambulatory: {{ 'AMB Example 85%': {{ '30': 300 }} }} }},
    renewal: {{ inpatient: {{}}, ambulatory: {{}} }}
  }}
}};
"""


def main():
    ap = argparse.ArgumentParser(description="Make or update an insurer's demo from its brand kit.")
    ap.add_argument("key", help="short name, lower case: acme, fidelity, al-mashrek")
    ap.add_argument("--name"), ap.add_argument("--tagline"), ap.add_argument("--legal-name")
    ap.add_argument("--logo", help="logo file (png, jpg, svg, webp)")
    ap.add_argument("--logo-on-dark", help="a light version of the logo for the dark document band")
    ap.add_argument("--colors", help="main colour, second colour: '#0B3D91,#F2A900'")
    ap.add_argument("--scheme", choices=["light", "dark"])
    ap.add_argument("--products", help="motor,health")
    ap.add_argument("--tariff-from", help="use a tariff already on the site: fidelity, ufa")
    for f in ("address", "phone", "whatsapp", "email", "website"):
        ap.add_argument("--" + f)
    ap.add_argument("--agent"), ap.add_argument("--agent-whatsapp"), ap.add_argument("--agent-email")
    ap.add_argument("--headline"), ap.add_argument("--footer"), ap.add_argument("--disclaimer")
    ap.add_argument("--valid-days", type=int)
    ap.add_argument("--not-demo", action="store_true", help="a delivered app: keep the sign-in, hide the DEMO badge")
    a = ap.parse_args()

    key = a.key.lower()
    if not re.fullmatch(r"[a-z0-9-]{1,30}", key):
        sys.exit("The key must be 1-30 lower-case letters, digits or dashes.")
    old = read_settings(key)
    s = dict(old)
    d = BRANDS / key
    d.mkdir(parents=True, exist_ok=True)

    s["key"] = key
    s["name"] = a.name or old.get("name") or key.title()
    for arg, field in (("tagline", "tagline"), ("legal_name", "legalName"), ("headline", "headline"),
                       ("footer", "footer"), ("disclaimer", "disclaimer")):
        if getattr(a, arg):
            s[field] = getattr(a, arg)
    s.setdefault("footer", f"{s['name']} tariffs. Indicative only, subject to underwriting.")
    s.setdefault("disclaimer", f"Indicative quote, subject to underwriting. No cover until accepted by {s['name']}.")
    if a.valid_days:
        s["validDays"] = a.valid_days
    s.setdefault("validDays", 15)
    if a.not_demo:
        s["demo"] = False
    s.setdefault("demo", True)

    # logo
    if a.logo:
        src = Path(a.logo)
        if not src.exists():
            sys.exit(f"No logo at {src}")
        dst = d / ("logo" + src.suffix.lower())
        shutil.copyfile(src, dst)
        s["logo"] = f"brands/{key}/{dst.name}"
    if a.logo_on_dark:
        src = Path(a.logo_on_dark)
        dst = d / ("logo-on-dark" + src.suffix.lower())
        shutil.copyfile(src, dst)
        s["logoOnDark"] = f"brands/{key}/{dst.name}"
    s.setdefault("logo", None)

    # colours
    scheme = a.scheme or (old.get("palette") or {}).get("scheme") or "light"
    primary = second = None
    if a.colors:
        cs = [c.strip() for c in a.colors.split(",") if c.strip()]
        primary, second = cs[0], (cs[1] if len(cs) > 1 else None)
    elif a.logo and Path(a.logo).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
        primary, second = logo_colours(a.logo)
        if primary:
            print(f"   colours read from the logo: {primary}" + (f", {second}" if second else ""))
    if primary or a.scheme or not old.get("palette"):
        if not primary:
            primary = (old.get("palette") or {}).get("accent") or "#14346F"
            second = second or (old.get("palette") or {}).get("tag")
        s["palette"] = palette(primary, second, scheme)
    s["palette"] = complete(s["palette"])
    print("   palette (" + s["palette"].get("scheme", "?") + "):")
    report(s["palette"])

    # contact and agent
    co = dict(old.get("contact") or {})
    for f in ("address", "phone", "whatsapp", "email", "website"):
        if getattr(a, f):
            co[f] = getattr(a, f)
    s["contact"] = co
    ag = dict(old.get("agent") or {"name": "Demo agent"})
    if a.agent:
        ag["name"] = a.agent
    if a.agent_whatsapp:
        ag["whatsapp"] = a.agent_whatsapp
    if a.agent_email:
        ag["email"] = a.agent_email
    s["agent"] = ag

    # tariff
    if a.tariff_from:
        s["insurer"] = a.tariff_from
        s.pop("tariffs", None)
        have = [l for l in LINES if (ROOT / "tariffs" / l / f"{a.tariff_from}.js").exists()]
        if not have:
            sys.exit(f"No tariff named {a.tariff_from} in tariffs/.")
        s["products"] = have
    else:
        s.setdefault("insurer", key)
        if s["insurer"] == key:
            s["tariffs"] = {}
            for l in LINES:
                f = d / f"{l}.js"
                if not f.exists():
                    f.write_text((MOTOR_DRAFT if l == "motor" else HEALTH_DRAFT).format(key=key, name=s["name"]), encoding="utf-8")
                    print(f"   wrote a tariff draft: brands/{key}/{l}.js")
                s["tariffs"][l] = f"brands/{key}/{l}.js"
    if a.products:
        s["products"] = [p.strip() for p in a.products.split(",") if p.strip() in LINES]
    s.setdefault("products", list(LINES))

    # settings file
    order = ["key", "name", "tagline", "legalName", "insurer", "products", "tariffs", "demo", "logo", "logoOnDark",
             "palette", "contact", "agent", "headline", "footer", "disclaimer", "validDays"]
    ordered = {k: s[k] for k in order if k in s}
    ordered.update({k: v for k, v in s.items() if k not in ordered})
    (BRANDS / f"{key}.js").write_text(
        f"/* {s['name']}: demo brand settings, made by tools/new_insurer.py. LOCAL ONLY: brands/ is\n"
        "   git-ignored and must never be published (it names a real insurer and uses its tariff).\n"
        "   Edit here, or run the script again with new options. */\n"
        "window.BROCARE_BRAND = " + json.dumps(ordered, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
    (d / "index.html").write_text(TEMPLATE.read_text(encoding="utf-8").replace("{{KEY}}", key), encoding="utf-8")

    print(f"\n{s['name']} demo: brands/{key}.js and brands/{key}/index.html")
    print(f"   open:  /brands/{key}/  on the preview server")
    if s.get("tariffs"):
        print(f"   next:  fill brands/{key}/motor.js and health.js from {s['name']}'s tariff (format: tariffs/README.md)")
    print(f"   then:  node tools/check-tariff.mjs {key} --suggest 25   (type the sheet prices into the drafts)")
    print(f"          node tools/check-tariff.mjs {key}                 (must end: Every quote matches the insurer's sheet. Ready.)")


if __name__ == "__main__":
    main()
