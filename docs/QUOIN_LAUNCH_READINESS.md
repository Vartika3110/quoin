# Quoin — launch readiness checklist

**Re-audited:** 22 November 2026 · **Commit:** `e176b30` · **main:** level with `origin/main`
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
| Pass | 64 |
| Partial | 7 |
| Fail | 7 |
| Blocked (no access) | 9 |
| Not Started | 19 |
| N/A / risk accepted | 2 |
| **Total items** | **108** |

**The seven failures:** PAY-01 (no settled webhook since 5 October), CX-14 and
DEP-14 (Supabase storage restricted, so uploads fail), ORD-14 (a captured
payment on a cancelled order with no refund row), SEC-03 (orphaned secret in
`.env.local`), SEC-11 (CSP still report-only), DEP-10 (no error monitoring).

**What blocks what:**

| Gate | Items |
| --- | --- |
| **Controlled pilot** | PAY-01 and PAY-14 — and ADM-08 and TRU-09, which are downstream of them. DEP-04 cleared 22 Nov |
| **Before live mode** | PAY-10, PAY-13, ADM-09, TRU-05, ORD-14 |
| **Before public launch** | ORD-10, ORD-12, PAY-11, CX-14, DEP-09, DEP-10, DEP-14, SEC-17, TRU-10 |

> **Live risk, found 22 November.** Online payment is **switched on right now**
> on `www.quoin.co.in` — `/consult` reports the gateway gate open, which means
> all three Razorpay variables are set in production. So a customer can pay
> today, and nothing has settled a payment through the webhook since 5 October.
> Their money would be captured at Razorpay and their order would sit in
> `PENDING_PAYMENT` with no confirmation sent: exactly the "payment worked,
> order counter empty" report that started this audit.
>
> Two honest ways out, and the choice is yours. **Either** clear Gate 1 before
> anyone else pays — it is one dashboard check plus one test delivery —
> **or** unset `RAZORPAY_WEBHOOK_SECRET` in production, which switches the
> payment tile off by design (PAY-02) and leaves "Confirm with an expert" in
> its place until settlement is proven.

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
- **838 tests pass**, lint clean bar one warning, build compiles.

---

## A. Website and customer experience

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| CX-01 | Home, categories, department, product, cart, checkout routes resolve | P0 | **Pass** | Live `/`, `/signin`, `/account`, `/api/v1/health` → 200 on 22 Nov | No |
| CX-02 | Custom domain serves over HTTPS | P0 | **Pass** | `quoin.co.in` → `www.quoin.co.in` → 200, HSTS preload | No |
| CX-03 | Mobile layout (375 px) | P1 | **Pass** | Re-walked after the home-page rebuild: hero carousel, Design & Renovate, Expert Services, six-tab bar | No |
| CX-04 | Tablet and desktop layouts | P1 | Not Started | Still only 375 px exercised by hand | No |
| CX-05 | Search, filters, departments, shelves | P1 | **Pass** | Shelf filter verified; `/api/v1/search` rate-limited | No |
| CX-06 | Product names, SKUs, units, prices render correctly | P1 | **Pass** | All 532 prices on the owner's list verified at three layers — stored paise, rendered card, checkout quote | No |
| CX-07 | Product images load | P2 | **Pass** | 0 of 488 active products without an image; all served from the repo, none from Supabase storage | No |
| CX-08 | Cart quantity, removal, subtotal | P0 | Not Started | Cart maths unit-tested; no live UI test run | No |
| CX-09 | Address entry, validation, delivery availability | P0 | Not Started | Code present; untested end to end | No |
| CX-10 | Loading, empty, error and success states | P2 | **Pass** | `loading.tsx` per route, `EmptyState` on empty results, toasts on cart actions | No |
| CX-11 | Console errors on key pages | P2 | **Pass** | Only the CSP report-only notice | No |
| CX-12 | Accessibility basics | P2 | Not Started | ARIA attributes present throughout; no axe run | No |
| CX-13 | Broken links / missing images sweep | P2 | Not Started | — | No |
| CX-14 | **Parcha upload works** | P0 | **Fail** | Supabase storage answers `402 exceed_egress_quota`, so the signed upload fails. The tab is in the six-tab bar | **Yes** — fix the cap or hide the tab |
| CX-15 | Catalogue restricted to the master list | P1 | **Pass** | 488 active of 3,227; reversible from `reports/restricted-to-master-list.json` | No |
| CX-16 | Illustrated products are honestly presented | P2 | **Partial** | 75 of 488 carry a generated illustration rather than a photograph; labelled, but photographs are still wanted | No |

---

## B. Orders and database

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| ORD-01 | **Orders persist to the database** | P0 | **Pass** | 4 orders, each with lines and a payment row (unchanged) | No |
| ORD-02 | Order carries correct customer, address, items, totals | P0 | **Pass** | Schema + `createPendingOrder`; totals ₹420–₹5,200 | No |
| ORD-03 | Unique order references | P0 | **Pass** | `QO-XXXXXX`, unique across all 4 | No |
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
| ORD-14 | **A captured payment sits on a cancelled order** | P1 | **Fail** | `QO-P8498W`: ₹5,200 netbanking, payment `CAPTURED`, `paidAt` set 5 Oct, order `CANCELLED`, and **zero `Refund` rows in the database**. Almost certainly test-mode, but confirm in the Razorpay dashboard and either refund it or annotate it | No, but settle it before live mode |
| ORD-15 | Wallet ledger | P2 | Not Started | `WalletEntry` is append-only, credit idempotent on `reference`, spend serializable; 0 entries, never exercised end to end | No |

---

## C. Razorpay and payment reliability

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | **Webhook signature verification succeeds** | P0 | **FAIL — untested, not fixed** | 46 deliveries ever: 45 `rejected_signature`, 1 `recorded`. The newest delivery of any kind is **5 October, 16:34 UTC — 48 days ago**. The October fix changed the code; nothing has tested it. **DEP-04 narrows the cause:** the webhook secret *is* set in production, so this is no longer "misconfigured and refusing" — nothing is arriving at all, which points at PAY-14 | **YES — the one pilot blocker** |
| PAY-02 | Misconfiguration fails loudly | P0 | **Pass** (fixed 24 Oct, proven live 22 Nov) | `isRazorpayConfigured` requires the webhook secret, so online payment is not offered without it; admin banner on rejected deliveries; 6 tests. The live site reports the gate open, which is itself the evidence for DEP-04 | No |
| PAY-03 | Gateway order created server-side | P0 | **Pass** | `createGatewayOrder` in the checkout route | No |
| PAY-04 | Amount computed server-side from catalogue | P0 | **Pass** | A claimed total in the body is ignored | No |
| PAY-05 | Handoff signature verified | P0 | **Pass** | HMAC over `orderId\|paymentId` | No |
| PAY-06 | Handoff cannot mark an order paid | P0 | **Pass** | `checkout/verify` has no write path to `status` | No |
| PAY-07 | Webhook is the sole authority for `PAID` | P0 | **Pass** | `settleCapturedPayment` reachable only from the webhook route | No |
| PAY-08 | Duplicate webhook deliveries safe | P0 | **Pass** | Duplicates answer 200; only unprocessed errors return 500 for retry | No |
| PAY-09 | Failed / cancelled payments handled | P1 | **Pass** (code) | `recordFailedPayment` on `payment.failed`; 30 such deliveries received | No |
| PAY-10 | Refund workflow | P1 | **Partial** | A real bug was found and fixed on 22 Nov: a *partial* refund was marking the whole order `REFUNDED`. Coverage is now decided by `refundsCoverCapture` over `PROCESSED` refunds only, a partial refund no longer touches order status, and `settleProcessedRefund` reports `partial_refund`. Still never exercised against Razorpay, and `Refund` count is 0 | **Yes, before live mode** |
| PAY-11 | Reconciliation catches missed webhooks | P0 | Not Started | `/api/v1/cron/reconcile-payments` is scheduled at 01:00 and is the safety net that should have caught PAY-01. Never observed to run | **Yes, before public launch** |
| PAY-12 | No Razorpay secret in frontend bundle | P0 | **Pass** | Exact-value search of `.next/static` — clean | No |
| PAY-13 | Test vs live mode separation | P0 | **Blocked** | `RAZORPAY_KEY_ID` is empty locally; Vercel values not visible | **Yes, before live mode** |
| PAY-14 | Razorpay webhook subscription configured | P0 | **Blocked — now the prime suspect** | No dashboard access. With the secret confirmed present (DEP-04), a rejected delivery would still *be* a delivery. Forty-eight days of complete silence is what a missing, disabled or wrongly-addressed subscription looks like. Check the URL it points at, that `payment.captured` is ticked, and that it is enabled | **Yes** |
| PAY-15 | Customer-facing payment messages | P2 | **Pass** | Verify failure names support and the order reference without disclosing the order | No |
| PAY-16 | Revenue figures net off refunds | P1 | **Pass** | Dashboard and monthly revenue both subtract `PROCESSED` refunds (`admin-metrics.ts`) | No |

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
| ADM-08 | Order confirmation to customer | P0 | **Blocked** | `notifyPaymentSettled` fires from the webhook, which is unreachable while PAY-01 stands | **Yes** |
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
| SEC-03 | **`.env.local` carries an orphaned secret** | P1 | **FAIL — unchanged** | Line 1 is still a 148-character value with no key name, shaped `v1,whsec_…` (a Supabase hook secret), and it is **a different value** from the `SUPABASE_SMS_HOOK_SECRET` the file also sets. Treat it as live until rotated. 6 keys hold empty values (3 MSG91, 3 Razorpay) — expected locally | No (local file), but see SEC-17 |
| SEC-04 | **Dependency audit** | P1 | **Partial** | `npm audit --omit=dev`: 4 high, 1 moderate — down from 1 critical + 8 high. All four highs are in the **Prisma CLI** chain (`deepmerge-ts`, `effect` via `@prisma/config`) and never run in the serving path. The moderate is `next` itself | No |
| SEC-05 | Admin authorization | P0 | **Pass** | See ADM-01, ADM-02, ADM-12 | No |
| SEC-06 | Server-side input validation | P0 | **Pass** | Zod on every inspected route, bounded string lengths | No |
| SEC-07 | Price manipulation prevented | P0 | **Pass** | Totals never read from the request body | No |
| SEC-08 | IDOR — orders | P0 | **Pass** | `checkout/verify` re-checks `order.userId === user.id` even with a valid signature | No |
| SEC-09 | IDOR — addresses | P0 | **Pass** | Address reads scoped by `userId`, re-scoped inside `createPendingOrder` | No |
| SEC-10 | Security headers | P1 | **Pass** | Re-read live: HSTS `max-age=63072000; includeSubDomains; preload`, XFO `DENY`, nosniff, Referrer-Policy, Permissions-Policy `payment=()` | No |
| SEC-11 | **CSP enforced** | P1 | **FAIL — unchanged** | Live header is still `content-security-policy-report-only`, and it allows `unsafe-inline`/`unsafe-eval` | No |
| SEC-12 | Rate limiting | P1 | **Pass** | The October gaps are closed: `checkout/order`, `checkout/quote` and `checkout/verify` are all limited, as are `auth/otp/request`, `auth/otp/verify`, `auth/supabase/send-otp`, `parcha`, `search`, `visualise` and the vendor dispatch token route | No |
| SEC-13 | Unverified webhook bodies not retained | P1 | **Pass** | `fingerprint()` stores length + digest only | No |
| SEC-14 | Sensitive data kept out of logs | P1 | **Pass** | `maskPhone` on the delivery-phone path; error identity logged, never the argument-echoing Prisma error | No |
| SEC-15 | Database RLS | P1 | **Blocked** | No Supabase access; authorization is enforced in application code | No |
| SEC-16 | File upload validation | P2 | Not Started | Signed-upload routes exist; untestable today because storage is restricted (CX-14) | No |
| SEC-17 | **Rotate the orphaned secret** | P1 | Not Started | SEC-03 is 29 days old and the value is still in the file. Rotate the Supabase hook secret, delete line 1, then re-check | **Yes** |
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
| DEP-10 | Error monitoring | P0 | **Fail — unchanged** | No Sentry or equivalent in `package.json`. PAY-01 went unnoticed for weeks, which is what this item is for | **Yes, before public launch** |
| DEP-11 | Rollback procedure | P1 | **Partial** | Written up in `docs/rollback.md`, including what a rollback does *not* revert. Still undrilled | No |
| DEP-12 | Image optimisation and performance | P2 | **Pass** (partial) | `next/image` with `sizes` throughout; no Lighthouse run | No |
| DEP-13 | Health endpoint | P2 | **Pass** | `/api/v1/health` → 200 on 22 Nov | No |
| DEP-14 | **Supabase project is within its limits** | P0 | **Fail** | Storage is restricted: `402 … exceed_egress_quota`. Postgres is still serving, so the shop is unaffected, but every signed upload fails (CX-14, SEC-16) and so does ORD-10's Supabase half. One upgrade clears the cap, the backups and PITR | **Yes, before public launch** |
| DEP-15 | Framework patch level | P1 | Not Started | `next` 16.2.12 carries 7 published advisories (moderate), among them an image-optimization SVG bypass and cache poisoning in `use cache`. Fixed in 16.4.6, which is outside the stated range — read the upgrade notes in `node_modules/next/dist/docs/` before moving | No |

---

## G. Customer trust and launch operations

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| TRU-01 | Privacy policy | P0 | **Pass** | `/privacy` live, with Quoin's real details — `POLICY_IS_SAMPLE = false` | No |
| TRU-02 | Terms of service | P0 | **Pass** | `/terms` live, audited for claims it could not keep | No |
| TRU-03 | Refunds and cancellations policy | P0 | **Pass** | `/refunds` live and consistent with the machine: a paid order leaves by refund, not cancellation | No |
| TRU-04 | Grievance officer | P1 | **Pass** | `/grievance` live with a named officer; `COMPANY_DETAILS_ARE_SAMPLE = false` | No |
| TRU-05 | Contact method works | P0 | Not Started | `support@quoin.co.in` is published site-wide; no delivery test has been run to it | **Yes** |
| TRU-06 | Delivery coverage and estimates clear | P1 | **Pass** | Four named areas at checkout; "Today — usually within 45 minutes" from one constant, `SCHEDULED_DELIVERY_MINUTES` | No |
| TRU-07 | **Delivery-time claims are accurate** | P1 | **Pass** | The "18 minutes" headline is gone; 45 minutes or same day everywhere, from one source | No |
| TRU-08 | Pricing, units, availability clear | P1 | **Pass** | Unit on every price, "Inclusive of all taxes" on the sticky bar — GST is extracted, never added | No |
| TRU-09 | Order confirmation reaches the customer | P0 | **Blocked** | Depends on PAY-01 and on the WhatsApp variables being set in production | **Yes** |
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

### Gate 1 — payment settlement (closes PAY-01)

> **Step 1 is already done** — confirmed 22 November. `RAZORPAY_WEBHOOK_SECRET`
> is set in production, which is why checkout offers the payment tile at all.
> This gate therefore starts at the Razorpay end, not the Vercel end.

1. [x] ~~Set `RAZORPAY_WEBHOOK_SECRET` in Vercel production.~~ Done — DEP-04.
2. [ ] In the Razorpay dashboard: confirm a webhook subscription exists, is **enabled**, points at the production URL, and has **`payment.captured`** ticked (PAY-14). This is the likeliest single cause of PAY-01.
3. [ ] Send a test webhook. Confirm a new `payment_webhooks` row with `signatureValid = true` and `outcome = 'recorded'` — the first since 5 October. If it arrives and is *rejected*, the secret in Vercel and the secret in the dashboard differ: copy it again.
4. [ ] Place **five** test-mode orders end to end.
5. [ ] Confirm **five** orders reach `status = 'PAID'` with `paidAt` set.
6. [ ] Confirm **zero** new `rejected_signature` rows.
7. [ ] Confirm all five appear in the admin orders queue on `admin.quoin.co.in`.
8. [ ] Confirm the customer notification fired for each.

### Gate 2 — resilience

9. [ ] Close the browser mid-payment; confirm the webhook still settles the order.
10. [ ] Double-submit checkout; confirm one order and one gateway order.
11. [ ] Disable the webhook, place an order, run `/api/v1/cron/reconcile-payments`, confirm it settles (PAY-11).
12. [ ] Process one **full** refund in test mode end to end.
13. [ ] Process one **partial** refund and confirm the order status does not move (the 22 November fix).
14. [ ] Settle `QO-P8498W` one way or the other (ORD-14).

### Gate 3 — security and operations

15. [ ] Rotate the Supabase hook secret, delete line 1 of `.env.local`, re-check (SEC-03, SEC-17).
16. [ ] `npm audit --omit=dev` → no critical, no high. Today: 4 high, all in the Prisma CLI chain.
17. [ ] Upgrade `next` past the 7 open advisories (DEP-15).
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

The honest summary of 22 November: the shop is in better shape than it was in
October — the catalogue is the right one, the prices are verified, the legal
pages are real, the admin console is behind two locks on its own hostname, and
the database finally has a copy that does not live in Supabase. None of that is
the blocker. **The blocker is that no payment has been settled through this
system since 5 October — and now that the production variables are confirmed,
the next move is not in the code at all. It is one look at the Razorpay
dashboard's webhook subscription, then one ₹1 test.**
