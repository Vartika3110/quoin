"""Map HomeRun products to the collections they appear in.

The merchant's own categorisation beats keyword guessing, so this is
tried first. Collection pages render ~20 products server-side and
paginate client-side, so large collections are truncated — coverage is
measured rather than assumed.
"""
import json, re, sys, time, random
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")
OPERATIONAL = ("tax-override", "best", "newest", "new-launches", "-all", "all-",
               "index", "carousel", "sale", "deals", "copy", "home-page",
               "cloud", "avada", "wizzy", "globofilter", "non-2-w", "add-ons",
               "bulk-prices")

def fetch(url):
    for i in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except (HTTPError, URLError, TimeoutError) as e:
            if isinstance(e, HTTPError) and e.code in (404, 410):
                return None
            time.sleep(1.2 * (i + 1))
    return None

sp = sys.argv[1]
slugs = [s.strip() for s in open(f"{sp}/../../../../../Users/gg/Desktop/Quion/research/data/homerun-collections.txt")] \
        if False else [s.strip() for s in open("/Users/gg/Desktop/Quion/research/data/homerun-collections.txt")]
slugs = [s for s in slugs if s and not any(t in s for t in OPERATIONAL) and s != "all"]
print(f"crawling {len(slugs)} merchandising collections", flush=True)

LINK = re.compile(r'/products/([a-z0-9][a-z0-9\-]*)')
out = {}

def one(slug):
    time.sleep(random.uniform(0.15, 0.4))
    h = fetch(f"https://home-run.co/collections/{slug}")
    if not h:
        return slug, []
    return slug, sorted(set(LINK.findall(h)))

with ThreadPoolExecutor(max_workers=4) as ex:
    for i, (slug, prods) in enumerate(ex.map(one, slugs), 1):
        out[slug] = prods
        if i % 25 == 0:
            print(f"  {i}/{len(slugs)}", flush=True)

json.dump(out, open(f"{sp}/collections-map.json", "w"), indent=1)
tot = len(set(p for v in out.values() for p in v))
print(f"done: {len(out)} collections, {tot} distinct product slugs")
