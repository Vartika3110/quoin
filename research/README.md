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

## Classifying the uncategorised

548 of the 884 products arrived with no category — every row from the
source that publishes none. That was more than half the catalogue and
unbrowsable, so `classify-uncategorised.py` fills it in from two signals,
in order of trust:

1. **The merchant's own collection membership.** A product listed under
   `tile-adhesive` is a tile adhesive — that is a merchandiser's
   judgement, not a guess. `crawl-collections.py` reads the 140
   merchandising collections (brand-only and operational ones carry no
   category signal and are excluded) and records which products appear in
   each. Collections are weighted by specificity so a precise one
   outranks a catch-all. This resolves **464 of 548**.
2. **Keywords in the product name**, used only where no collection
   applies. This resolves the remaining **84**.

A short correction pass then overrules the vote where a name is
unambiguous — "pullout" otherwise files a pullout *faucet* with the
drawer pullouts.

```bash
python3 research/crawl-collections.py <scratch-dir>       # refresh membership
python3 research/classify-uncategorised.py <scratch-dir>  # regenerate the map
```

The output is `data/category-map.json`, keyed by product-URL slug. It is
data rather than code on purpose: merchandising corrects a bad call by
editing one line and re-importing, with no deploy. `prisma/import-catalogue.ts`
reads it and falls back to it only where the export itself is silent — a
category the source states always wins.

### Taxonomy

Six categories were added, because the original eight came from a
competitor whose range stops well short of this catalogue: **Kitchen &
wardrobe fittings** (78), **Tools & safety** (72), **Home appliances &
security** (40), **Kitchen sinks & faucets** (22), **Gypsum & false
ceiling** (1) and **Services** (1).

The last two hold one product each and are not worth surfacing as
storefront categories yet — they are correct, not useful. `Services` is
worth keeping regardless: "Unloading Service" is bookable rather than
stocked, and filing it as goods would put a non-deliverable line in a
delivery cart.
