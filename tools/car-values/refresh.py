#!/usr/bin/env python3
"""Refresh the Lebanon used-car listings database used by the Motor Quoter.

Crawls OLX Lebanon, OpenSooq Lebanon and Autotrader.com.lb, normalises every
listing to USD, and writes motor/car-listings.js (what the quoter loads).

    python tools/car-values/refresh.py                    # all sources
    python tools/car-values/refresh.py --sources olx      # one source
    python tools/car-values/refresh.py --max-pages 5      # quick test run

Polite by design: one request per second per site, small thread pool for the
Autotrader detail pages, results cached for a week. Needs: pip install requests
"""
import argparse, datetime, html, json, re, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT_JS = ROOT / "motor" / "car-listings.js"
RAW_JSON = Path(__file__).with_name("listings.json")
CACHE = Path(__file__).with_name("autotrader_cache.json")

# OLX serves a bot challenge to a full browser UA string and the real page to this.
HEADERS = {"User-Agent": "Mozilla/5.0"}
LBP_PER_USD = 15000          # OpenSooq shows LBP converted at roughly this rate
MIN_YEAR, MIN_PRICE, MAX_PRICE = 2001, 500, 1_000_000
MILE_KM = 1.609344

MAKE_ALIAS = {                # source spelling -> the quoter's dropdown spelling
    "mercedes-benz": "Mercedes", "mercedes benz": "Mercedes", "mercedes": "Mercedes",
    "land-rover": "Land Rover", "land rover": "Land Rover",
    "range-rover": "Range Rover", "range rover": "Range Rover",
    "vw": "Volkswagen", "volkswagen": "Volkswagen", "bmw": "BMW", "mg": "MG", "byd": "BYD",
    "gmc": "GMC", "kia": "Kia", "mini": "Mini", "seat": "Seat", "ssangyong": "SsangYong",
    "rolls-royce": "Rolls Royce", "rolls royce": "Rolls Royce", "alfa-romeo": "Alfa Romeo",
    "aston-martin": "Aston Martin",
}

session = requests.Session()
session.headers.update(HEADERS)


def log(*a):
    print(*a, flush=True)


def fetch(url, tries=4):
    for i in range(tries):
        try:
            r = session.get(url, timeout=30)
            if r.status_code == 200 and r.text:
                return r.text
            if r.status_code in (404, 410):
                return None
        except requests.RequestException:
            pass
        time.sleep(1.5 * (i + 1))
    return None


def nice_make(raw):
    k = (raw or "").strip().lower().replace("_", " ")
    if k in MAKE_ALIAS:
        return MAKE_ALIAS[k]
    return " ".join(w.capitalize() for w in k.replace("-", " ").split())


def nice_slug(s):
    return " ".join(w if w.isupper() else w.capitalize() for w in s.replace("-", " ").split())


def next_data(text):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
    return json.loads(m.group(1)) if m else None


def keep(rec):
    return (rec["make"] and rec["model"] and MIN_YEAR <= rec["year"] <= datetime.date.today().year + 1
            and MIN_PRICE <= rec["price"] <= MAX_PRICE)


# ---------------------------------------------------------------- OLX
def scrape_olx(max_pages):
    base = "https://www.olx.com.lb/en/vehicles/cars-for-sale/"
    out, seen, page, total_pages = [], set(), 1, 1
    while page <= total_pages and page <= max_pages:
        text = fetch(base + (f"?page={page}" if page > 1 else ""))
        d = next_data(text) if text else None
        if not d:
            log(f"  olx page {page}: no data, stopping"); break
        s = d["props"]["pageProps"]["initialState"]["search"]
        total_pages = s["ads"].get("pageCount", 1)
        hits = list(s["ads"]["hits"])
        if page == 1:
            hits += s["eliteAds"]["hits"] + s["featuredAds"]["hits"]
        for h in hits:
            ext = h.get("externalID")
            if ext in seen:
                continue
            seen.add(ext)
            f = {x["attribute"]: x["formattedValue"] for x in h.get("formattedExtraFields", [])}
            x = h.get("extraFields", {})
            try:
                price = float(x.get("price") or h.get("price") or 0)
                year = int(f.get("year") or x.get("year") or 0)
            except (TypeError, ValueError):
                continue
            rec = {"make": nice_make(f.get("make")), "model": (f.get("model") or "").strip(),
                   "year": year, "price": round(price), "km": x.get("mileage"),
                   "src": "o", "url": f"{h.get('slug','ad')}-ID{ext}", "title": h.get("title", "")}
            if keep(rec):
                out.append(rec)
        if page % 20 == 0:
            log(f"  olx page {page}/{total_pages}  ({len(out)} kept)")
        page += 1
        time.sleep(1.0)
    return out


# ---------------------------------------------------------------- OpenSooq
def scrape_opensooq(max_pages):
    base = "https://lb.opensooq.com/en/cars/cars-for-sale"
    out, page, pages = [], 1, 1
    while page <= pages and page <= max_pages:
        text = fetch(base + (f"?page={page}" if page > 1 else ""))
        d = next_data(text) if text else None
        if not d:
            break
        serp = d["props"]["pageProps"]["serpApiResponse"]
        pages = serp["listings"]["meta"].get("pages", 1)
        for it in serp["listings"]["items"]:
            if it.get("price_currency_iso") != "USD":
                continue
            cps = [c.strip() for c in it.get("cps", [])]
            parts = [p.strip() for p in (it.get("highlights") or "").split("»")]
            if len(parts) < 3:
                continue
            make, model = nice_make(parts[0]), parts[1]
            try:
                year = int(parts[2].replace(",", ""))
                lbp = float(re.sub(r"[^\d.]", "", it["price_amount"]))
            except (ValueError, KeyError):
                continue
            price = round(lbp / LBP_PER_USD / 50) * 50
            km = it.get("kilometers_Cars_value_i")
            rec = {"make": make, "model": model, "year": year, "price": price,
                   "km": int(km) if str(km).isdigit() else None, "src": "s", "url": "",
                   "title": " ".join(cps)}
            if keep(rec):
                out.append(rec)
        page += 1
        time.sleep(1.0)
    return out


# ---------------------------------------------------------------- Autotrader
def at_list_urls(max_pages):
    urls, page = [], 1
    while page <= max_pages:
        text = fetch("https://www.autotrader.com.lb/cars/" + (f"page-{page}/" if page > 1 else ""))
        if not text:
            break
        found = re.findall(r'"url":\s*"(https://www\.autotrader\.com\.lb/cars/[^"]+)"', text)
        found = [u for u in found if re.search(r"-\d+$", u)]
        new = [u for u in dict.fromkeys(found) if u not in urls]
        if not new:
            break
        urls += new
        if page % 10 == 0:
            log(f"  autotrader list page {page} ({len(urls)} cars)")
        page += 1
        time.sleep(1.0)
    return urls


def at_detail(url, cache):
    hit = cache.get(url)
    if hit and time.time() - hit["t"] < 7 * 86400:
        return hit["rec"]
    text = fetch(url)
    time.sleep(0.25)
    rec = None
    if text:
        m = re.search(r"<title>(\d{4}) .*? For Sale - (\d+)\$\s*\|?\s*(?:(\d+)\s*(mile|km))?", text)
        parts = url.split("/cars/")[1].split("/")
        if m and len(parts) >= 3:
            km = None
            if m.group(3):
                km = int(int(m.group(3)) * (MILE_KM if m.group(4) == "mile" else 1))
            rec = {"make": nice_make(parts[0]), "model": nice_slug(parts[1]), "year": int(m.group(1)),
                   "price": int(m.group(2)), "km": km, "src": "a",
                   "url": url.replace("https://www.autotrader.com.lb/", ""),
                   "title": re.search(r"<title>(.*?)</title>", text).group(1)}
    cache[url] = {"t": time.time(), "rec": rec}
    return rec


def scrape_autotrader(max_pages):
    cache = json.loads(CACHE.read_text("utf8")) if CACHE.exists() else {}
    urls = at_list_urls(max_pages)
    log(f"  autotrader: {len(urls)} cars listed, fetching details ({sum(1 for u in urls if u in cache)} cached)")
    recs = []
    with ThreadPoolExecutor(4) as ex:
        for i in range(0, len(urls), 100):          # checkpoint so an interrupted run resumes
            recs += list(ex.map(lambda u: at_detail(u, cache), urls[i:i + 100]))
            CACHE.write_text(json.dumps(cache), "utf8")
            log(f"  autotrader details {min(i + 100, len(urls))}/{len(urls)}")
    return [r for r in recs if r and keep(r)]


# ---------------------------------------------------------------- output
def dedupe(rows):
    seen, out = set(), []
    for r in rows:
        k = (r["make"], r["model"].lower(), r["year"], r["price"], r["km"])
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


SOURCES = ("olx", "opensooq", "autotrader")
MAX_SOURCE_AGE_DAYS = 14


def source_file(name):
    return Path(__file__).with_name(f"source_{name}.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default=",".join(SOURCES), help="which sites to re-crawl now")
    ap.add_argument("--max-pages", type=int, default=400)
    ap.add_argument("--build-only", action="store_true", help="just merge the saved source files")
    a = ap.parse_args()
    fns = {"olx": scrape_olx, "opensooq": scrape_opensooq, "autotrader": scrape_autotrader}
    if not a.build_only:
        for name in a.sources.split(","):
            log(f"[{name}]")
            got = fns[name](a.max_pages)
            source_file(name).write_text(json.dumps({"date": datetime.date.today().isoformat(), "rows": got},
                                                    ensure_ascii=False), "utf8")
            log(f"[{name}] {len(got)} listings saved")

    # merge every source crawled recently enough, so one slow site never blocks the others
    rows, counts, dates = [], {}, []
    for name in SOURCES:
        f = source_file(name)
        if not f.exists():
            continue
        d = json.loads(f.read_text("utf8"))
        age = (datetime.date.today() - datetime.date.fromisoformat(d["date"])).days
        if age > MAX_SOURCE_AGE_DAYS:
            log(f"  {name}: skipped, last crawled {age} days ago")
            continue
        counts[name] = len(d["rows"])
        dates.append(d["date"])
        rows += d["rows"]
    before = len(rows)
    rows = dedupe(rows)
    log(f"{before} -> {len(rows)} after removing duplicates")

    RAW_JSON.write_text(json.dumps(rows, ensure_ascii=False), "utf8")
    compact = [[r["make"], r["model"], r["year"], r["price"], r["km"], r["src"], r["url"]] for r in rows]
    payload = {"generatedAt": min(dates) if dates else datetime.date.today().isoformat(), "counts": counts,
               "cols": ["make", "model", "year", "price", "km", "src", "url"], "rows": compact}
    OUT_JS.write_text("window.CAR_LISTINGS=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", "utf8")
    log(f"wrote {OUT_JS} ({OUT_JS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
