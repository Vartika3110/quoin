# Quoin

Storefront for construction materials, premium interiors and verified expert
services — hyperlocal delivery, bookable professionals, and long-running
projects behind one catalogue.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4, CSS-first tokens in `src/app/globals.css` |
| Fonts | Cormorant Garamond (wordmark/display), Inter (UI) |

## Architecture

A single Next.js deployment, but the web app is treated as **the first client
of an API, not the only one.** Data access goes through async accessors in
`src/lib/data/` whose signatures match the `/api/v1` endpoints that will
replace them. When the backend lands, those functions become `fetch` calls and
no component changes. A native mobile client consumes the same contract.

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

## Status

The home storefront is built against fixture data in `src/lib/data/catalog.ts`.
Backend modules are not yet implemented — planned delivery order:

1. Identity + address (phone OTP, saved addresses, serviceability)
2. Catalog (categories, products, variants, pricing, media)
3. Inventory + serviceability (per-store stock, geo radius, promise engine)
4. Cart + checkout (multi-fulfilment splitting, price resolution)
5. Orders + payments (Razorpay, order state machine, invoices)
6. Services + bookings (professionals, slots, consultations)
7. Project Hub (aggregate over orders, bookings and quotes)
8. Admin / ops console
