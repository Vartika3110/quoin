# Quoin

Storefront for construction materials, premium interiors and verified expert
services — hyperlocal delivery, bookable professionals, and long-running
projects behind one catalogue.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Database | Postgres via Prisma 6 |
| Styling | Tailwind CSS v4, CSS-first tokens in `src/app/globals.css` — see [`docs/design-system.md`](docs/design-system.md) |
| Fonts | Cormorant Garamond (wordmark/display), Inter (UI) |

## Architecture

A single Next.js deployment, but the web app is treated as **the first client
of an API, not the only one.** Data access goes through async accessors in
`src/lib/data/` whose signatures match the `/api/v1` endpoints that will
replace them. Those functions become `fetch` calls without a component change,
and a native mobile client consumes the same contract.

**One backend, in this repo.** A separate Django + DRF service briefly held the
catalogue; it was removed and its models, importer and query semantics folded
into Prisma. Two backends meant two deploy targets, two connection pools and two
places for money to be rounded differently. See
[`docs/django-to-prisma.md`](docs/django-to-prisma.md).

### Why not server actions everywhere

Server actions couple the data layer to the React render lifecycle, and a React
Native client cannot call them. Since a native app is planned, the boundary is
kept explicit from the start.

## Domain model

The load-bearing decision lives in `src/lib/types/catalog.ts`: Quoin sells four
things that cannot share a fulfilment path or a price column.

| `fulfilment` | Meaning | Example |
| --- | --- | --- |
| `instant` | In a dark store inside the serviceable radius | Paint, pendant light |
| `scheduled` | Real stock, delivered on a chosen date | Cement, sanitaryware |
| `bookable` | Consumes a professional time slot, no stock | Site visit, consultation |
| `made_to_order` | Cut or manufactured after ordering | Marble slabs |

Consequences that are easy to get wrong later and cheap to get right now:

- **The "18 minutes" header promise only applies to `instant`.** Every product
  card shows its own real promise so the cart never becomes an argument.
- **Money is stored in paise (integer) everywhere.** Float rupees accumulate
  rounding errors across tier pricing, GST and promos.
- **Price is resolved, not stored.** `resolvePrice()` runs base → Pro tier →
  cheapest variant. The same pure function must run server-side at checkout and
  client-side for optimistic totals, or the two will disagree.
- **Variants carry `minQty` / `stepQty`.** Marble is not sold by the single
  square foot.

## Layout

Two genuinely different layouts, not one stretched:

- **`< lg`** — the reference app shell: stacked header, horizontal snap rails,
  fixed bottom tab bar.
- **`>= lg`** — persistent top bar, left category rail, real multi-column
  grids, cart in the top bar, bottom nav removed entirely.

Both are always in the DOM and toggled with CSS, so the server renders one
markup tree and there is no layout flash on hydration.

### Rails and the CSS layer

`.rail` is declared inside `@layer components`. This is deliberate: Tailwind
emits its utilities layer afterwards, so `lg:grid` can override the rail on
desktop. Unlayered, the rule would beat every utility and the desktop grid
would silently never apply.

## Product imagery

`src/components/Swatch.tsx` renders deterministic SVG material illustrations as
a stand-in for photography. The contract is `key` in, filled box out — real
photography replaces it wholesale without touching layout.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000.

```bash
npm run build
```

```bash
npx tsc --noEmit
```

### Database

Copy `.env.example` to `.env.local` and point `DATABASE_URL` at a Postgres
instance, then:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run db:import
```

`db:seed` writes the dark stores serviceability is computed against;
`db:import` loads ~880 products from `research/data/all-products.csv` and is
idempotent, so it can be re-run after a fresh export. Without the import the
storefront renders correctly but empty.

## Deploying

One Next.js deployment plus a managed Postgres — see
[`docs/deploying.md`](docs/deploying.md). The one non-obvious step: the app
refuses to boot in production without `MSG91_AUTH_KEY`, by design.

## Status

Modules 1 and 2 are implemented. Planned delivery order:

1. ~~Identity + address (phone OTP, saved addresses, serviceability)~~ — done
2. ~~Catalog (categories, products, variants, pricing)~~ — schema, importer,
   storefront reads and the `/api/v1` browse endpoints done; media and the
   merchandising admin outstanding
3. Inventory + serviceability (per-store stock, geo radius, promise engine)
4. Cart + checkout (multi-fulfilment splitting, price resolution)
5. Orders + payments (Razorpay, order state machine, invoices)
6. Services + bookings (professionals, slots, consultations) — the
   consultation request flow at `/consult` is in, so demand can be
   captured; the professional roster and real slot booking are not
7. Project Hub (aggregate over orders, bookings and quotes)
8. Admin / ops console
