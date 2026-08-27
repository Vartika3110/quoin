# Competitor research

Catalogue snapshots of the two closest Quoin comparables, both quick-commerce
platforms for construction materials in India.

| | HandyPanda | HomeRun |
| --- | --- | --- |
| Site | handypanda.in | home-run.co |
| City | Gurgaon | Bengaluru |
| Promise | 60 min | 60–90 min |
| Stack | Next.js on Vercel | Next.js over headless Shopify |
| Products captured | 336 | 548 |

## How it was collected

`scrape-competitors.py` reads each site's own `sitemap.xml`, then parses the
schema.org JSON-LD both sites publish for search engines. No headless browser
is involved — the data is in the served HTML.

Both `robots.txt` files were read first and are respected: `Allow: /` for
general agents, with `/of/`, `/account`, `/cart`, `/login`, `/search` and
`/order-tracking` excluded before the queue is built. Requests run at low
concurrency with a delay between them.

```bash
python3 research/scrape-competitors.py <scratch-dir>
```

Re-running produces a fresh snapshot; prices move, so date any conclusions.

## What this data is for

Benchmarking price positions, understanding category taxonomy, and sizing the
assortment. Prices, SKUs and stock states are facts and are used as such.

The product **descriptions and images referenced here belong to the two
companies**. They are kept for comparison only and must not be copied into the
Quoin catalogue — Quoin needs its own copy and its own photography.
