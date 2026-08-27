"""Competitor catalogue extractor.

Reads product URLs from each site's own sitemap and pulls the schema.org
JSON-LD both sites already publish for search engines. No headless
browser needed: the data is in the served HTML.

Deliberately polite - small concurrency, a delay between requests, and
robots.txt disallow paths excluded before the queue is built.
"""
import json, re, html, sys, time, random
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.parse import urlsplit, urlunsplit, quote
from urllib.error import HTTPError, URLError

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
DISALLOW = ("/of/", "/account", "/cart", "/login", "/search",
            "/order-tracking", "/order-confirmation", "/dev-preview")

LD = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)


def safe_url(url):
    """Percent-encode non-ASCII path characters.

    Several slugs carry a literal trademark or registered sign, which the
    HTTP client cannot put on a request line - it encodes headers as ASCII.
    """
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc,
                       quote(parts.path, safe="/%"),
                       quote(parts.query, safe="=&%"), parts.fragment))


def fetch(url, tries=3):
    url = safe_url(url)
    for i in range(tries):
        try:
            req = Request(url, headers={"User-Agent": UA,
                                        "Accept-Language": "en-IN,en;q=0.9"})
            with urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except (HTTPError, URLError, TimeoutError) as e:
            if isinstance(e, HTTPError) and e.code in (404, 410):
                return None
            if i == tries - 1:
                return None
            time.sleep(1.5 * (i + 1))
    return None


def products_from(doc):
    """Yields every schema.org Product in the document, nesting included."""
    out = []
    def walk(node):
        if isinstance(node, list):
            for n in node: walk(n)
        elif isinstance(node, dict):
            if node.get("@type") == "Product":
                out.append(node)
            for v in node.values():
                if isinstance(v, (dict, list)): walk(v)
    walk(doc)
    return out


def money(v):
    """Rupee string -> integer paise. Never float rupees."""
    if v is None: return None
    try:
        return int(round(float(str(v).replace(",", "").strip()) * 100))
    except ValueError:
        return None


def tiers_of(offer):
    """Volume price breaks - the competitor equivalent of Quoin Pro rates."""
    spec = offer.get("priceSpecification")
    if not spec: return []
    if isinstance(spec, dict): spec = [spec]
    out = []
    for s in spec:
        q = s.get("eligibleQuantity") or {}
        out.append({
            "minQty": q.get("minValue"),
            "maxQty": q.get("maxValue"),
            "pricePaise": money(s.get("price")),
        })
    return [t for t in out if t["pricePaise"] is not None]


def normalise(p, url, source):
    offers = p.get("offers") or {}
    if isinstance(offers, list): offers = offers[0] if offers else {}
    brand = p.get("brand")
    if isinstance(brand, dict): brand = brand.get("name")
    avail = (offers.get("availability") or "").rsplit("/", 1)[-1]
    return {
        "source": source,
        "url": url,
        "sku": p.get("sku") or p.get("mpn"),
        "name": p.get("name"),
        "brand": brand,
        "category": p.get("category"),
        "description": (p.get("description") or "")[:600],
        "image": p.get("image") if isinstance(p.get("image"), str)
                 else (p.get("image") or [None])[0],
        "pricePaise": money(offers.get("price")),
        "currency": offers.get("priceCurrency"),
        "availability": avail or None,
        "priceTiers": tiers_of(offers),
    }


def scrape(name, urls, out_path, workers=4):
    urls = [u for u in urls if not any(d in u for d in DISALLOW)]
    print(f"[{name}] {len(urls)} product urls", flush=True)
    rows, misses = [], 0

    def one(u):
        try:
            return _one(u)
        except Exception as e:
            print(f"  [{name}] skip {u}: {type(e).__name__}", flush=True)
            return None

    def _one(u):
        time.sleep(random.uniform(0.15, 0.45))   # be a good neighbour
        h = fetch(u)
        if not h: return None
        for m in LD.findall(h):
            try: doc = json.loads(html.unescape(m.strip()))
            except Exception: continue
            for p in products_from(doc):
                if p.get("name"):
                    return normalise(p, u, name)
        return None

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, r in enumerate(ex.map(one, urls), 1):
            if r: rows.append(r)
            else: misses += 1
            if i % 50 == 0:
                print(f"  [{name}] {i}/{len(urls)}  ok={len(rows)}", flush=True)

    json.dump(rows, open(out_path, "w"), indent=1, ensure_ascii=False)
    print(f"[{name}] done: {len(rows)} products, {misses} misses -> {out_path}",
          flush=True)
    return rows


if __name__ == "__main__":
    sp = sys.argv[1]
    only = sys.argv[2] if len(sys.argv) > 2 else None
    for key, label in (("hp", "handypanda"), ("hr", "homerun")):
        if only and key != only:
            continue
        urls = [u.strip() for u in open(f"{sp}/{key}-urls.txt")
                if "/products/" in u]
        scrape(label, urls, f"{sp}/{key}-products.json")
