# Quoin — launch readiness checklist

**Re-audited:** 22 November 2026 · **Code as audited:** `e176b30`
**Amended 22 Nov:** DEP-04 confirmed by the owner, and PAY-01 narrowed because of it.
**Amended 24 Nov:** PAY-01 closed by the first verified webhook since October; DEP-10,
SEC-11, SEC-03, ORD-14, CX-04, CX-08, CX-12, CX-13 and DEP-16 all moved. The one
remaining pilot blocker is PAY-18, a single captured payment.
**First audited:** 24 October 2026 (`b4d9255`) — findings and method in `QUOIN_LAUNCH_AUDIT.md`,
which stays as that day's record and is not rewritten.
**Excluded by instruction:** GST, tax calculation, GST compliance.

**Status values:** Pass · Partial · Fail · Blocked · Not Started · N/A
**Priority:** P0 critical · P1 high · P2 medium · P3 low

> Four states are kept apart on purpose. **Pass** means tested today, with the
> evidence in the row. **Partial** means something real is in place and the
> item is not finished. **Blocked** means I have no access and you must verify
> it. **Not Started** means testable but not yet run.
>
> Every number in this file was re-read on 22 November against the production
> database and the live site. Where a row says "unchanged", it was re-checked
> and had not moved.

---

## Summary

| | Count |
| --- | ---: |
| Pass | 75 |
| Partial | 10 |
| Fail | 2 |
| Blocked (no access) | 8 |
| Not Started | 14 |
| N/A, resolved or risk accepted | 3 |
| **Total items** | **112** |

**The two failures:** CX-14 and DEP-14 — Supabase storage is restricted, so
uploads fail. One upgrade closes both.

**PAY-01 closed on 24 November at 14:14 UTC**, when the first webhook since 5
October arrived and verified. ORD-14, DEP-10, SEC-11 and SEC-03 closed the same
day. **SEC-17, the rotation itself, is still open and is yours** — removing a
secret from a file does not make it stop working.

**What blocks what:**

| Gate | Items |
| --- | --- |
| **Controlled pilot** | **PAY-18** — one captured payment — and ADM-08 and TRU-09, which it proves in the same minute. PAY-01, PAY-14 and DEP-04 are all cleared |
| **Before live mode** | PAY-10, PAY-13, ADM-09, TRU-05 |
| **Before public launch** | ORD-10, ORD-12, PAY-11, CX-14, DEP-09, DEP-10 (set `ALERT_WEBHOOK_URL`), DEP-14, SEC-17, TRU-10 |

> **Live risk, 22 November — resolved 24 November.** Online payment has been
> switched on in production the whole time, with nothing having settled through
> the webhook since 5 October: a customer could pay and have their order sit in
> `PENDING_PAYMENT` with no confirmation. That is no longer true. The webhook
> verifies, the failure path is proven, and the remaining unknown is narrower
> and much less dangerous — whether a *capture* settles (PAY-18). A payment
> taken today would be recorded; the question is only whether the order flips
> to `PAID` without someone watching.

### What moved since 24 October

- **Legal pages carry Quoin's real details.** `COMPANY_DETAILS_ARE_SAMPLE` and
  `POLICY_IS_SAMPLE` are both `false`; no placeholder text is served.
- **The admin console has its own hostname.** `/admin` and `/api/v1/admin/*`
  return 404 on `www`, and admin access needs `isStaff` *and* an
  `ADMIN_ALLOWLIST` entry that lives outside the database.
- **The order lifecycle was rewritten** to four customer-facing stages, with one
  status-writing path and a per-vendor fulfilment row.
- **The database has an off-platform copy** — `scripts/export-database.ts`,
  verified. Supabase's own backups are still not enabled.
- **The catalogue was cut to the master list** — 488 active products of 3,227,
  every one with an image, every listed price verified at three layers.
- **Checkout is rate-limited** where October found it was not.
- **`.env.local` still carries an orphaned secret on line 1.** Unchanged, and
  still the one security item with a real value behind it.
- **Supabase storage is restricted** — `402 exceed_egress_quota` — which breaks
  the Parcha upload. This is new since October and is on the spend cap.
- **Production environment variables are confirmed** (DEP-04), which narrows
  PAY-01 from "something is misconfigured" to "nothing is being delivered".
- **838 tests pass**, lint reports 0 errors and 3 warnings, and `npm run build`
  exits 0 on **Next 16.4.6** — upgraded 22 Nov, which closes the only advisory
  that was in the serving path (DEP-15).

---

## A. Website and customer experience

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| CX-01 | Home, categories, department, product, cart, checkout routes resolve | P0 | **Pass** | Live `/`, `/signin`, `/account`, `/api/v1/health` → 200 on 22 Nov | No |
| CX-02 | Custom domain serves over HTTPS | P0 | **Pass** | `quoin.co.in` → `www.quoin.co.in` → 200, HSTS preload | No |
| CX-03 | Mobile layout (375 px) | P1 | **Pass** | Re-walked after the home-page rebuild: hero carousel, Design & Renovate, Expert Services, six-tab bar | No |
| CX-04 | Tablet and desktop layouts | P1 | **Pass** (24 Nov) | Walked at **768** and **1440**: home, category, product, cart and checkout all render with **no horizontal page scroll** at either width (`scrollWidth == clientWidth`). At 1440 the phone tab bar is correctly `display: none`, the footer runs the full width, and the product page lays out two columns at 888 px + 416 px. One quality note, not a break: the hero art is a 1200 px source, so on a large screen at device-pixel-ratio 2 it is scaled past its resolution and will look soft — a 2400 px export fixes it | No |
| CX-05 | Search, filters, departments, shelves | P1 | **Pass** | Shelf filter verified; `/api/v1/search` rate-limited | No |
| CX-06 | Product names, SKUs, units, prices render correctly | P1 | **Pass** | All 532 prices on the owner's list verified at three layers — stored paise, rendered card, checkout quote | No |
| CX-07 | Product images load | P2 | **Pass** | 0 of 488 active products without an image; all served from the repo, none from Supabase storage | No |
| CX-08 | Cart quantity, removal, subtotal | P0 | **Pass** (walked live, 23 Nov) | On `www`, phone width: added a ₹1,400 valve and a ₹416 bonding agent; 3 × ₹1,400 = **₹4,200**, line 2 **₹416**, group and footer both **₹4,616**, "4 items" counting units not lines. Decrement 3→2→1 and removal by bin both recomputed correctly; − at the minimum removes the line, which `setQty` documents as deliberate; the empty state renders. The cart is `localStorage` (`quoin:cart`), so it survived navigation and **wrote nothing to the database** — the store was read directly after each step and agreed with the screen every time. Not exercisable: `stepQty`/`minQty` above 1 and the savings line, because no variant in the live catalogue has either | No |
| CX-09 | Address entry, validation, delivery availability | P0 | **Partial** (23 Nov) | **Availability verified live:** `/api/v1/serviceability` answers 110058 → Janakpuri and 110063 → Paschim Vihar serviceable, Mumbai 400001 not serviceable, and `12` → *"Enter a six-digit pincode"*. **Address entry is sign-in only:** signed out, checkout step 1 offers nothing but "Continue with Google", and pressing Continue answers *"Sign in above to continue — your delivery addresses live on your account"*. There is no guest checkout, so the form, its validation and the save path need one signed-in pass by the owner — I did not sign in, because that is your Google account and saving writes a real `Address` row. The product-page pincode checker exists but is unmounted, by your instruction | No |
| CX-10 | Loading, empty, error and success states | P2 | **Pass** | `loading.tsx` per route, `EmptyState` on empty results, toasts on cart actions | No |
| CX-11 | Console errors on key pages | P2 | **Pass** | Only the CSP report-only notice | No |
| CX-12 | Accessibility basics | P2 | **Partial** (24 Nov) | Audited home, category and product by hand: `lang="en"`, one `<main>`, header and footer landmarks, no heading-level skips, **no missing `alt`** across 278 images on the home page (44 correctly empty for decoration), and no unnamed link, button or input anywhere. **Two real defects found and fixed:** the home page carried **three `<h1>`** (one per carousel slide) and there was **no skip link**, so a keyboard user walked the whole header on every page. The slides are `h2` now, the page has one screen-reader `h1`, and `Skip to content` is the first thing in the tab order, moving focus to `main#main`. Fixing the second found a third: at `z-50` the link painted *underneath* the sticky header, proven by `elementFromPoint`, so it sits at `z-100`. Still outstanding: no automated axe run (injecting it into the live page was refused, correctly) and no colour-contrast pass | No |
| CX-13 | Broken links / missing images sweep | P2 | **Pass** (24 Nov) | Crawled 70 live pages — every non-product URL in the sitemap plus 40 sampled products — and resolved all **788 unique internal links and images**: zero broken, zero non-200 pages. Separately, all **488** active products' image files were checked against the repository: every one present, **none pointing at Supabase storage**, which is why the catalogue survives the egress cap. One orphan: `generic-gypsum-keel-furlocgyp176cw` is active but has no active variant, so its page 404s. It is excluded from the sitemap, the listing, search and the category count alike, and nothing links to it — consistent, but it is why "488 active" is one more than the 487 that are sellable | No |
| CX-14 | **Parcha upload works** | P0 | **Fail** | Supabase storage answers `402 exceed_egress_quota`, so the signed upload fails. The tab is in the six-tab bar | **Yes** — fix the cap or hide the tab |
| CX-15 | Catalogue restricted to the master list | P1 | **Pass** | 488 active of 3,227; reversible from `reports/restricted-to-master-list.json` | No |
| CX-16 | Illustrated products are honestly presented | P2 | **Partial** | 75 of 488 carry a generated illustration rather than a photograph; labelled, but photographs are still wanted | No |

---

## B. Orders and database

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| ORD-01 | **Orders persist to the database** | P0 | **Pass** (as observed 22 Nov) | 4 orders, each with lines and a payment row. The table is empty now by decision, not by fault — ORD-16 | No |
| ORD-02 | Order carries correct customer, address, items, totals | P0 | **Pass** | Schema + `createPendingOrder`; totals ₹420–₹5,200 | No |
| ORD-03 | Unique order references | P0 | **Pass** (as observed 22 Nov) | `QO-XXXXXX`, unique across all 4 before they were cleared (ORD-16) | No |
| ORD-04 | Orders visible in admin | P1 | Not Started | `listAdminOrders` + the order board exist; UI not exercised against a real order | No |
| ORD-05 | Dashboard counters are day-scoped | P1 | **Pass** | `admin-metrics.ts` counts within today IST | No |
| ORD-06 | Status transitions guarded | P1 | **Pass** | `ORDER_TRANSITIONS` + `transitionOrderStatus`, the single status-writing path; `OrderStatusChange` audit trail | No |
| ORD-07 | **Duplicate orders prevented** | P0 | **Pass** | `idempotencyKey` returns the existing order *and* gateway order | No |
| ORD-08 | Partial checkout failure leaves no orphan gateway order | P0 | **Pass** | Order first, gateway second, payment third | No |
| ORD-09 | Stock management / out-of-stock | P1 | **N/A — risk accepted** | Decided 22 Nov: nothing is stocked, every product shows "In stock", `stockTracked` is off. Overselling is possible and is a business decision, not a defect | No |
| ORD-10 | Database backups and PITR | P0 | **Partial** | `npm run db:export` writes and verifies an off-platform copy — 6,551 rows, 48 tables, 0.4 MB gzipped, ~14s. Supabase's own daily backups and PITR are still not enabled, and nothing schedules the exporter. See `docs/backups.md` | **Yes, before public launch** |
| ORD-11 | Migrations applied cleanly in production | P1 | **Blocked** | No Supabase or Vercel access | No |
| ORD-12 | Restore drill performed | P1 | Not Started | Procedure now written down, including what to assert and that the clock reading is the recovery time. Needs a second Supabase project and a loader, both deliberately unwritten until the drill is done for real | **Yes, before public launch** |
| ORD-13 | Four-stage lifecycle, one vocabulary | P1 | **Pass** | `src/lib/orders/lifecycle.ts` read by the stepper, timeline, order board and notifiers; `CONFIRMED`/`PROCESSING`/`PACKED` retired and refused as destinations | No |
| ORD-14 | A captured payment sat on a cancelled order | P1 | **Resolved by deletion** (24 Nov) | Was: `QO-P8498W`, ₹5,200 netbanking, `CAPTURED`, order `CANCELLED`, no `Refund` row. Cleared at the owner's instruction along with the rest of the October test traffic — see ORD-16. **The deletion settles the database, not the money:** if that capture was live, it is still Razorpay's record and still the customer's ₹5,200. The row survives in the 23 November export | No |
| ORD-15 | Wallet ledger | P2 | Not Started | `WalletEntry` is append-only, credit idempotent on `reference`, spend serializable; 0 entries, never exercised end to end | No |
| ORD-16 | October's test traffic cleared from production | P2 | **Pass** (24 Nov) | At the owner's instruction: **4 orders, 5 order lines, 1 status change and 4 payment rows deleted**, two of them belonging to people who are not the owner. The **46 `payment_webhooks` rows were kept on purpose** — they carry no customer data and they are the only evidence in the database that the webhook has never worked (PAY-01). A verified export was taken first (6,551 rows, 48 tables, every hash matching, 23 Nov 18:55 UTC), so nothing is unrecoverable. Orders now stand at **0**, which is also why ORD-01 to ORD-03 read as history rather than as live counts | No |

---

## C. Razorpay and payment reliability

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | **Webhook signature verification succeeds** | P0 | **Pass** (24 Nov, 14:14 UTC) | **The first delivery since 5 October, and it verified.** `payment.failed` for `pay_U42dsnkLycQcZC`, `signatureValid: true`, `outcome: recorded`, processed in the same millisecond. The whole chain ran: Razorpay sent it, the HMAC checked out, `recordFailedPayment` wrote the row, and the order correctly stayed at `PENDING_PAYMENT`. The October fix was right; nothing had ever tested it. **What is still unproven is the success path** — no `payment.captured` has settled an order to `PAID` yet, which is PAY-18 |
| PAY-02 | Misconfiguration fails loudly | P0 | **Pass** (fixed 24 Oct, proven live 22 Nov) | `isRazorpayConfigured` requires the webhook secret, so online payment is not offered without it; admin banner on rejected deliveries; 6 tests. The live site reports the gate open, which is itself the evidence for DEP-04 | No |
| PAY-03 | Gateway order created server-side | P0 | **Pass** | `createGatewayOrder` in the checkout route | No |
| PAY-04 | Amount computed server-side from catalogue | P0 | **Pass** | A claimed total in the body is ignored | No |
| PAY-05 | Handoff signature verified | P0 | **Pass** | HMAC over `orderId\|paymentId` | No |
| PAY-06 | Handoff cannot mark an order paid | P0 | **Pass** | `checkout/verify` has no write path to `status` | No |
| PAY-07 | Webhook is the sole authority for `PAID` | P0 | **Pass** | `settleCapturedPayment` reachable only from the webhook route | No |
| PAY-08 | Duplicate webhook deliveries safe | P0 | **Pass** | Duplicates answer 200; only unprocessed errors return 500 for retry | No |
| PAY-09 | Failed / cancelled payments handled | P1 | **Pass** (proven 24 Nov) | No longer "pass (code)": a real failure ran through it today. `QO-DAKYD4`, ₹29, card — `Payment.status = FAILED` with Razorpay's own words stored verbatim, and the order left at `PENDING_PAYMENT` where it belongs | No |
| PAY-10 | Refund workflow | P1 | **Partial** | A real bug was found and fixed on 22 Nov: a *partial* refund was marking the whole order `REFUNDED`. Coverage is now decided by `refundsCoverCapture` over `PROCESSED` refunds only, a partial refund no longer touches order status, and `settleProcessedRefund` reports `partial_refund`. Still never exercised against Razorpay, and `Refund` count is 0 | **Yes, before live mode** |
| PAY-11 | Reconciliation catches missed webhooks | P0 | Not Started | `/api/v1/cron/reconcile-payments` is scheduled at 01:00 and is the safety net that should have caught PAY-01. Never observed to run | **Yes, before public launch** |
| PAY-12 | No Razorpay secret in frontend bundle | P0 | **Pass** | Exact-value search of `.next/static` — clean | No |
| PAY-13 | Test vs live mode separation | P0 | **Blocked** | `RAZORPAY_KEY_ID` is empty locally; Vercel values not visible | **Yes, before live mode** |
| PAY-14 | Razorpay webhook subscription configured | P0 | **Pass** (24 Nov) | It was the prime suspect and it is now answered the only way a subscription can be: a delivery arrived. It exists, it is enabled, and it points at production | No |
| PAY-15 | Customer-facing payment messages | P2 | **Pass** | Verify failure names support and the order reference without disclosing the order | No |
| PAY-16 | Revenue figures net off refunds | P1 | **Pass** | Dashboard and monthly revenue both subtract `PROCESSED` refunds (`admin-metrics.ts`) | No |
| PAY-17 | Card acceptance is domestic-only | P2 | **Pass** — a setting, not a fault | Today's ₹29 attempt was refused by Razorpay with *"this business accepts domestic (Indian) card payments only"*. That is the account's configuration, and the application handled it correctly. Worth knowing before somebody abroad tries to buy, and before anyone reads a failed card as a bug | No |
| PAY-18 | **A capture settles an order to `PAID`** | P0 | Not Started | The half PAY-01 did not prove. One order paid by UPI, netbanking or an Indian card gives: a `payment.captured` row with `signatureValid: true`, an order at `PAID` with `paidAt` set, and the confirmation firing — which is ADM-08 and TRU-09 in the same minute | **YES — the remaining pilot blocker** |

---

## D. Admin and fulfilment

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| ADM-01 | **Admin pages require staff** | P0 | **Pass** | `requireStaffPage` on 21 of 21 pages, re-counted 22 Nov | No |
| ADM-02 | **Admin APIs require staff** | P0 | **Pass** | `requireStaff` on 25 of 25 admin routes | No |
| ADM-03 | Admin existence not disclosed | P1 | **Pass** | `notFound()` for signed-out and for signed-in-without-access alike | No |
| ADM-04 | Orders queue, search, filter | P1 | Not Started | Code supports status + search; not exercised | No |
| ADM-05 | Status updates from admin | P1 | Not Started | Guarded route exists, one writing path | No |
| ADM-06 | Customer delivery details visible | P1 | Not Started | — | No |
| ADM-07 | Inventory management | P2 | **N/A** | Follows ORD-09: nothing is stocked | No |
| ADM-08 | Order confirmation to customer | P0 | **Blocked — narrowed** | `notifyPaymentSettled` fires from `settleCapturedPayment`, which only a **captured** payment reaches. The webhook is no longer the obstacle (PAY-01); one successful payment now proves this and TRU-09 together | **Yes** |
| ADM-09 | Cancellation and refund procedure | P1 | Not Started | The machine now refuses `PAID → CANCELLED`; a paid order leaves by `REFUND_PENDING → REFUNDED`. The written procedure is still missing | **Yes, before live mode** |
| ADM-10 | Failed / abandoned order handling | P2 | **Pass** (code) | 2 orders correctly sit `PENDING_PAYMENT` with a `CREATED` payment | No |
| ADM-11 | Console served on its own hostname | P1 | **Pass** | `www/admin` → 404, `www/api/v1/admin/orders` → 404, `admin.quoin.co.in/` → 307. `hostVerdict` enforced in the middleware, the `handler` wrapper and `requireStaffPage` | No |
| ADM-12 | Admin access needs more than a database flag | P0 | **Pass** (code) · **Blocked** (value) | `canAccessAdmin` = `isStaff` **and** an `ADMIN_ALLOWLIST` entry from the environment; nobody hard-coded; `scripts/grant-staff.ts` refuses a flag the gate would not admit. 2 of 4 users carry `isStaff`; the production allowlist value is not visible from here | No |

---

## E. Security and dependency health

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | **No secret values in client bundle** | P0 | **Pass** | Every configured secret exact-value searched in `.next/static` — none found | No |
| SEC-02 | `.env` files git-ignored | P0 | **Pass** | `.gitignore` → `.env*`, and `/backups` added by the exporter itself | No |
| SEC-03 | `.env.local` carried an orphaned secret | P1 | **Pass** (24 Nov) | Line 1 is gone. It was 148 characters, `v1,whsec_…`, with no key name and **no `=`**, so nothing ever read it — not this project's loader, not Next's: it was a secret sitting in a file doing nothing. 23 keys before and after, no unparsed line left, and every variable verified to still load against the live database. **It was never committed** — `.env.local` has never been tracked, and the only `v1,whsec_` strings in the history are a format note, a test fixture and this checklist. The removed value's fingerprint, for recognising it in the dashboard, is sha256 `cbb1095e…`; the copy taken before the edit has been deleted. 6 keys hold empty values (3 MSG91, 3 Razorpay), which is expected locally | No |
| SEC-04 | **Dependency audit** | P1 | **Partial — the serving path is clean** | `npm audit --omit=dev`: **4 high, 0 moderate, 0 critical** (October: 1 critical + 8 high). The `next` moderate is gone — see DEP-15. All four remaining highs are in the **Prisma CLI** chain (`deepmerge-ts`, `effect` via `@prisma/config`): a developer's tool, never loaded by a request. **A zero here is purchasable and was not worth the price:** `npm audit fix --force` downgrades the CLI to 6.12.0, which does not understand the `migrations.seed` key in `prisma.config.ts` (typecheck fails) and leaves a 6.12 CLI against a 6.19 client. Tried on 22 Nov and reverted. The forward fix is Prisma 7.10.1 or later, which is outside the advisory range — a deliberate major upgrade, not an audit-fix | No |
| SEC-05 | Admin authorization | P0 | **Pass** | See ADM-01, ADM-02, ADM-12 | No |
| SEC-06 | Server-side input validation | P0 | **Pass** | Zod on every inspected route, bounded string lengths | No |
| SEC-07 | Price manipulation prevented | P0 | **Pass** | Totals never read from the request body | No |
| SEC-08 | IDOR — orders | P0 | **Pass** | `checkout/verify` re-checks `order.userId === user.id` even with a valid signature | No |
| SEC-09 | IDOR — addresses | P0 | **Pass** | Address reads scoped by `userId`, re-scoped inside `createPendingOrder` | No |
| SEC-10 | Security headers | P1 | **Pass** | Re-read live: HSTS `max-age=63072000; includeSubDomains; preload`, XFO `DENY`, nosniff, Referrer-Policy, Permissions-Policy `payment=()`. One consequence of that last one worth knowing before it surprises someone: `payment=()` denies the browser's Payment Request API to everyone, this origin included. Card, UPI and netbanking inside Razorpay's iframe do not use it; a future Google Pay or Apple Pay button driven by that API would need the directive relaxed | No |
| SEC-11 | **CSP enforced** | P1 | **Pass** (24 Nov) | The header is `Content-Security-Policy` now. The old precondition — *"watch a real test payment and a real Studio clip through it"* — could never be met: **there are no Studio clips** (0 `StudioIdea` rows with `media = VIDEO`, no `videoUid`, no `videoPath`, `CF_STREAM_CUSTOMER_CODE` empty), and the test payment is behind PAY-01. So it was settled with evidence instead: every host `checkout.razorpay.com/v1/checkout.js` names — `api`, `cdn`, `lumberjack`, `lumberjack-cx`, `lumberjack-metrics`, `api-dark`, `express` — is under `razorpay.com` and already covered by the wildcard; `browser.sentry-cdn.com` appears only in an ignore-list, not as a script. Then proven in a browser under the enforced header: **the script loads, `window.Razorpay` is defined, and `rzp.open()` creates its iframe on `api.razorpay.com/v1/checkout/public` with no violation reported.** `CSP_REPORT_ONLY=1` is the way back without a deploy. **Be honest about the value:** `script-src` still allows `'unsafe-inline'` and `'unsafe-eval'`, so this is not the policy that stops an injected script — nonce-ing Next's bootstrap is a separate change. What enforcing buys is everything that was inert while report-only: `object-src`, `base-uri`, `frame-ancestors`, `form-action`, and `upgrade-insecure-requests`, which browsers ignore outright in a report-only policy. 8 tests | No |
| SEC-12 | Rate limiting | P1 | **Pass** | The October gaps are closed: `checkout/order`, `checkout/quote` and `checkout/verify` are all limited, as are `auth/otp/request`, `auth/otp/verify`, `auth/supabase/send-otp`, `parcha`, `search`, `visualise` and the vendor dispatch token route | No |
| SEC-13 | Unverified webhook bodies not retained | P1 | **Pass** | `fingerprint()` stores length + digest only | No |
| SEC-14 | Sensitive data kept out of logs | P1 | **Pass** | `maskPhone` on the delivery-phone path; error identity logged, never the argument-echoing Prisma error | No |
| SEC-15 | Database RLS | P1 | **Blocked** | No Supabase access; authorization is enforced in application code | No |
| SEC-16 | File upload validation | P2 | Not Started | Signed-upload routes exist; untestable today because storage is restricted (CX-14) | No |
| SEC-17 | **Rotate the orphaned secret** | P1 | Not Started — **and this is the half that matters** | The file is clean (SEC-03) and the secret is not. Deleting a line removes a copy, not the credential: that value still authenticates anything holding it until Supabase issues a new one. It is shaped like the **SMS hook secret**, which is what stops anyone posting to `/api/v1/auth/supabase/send-otp` and making this application send one-time codes. Rotate it in **Supabase → Authentication → Hooks**, then set the new value as `SUPABASE_SMS_HOOK_SECRET` in **both** `.env.local` and Vercel production — and only then is SEC-03 finished | **Yes** |
| SEC-18 | Vendor identifiers and bank details | P1 | **Partial** | GSTIN base-36 checksum, embedded PAN, IFSC and VPA shape, and name matching are all implemented and tested; a payment route and a note are required before `VERIFIED`. No penny-drop verification, and no vendor rows to verify | No |

---

## F. Deployment and production configuration

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| DEP-01 | Production domain + HTTPS + redirect | P0 | **Pass** | `quoin.co.in` → `www.quoin.co.in`, 200, HSTS | No |
| DEP-02 | Deployed version matches intended code | P1 | **Pass** | October's three unmerged commits are gone: `main` is `e176b30` and level with `origin/main`. The live home page serves the current work (206 "In stock" lines) | No |
| DEP-03 | No hardcoded localhost / test endpoints | P1 | **Pass** | No `localhost` in `src/`; gateway key read from env per request | No |
| DEP-04 | Vercel env var names and values | P0 | **Pass** (owner-confirmed 22 Nov) | Checked in the Vercel production environment by the owner, and corroborated twice from outside: `admin.quoin.co.in/` → 307 → `/signin?next=/admin`, a redirect only reachable from the `host === adminHost` branch of `hostVerdict`, so `ADMIN_HOST` is set and correct; and `/consult` serialises `paymentsReady: true`, which `razorpayMissingConfigIn` only allows when `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` **and** `RAZORPAY_WEBHOOK_SECRET` are all non-empty | No |
| DEP-05 | Preview and production separated | P1 | **Blocked** | No access | **Yes** |
| DEP-06 | Build and runtime logs reviewed | P1 | **Blocked** | No access | No |
| DEP-07 | Region | P2 | **Pass** | `bom1` in `vercel.json`, confirmed by `x-vercel-id` | No |
| DEP-08 | Cron jobs configured | P1 | **Pass** (config) | `reconcile-payments` 01:00, `release-reservations` 02:00 | No |
| DEP-09 | Cron jobs actually run and are authenticated | P0 | **Blocked** | `CRON_SECRET` empty locally; no log access | **Yes** |
| DEP-10 | Error monitoring | P0 | **Partial** (24 Nov) | Not Sentry — `src/lib/alerts.ts` already raises on the events that matter: an unhandled 5xx from any API route, a rejected webhook, a refused admin, a CSP violation. **The hole was pages:** a Server Component that cannot reach the database never passes through `handler()`, so the customer saw the error boundary and nobody else saw anything. Both boundaries now report to `/api/v1/render-error` — digest and path only, never the message, deduped by fault, rate-limited, always 204 — and it raises `render_error`. Proven end to end against a deliberately throwing page: boundary → 204 → `[alert] render_error: A page threw while rendering /…`. 11 new tests. **What is left is yours:** every alert reaches the console and goes no further until `ALERT_WEBHOOK_URL` is set in Vercel production — a Slack or Discord incoming webhook, two minutes, no new vendor | **Yes, before public launch** — set the webhook URL |
| DEP-11 | Rollback procedure | P1 | **Partial** | Written up in `docs/rollback.md`, including what a rollback does *not* revert. Still undrilled | No |
| DEP-12 | Image optimisation and performance | P2 | **Pass** (partial) | `next/image` with `sizes` throughout; no Lighthouse run | No |
| DEP-13 | Health endpoint | P2 | **Pass** | `/api/v1/health` → 200 on 22 Nov | No |
| DEP-14 | **Supabase project is within its limits** | P0 | **Fail** | Storage is restricted: `402 … exceed_egress_quota`. Postgres is still serving, so the shop is unaffected, but every signed upload fails (CX-14, SEC-16) and so does ORD-10's Supabase half. One upgrade clears the cap, the backups and PITR | **Yes, before public launch** |
| DEP-15 | Framework patch level | P1 | **Pass** (22 Nov) | `next` 16.4.6, pinned exactly as this repo pins it. Closes all 7 advisories, among them the image-optimization SVG bypass and cache poisoning in `use cache`. Verified: typecheck clean, 838 tests pass, `npm run build` exits 0 — compiled in 46s with the Prisma client regenerated at 6.19.3 | No |
| DEP-16 | `middleware` convention deprecated | P1 | **Pass** (24 Nov) | Migrated by hand rather than by codemod, because the file is one of the three places enforcing the admin-host split: `src/middleware.ts` → `src/proxy.ts`, the exported function renamed, and every reference in code, tests and docs brought with it. The matcher, the header set and the order of operations are untouched. 838 tests pass, the host tests among them; the build warning is gone | No |

---

## G. Customer trust and launch operations

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| TRU-01 | Privacy policy | P0 | **Pass** | `/privacy` live, with Quoin's real details — `POLICY_IS_SAMPLE = false` | No |
| TRU-02 | Terms of service | P0 | **Pass** | `/terms` live, audited for claims it could not keep | No |
| TRU-03 | Refunds and cancellations policy | P0 | **Pass** | `/refunds` live and consistent with the machine: a paid order leaves by refund, not cancellation | No |
| TRU-04 | Grievance officer | P1 | **Pass** | `/grievance` live with a named officer; `COMPANY_DETAILS_ARE_SAMPLE = false` | No |
| TRU-05 | Contact method works | P0 | **Partial** (24 Nov) | Tested by the owner: mail to `support@quoin.co.in` arrives and replies come back, so the channel exists. **But it lands in recipients' spam** — `quoin.co.in` publishes no SPF and no DKIM while a DMARC record GoDaddy created says `p=quarantine`, so the domain instructs receivers to quarantine everything that fails authentication, and nothing can authenticate. Not a code fault: the application sends no email at all. The fix is two dashboards and is written out in `docs/email-deliverability.md` | **Yes** — a support address nobody sees is not a support address |
| TRU-06 | Delivery coverage and estimates clear | P1 | **Pass** | Four named areas at checkout; "Today — usually within 45 minutes" from one constant, `SCHEDULED_DELIVERY_MINUTES` | No |
| TRU-07 | **Delivery-time claims are accurate** | P1 | **Pass**, with a loose end | The "18 minutes" headline is gone; 45 minutes or same day everywhere, from one source. **The number itself is still alive in the data:** `/api/v1/serviceability?lat=&lng=` returns `etaMinutes: 18` from `Store.baseEtaMinutes`, and the only reason no page says it is that no component reads that field. Wiring it up would bring the retired claim back without anyone deciding to | No |
| TRU-08 | Pricing, units, availability clear | P1 | **Pass** | Unit on every price, "Inclusive of all taxes" on the sticky bar — GST is extracted, never added | No |
| TRU-09 | Order confirmation reaches the customer | P0 | **Blocked — narrowed** | No longer waiting on the webhook. Waiting on a captured payment, and on the WhatsApp variables being set in production | **Yes** |
| TRU-10 | Operational readiness to deliver / cancel / refund | P0 | Not Started | A business-process question. Nothing in the code can answer it | **Yes** |
| TRU-11 | Sign-in works for the customers you have | P1 | **Pass** (decision) | Live `/signin` offers Google only, by decision, while DLT approval is pending. The consequence is explicit: a customer with no Google account cannot sign in yet | No |

---

## H. Vendors and supply

New section. The October audit predates all of it.

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| VEN-01 | Vendor records exist and are gated | P1 | **Pass** (code) | `Vendor` + `VendorStatus`; `createVendor` always writes `DRAFT`; `markVerified` requires a payment route and a note. **0 vendor rows** | No |
| VEN-02 | Cost price per variant | P1 | **Pass** (code) | `ProductVariant.costPaise`, integer paise, set through `setVariantCost`. **0 costed variants** | No |
| VEN-03 | Margin reporting | P2 | **Pass** (code) | `listVendorMargins`; nothing to report until VEN-02 has data | No |
| VEN-04 | Per-vendor fulfilment and dispatch | P1 | **Partial** | An order spanning vendors gets one `OrderFulfilment` each and only reaches `DISPATCHED` when every one has. Since `Product.vendorId` is null on all 488 active products, **every order today is Quoin's own to fulfil** and the vendor dispatch path has never carried a real order | No |
| VEN-05 | Weekly automatic payouts | P1 | Not Started | The payable ledger, the weekly statement and the payout run are designed and unbuilt. RazorpayX KYC is yours to start | No — blocks paying vendors, not launching |

---

## Retest checklist — run after fixes

Complete **all** of these before revisiting the launch decision.

### Gate 1 — payment settlement (PAY-01 closed 24 Nov; PAY-18 remains)

> **Steps 1 to 3 are done.** The webhook secret is set (DEP-04), the
> subscription exists and is enabled (PAY-14), and on 24 November at 14:14 UTC
> a delivery arrived and verified (PAY-01). What has not happened is a
> *successful* payment.

1. [x] ~~Set `RAZORPAY_WEBHOOK_SECRET` in Vercel production.~~ Done.
2. [x] ~~Confirm the webhook subscription exists and points at production.~~ Proven by a delivery arriving.
3. [x] ~~Confirm a `payment_webhooks` row with `signatureValid = true` and `outcome = 'recorded'`.~~ 24 Nov, `payment.failed` for `pay_U42dsnkLycQcZC`.
4. [ ] **Pay for one order successfully** — UPI, netbanking or an Indian card. A foreign card is refused by the account itself (PAY-17), which is what happened on the first attempt.
5. [ ] Confirm that order reaches `status = 'PAID'` with `paidAt` set (PAY-18).
6. [ ] Confirm the customer notification fired (ADM-08, TRU-09).
7. [ ] Confirm it appears in the admin orders queue on `admin.quoin.co.in` (ORD-04, ADM-04).
8. [ ] Then place four more, and confirm **zero** new `rejected_signature` rows.

### Gate 2 — resilience

9. [ ] Close the browser mid-payment; confirm the webhook still settles the order.
10. [ ] Double-submit checkout; confirm one order and one gateway order.
11. [ ] Disable the webhook, place an order, run `/api/v1/cron/reconcile-payments`, confirm it settles (PAY-11).
12. [ ] Process one **full** refund in test mode end to end.
13. [ ] Process one **partial** refund and confirm the order status does not move (the 22 November fix).
14. [ ] Settle `QO-P8498W` one way or the other (ORD-14).

### Gate 3 — security and operations

15. [ ] Rotate the Supabase hook secret, delete line 1 of `.env.local`, re-check (SEC-03, SEC-17).
16. [ ] `npm audit --omit=dev` → **nothing critical or high in the serving path**. Today: 4 high, all in the Prisma CLI chain, and a plain `audit fix --force` breaks the build to clear them (SEC-04). The real close is Prisma 7.10.1+.
17. [x] ~~Upgrade `next` past the 7 open advisories.~~ Done 22 Nov — 16.4.6, verified (DEP-15). Then migrate `middleware` → `proxy` (DEP-16).
18. [ ] Error monitoring installed, with an alert on webhook rejections (DEP-10).
19. [ ] Clear the Supabase spend cap; confirm storage answers 200 and the Parcha upload works (DEP-14, CX-14).
20. [ ] Enable Supabase daily backups and PITR; schedule `npm run db:export` as the off-platform copy (ORD-10).
21. [ ] One documented restore drill, with the time written into `docs/backups.md` (ORD-12).
22. [ ] Enforce the CSP instead of reporting it (SEC-11).

### Gate 4 — before enabling live mode

23. [ ] Razorpay account activated for live payments; `rzp_live_` in production only (PAY-13).
24. [ ] Support contact tested and answered (TRU-05).
25. [ ] Written procedure for cancel, refund and failed delivery (ADM-09, TRU-10).
26. [ ] WhatsApp order variables set in production, confirmation message observed (TRU-09).

---

**Current decision: NO-GO.**

Clearing **Gate 1** and **Gate 2** moves this to **GO FOR CONTROLLED PILOT** —
orders you watch by hand, placed by people you can phone. Public launch
additionally needs **Gate 3** and **Gate 4**.

The honest summary of 24 November: **the thing that was broken is fixed.** The
webhook verified for the first time since October, which closes the item this
whole document has been built around, and it closed by somebody trying to pay
rather than by anybody reasoning about it. The failure path is proven in
production: Razorpay refused a foreign card, the application recorded exactly
that and left the order alone.

What is left is one line of evidence nobody has yet: **a payment that
succeeds.** It proves PAY-18, ADM-08 and TRU-09 together, in the same minute,
and it is the only thing between here and a controlled pilot. Pay the ₹29 again
with UPI.

Everything else outstanding is somebody's decision rather than somebody's bug —
a Supabase upgrade, a secret rotation, an alert webhook URL, a restore drill,
and the procedures for cancelling and refunding that only a person can write.
