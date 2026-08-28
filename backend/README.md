# Quoin backend

Django + PostgreSQL. Owns the catalogue, and the admin an ops team uses
to merchandise it.

## Why Django owns this

The storefront is Next.js and stays that way. The catalogue moved here
for one dominant reason: **Django admin**. Seven hundred products need
prices edited, categories fixed and stock flipped by people who are not
developers, and Django gives that away. Rebuilding it in Next.js is
weeks of work that adds no customer-facing value.

The consequence is that Django should own the *whole* backend, not just
the catalogue. Two ORMs migrating one Postgres database is a conflict
waiting to happen — see the migration note at the bottom.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set `DATABASE_URL`, then:

```bash
.venv/bin/python manage.py migrate
```

```bash
.venv/bin/python manage.py createsuperuser
```

```bash
.venv/bin/python manage.py runserver 8000
```

Admin at `/admin/`, API at `/api/v1/`.

## Loading the catalogue

Reads the `.docx` directly, so a re-export can be re-imported with no
hand steps. Matching is on SKU, so it is safe to run repeatedly.

```bash
.venv/bin/python manage.py import_catalogue "/path/to/Quoin _ DATA SEMI FINAL.docx"
```

Add `--dry-run` to parse and report without writing.

## Model notes

**Money is integer paise everywhere.** Float rupees accumulate rounding
error across tier pricing, GST and promotions.

**Fulfilment and pricing unit are per product.** Quoin sells instantly
deliverable goods, scheduled bulk items, bookable services and
made-to-order materials through one catalogue, and they cannot share a
checkout path. The importer never assigns `instant`: that claims a dark
store holds the item, which is an inventory fact the source document
does not carry. Merchandising promotes products to instant once stock
is real.

**GST is explicit.** Cement sits at 28%, most building materials at 18%.
Defaulting it silently produces wrong invoices.

**Provenance is quarantined.** Fields prefixed `source_` record where an
imported row came from and what a competitor charged. They are excluded
from every serializer and never reach a customer. In particular
`source_image_url` points at a competitor's CDN and must not be
rendered — Quoin's own `image` stays empty until real photography
exists, and the storefront draws a generated swatch instead.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/categories/` | Navigation, with product counts |
| `GET /api/v1/brands/` | Brand list |
| `GET /api/v1/products/` | Cards; `?category=` `?brand=` `?fulfilment=` `?search=` |
| `GET /api/v1/products/{slug}/` | Detail, with variants and price tiers |

Prices cross the wire as integer paise; the storefront already formats
them.

## Outstanding

- **386 of 707 products have no category** and sit under `Uncategorised`.
  They came from a source that published none. This is the single
  biggest data gap and is a merchandising job, not a code one.
- **No product has Quoin imagery.** Every `image` is empty by design.
- **Prices are competitor prices**, imported as a starting point. They
  are Quoin's `price` today only because there is nothing else yet.
- **Identity, addresses and serviceability still live in the Next.js
  Prisma layer** (`../src/lib`, `../prisma`). Port them here and retire
  that layer, rather than migrating one database from two places.
