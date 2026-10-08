# Session handoff — 2026-10-06

Written so this work can be picked up from a different machine or
account. Everything below is either in the repo or stated here; nothing
important lives only in a chat transcript.

Read `AGENTS.md` first — it is short and it overrides habits. In
particular: **this is not the Next.js you know** (read
`node_modules/next/dist/docs/` before writing code), and **there is no
Django service** — the catalogue is Prisma, and recreating a second
backend is the one mistake that has already been made and undone.

---

## Where things stand

`main` is pushed and clean at `78c620e`. Working tree has **uncommitted
work that is not mine** — see "Do not commit the auth work" below.

- 561 tests pass (`npm test`)
- `eslint` clean
- `tsc --noEmit` has **one** error, and it is not from this work:
  `src/app/api/v1/auth/supabase/send-sms/route.ts` passes
  `string | undefined` where `string` is required. **This will fail a
  production build.** It belongs to the auth work in progress.

### Do not commit the auth work

The tree carries a second session's Supabase/OTP work: modified
`session.ts`, the OTP routes, `SignInPanel`, `middleware.ts`, `env.ts`,
`prisma/schema.prisma`, plus untracked `src/lib/auth/supabase*.ts`,
`otp-digits.ts`, `sms-hook.ts`, `OtpInput.tsx` and the migration
`20261005120000_add_supabase_auth_link/`.

I never staged any of it — every commit below names its files
explicitly. Keep doing that: `git add -A` would sweep up half-finished
auth work and the typecheck error with it.

---

## What this session changed

All of it is storefront presentation except the delivery estimate.

### The home page

Cut to three blocks: hero, Shop by category, Shop by brand. It was
eighteen at the start of the week.

| Commit | What |
| --- | --- |
| `e1b9580` | Hero headline moved over the photograph on a phone |
| `e9af0d5` | Dropped the hero's tick list and "Delivering in…" line |
| `69fad7c` | Removed the Expert services section |
| `831e2dd` | Shop by category shows 8 departments, same 8 at both widths |
| `78c620e` | Added the Upload-a-parcha tube under the hero |

Two components are now **dead but kept**: `ServicesRow` and
`CatalogTabs`, plus the `TABS` export in `src/lib/data/catalog.ts`.
Neither has an importer. They were left in place rather than deleted in
the same commit that stopped using them, so the sections are easy to
restore. Delete them when it is clear they are not coming back.

### Brand row — was broken, now fixed (`940b817`)

`BrandWall` (`hidden lg:block`) and `BrandRail` (`lg:hidden`) are two
halves of one row. The page rendered only the rail, so **above `lg` the
section was a heading with 26px of nothing under it**. Both now render.
Logos are no longer greyscale, at the owner's instruction.

### `ImageCard` — was broken, now fixed (`9822579`)

This is the one worth understanding, because the same trap exists
elsewhere.

`ImageCard` has always claimed to put type *over* a photograph. It never
did. The aspect ratio was set on `Photo`, whose own wrapper carries
`relative`; `cn` does not merge classes, and Tailwind emits `.relative`
after `.absolute`, so the `absolute inset-0` the card passed it **lost on
stylesheet order every time**. The photo stayed in flow and pushed the
type into a block beneath it.

The ratio now belongs to the card, and the photo fills it from a wrapper
that owns its own positioning.

> **Rule of thumb:** `cn` concatenates, it does not merge. Two competing
> utilities of the same property are settled by stylesheet order, not by
> argument order. Never pass a positioning class to a component that sets
> its own — wrap it instead.

### Theme and footer

- `855de78` — the accent is **burnt sienna `#a85a2a`** (dark `#d18a5c`).
  Two places never got the memo and have now been fixed:
  `global-error.tsx` (inlines its palette on purpose — it renders when
  the stylesheet has not loaded, so **a retheme is two edits**) and the
  `docs/design-system.md` colour table.
- `fa6362c` — the "these are placeholders" banner is gone from the
  footer. While `COMPANY_DETAILS_ARE_SAMPLE` is true the copyright line
  prints only the year and trading name; **the legal name and GSTIN
  appear by themselves** once `src/lib/company.ts` holds real values. Do
  not print a sample GSTIN to customers.
- `342c0f4` — the four trust claims are pills on the page, outside
  `<footer>`.
- `1419c4f` — footer's Categories column is desktop-only.

### Delivery estimate — the one piece of real logic (`9da0c72`)

New: `src/lib/orders/delivery-estimate.ts`. `BULK_DELIVERY_HOURS = 3` is
the only place the number is written.

Every surface that mentioned delivery used to say "Date confirmed on
call". Now they derive an estimate from the order's fulfilment mix —
confirmation screen, order detail, orders list, project orders panel,
account dashboard card.

- Derived from `Fulfilment`, not a flat constant. `SCHEDULED` is "heavy
  or bulk goods" and is what **2,512 of 2,513 sellable products are**
  (one `BOOKABLE` service; nothing `INSTANT`). Bulk *is* the catalogue
  today, but reading the enum keeps it correct if a dark store ever
  carries quick stock.
- **Slowest line wins** in a mixed basket.
- It is never a *date*. `Order.expectedDeliveryOn` is a real day
  operations commits to and still wins wherever set.
- The orders list reads every line's fulfilment, not just the four it
  thumbnails — an estimate from 4 of 6 lines can promise three hours for
  a basket whose fifth line is cut to order.

Verified against real order `QO-P8498W` (two `SCHEDULED` lines, no date
set) → "Within about 3 hours" from both the list and detail projections.

### Architectural Selects (`45062db`)

`Premium Studio` → `Architectural Selects`, in the `/premium` page title,
`<h1>`, breadcrumb, metadata and the entry card. **The URL stays
`/premium`.** The entry card uses a `tight` flag to drop that one label
to 7px below `sm` so "ARCHITECTURAL" stays whole down to 320px.

---

## The merge that should not have happened (`916bb28`)

PR #3 (`prototype-port/home-architectural-selects`) was merged by
mistake. It forked before the home-page work and would have undone it:
five rails back on the home page, and **the accent reverted from burnt
sienna to the walnut `#7a4b28` that had already been rejected**.

Resolved with `git merge -s ours`: history keeps the merge, the tree
keeps ours. Nothing was force-pushed; the branch still exists on the
remote.

**Two things in that branch are worth cherry-picking deliberately:**

1. Two new Studio rooms — a rose-headboard bedroom and a skyline-bedroom
   clip, with `public/studio/manifest.json` and an updated
   `scripts/import-studio-photos.ts`
2. Extracting `PREMIUM_FLOOR_RUPEES` into `src/lib/browse-params.ts`

Take those on their own. Do not merge the branch.

---

## Open work

### Asked for, not built

- **Operating hours on the 3-hour estimate.** An order placed at 11pm
  currently promises delivery "within about 3 hours". Support hours are
  Mon–Sat 10am–7pm. Needs the real delivery window from the owner, then
  scoping in `delivery-estimate.ts`.

### Needs the owner, not a developer

- **Google sign-in fails on the real domain.** Add
  `https://www.quoin.co.in/api/v1/auth/google/callback` to the Google
  Cloud Console Authorized redirect URIs. Nothing in the repo fixes this.
- **Company details are placeholders.** `src/lib/company.ts` needs the
  registered entity name, address, GSTIN, support email/phone/hours and
  grievance officer. Then set `COMPANY_DETAILS_ARE_SAMPLE = false`. A
  payment gateway's onboarding review looks for these. The liability
  clause needs a lawyer, not a developer.

### Known bugs, undiagnosed

- **The home page navigates on its own.** Twice during testing the
  browser left `/` with no click — once to `/products?brand=dorset`,
  once to `/faq`. Both are links in the auto-scrolling brand marquee or
  the footer. Suspicion: the marquee moves a link under a stationary
  pointer and a stale click lands on it. Not investigated.
- **A session JWT outlives a deleted user.** Delete your own user mid-
  session and `/signin` keeps redirecting to `/account` while every API
  call 401s. Only `POST /api/v1/auth/logout` clears it. Minor, real.

### Catalogue faults still open

From the QA pass: ~55 products with a price in the name; duplicate
`MYK Laticrete` / `Myk Laticrete` brands; `Harald` on an Araldite
product; `ACCESSPRIES` product names; some miscategorised stock; "Goes
well with" empty on every PDP; "Shop this look" matching style words
against product-name substrings.

---

## Working notes

**Verify in the browser, then test, then commit.** Every change this
session was checked at 375px and ~1024–1440px before it was committed.
Measure rather than eyeball — several of these bugs (the 26px brand
section, the stacked `ImageCard`) were invisible until something was
measured.

**Running a one-off script against the database:** put it in `scripts/`
(not `/tmp`, where tsx cannot resolve the `@/` alias), wrap it in a
`main()` — top-level await fails — export the env first, and delete it
after:

```bash
set -a; . ./.env.local; set +a; npx tsx ./scripts/your-script.ts
```

**Prisma client goes stale.** After a migration the dev server holds the
old client in memory and throws `Unknown field`. Restart the preview
server. Production builds regenerate, so CI is unaffected.

**Content sits below the fold more than you expect.** Twice this session
something was reported as missing when it was simply further down the
page — the booking form's required field, parcha's results. Scroll to
the true bottom before calling something a bug; `scrollTo(0, 99999)`
once is not enough while images are still loading.
