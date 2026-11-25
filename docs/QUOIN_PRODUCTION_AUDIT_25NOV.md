# Quoin production readiness audit — 25 November 2026

**This file is a second audit's own report, kept as that run's record and not
rewritten**, on the same footing as `QUOIN_LAUNCH_AUDIT.md`. It was produced
independently, from a fresh clone of `62490d5`, with no production database or
Supabase access, and it reaches the half `QUOIN_LAUNCH_READINESS.md` could not:
a clone stood up from nothing, the suite, lint, typecheck and build run with the
output recorded, and a code-level read of the areas that checklist covered
thinnest.

---

## What was verified before any of it was acted on

Everything below was checked against this working tree on 25 November. The
audit's own caveats in its section 1 stand.

**Confirmed as written:**

- **LEG-01** — `ToConfirm` at `src/app/(legal)/terms/page.tsx:76` renders a
  visible `<mark>` reading `[LEGAL TO CONFIRM] limitation of liability,
  governed-by and jurisdiction clauses`, and `curl` of
  `https://www.quoin.co.in/terms` returns that string from production. The
  checklist's `TRU-02` Pass was wrong and is now a **Fail**.
- **CX-14 / the Parcha correction** — `ParchaWorkbench` makes three fetches and
  none of them is an upload: `/api/v1/parcha`, `/api/v1/parcha/extract`,
  `/api/v1/products/{slug}`. Nothing under `src/components/storefront/parcha/`
  or `src/app/api/v1/parcha/` references `uploads`, `StoredFile` or a signed
  URL. The four genuine storage callers the audit names are the only four.
  **The Parcha tab can stay.**
- **SEO-01 / SEO-02** — all six pages exist (81–209 lines each), none sets
  `noindex`, none was in `sitemap.ts`, and `robots.ts` disallowed neither
  `/projects/new` nor `/studio/upload`.
- **DX-01** — `typecheck` was bare `tsc --noEmit`; `next typegen` exists and
  fixes it.
- **SEC-01** — `consultations/sessions` imports `countRequestsSince` and
  `MAX_PER_DAY = 5`, and no `enforce()`.
- **SEC-03** — `prisma` is in `dependencies`, not `devDependencies`.
- **P3-01** — nothing in `src/` imports `Placeholder`; the only mention anywhere
  is a comment in `EmptyState.tsx` saying it is deliberately not that component.

**Corrected — two places where this audit is wrong:**

1. **OPS-01 says `research/data/all-products.csv` "was never tracked".** It was.
   `git log --all --diff-filter=ADM` shows it added in `6934c0c` and deleted in
   `ba4661d` (23 October) as an unmentioned 885-line deletion inside a commit
   about shelves and variants. The blob is intact: 228 KB, 884 data rows, header
   `source,sku,name,brand,category,price_inr,availability,volume_tiers,url,image`
   — exactly what `prisma/import-catalogue.ts` reads. `git checkout 6934c0c --
   research/data/all-products.csv` restores it. The finding stands, the severity
   does not: this is a decision about whether to commit it back, not a loss.
   Tracked as `ORD-17`.

2. **CX-01 names two render paths and calls the copy an open decision.** There
   are **four** — `ProductCard.tsx:77`, `browse/ProductRow.tsx:31`,
   `p/[slug]/page.tsx:56` (which also claims *"In stock at your nearest Quoin
   store"*) and `browse/QuickFilters.tsx:55`. And the decision is not open:
   `ba4661d`'s own message records *"Taken out at the owner's instruction: the
   'Quoin in 18 minutes' promise"*. This is unfinished removal, not pending copy.
   Tracked as `CX-17`.

**One claim narrowed:** the audit lists OCR quality as unverifiable because
`OPENAI_API_KEY` was absent from *its* environment. The key is present in this
checkout, so the vision path is live and the gap is narrower than stated — it
needs one photograph of a real parcha, which only the owner can supply.

**One claim that does not apply here:** the audit says it left a `.env.local` in
this checkout. It did not; this checkout's `.env.local` still points at the
production Supabase pooler and was last modified 24 November, before that run.
Its branch `production-readiness-audit` does not exist in this repository
either, locally or on the remote, so none of its five file changes were
available to apply. The three unambiguous ones were reimplemented here —
see `CX-19` and `DEP-17`.

---

*What follows is the audit's report, verbatim.*

---

# Quoin production readiness audit

**Date:** 25 November 2026
**Code audited:** `62490d5` on `main` ("Close PAY-01: the webhook verified, for the
first time since October"), read in a fresh clone of `Vartika3110/quoin`.
**Fixes applied on:** branch `production-readiness-audit`, nothing pushed.
**Excluded by instruction:** Razorpay, payment gateways, payment verification and
payment related order logic; any redesign of the existing UI or branding.

This is a fresh audit against the code, not a rewrite of what is already in
`docs/QUOIN_LAUNCH_READINESS.md`. That checklist was re-audited against the
production database and the live site on 22 to 24 November and it is newer than
this file on everything it covers. Where this file disagrees with it, the
disagreement is called out explicitly and the evidence is given, because there
are two such places and both matter.

What is new here is the half that checklist could not reach: a fresh clone stood
up from nothing, the full suite, lint, typecheck and build run locally with the
output recorded, a responsive and accessibility pass over the pages it did not
walk (Studio, Project Hub, Parcha, Services, account, sign in), and a code level
read of the areas it covered thinnest, which are Parcha, Studio, Project Hub,
consultations and SEO.

---

## 1. What I could not verify, and why

Read this first. Everything in section 4 is bounded by it.

| Not verified | Why |
| --- | --- |
| The production catalogue: duplicate SKUs, missing images, stock, pricing units, minimum order quantities, product counts | No production database access. The 488 active product figures in the readiness checklist are from the live database on 22 November and I could not re-read them. `reports/*.csv` and `products-without-images.csv` are the 21 October snapshots and are stale by design. |
| OCR quality on real parchas: handwriting, ambiguous quantities, confidence flagging, auto substitution | `OPENAI_API_KEY` is not in my environment, so every image and PDF path returns the honest "not switched on yet" refusal. I verified the plumbing, the size cap, the type refusals and the CSV path. I did **not** verify that the model reads a real parcha correctly. This is the single largest untested area and it is one of the areas you asked about most. |
| Supabase row level security, database permissions, migration state in production | No Supabase access. Authorisation is enforced in application code and that part I did read. |
| Signed in flows end to end in a browser: cart persistence across login, address create and edit, order history, wishlist, project and board persistence | Sign in needs Supabase OTP or Google OAuth, neither of which I have, and I did not use your credentials. I probed every protected endpoint signed out and read the ownership clauses in the data layer instead. |
| Anything behind the admin host | `/admin` and `/api/v1/admin/*` 404 unless `ADMIN_HOST` matches, which is correct. I read all 21 pages and 25 routes for their guards rather than clicking through them. |
| Supabase storage egress cap, and therefore the Studio image upload and document downloads | No Supabase keys. See the correction in section 3, which narrows what the cap actually breaks. |
| Payments, in any form | Excluded by instruction. |

I stood up a local environment to get as far as I did: an embedded Postgres
(PGlite) on port 55432, the repository's own `prisma db push` and `npm run
db:seed`, and 548 products imported from `research/data/homerun-products.json`,
which is committed. That catalogue is **test data for exercising the interface**,
it is not Quoin's catalogue, and no finding below is a claim about product data.
The only file this left in your checkout is `.env.local`, which is gitignored,
carries no production secret, and you can delete.

---

## 2. Evidence

### Before, on a fresh clone of `62490d5`

```
$ npx tsc --noEmit
src/components/storefront/home/EntryCards.tsx(9,23): error TS2307: Cannot find module '../../../../public/entry/studio.webp' or its corresponding type declarations.
src/components/storefront/home/EntryCards.tsx(10,25): error TS2307: Cannot find module '../../../../public/entry/services.webp' or its corresponding type declarations.
src/components/storefront/home/EntryCards.tsx(11,25): error TS2307: Cannot find module '../../../../public/entry/products.webp' or its corresponding type declarations.
src/components/storefront/home/EntryCards.tsx(12,24): error TS2307: Cannot find module '../../../../public/entry/selects.webp' or its corresponding type declarations.
TSC_EXIT=2
```

```
$ npm test
ℹ tests 857
ℹ suites 207
ℹ pass 857
ℹ fail 0
TEST_EXIT=0
```

```
$ npm run lint
✖ 3 problems (0 errors, 3 warnings)
LINT_EXIT=0
```

```
$ npm run build
✓ Compiled successfully
BUILD_EXIT=0
```

```
$ npx tsx scripts/check-legal.ts
[legal] 1 clause still marked in the pages themselves.

  /terms
      limitation of liability, governed-by and jurisdiction clauses

        These are not values to fill in -- they need drafting.

LEGAL_EXIT=1
```

```
$ npm run db:import
Error: ENOENT: no such file or directory, open 'research/data/all-products.csv'
IMPORT_EXIT=1
```

```
$ npm audit --omit=dev
4 high severity vulnerabilities
```

### After the fixes in section 5

```
$ npm test
ℹ tests 924
ℹ suites 209
ℹ pass 924
ℹ fail 0
TEST_EXIT=0
```

```
$ npm run typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
TYPECHECK_EXIT=0
```

```
$ npm run lint
✖ 3 problems (0 errors, 3 warnings)
LINT_EXIT=0
```

```
$ npm run build
✓ Compiled successfully in 2.7s
BUILD_EXIT=0
```

The three lint warnings are unchanged and pre-existing: two unused variables in
`marketing/diwali-teaser/`, one `_omit` in `src/lib/data/service-bookings.ts:796`.

`npm run check:legal` still exits 1, deliberately. See LEG-01.

---

## 3. A correction to a recorded launch blocker

`docs/QUOIN_LAUNCH_READINESS.md` records **CX-14** as a **Fail** that blocks
launch: "Parcha upload works ... Supabase storage answers `402
exceed_egress_quota`, so the signed upload fails. The tab is in the six-tab bar",
with the remedy "fix the cap or hide the tab".

**The Parcha flow at `/upload` does not use Supabase storage.** The workbench
makes exactly two calls:

- `src/components/storefront/parcha/ParchaWorkbench.tsx:194` to `/api/v1/parcha`, which prices a typed list;
- `src/components/storefront/parcha/ParchaWorkbench.tsx:265` to `/api/v1/parcha/extract`, which reads an attached file.

`/api/v1/parcha/extract` is multipart and persists nothing. Its own doc comment
says so and says why: "This one keeps nothing, the bytes exist for the length of
one request". It never touches `/api/v1/uploads`, never writes a `StoredFile`,
and needs no bucket.

Proved against a running server with the storage provider unconfigured:

```
$ curl -s -X POST -F "file=@parcha-test.csv;type=text/csv" http://localhost:3000/api/v1/parcha/extract
{"data":{"items":null,"text":"Cement 50kg 20\nTMT bars 5\nWhite putty 20kg 3","itemCount":3,"source":"csv"}}
```

What the egress cap does break is every caller that genuinely uses the bucket,
and those are a different list:

- `src/components/storefront/studio/UploadIdea.tsx:125` and `:141`, the Studio image upload;
- `src/components/storefront/projects/DocumentsPanel.tsx:58`, project document download;
- `src/components/storefront/account/documents/DocumentActions.tsx:51`, account document download;
- `src/components/storefront/services/ServiceBookingFileRow.tsx:27`, service booking attachments.

So the remedy "hide the Parcha tab" is not needed and would remove a working
feature. The cap still has to be lifted, for Studio uploads and for every
document a customer has already stored. I could not test the cap itself, so this
narrows the blocker rather than closing it: **the tab can stay.**

The second disagreement is **TRU-02**, recorded as a Pass. See LEG-01.

---

## 4. Findings

Every row carries a file path. Nothing here is a recommendation without a
finding behind it.

### P1, must fix before public launch

#### LEG-01 Terms of service serves a visible placeholder, on the live site

`src/app/(legal)/terms/page.tsx:76`

Under the heading "Liability", the page renders, highlighted in a `<mark>`:

> [LEGAL TO CONFIRM] limitation of liability, governed-by and jurisdiction clauses

This is not a flag I inferred. The repository's own gate reports it and exits
non zero (`npx tsx scripts/check-legal.ts`, output in section 2), and it is
served to the public right now:

```
$ curl -sL https://www.quoin.co.in/terms | grep -o "LEGAL TO CONFIRM[^<]*"
LEGAL TO CONFIRM] <!-- -->limitation of liability, go
```

The readiness checklist records TRU-02 as **Pass**, on the basis that
`COMPANY_DETAILS_ARE_SAMPLE` and `POLICY_IS_SAMPLE` are both `false`. Both are,
and no company detail is a placeholder. `ToConfirm` is a separate mechanism from
those two flags and it is still rendering. The claim "no placeholder text is
served" is wrong on this one page.

A storefront publishing terms with no limitation of liability, no governing law
and no jurisdiction, and saying so in a yellow box, is worse than one that is
quiet about it: it is an open admission in front of a customer or a gateway's
compliance review.

**Not fixed, and I will not fix it.** Those three clauses need drafting by
someone who can take legal responsibility for the wording. Writing them myself
would be exactly the fabrication you asked me to avoid. When they exist, replace
the `ToConfirm` block and `npm run check:legal` goes green.

#### OPS-01 The catalogue cannot be rebuilt from this repository

`prisma/import-catalogue.ts:30`, `README.md` under "Database"

The README tells a new environment to run `npm run db:migrate`, `npm run db:seed`
and `npm run db:import`. The third one fails:

```
Error: ENOENT: no such file or directory, open 'research/data/all-products.csv'
```

That file is not in the repository, it is **not gitignored**, and `git log --all`
shows it was never tracked. No other committed source can stand in for it:
`scripts/data/master-catalogue.json` holds 532 rows of reference, name and brand
only, with no category, unit, GST rate or image; `prisma/import-brand-catalogue.ts`
wants a per brand manifest directory; `prisma/import-approved-sheet.ts` wants a
file passed on the command line.

The live site is unaffected, because production already holds the data. What is
affected is every case where you would need to rebuild: a restore drill, a
staging environment, a second developer, or the day the database is lost. The
readiness checklist already carries ORD-10 (no Supabase backups or PITR) and
ORD-12 (restore drill not started) as launch blockers. This is the third leg of
the same problem, and it is the one that means the code alone is not enough to
reconstitute the shop.

**Not fixed.** The remedy is a decision: either commit the export (it is catalogue
data, not customer data), or write down in the README that
`npm run db:export` output is the only rebuild source and where a copy lives.
`scripts/export-database.ts` already exists and is verified.

### P2, important

#### SEO-01 Six indexable pages were in neither the sitemap nor robots.txt

`src/app/sitemap.ts`

`/faq`, `/experts`, `/trending`, `/premium`, `/lighting` and `/rooted` are all
live, return 200, carry their own title and description, and set no `noindex`.
None was in the sitemap's fixed list and none is disallowed in `robots.ts`, so
the only route a crawler had to any of them was a footer link. `/faq` is the
worst of the six: it sits in the same `(legal)` group as the five pages that
*are* listed, and it is where a customer looking for the cancellation window
lands.

This also means the readiness checklist's CX-13 broken link sweep, which crawled
"every non-product URL in the sitemap", never visited these six pages at all.

**Fixed.** See section 5.

#### SEO-02 Two sign in gated forms were crawlable and indexable

`src/app/robots.ts`

`/projects/new` and `/studio/upload` render nothing but "Sign in to start a
project" and "Sign in to add a photograph" to a signed out visitor, which is the
same empty shell problem `/account`, `/cart` and `/checkout` are already
disallowed for. Neither was excluded.

**Fixed.** See section 5.

#### DX-01 `npm run typecheck` fails on a fresh clone

`package.json:11`

`tsconfig.json` includes `next-env.d.ts`, which declares the image module types.
That file is generated by `next dev` or `next build` and is gitignored
(`.gitignore:48`). On a clone where neither has run yet, the documented check
fails with four `TS2307` errors that have nothing to do with the code. A CI job
that runs typecheck before build fails on a green tree.

**Fixed.** See section 5.

#### CX-01 A retired delivery promise is still in two render paths

`src/components/storefront/ProductCard.tsx:77`, `src/components/storefront/browse/ProductRow.tsx:31`

Both files hard code the string `"18 min"` as the label for `instant`
fulfilment. The `scheduled` branch immediately below reads
`SCHEDULED_DELIVERY_SHORT` from `src/lib/orders/delivery-estimate.ts`, which is
the single source TRU-07 was closed on. The instant branch does not.

Nothing is visible today because nothing is imported as `INSTANT`
(`prisma/import-catalogue.ts:112`, `guessFulfilment` returns only `BOOKABLE`,
`MADE_TO_ORDER` or `SCHEDULED`). This is the same shape of loose end TRU-07
already recorded for `Store.baseEtaMinutes` returning `etaMinutes: 18`, and it is
a second instance that was not found: one product set to `instant` by
merchandising puts an unbacked 18 minute promise on a card.

**Not fixed.** Centralising the literal is a two line change I can make, but what
the instant promise should *say* is your decision, not mine, and changing
customer facing copy is not something to do unasked.

#### SEC-01 The public consultation booking has no address based rate limit

`src/app/api/v1/consultations/sessions/route.ts`

The route is open to guests by design. Its only limit is `MAX_PER_DAY = 5`
counted by **phone number** (`countRequestsSince(phone, ...)`). Varying the phone
number is free, so one caller can create unlimited bookings, each one creating a
Razorpay order and holding a slot for `CONSULT_HOLD_MINUTES`.

The damage is bounded: `listAvailability` only counts `PENDING` rows inside the
hold window, so holds expire on their own and a slot flood needs sustained
traffic to keep the calendar full. What is unbounded is the number of gateway
orders created.

Every comparable public endpoint in the app is rate limited through
`src/lib/rate-limit.ts`: `checkout/order`, `checkout/quote`, `checkout/verify`,
`auth/otp/request`, `parcha`, `search`, `search/assist`, `search/visual`,
`visualise`, `consultations/availability` and the vendor dispatch route. This one
is the gap.

**Not fixed.** Adding `enforce()` here is a security change, not a payment change,
but the route's body is the gateway order path and you asked me to keep out of
it. Say the word and it is a three line change plus a test.

#### SEC-02 The legacy self signed session is still accepted

`src/lib/auth/session.ts`

Sessions are Supabase's now, except that the old self signed `quoin_session` JWT
is still honoured, because the Google sign in callback still mints one and
because dropping it would have logged everyone out mid checkout. Both reasons are
good and the file says so.

The consequence worth writing down: anyone holding `AUTH_SECRET` can mint a valid
session for **any** user id, with no Supabase involvement and nothing to revoke
it for up to 30 days. That is strictly more exposure than the Supabase path
carries. Today Google sign in is the only live sign in method on the live site
(TRU-11), so this is not a legacy path, it is the main one.

I used this myself to prove it, against my own local secret and my own test
database. It worked.

**Not fixed, no action needed today.** It becomes deletable the moment Google sign
in moves to Supabase's Google provider, which the file already names as the
plan. Until then, treat `AUTH_SECRET` as a credential of the same class as the
Razorpay secret, and rotate it if it is ever exposed.

#### SEC-03 The Prisma CLI and its four advisories ship in the production install

`package.json:44`

```
$ npm audit --omit=dev
deepmerge-ts  <8.0.0   high   stack exhaustion
effect        <=3.22.0 high   ReDoS in Schema.TemplateLiteral
4 high severity vulnerabilities
```

This matches SEC-04 in the readiness checklist exactly, and that row's judgement
is right: all four are in the Prisma CLI chain and none is in the serving path.
The detail that row does not mention is **why they appear under `--omit=dev` at
all**, which is that `prisma` is listed in `dependencies`, not
`devDependencies`. Moving it would take the CLI out of the production install
entirely and the advisory count to zero without a major upgrade.

**Not fixed.** `postinstall` runs `prisma generate` and `build` runs it again, so
moving the package is safe on Vercel (which installs devDependencies at build
time) and breaks anything doing `npm ci --omit=dev`. That is a deploy shaped
risk and it is yours to take, not mine.

#### SEC-04 A guest parcha submission is protected by a 29 bit reference

`src/lib/reference.ts`, `src/lib/data/parcha-submissions.ts:473`

A guest's submission has `userId` null, and `getSubmissionByReference` matches it
for **any** caller who knows the reference. The schema comment and the route doc
both say this plainly: the reference is the only credential such a submission
has. That is a reasonable design for a guest flow.

The reference is six characters from a 29 character alphabet, so about 59 crore 48 lakh
combinations, roughly 29 bits. For comparison, a bearer token is normally
128 bits. `GET /api/v1/parcha/submissions/{reference}` has **no** rate limit, and
nor does the `PATCH` on its items, which means an enumeration attempt is not
slowed by anything.

What leaks is a materials list and whatever the customer typed with it. Not
catastrophic, and genuinely hard to hit at 29 bits, but it is the one credential
in this app that is both short and unthrottled.

**Not fixed.** The cheap fix is a rate limit on the read; the thorough one is a
longer reference for guest submissions only. Both are small. Neither is urgent.

#### CX-02 Six footer legal links are below the minimum touch target

`src/components/storefront/nav/` footer, measured at 375 px

Measured in the browser: "Contact us", "FAQs", "Privacy", "Terms", "Refunds &
cancellations" and "Grievance officer" each render 14 px tall. WCAG 2.2 AA
(2.5.8, Target Size Minimum) asks for 24 by 24 CSS px. Everything else on every
page I measured clears it.

**Not fixed.** The fix is padding on six links, which changes the footer's visual
density, and you asked me not to change the design. Flagging it rather than doing
it.

#### OPS-02 An internal extraction preview is publicly reachable

`src/app/hindware/page.tsx`

`https://quoin.co.in/hindware` serves "Hindware Catalogue A, extraction preview",
a gallery of product images lifted out of a third party's PDF, with the note
"Nothing on this page is for sale."

The page is handled honestly: it sets `robots: { index: false }`, it carries
three badges saying what it is, and it is correctly absent from the sitemap. I
checked, and that is why it is excluded rather than an oversight.

`noindex` stops search engines, not people. A URL anyone can type serves another
brand's catalogue artwork under Quoin's domain. That is a judgement call about
third party imagery, not a bug.

**Not fixed.** Decide whether it stays, moves behind the admin host, or goes.

### P3, future

| ID | Finding | File |
| --- | --- | --- |
| P3-01 | `Placeholder`, the "Not built yet" page component, is dead code. Nothing imports it, which is good news: no route serves a "not built" page. | `src/components/storefront/Placeholder.tsx` |
| P3-02 | `classifyFile` trusts the filename extension before the content type and never sniffs magic bytes. Low risk because the extract route persists nothing and caps at 10 MB, and because `.exe` and `.xlsx` are both correctly refused (tested). | `src/lib/parcha-extract.ts:133` |
| P3-03 | The account settings "Name" field is correctly disabled rather than fake, but its hint is written for a developer: "Editing a name needs the profile endpoint, which is not built yet." | `src/components/storefront/account/SettingsPanel.tsx:76` |
| P3-04 | `requireStaff`'s doc comment claimed `canAccessAdmin` "wants the owner's own identity, or `isStaff` and an allowlist entry". There is no owner identity in the code and `AGENTS.md` says there must not be. Misleading comment next to a security gate. | `src/lib/http.ts` |

P3-04 is **fixed**; it is a comment, with no behaviour attached.

---

## 5. Fixes applied

All on branch `production-readiness-audit` in the Quoin checkout. Nothing
pushed, nothing deployed.

| File | Change | Finding |
| --- | --- | --- |
| `package.json` | `typecheck` is now `next typegen && tsc --noEmit`, so the command documented in the README works on a clone where no build has run. | DX-01 |
| `src/app/sitemap.ts` | The fixed page list is lifted out of the function body into an exported `FIXED_SITEMAP_PAGES`, so it can be asserted against, and the six missing pages are added. No change to the product or category queries. | SEO-01 |
| `src/app/robots.ts` | `Disallow: /projects/new` and `Disallow: /studio/upload`. | SEO-02 |
| `tests/sitemap.test.mts` | New, 67 assertions. | SEO-01, SEO-02 |
| `src/lib/http.ts` | Comment only: the stale owner identity claim removed. | P3-04 |

### What the new test actually asserts

A hand written sitemap list goes stale the first time somebody adds a page, which
is how six pages went missing. So the test does not compare one list against
another list. It walks `src/app` for every statically routed `page.tsx` and
requires each one to be exactly one of:

1. in `FIXED_SITEMAP_PAGES`, so it is submitted for indexing;
2. under a `Disallow` read out of `robots.ts`, so it is not crawled;
3. declaring `robots: { index: false }` for itself, which is `/hindware`;
4. named in `NOT_SUBMITTED_YET` with a reason and a date.

Dynamic segments are skipped, because those come out of the database in the same
file. A page whose body is only `redirect()` or `permanentRedirect()` is skipped,
because `/studio/boards` is a 308 to `/studio/spaces` and asking a crawler to
index a redirect is not a thing to want.

It needs no database and no network.

Running it against the tree as found flagged five more pages, which is the test
doing its job. Four are now accounted for. Two are in `NOT_SUBMITTED_YET`, and
that list is a decision I am handing to you rather than taking:

- **`/studio/designers`** is live and says "No designers listed yet ... empty on purpose".
- **`/studio/watch`** is live and there are no Studio videos at all (SEC-11 in the readiness checklist established that independently: zero `StudioIdea` rows with `media = VIDEO`).

Submitting either today submits a soft 404, which is the exact cost
`src/app/sitemap.ts` already refuses to pay for products with no sellable
variant. The moment either page has content it belongs in the sitemap, and the
test tells whoever adds that content to say so.

### Database changes and migrations

**None.** No schema change, no migration, no write to any shared database. The
only database I touched was the local embedded Postgres described in section 1.

---

## 6. Features confirmed working

Each of these was exercised, not just read.

- **Every storefront route resolves.** 37 paths probed against a running server: all 200, except `/studio/boards` (308 to `/studio/spaces`, correct) and `/admin` (404 on the storefront host, correct).
- **Responsive layout holds at 375 px, 768 px and 1440 px.** Measured `document.documentElement.scrollWidth` against `clientWidth` on home, products, Studio, Studio boards, Project Hub, Parcha upload, Services, account and sign in. Zero horizontal page overflow at any width on any of them. The elements that extend past the viewport are `.rail` snap scrollers with their documented negative margin, contained by `overflow-x: clip` on `html` and `body`.
- **Heading structure and image alt text.** Exactly one visible `<h1>` per page. The account page has two `<h1>` in the DOM, one from the phone shell and one from the desktop shell, and only one is ever visible, which is the documented design rather than a defect. No `<img>` missing an `alt` attribute, no unnamed button or link on any page measured.
- **Authorisation, probed signed out.** 20 protected endpoints: every customer scoped route answers 401, every `/api/v1/admin/*` route answers 404 rather than 401 (deliberate, so the console's existence is not disclosed), both cron routes answer 404 with no `CRON_SECRET` set, and `/api/v1/orders/{ref}`, `/api/v1/projects/{id}`, `/api/v1/studio/spaces/{id}` and `/api/v1/parcha/submissions/{ref}` all refuse without disclosing whether the row exists.
- **Ownership is in the `where` clause, not a post-fetch comparison.** Read through `projects.ts`, `studio.ts`, `wishlist.ts`, `service-bookings.ts`, `parcha-submissions.ts` and both upload routes. Every customer scoped read and write is scoped by `userId` in the query, including the two that looked like exceptions: `reorderSpaceItems` filters the ids to those the space actually owns before updating, and the unscoped `supportRequest` functions are the staff ones.
- **Parcha, the parts that do not need a model.** CSV extraction returns the right lines (output in section 3). `.xlsx` is refused with "We cannot read that file automatically", and so is a file with an `.exe` extension. With no OCR key, an image gets "Reading files automatically is not switched on yet" rather than a silent failure or a fabricated list.
- **Nothing fake in the interface.** No route serves a "not built yet" page. The one disabled control I found, the account name field, says why it is disabled instead of accepting keystrokes and dropping them.
- **SEO fundamentals.** `robots.txt` and `sitemap.xml` both serve. Product pages carry a canonical link and four JSON-LD blocks. 577 sitemap URLs with the local catalogue.
- **The suite, lint and build.** 924 tests pass, lint reports 0 errors, build exits 0.

---

## 7. Features incomplete, and honestly presented as such

Not defects. Listed so nothing on this list is mistaken for working.

- **Professional roster and slot booking.** `/studio/designers` renders "No designers listed yet ... empty on purpose". `README.md` module 6 says the same: the consultation request flow is in, the roster and real slot booking are not.
- **Studio video.** No videos exist. `CF_STREAM_CUSTOMER_CODE` is unset and there are no `StudioIdea` rows carrying video.
- **XLSX parsing.** Spreadsheets are accepted by the submission path and routed to a human with an honest note; on the extract path they are refused with a sentence telling the customer what to attach instead. Real `.xlsx` parsing is not implemented and does not pretend to be.
- **Profile name editing.** Not built. `PATCH /api/v1/me` edits the delivery phone only, and the field says so.
- **Vendors.** Zero vendor rows, zero costed variants, and `Product.vendorId` is null across the catalogue, so the per vendor dispatch path has never carried a real order.
- **Wallet.** `WalletEntry` is append only and correct by construction, and has never been exercised end to end.

---

## 8. Needs a business or legal decision

| What | Why it is not mine to decide |
| --- | --- |
| The three Terms clauses (LEG-01) | Drafting law. Writing them would be fabrication. |
| What the `instant` delivery promise should say (CX-01) | Customer facing copy, and the number has already been retired once. |
| Whether `/hindware` stays public (OPS-02) | Third party catalogue imagery on your domain. |
| Whether to commit the catalogue export (OPS-01) | Data that lives outside the repo today, by someone's earlier choice. |
| Whether `/studio/designers` and `/studio/watch` go into the sitemap now | Submitting empty pages for indexing is a trade, not a bug. |
| Moving `prisma` to `devDependencies` (SEC-03) | Changes what the production install contains. |

---

## 9. Production deployment checklist

Carried forward from `docs/QUOIN_LAUNCH_READINESS.md` where it still stands, with
this audit's items folded in. Items marked **new** are from this audit.

### Before a public launch

- [ ] **LEG-01, new.** Draft the limitation of liability, governing law and jurisdiction clauses, replace the `ToConfirm` block in `src/app/(legal)/terms/page.tsx`, and confirm `npm run check:legal` exits 0.
- [ ] **OPS-01, new.** Make the catalogue rebuildable: commit the export, or document where the only copy lives. Then do ORD-12's restore drill against it.
- [ ] Lift the Supabase storage cap (DEP-14). This affects Studio uploads and document downloads, **not** the Parcha tab, which can stay (section 3).
- [ ] Enable Supabase daily backups and PITR, and schedule `npm run db:export` (ORD-10).
- [ ] Set `ALERT_WEBHOOK_URL` in Vercel production, or every alert stops at the console (DEP-10).
- [ ] Rotate the orphaned Supabase SMS hook secret and set `SUPABASE_SMS_HOOK_SECRET` in both `.env.local` and Vercel (SEC-17).
- [ ] Fix SPF and DKIM on `quoin.co.in`, or support mail keeps landing in spam (TRU-05).
- [ ] Confirm the cron jobs actually run and are authenticated (DEP-09).
- [ ] Confirm the reconciliation job has run at least once (PAY-11).
- [ ] Write the cancellation and refund procedure (ADM-09), and confirm you can actually deliver, cancel and refund (TRU-10).

### Deploy time, for the changes on this branch

- [ ] Review the diff on `production-readiness-audit`, five files.
- [ ] Confirm the six newly submitted pages are ones you want indexed: `/faq`, `/experts`, `/trending`, `/premium`, `/lighting`, `/rooted`.
- [ ] Confirm `/projects/new` and `/studio/upload` should be uncrawlable.
- [ ] After deploy, fetch `https://www.quoin.co.in/sitemap.xml` and `robots.txt` and check both against the above.
- [ ] Resubmit the sitemap in Search Console.

### Still open and outside this audit's scope

- [ ] PAY-18, one captured payment settling an order to `PAID`, with ADM-08 and TRU-09 in the same minute. Payments were excluded by instruction and nothing here touches them.

---

## 10. Method

Read `CLAUDE.md`, `AGENTS.md`, `README.md`, and the three existing audit
documents in `docs/` before touching anything, so this would add to them rather
than repeat them. Then: fresh `npm install`; baseline typecheck, suite, lint and
build; an embedded Postgres with the schema pushed and the repository's own seed
and importer run; a dev server; a 37 route HTTP sweep; a scripted responsive and
accessibility pass at three widths in a real browser; a signed out probe of 20
protected endpoints; file upload probes against the Parcha reader; the
repository's own `check-legal` and `npm audit`; and a code read of the API
surface, every `/api/v1` route's guard, and the data layer's ownership clauses.

One read only request was made to the live site, to `https://www.quoin.co.in/terms`,
to confirm LEG-01 is in production and not only on this branch. No form was
submitted anywhere, no account was signed into, and no production data was read
or written.
