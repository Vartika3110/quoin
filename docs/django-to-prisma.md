# The catalogue moved from Django to Prisma

**Status: done. Do not reintroduce the Django service.**

For a while this repo carried two backends: the Next.js app (identity,
addresses, serviceability — Prisma + Postgres) and an untracked
`backend/` directory holding a Django 4.2 + DRF service that owned the
catalogue. `backend/` has been deleted. Everything it did now lives in the
Next.js app.

## Why

The storefront never called Django — `src/lib/data/catalog.ts` was still
fixtures, and nothing in `src/` referenced port 8000. Keeping the service
would have meant two deploy targets, two connection pools against the same
Postgres, CORS between them, and two independent implementations of price
resolution and GST — for a catalogue that had no client. The README's own
architecture note already assumed one deployment.

## What replaced what

| Was (Django) | Is now |
| --- | --- |
| `catalog/models.py` | `prisma/schema.prisma` — `Brand`, `Category`, `Product`, `ProductVariant`, `PriceTier` |
| `Fulfilment`, `PricingUnit`, `GstRate` choices | Prisma enums `Fulfilment`, `PricingUnit`, `BadgeKind`; GST is `Product.gstRatePct` (`Int`) |
| `management/commands/import_catalogue.py` | `prisma/import-catalogue.ts` (`npm run db:import`) |
| `catalog/views.py`, `serializers.py` | not yet ported — see [Outstanding](#outstanding) |
| SQLite dev fallback | none; Postgres only, `DATABASE_URL` required |
| `manage.py migrate` | `npm run db:migrate` (Prisma migrations) |

The port kept every decision the Django models had encoded:

- **Money is integer paise.** No float rupees anywhere.
- **Provenance is quarantined.** `sourceName`, `sourceUrl`, `sourceImageUrl`,
  `sourceAvailability`, `sourcePricePaise` record what a competitor listed.
  They are reference data for pricing. Never render them, never treat
  `sourceImageUrl` as Quoin imagery, never show `sourcePricePaise` as a
  strikethrough.
- **`Product.image` stays empty** until Quoin's own photography exists. The
  storefront draws a generated swatch (`src/components/Swatch.tsx`, unknown
  keys fall back to `cement`).
- **Nothing is imported as `INSTANT`.** That claims a dark store holds the
  item, which is an inventory fact the export does not carry. Merchandising
  promotes products to instant once stock is real.
- **Foreign keys to `Brand` and `Category` are `onDelete: Restrict`**, matching
  Django's `PROTECT`. Deleting a category must not silently delete products.

## Enum spelling

Prisma uses `SCREAMING_SNAKE`; the wire contract and the UI use lower snake
(`per_sqft`, `made_to_order`). The three lookup tables at the top of the
mapping section in `src/lib/data/catalog.ts` are the only place that
converts. They are exhaustive `Record`s, so adding a schema enum value
without handling it is a type error rather than a mis-rendered chip.

## The importer

```bash
npm run db:import -- --dry-run     # parse and report, write nothing
npm run db:import                  # research/data/all-products.csv
npm run db:import -- path/to.csv   # any file with the same header
```

Idempotent — products are matched on `sku` and updated in place. Slugs are
assigned **on creation only**, so re-importing never changes a URL that has
been indexed. Current result on the committed CSV: **883 created, 1 skipped**
(one row has no readable price), **85 brands, 9 categories**.

Two known data-quality gaps, both inherited from the source export, both
worth fixing before launch:

1. **548 of 884 rows have no category** and are filed under `Uncategorised`
   — every `homerun` row. They need categorising before category browse is
   useful.
2. **Unit inference is name-based** and conservative: 790 land on
   `PER_PIECE`, 68 `PER_KG`, 17 `PER_LITRE`, 7 `PER_RUNNING_FT`, 1
   `PER_VISIT`. Nothing infers `PER_SQFT` or `PER_BAG` from this export.

## Rendering

`/` and `/p/[slug]` are `export const dynamic = "force-dynamic"`.

This is deliberate. A static prerender runs the catalogue queries during
`next build`, where the database is not reachable — `src/lib/env.ts` skips
validation in the build phase precisely because hosts inject `DATABASE_URL`
at runtime. Prerendering would also mean rebuilding the site to correct a
price. `generateStaticParams` was removed for the same reason.

When traffic justifies caching, the move is Next 16 Cache Components
(`cacheComponents: true` in `next.config.ts`, then `use cache` + `cacheLife`
on the accessors), **not** a build-time prerender. Read
`node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` first —
this Next version's caching model differs from older ones.

## What this port gave up

The Django service's own README made one substantive argument for its
existence: **Django admin**. Roughly 880 products need prices edited,
categories fixed and stock flipped by people who are not developers, and
Django gives that interface away for free.

Removing the service removes that interface. `npm run db:studio` (Prisma
Studio) is a developer tool — it has no auth, no roles, no audit trail, and
is not something an ops team should be pointed at. So the admin console,
item 8 in the README's delivery order, is now load-bearing much earlier than
planned: merchandising cannot happen without it.

This was a known, accepted trade. The counter-argument that won: two ORMs
migrating one Postgres database is a standing conflict, and the storefront
had no dependency on the Django service to justify carrying it. But whoever
picks up merchandising needs to know the gap is real and unsolved.

## Outstanding

- **`/api/v1/products` and `/api/v1/categories` route handlers.** The Django
  viewsets defined semantics worth reproducing exactly: filter by
  `category`, `brand` and `fulfilment` slug; search across name, sku, brand
  name and category name; order by name, creation, or cheapest variant
  price; page size 24. Prefetch variants in one query — the Django code
  carried a comment that without it a 24-product page cost 25 queries, and
  Prisma has the same trap.
- **Category tree.** `Category.parentId` exists and is unused; the import
  creates a flat list. `getCategories()` returns top-level rows only.
- **Storefront tabs are still fixtures.** `TABS` in
  `src/lib/data/catalog.ts` (`all`, `services`, `materials`, `premium`,
  `interiors`, `lighting`) has no mapping onto real categories yet, so tab
  filtering does nothing.
- **`Category.images`** holds swatch keys and is empty on import, so
  category tiles render bare until keys or real artwork are set.
- **Badges are never set by the import.** `Product.badges` is merchandising
  input.

## Deployment notes this changes

- `npm run build` is now `prisma generate && next build`, and a
  `postinstall` runs `prisma generate`. Vercel restores a cached
  `node_modules` and skips `postinstall`, which is why the generate is also
  in `build`. Removing either brings back a stale-client build failure.
- `prisma/migrations/` now exists. Release runs `prisma migrate deploy`.
  Module 1's schema had only ever been `db push`ed, so the initial migration
  covers identity *and* catalogue together.
- `src/lib/env.ts` no longer enforces `MSG91_AUTH_KEY` during the build
  phase. It is still enforced on server boot, which is where the guard
  belongs — enforcing it at build failed the build of any deploy supplying
  SMS credentials at runtime.
