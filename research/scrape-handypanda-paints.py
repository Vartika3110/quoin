"""Handypanda's paint range, shade by shade.

The competitor scraper (`scrape-competitors.py`) reads the schema.org
JSON-LD every product page publishes, which is enough for a tap or a
switch. **It is not enough for paint.** A paint product carries no price
in its JSON-LD at all, because there is no single price: Royale Matt is
sold as shade x pack size, and the page quietly embeds every one of
those SKUs in its Next.js payload. Reading only the JSON-LD makes nine
Asian Paints emulsions look unpriced when in fact several thousand
priced SKUs are sitting in the same document.

So this goes after the payload:

    self.__next_f.push([1, "...escaped JSON..."])   ->  allVariants[]

Each entry is a real SKU — `skuId`, `hpSellingPrice`, `varSize`,
`varPaintShadeName`, `varColourCode` — and `paintShadeOptions` beside it
is the shade card, with hex, family and the rooms Asian Paints suggests.

    .venv/bin/python research/scrape-handypanda-paints.py \
        --out research/data/handypanda-paints

Polite by construction: the product list comes from the site's own
sitemap, robots.txt allows everything but /pay/, requests are
single-file with a delay, and only pages that the cheap JSON-LD pass
already identified as paint are fetched in full (each weighs ~6 MB).

Prices are stored as integer paise and are GST-inclusive, which is how
the rest of Quoin stores money. Nothing here is a Quoin price: it is
what a competitor charges, recorded for comparison.
"""

import argparse
import html
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SITE = "https://www.handypanda.in"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)

# What counts as paint. The site's own "Paints & finishes" category is
# the spine; the brand and word nets catch the things it files
# elsewhere - Asian Paints masking tape under Tiling, SmartCare under
# Waterproofing. Word boundaries matter: without them "surface" matches
# "ace" and every ceiling light arrives as a paint.
PAINT_CATEGORIES = {"paints & finishes"}
PAINT_BRANDS = {
    "asian paints", "berger", "nerolac", "dulux", "indigo paints",
    "shalimar", "nippon paint", "birla opus", "jsw paints",
    "national brush industries", "truly texture",
}
PAINT_WORDS = re.compile(
    r"\b(paint|primer|putty|emulsion|enamel|distemper|undercoat|topcoat|"
    r"thinner|varnish|lacquer|stainer|colourant|colorant|texture|"
    r"paint ?brush|roller|sandpaper|wall ?care)\b",
    re.I,
)

RSC = re.compile(r'self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)', re.S)
LD = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)


def fetch(url, tries=3, timeout=60):
    for attempt in range(tries):
        try:
            req = Request(url, headers={"User-Agent": UA,
                                        "Accept-Language": "en-IN,en;q=0.9"})
            with urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except (HTTPError, URLError, TimeoutError) as e:
            if isinstance(e, HTTPError) and e.code in (404, 410):
                return None
            if attempt == tries - 1:
                return None
            time.sleep(2 * (attempt + 1))
    return None


def sitemap_urls():
    doc = fetch(f"{SITE}/sitemap.xml") or ""
    return [u for u in re.findall(r"<loc>([^<]+)</loc>", doc) if "/products/" in u]


def jsonld_products(page):
    """The cheap pass: brand, name and category without decoding 6 MB."""
    for block in LD.findall(page):
        try:
            doc = json.loads(html.unescape(block.strip()))
        except Exception:
            continue
        stack = [doc]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                if node.get("@type") == "Product":
                    yield node
                stack.extend(v for v in node.values() if isinstance(v, (dict, list)))


def is_paint(product):
    brand = product.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")
    category = (product.get("category") or "").strip().lower()
    if category in PAINT_CATEGORIES:
        return True, "category"
    if (brand or "").strip().lower() in PAINT_BRANDS:
        return True, "brand"
    if PAINT_WORDS.search(product.get("name") or ""):
        return True, "name"
    return False, None


def payload_of(page):
    """Reassemble the RSC payload the page streams to the browser."""
    chunks = RSC.findall(page)
    if not chunks:
        return ""
    joined = "".join(chunks)
    # The chunks are JSON string literals; decode them as such rather
    # than with unicode_escape, which mangles anything non-ASCII.
    try:
        return json.loads('"' + joined.replace('\n', '\\n') + '"')
    except Exception:
        return joined.encode().decode("unicode_escape", "replace")


def array_after(payload, key):
    """Return the JSON array that follows \"key\": in the payload.

    Brace matching rather than a regex: these arrays are megabytes long
    and contain every bracket there is inside product descriptions.
    """
    marker = f'"{key}":['
    start = payload.find(marker)
    if start < 0:
        return []
    i = start + len(marker) - 1
    depth, in_string, escaped = 0, False, False
    for j in range(i, len(payload)):
        c = payload[j]
        if in_string:
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == '"':
                in_string = False
            continue
        if c == '"':
            in_string = True
        elif c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(payload[i:j + 1])
                except Exception:
                    return []
    return []


def paise(rupees):
    if rupees is None:
        return None
    try:
        return int(round(float(rupees) * 100))
    except (TypeError, ValueError):
        return None


# What a pack is called depends on what is in it. Paint is sold by
# volume in `varSize`, putty by weight in `varCapacity`, a brush by the
# width in `varSize` again. Reading only `varSize` made Birla White
# putty look like five identical products at five different prices.
PACK_FIELDS = ("varSize", "varCapacity", "varWeight", "varLength",
               "varThickness", "varDiameter", "varBreadth")

VAR_LABELS = {
    "varSize": "size", "varCapacity": "capacity", "varWeight": "weight",
    "varLength": "length", "varThickness": "thickness",
    "varDiameter": "diameter", "varBreadth": "breadth",
    "varColour": "colour", "varColourCode": "shade code",
    "varPaintShadeName": "shade", "varFlow": "flow", "varBody": "body",
    "varMaterial": "material", "varPower": "power",
    "varModular": "modular", "varStarRating": "star rating",
    "varMount": "mount", "varSeries": "series", "varShape": "shape",
    "varType": "type",
}


def variant_row(v, product_url, product_brand=None):
    pack = next((v.get(f) for f in PACK_FIELDS if v.get(f)), None)
    spelled = [
        f"{VAR_LABELS.get(k, k)}: {val}"
        for k, val in v.items()
        if k.startswith("var") and val not in (None, "")
    ]
    return {
        "url": product_url,
        "productName": v.get("productName"),
        "brand": (v.get("brand") or {}).get("name") or product_brand,
        "primaryCategory": (v.get("primaryCategory") or {}).get("name"),
        "category": (v.get("category") or {}).get("name"),
        "skuId": v.get("skuId"),
        "packSize": pack,
        "variant": "; ".join(spelled),
        "shade": v.get("varPaintShadeName"),
        "shadeCode": v.get("varColourCode"),
        "colour": v.get("varColour"),
        "sellingPricePaise": paise(v.get("hpSellingPrice")),
        "consumerPricePaise": paise(v.get("hpConsumerPrice")),
        "mrpPaise": paise(v.get("mrp")),
        "inStock": v.get("inStock"),
        "image": (v.get("productContent") or {}).get("imageUrl"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="research/data/handypanda-paints")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="seconds between full page fetches")
    parser.add_argument("--limit", type=int, help="stop after N paint pages")
    parser.add_argument(
        "--known",
        help="a scrape-competitors.py products.json, used to decide which "
             "pages are paint before fetching them. Without it every "
             "product page is pulled in full, which is a great deal more "
             "traffic for the same answer.",
    )
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    urls = sitemap_urls()
    print(f"sitemap: {len(urls)} product urls", flush=True)

    if args.known:
        known = json.loads(Path(args.known).read_text())
        shortlist = []
        for row in known:
            paint, _ = is_paint({
                "name": row.get("name"),
                "brand": row.get("brand"),
                "category": row.get("category"),
            })
            if paint and row.get("url"):
                shortlist.append(row["url"])
        missing = [u for u in urls if u not in {r.get("url") for r in known}]
        urls = [u for u in urls if u in set(shortlist)] + missing
        print(f"shortlist: {len(shortlist)} known paint pages "
              f"+ {len(missing)} not in the known set", flush=True)

    products, variants, shades = [], [], {}
    skipped = 0

    for n, url in enumerate(urls, 1):
        page = fetch(url)
        if not page:
            skipped += 1
            continue
        found = next(jsonld_products(page), None)
        if not found:
            skipped += 1
            continue
        paint, why = is_paint(found)
        if not paint:
            continue

        brand = found.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")

        payload = payload_of(page)
        all_variants = array_after(payload, "allVariants")
        rows = [variant_row(v, url, brand)
                for v in all_variants if v.get("skuId")]
        variants.extend(rows)

        for shade in array_after(payload, "paintShadeOptions"):
            if shade.get("code"):
                shades[shade["code"]] = shade

        priced = [r["sellingPricePaise"] for r in rows if r["sellingPricePaise"]]
        products.append({
            "url": url,
            "name": found.get("name"),
            "brand": brand,
            "category": found.get("category"),
            "matchedOn": why,
            "description": found.get("description"),
            "image": found.get("image") if isinstance(found.get("image"), str)
                     else (found.get("image") or [None])[0],
            "skuCount": len(rows),
            "packSizes": sorted({r["packSize"] for r in rows if r["packSize"]}),
            "shadeCount": len({r["shade"] for r in rows if r["shade"]}),
            "lowestPaise": min(priced) if priced else None,
            "highestPaise": max(priced) if priced else None,
        })
        print(f"  [{len(products)}] {brand} {found.get('name')}: "
              f"{len(rows)} skus  (page {n}/{len(urls)})", flush=True)

        if args.limit and len(products) >= args.limit:
            break
        time.sleep(args.delay)

    manifest = {
        "site": SITE,
        "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "productsSeen": len(urls),
        "paintProducts": len(products),
        "skus": len(variants),
        "shades": len(shades),
        "unreadablePages": skipped,
        "products": products,
        "variants": variants,
        "shadeCard": sorted(shades.values(), key=lambda s: s.get("code") or ""),
    }
    path = out / "handypanda-paints.json"
    path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(f"\n{len(products)} paint products, {len(variants)} priced SKUs, "
          f"{len(shades)} shades -> {path}", flush=True)


if __name__ == "__main__":
    main()
