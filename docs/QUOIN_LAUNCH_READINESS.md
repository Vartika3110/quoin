# Quoin — launch readiness checklist

**Date:** 24 October 2026 · **Commit:** `b4d9255` · **main:** `52fe753`
**Findings and evidence:** `QUOIN_LAUNCH_AUDIT.md`
**Excluded by instruction:** GST, tax calculation, GST compliance.

**Status values:** Pass · Fail · Blocked · Not Started · N/A
**Priority:** P0 critical · P1 high · P2 medium · P3 low

> Three states are kept apart on purpose. **Pass** means tested with evidence
> recorded here. **Blocked** means I had no access and you must verify it.
> **Not Started** means testable but not yet run.

---

## Summary

| | Count |
| --- | ---: |
| Pass | 25 |
| Fail | 5 |
| Blocked (no access) | 14 |
| Not Started | 12 |
| **Launch blockers outstanding** | **1** — PAY-01. PAY-02 fixed 24 Oct. |

---

## A. Website and customer experience

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| CX-01 | Home, categories, department, product, cart, checkout routes resolve | P0 | **Pass** | Live: `/`, `/categories`, `/c/[slug]` → 200; local: 17 routes → 200 | No |
| CX-02 | Custom domain serves over HTTPS | P0 | **Pass** | `quoin.co.in` → 308 → `www.quoin.co.in` → 200 | No |
| CX-03 | Mobile layout (375 px) | P1 | **Pass** | Walked by hand across 12 screens | No |
| CX-04 | Tablet and desktop layouts | P1 | Not Started | Only 375 px exercised | No |
| CX-05 | Search, filters, departments, shelves | P1 | **Pass** | Shelf filter verified: `?type=showers` → 25 products, matching chip count exactly | No |
| CX-06 | Product names, SKUs, units, prices render correctly | P1 | **Pass** | Spot-checked across paints, tiling, bathware; units `Per Pc`/`Per Bag` correct | No |
| CX-07 | Product images load | P2 | **Pass** | 428/487 local photographs verified readable by `audit:photo-backgrounds` | No |
| CX-08 | Cart quantity, removal, subtotal | P0 | Not Started | Cart maths unit-tested; no live UI test run | No |
| CX-09 | Address entry, validation, delivery availability | P0 | Not Started | Code present (`resolveShipContact`, `DeliveryCheck`); untested | No |
| CX-10 | Loading, empty, error and success states | P2 | **Pass** | `loading.tsx` per route; `EmptyState` on empty results; toasts on cart actions | No |
| CX-11 | Console errors on key pages | P2 | **Pass** | Only a benign CSP report-only notice observed | No |
| CX-12 | Accessibility basics | P2 | Not Started | `aria-current`, `aria-label`, `sr-only` headings present; no axe run | No |
| CX-13 | Broken links / missing images sweep | P2 | Not Started | — | No |

---

## B. Orders and database

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| ORD-01 | **Orders persist to the database** | P0 | **Pass** | 4 orders present, each with lines and payment rows | No |
| ORD-02 | Order carries correct customer, address, items, totals | P0 | **Pass** | Schema + `createPendingOrder`; recent orders show `lines=1–2`, totals ₹420–₹5,200 | No |
| ORD-03 | Unique order references | P0 | **Pass** | `QO-XXXXXX` format, unique across all 4 | No |
| ORD-04 | Orders visible in admin | P0 | Not Started | `listAdminOrders` has no status filter by default — code-correct; UI not exercised | No |
| ORD-05 | Dashboard counters are day-scoped, not all-time | P1 | **Pass** | `admin-metrics.ts:288` counts `createdAt` within today IST — an order from a previous day legitimately shows zero | No |
| ORD-06 | Status transitions guarded | P1 | **Pass** | `canTransition` + `OrderStatusChange` audit trail | No |
| ORD-07 | **Duplicate orders prevented** | P0 | **Pass** | `idempotencyKey` returns existing order *and* gateway order (`checkout/order/route.ts:254`) | No |
| ORD-08 | Partial checkout failure leaves no orphan gateway order | P0 | **Pass** | Order written first, gateway second, payment row third — documented and correct | No |
| ORD-09 | Stock management / out-of-stock | P1 | **N/A → Risk** | `stockTracked` false on every product by design; overselling possible | No |
| ORD-10 | Database backups and PITR | P0 | **Blocked** | No Supabase access | **Yes, before public launch** |
| ORD-11 | Migrations applied cleanly in production | P1 | **Blocked** | No Vercel/Supabase access; one unapplied local migration directory present | No |
| ORD-12 | Restore drill performed | P1 | Not Started | — | **Yes, before public launch** |

> **Reported issue — "payment worked, order counter empty":** root cause
> identified. Orders *were* being written; they never reached `PAID` because
> the webhook that alone sets it was rejecting every delivery. See PAY-01.

---

## C. Razorpay and payment reliability

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | **Webhook signature verification succeeds** | P0 | **FAIL** | 45 of 46 deliveries `rejected_signature`; only 1 ever `recorded` | **YES** |
| PAY-02 | **Misconfiguration fails loudly** | P0 | **Pass** (fixed 24 Oct) | `isRazorpayConfigured` now requires the webhook secret, so online payment is not offered without it; admin dashboard raises a banner on rejected deliveries; 6 tests in `payment-settlement-gate.test.mts` | No |
| PAY-03 | Gateway order created server-side | P0 | **Pass** | `createGatewayOrder` in `checkout/order/route.ts:273` | No |
| PAY-04 | Amount computed server-side from catalogue | P0 | **Pass** | Client sends lines only; a claimed total is ignored | No |
| PAY-05 | Handoff signature verified | P0 | **Pass** | `verifyCheckoutSignature`, HMAC over `orderId\|paymentId` | No |
| PAY-06 | Handoff cannot mark an order paid | P0 | **Pass** | `checkout/verify` has no write path | No |
| PAY-07 | Webhook is the sole authority for `PAID` | P0 | **Pass** | `settleCapturedPayment` reachable only from the webhook route | No |
| PAY-08 | Duplicate webhook deliveries safe | P0 | **Pass** | Duplicates answer 200; only unprocessed errors return 500 for retry | No |
| PAY-09 | Failed / cancelled payments handled | P1 | **Pass** (code) | `recordFailedPayment` on `payment.failed`; 30 such deliveries received | No |
| PAY-10 | Refund workflow | P1 | Not Started | `settleProcessedRefund` + admin refund route exist; never exercised | **Yes, before live mode** |
| PAY-11 | Reconciliation catches missed webhooks | P0 | Not Started | `/api/v1/cron/reconcile-payments` exists — this is the safety net that should have caught PAY-01 | **Yes** |
| PAY-12 | No Razorpay secret in frontend bundle | P0 | **Pass** | Exact-value search of `.next/static` — clean | No |
| PAY-13 | Test vs live mode separation | P0 | **Blocked** | `RAZORPAY_KEY_ID` empty locally; Vercel values not visible | **Yes, before live mode** |
| PAY-14 | Razorpay webhook subscription configured | P0 | **Blocked** | No dashboard access | **Yes** |
| PAY-15 | Customer-facing payment messages | P2 | **Pass** | Verify failure returns a message naming support and the order reference, without disclosing the order | No |

---

## D. Admin and fulfilment

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| ADM-01 | **Admin pages require staff** | P0 | **Pass** | `requireStaff` on 21 of 21 pages | No |
| ADM-02 | **Admin APIs require staff** | P0 | **Pass** | `requireStaff` on 26 of 26 routes | No |
| ADM-03 | Admin existence not disclosed | P1 | **Pass** | Non-staff and signed-out both get `404`, not `401` | No |
| ADM-04 | Orders queue, search, filter | P1 | Not Started | `listAdminOrders` supports status + search; UI not exercised | No |
| ADM-05 | Status updates from admin | P1 | Not Started | Guarded route exists | No |
| ADM-06 | Customer delivery details visible | P1 | Not Started | — | No |
| ADM-07 | Inventory management | P2 | Not Started | Routes exist; stock tracking off everywhere | No |
| ADM-08 | Order confirmation to customer | P0 | **Blocked** | `notifyPaymentSettled` exists but fires from the webhook — currently unreachable (PAY-01) | **Yes** |
| ADM-09 | Cancellation and refund procedure | P1 | Not Started | — | **Yes, before live mode** |
| ADM-10 | Failed / abandoned order handling | P2 | **Pass** (code) | 2 orders correctly sit `PENDING_PAYMENT` with a `CREATED` payment | No |

---

## E. Security and dependency health

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | **No secret values in client bundle** | P0 | **Pass** | Every configured secret exact-value searched in `.next/static` — none found | No |
| SEC-02 | `.env` files git-ignored | P0 | **Pass** | `.gitignore:39` → `.env*` | No |
| SEC-03 | **`.env.local` is malformed** | P1 | **FAIL** | Line 1 is a stray 146-char `v1,…` fragment with no key; 4 keys have zero-length values | No (local only) |
| SEC-04 | **Dependency audit** | P1 | **FAIL** | 1 critical (`next`, Windows-only), 8 high incl. `zod` on the validation path | No |
| SEC-05 | Admin authorization | P0 | **Pass** | See ADM-01, ADM-02 | No |
| SEC-06 | Server-side input validation | P0 | **Pass** | Zod schema on every inspected route; bounded string lengths | No |
| SEC-07 | Price manipulation prevented | P0 | **Pass** | Totals never read from the request body | No |
| SEC-08 | IDOR — orders | P0 | **Pass** | `checkout/verify` re-checks `order.userId === user.id` even with a valid signature | No |
| SEC-09 | IDOR — addresses | P0 | **Pass** | Address reads scoped by `userId`; re-scoped again inside `createPendingOrder` | No |
| SEC-10 | Security headers | P1 | **Pass** | HSTS preload, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy `payment=()` | No |
| SEC-11 | **CSP enforced** | P1 | **FAIL** | `content-security-policy-report-only` — not enforced; `unsafe-inline`/`unsafe-eval` allowed | No |
| SEC-12 | Rate limiting | P1 | **Partial** | Present on `auth/otp/request`, `checkout/quote`; absent on `checkout/order`, `checkout/verify` | No |
| SEC-13 | Unverified webhook bodies not retained | P1 | **Pass** | `fingerprint()` stores length + digest only | No |
| SEC-14 | Sensitive data kept out of logs | P1 | **Pass** | `maskPhone` on the delivery-phone path; error *identity* logged, never the Prisma error echoing arguments | No |
| SEC-15 | Database RLS | P1 | **Blocked** | No Supabase access; authorization is enforced in application code | No |
| SEC-16 | File upload validation | P2 | Not Started | `uploads` routes exist; untested | No |
| SEC-17 | Secret rotation after the `.env.local` mishandling | P1 | Not Started | A webhook secret was left orphaned in a file | **Yes** |

---

## F. Deployment and production configuration

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| DEP-01 | Production domain + HTTPS + redirect | P0 | **Pass** | `quoin.co.in` → `www.quoin.co.in`, 200, HSTS | No |
| DEP-02 | Deployed version matches intended code | P1 | **Fail** | `main` is live and correct, but 3 commits are unmerged; live `/c/plumbing-fittings` shows "Photo coming soon", local does not | No |
| DEP-03 | No hardcoded localhost / test endpoints | P1 | **Pass** | No `localhost` in `src/`; gateway key read from env per request, not inlined at build | No |
| DEP-04 | Vercel env var names and values | P0 | **Blocked** | No access | **Yes** |
| DEP-05 | Preview and production separated | P1 | **Blocked** | No access | **Yes** |
| DEP-06 | Build and runtime logs reviewed | P1 | **Blocked** | No access | No |
| DEP-07 | Region | P2 | **Pass** | `bom1` in `vercel.json`, confirmed by `x-vercel-id` | No |
| DEP-08 | Cron jobs configured | P1 | **Pass** (config) | `reconcile-payments` 01:00, `release-reservations` 02:00 | No |
| DEP-09 | Cron jobs actually run and are authenticated | P0 | **Blocked** | `CRON_SECRET` empty locally; no log access | **Yes** |
| DEP-10 | Error monitoring | P0 | **Fail** | No Sentry or equivalent in `package.json` | **Yes, before public launch** |
| DEP-11 | Rollback procedure | P1 | Not Started | Vercel supports instant rollback; undocumented and undrilled | No |
| DEP-12 | Image optimisation and performance | P2 | **Pass** (partial) | `next/image` with `sizes` throughout; no Lighthouse run | No |
| DEP-13 | Health endpoint | P2 | **Pass** | `/api/v1/health` → `{"ok":true}` | No |

---

## G. Customer trust and launch operations

| ID | Task | P | Status | Evidence | Blocks launch |
| --- | --- | --- | --- | --- | --- |
| TRU-01 | Privacy policy | P0 | **Pass** | `/privacy` route present | No |
| TRU-02 | Terms of service | P0 | **Pass** | `/terms` route present | No |
| TRU-03 | Refunds and cancellations policy | P0 | **Pass** | `/refunds` route present | No |
| TRU-04 | Grievance officer | P1 | **Pass** | `/grievance` route present | No |
| TRU-05 | Contact method works | P0 | Not Started | `/contact` and support routes exist; no delivery test | **Yes** |
| TRU-06 | Delivery coverage and estimates clear | P1 | **Pass** | Four named areas shown at checkout; "Delivered today / usually within 45 minutes" on product pages | No |
| TRU-07 | **Delivery-time claims are accurate** | P1 | **Pass** | The "18 minutes" headline was removed this session — nothing is stocked for it, and every card quotes 45 minutes | No |
| TRU-08 | Pricing, units, availability clear | P1 | **Pass** | Unit on every price; "Inclusive of all taxes" on the sticky bar | No |
| TRU-09 | Order confirmation reaches the customer | P0 | **Blocked** | Depends on PAY-01 and the Supabase/WhatsApp OTP configuration | **Yes** |
| TRU-10 | Operational readiness to deliver / cancel / refund | P0 | Not Started | Business-process question, not a code question | **Yes** |

---

## Retest checklist — run after fixes

Complete **all** of these before revisiting the launch decision.

### Gate 1 — payment settlement (closes PAY-01; PAY-02 is already fixed)

> With the 24 October fix in place, a deployment missing
> `RAZORPAY_WEBHOOK_SECRET` **does not offer online payment at all**. If
> checkout shows only "Confirm with an expert", that is this gate telling
> you step 1 has not been done yet — not a separate fault.

1. [ ] Set `RAZORPAY_WEBHOOK_SECRET` in Vercel production from the Razorpay dashboard. Redeploy.
2. [ ] Send a test webhook from the dashboard. Confirm a new `payment_webhooks` row with `signatureValid = true` and `outcome = 'recorded'`.
3. [ ] Place **five** test-mode orders end to end.
4. [ ] Confirm **five** orders reach `status = 'PAID'` with `paidAt` set.
5. [ ] Confirm **zero** new `rejected_signature` rows.
6. [ ] Confirm all five appear in the admin orders queue.
7. [ ] Confirm the customer notification fired for each.

### Gate 2 — resilience

8. [ ] Close the browser mid-payment; confirm the webhook still settles the order.
9. [ ] Double-submit checkout; confirm one order and one gateway order.
10. [ ] Disable the webhook, place an order, run `/api/v1/cron/reconcile-payments`, confirm it settles.
11. [ ] Process one refund in test mode end to end.

### Gate 3 — security and operations

12. [ ] `npm audit --omit=dev` → no critical, no high.
13. [ ] Rotate any secret that was mishandled in `.env.local`; repair the file.
14. [ ] Error monitoring installed, with an alert on webhook rejections.
15. [ ] One documented backup restore drill.
16. [ ] Confirm `RAZORPAY_KEY_ID` is `rzp_test_` in preview and, when activated, `rzp_live_` in production only.
17. [ ] Merge the three outstanding commits; confirm "Photo coming soon" is gone from `/c/plumbing-fittings`.

### Gate 4 — before enabling live mode

18. [ ] Razorpay account activated for live payments.
19. [ ] Support contact tested and answered.
20. [ ] Written procedure for cancel, refund and failed-delivery.

---

**Current decision: NO-GO.** Clearing Gate 1 and Gate 2 moves this to
**GO FOR CONTROLLED PILOT**. Public launch additionally needs Gate 3 and
Gate 4.
