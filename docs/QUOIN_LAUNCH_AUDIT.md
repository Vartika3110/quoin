# Quoin — production launch readiness audit

**Date:** 24 October 2026
**Branch commit:** `b4d9255` (`storefront-browse-and-detail`) · **main:** `52fe753`
**Live:** <https://quoin-xi.vercel.app> · <https://www.quoin.co.in>
**Scope:** repository, live site responses, and the production database.
**Excluded by instruction:** GST, tax calculation and GST compliance.

No application code, schema or production setting was changed by this audit.
Two documents were written: this one and `QUOIN_LAUNCH_READINESS.md`.

---

## 1. Executive summary

### Launch decision: **NO-GO**

One P0 blocker is confirmed by database evidence, and it is the same defect
behind the symptom reported before this audit ("a Razorpay test payment
appeared to work, but the order counter remained empty").

**The order pipeline itself is not broken.** Orders persist, with their lines
and payment rows. The failure is isolated to payment *settlement*: the webhook
is the only authority that can move an order to `PAID`, and **45 of 46 webhook
deliveries ever received were rejected for an invalid signature.**

| Area | Score | Basis |
| --- | ---: | --- |
| Customer experience | 78 / 100 | Routes verified live and locally; no automated a11y or cross-device testing run |
| Catalogue and cart | 85 / 100 | Server-side pricing verified in code; cart maths covered by tests; no live cart test executed |
| Orders and database | 70 / 100 | Order creation **verified working** against the live database; status transitions guarded; backups unverified |
| Payments | **35 / 100** | Architecture is sound; settlement is **confirmed failing** — 45/46 webhooks rejected |
| Admin and fulfilment | 80 / 100 | Every admin page and API route guarded by `requireStaff` (21/21, 26/26); workflows not exercised end to end |
| Security | 72 / 100 | No secret values in the client bundle; 1 critical + 8 high dependency advisories; CSP is report-only |
| Deployment and reliability | 60 / 100 | HTTPS, HSTS and headers good; **no error monitoring found**; 3 commits unmerged; no access to Vercel config or logs |
| Customer support and policies | 75 / 100 | Legal pages exist and resolve; operational readiness unverified |

**Overall: 69 / 100 — and the score is not the decision.** A single
unresolved payment-settlement blocker is a NO-GO regardless of the total.

---

## 2. Architecture, as found in the code

| Element | Finding | Evidence |
| --- | --- | --- |
| Framework | Next.js 16.2.12, React 19.2.4, App Router | `package.json` |
| Database | PostgreSQL via Prisma 6.19.3 (Supabase) | `prisma/schema.prisma`, `src/lib/db.ts` |
| Auth | Phone OTP via **Supabase Auth + WhatsApp**, Google OAuth; `isStaff` flag for admin | `src/app/api/v1/auth/**`, `health/route.ts` |
| Payments | Razorpay — server order creation, browser handoff verification, webhook settlement | `src/lib/payments/razorpay.ts` |
| Hosting | Vercel, region `bom1`, two cron jobs | `vercel.json`, `x-vercel-id` headers |
| API surface | 101 route handlers under `src/app/api` | `find src/app/api -name route.ts` |
| Admin | 21 pages under `/admin`, 26 API routes under `/api/v1/admin` | — |

### The money path, traced end to end

1. `POST /api/v1/checkout/quote` — prices a basket. Rate-limited.
2. `POST /api/v1/checkout/order` — `requireUser()`, re-prices **server-side**
   from the catalogue, writes the order, then creates the Razorpay order and
   records the attempt. The client states *what* it is buying, never *what it
   costs*.
3. Razorpay modal → browser receives a signed handoff.
4. `POST /api/v1/checkout/verify` — verifies the handoff HMAC and returns the
   current status. **It contains no code path that writes `PAID`.**
5. `POST /api/v1/webhooks/razorpay` — verifies an HMAC over the raw body and is
   **the only authority** that sets `paidAt` and `PAID`.

This separation is correct and deliberate, and the code says so in its own
comments. The defect below is a configuration failure against a sound design,
not a design failure.

---

## 3. Confirmed failures and critical blockers

### BLOCK-1 (P0) — Razorpay webhook signatures are being rejected

**Status: FAIL — confirmed by production data.**

Every webhook delivery is recorded in `payment_webhooks`. Grouped by outcome:

| Event | Outcome | Signature valid | Count | Last seen |
| --- | --- | --- | ---: | --- |
| `payment.captured` | `recorded` | true | 1 | 2026-10-05 16:34 |
| `payment.captured` | `rejected_signature` | false | 15 | 2026-09-14 14:58 |
| `payment.failed` | `rejected_signature` | false | 30 | 2026-09-14 14:56 |

**45 of 46 deliveries were rejected.** `verifyWebhookSignature` returns `false`
when `RAZORPAY_WEBHOOK_SECRET` is absent or does not match, and the handler
answers `401` — so the order is never settled. Because only this route writes
`PAID`, the customer pays, the modal succeeds, and the order stays
`PENDING_PAYMENT`. That is precisely the reported symptom.

One delivery verified successfully on 2026-10-05, which suggests the secret was
partially corrected at some point. **One success is not evidence of a reliable
fix**, and no `payment.captured` has verified since.

**Root cause, strongly indicated:** `.env.local` declares
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` with
**zero-length values** (lines 36–38), and line 1 of the same file is a stray
146-character fragment beginning `v1,` — the shape of a Razorpay webhook secret
— sitting with no key name attached. A secret was pasted and became orphaned.
Values are not reproduced here.

**Caveat:** that is the *local* file. Production reads Vercel environment
variables, which I have no access to. The webhook evidence above is consistent
with the same malformation having existed in production.

**Fix:** set `RAZORPAY_WEBHOOK_SECRET` in Vercel to the exact secret shown in
the Razorpay dashboard webhook configuration, redeploy, then use Razorpay's
"Send test webhook" and confirm a new `payment_webhooks` row with
`signatureValid = true` and `outcome = 'recorded'`.

**Effort:** S. **Blocks launch: YES.**

---

### BLOCK-2 (P0) — nothing fails loudly when payment settlement is misconfigured

**Status: FIXED — 24 October 2026.** See §10.

**Original finding, confirmed by code inspection:**

`RAZORPAY_WEBHOOK_SECRET` is `z.string().optional()` in `src/lib/env.ts:69`.
The application therefore boots, serves checkout, takes money through Razorpay,
and silently never settles a single order. Returning `false` from
`verifyWebhookSignature` on a missing secret is the right *security* choice —
the comment explaining it is correct — but there is no startup check, no health
signal and no alert that distinguishes "no payments today" from "every payment
is being dropped on the floor".

That is how 45 deliveries were rejected over an hour on 14 September without
anyone being told.

**Fix:** treat the webhook secret as required whenever `RAZORPAY_KEY_ID` is
set; surface webhook rejection counts in `/api/v1/health` or the admin
dashboard; alert on any `rejected_signature` row.

**Effort:** S. **Blocks launch: YES.**

---

### BLOCK-3 (P1) — dependency advisories: 1 critical, 8 high

**Status: FAIL — `npm audit --omit=dev`.**

| Severity | Package | Advisory |
| --- | --- | --- |
| critical | `next` | Unauthenticated RCE on **Windows-hosted** servers |
| high | `zod` | Memory exhaustion on oversized constrained collections |
| high | `sharp` | Inherited libvips CVE-2026-33327 / 33328 |
| high | `postcss` | XSS via unescaped `</style>` in stringify output |
| high | `nanoid`, `source-map-js`, `deepmerge-ts`, `prisma`, `@prisma/config` | DoS / stack exhaustion |

**Stated honestly:** the critical Next.js advisory is specific to
Windows-hosted servers. Vercel runs Linux, so real exposure is likely low — but
"likely low" is an inference, not a verified mitigation, and `zod` is on the
request-validation path for every API route, which is directly reachable.

**Effort:** M. **Blocks launch: NO** — but fix before a pilot.

---

### BLOCK-4 (P2) — three commits are not deployed

**Status: FAIL — verified by comparing live and local HTML.**

`main` (`52fe753`) is live and correct. Three commits on
`storefront-browse-and-detail` are unmerged. One has a user-visible production
consequence: the catalogue migrations have already been applied to the shared
database, so production serves the new **Plumbing fittings** department while
lacking the photo fallback that shipped with the split.

```
live  /c/plumbing-fittings  →  "Photo coming soon"  ×1
local /c/plumbing-fittings  →  "Photo coming soon"  ×0
```

**Fix:** merge the follow-up PR. **Effort:** S. **Blocks launch: NO.**

---

## 4. What passed, with evidence

| ID | Check | Evidence |
| --- | --- | --- |
| PASS-1 | **Orders persist correctly** | 4 orders in the database, each with lines and payment rows; statuses `PAID` 1, `PENDING_PAYMENT` 2, `CANCELLED` 1; 2 carry `paidAt` |
| PASS-2 | **No client-stated pricing** | `checkout/order/route.ts` recomputes every figure from the catalogue; a body claiming a total is ignored |
| PASS-3 | **Duplicate-order prevention** | `idempotencyKey` returns the existing order *and* existing gateway order rather than creating a second of either (`route.ts:254–269`) |
| PASS-4 | **Browser handoff cannot mark an order paid** | `checkout/verify/route.ts` reads status only; no write path exists |
| PASS-5 | **Webhook replay and duplicate safety** | Duplicates, unknown events and stale payments answer `200`; only genuine mid-write errors return `500` for retry |
| PASS-6 | **Admin authorization is complete** | `requireStaff` on **21 of 21** admin pages and **26 of 26** admin API routes; signed-out and non-staff both get `404`, not `401` |
| PASS-7 | **No secret values in the client bundle** | Every configured secret tested by exact-value search against `.next/static` — none found |
| PASS-8 | **Security headers** | HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` with `payment=()` |
| PASS-9 | **HTTPS and domain** | `quoin.co.in` → 308 → `www.quoin.co.in` → 200; served from `bom1` |
| PASS-10 | **Build, types, lint, tests** | `npm run build` compiles; `tsc --noEmit` clean; 725 tests pass; lint clean but one pre-existing warning in `service-bookings.ts` |
| PASS-11 | **Webhook audit trail exists** | `payment_webhooks` retains event, outcome, signature validity and timing — which is the only reason BLOCK-1 could be diagnosed at all |
| PASS-12 | **Rejected webhook bodies are not retained** | `fingerprint()` stores a length and digest instead of attacker-controlled content |

---

## 5. Risks identified but not confirmed

These need testing before they can be called pass or fail.

| ID | Risk | Why it is unresolved |
| --- | --- | --- |
| RISK-1 | **CSP is report-only** — `content-security-policy-report-only`, so nothing is enforced. `script-src` also allows `'unsafe-inline'` and `'unsafe-eval'`. | Enforcing it may break Razorpay's modal; needs testing before switching |
| RISK-2 | **Rate limiting is partial** — present on `auth/otp/request` and `checkout/quote`, absent on `checkout/order` and `checkout/verify` | Order creation requires a session, which limits abuse, but there is no ceiling on gateway orders per user |
| RISK-3 | **No error monitoring found** — no Sentry or equivalent in `package.json` | A repeat of BLOCK-1 would again be invisible until someone looked at the database |
| RISK-4 | **Database RLS unknown** — the app connects with a privileged Prisma connection; authorization is enforced in application code, which is consistent but means a bug in a `where` clause is the only thing between users' data | No access to Supabase policy configuration |
| RISK-5 | **Backup and recovery unverified** | No access to Supabase settings; no documented restore drill |
| RISK-6 | **OTP delivery** — needs `SUPABASE_ANON_KEY`, `SUPABASE_SMS_HOOK_SECRET` and three `WHATSAPP_*` variables; five variables across two integrations is the easiest thing here to half-configure | Cannot test sign-in delivery; production values unknown |
| RISK-7 | **Stock is opt-in and off** — `Product.stockTracked` defaults false, so nothing is decremented and overselling is possible by design | Intentional, but needs an operational answer before public launch |
| RISK-8 | **No discounted products exist** — all 487 sellable products have `mrpPaise == pricePaise`, so `/deals` and every discount display path are untested with real data | Not a defect; an untested surface |

---

## 6. Access limitations — what I could not verify

I did not have access to these, and have not guessed at them:

- **Vercel environment variables** — production Razorpay keys, webhook secret, mode (`rzp_test_` vs `rzp_live_`), and whether preview and production are separated.
- **Vercel build and runtime logs** — no deployment failures or runtime errors could be reviewed.
- **Razorpay dashboard** — which events are subscribed, the configured webhook URL, and whether the account is activated for live mode.
- **Supabase project settings** — RLS policies, backup schedule, point-in-time recovery.
- **End-to-end payment** — no transaction was attempted, per instruction.
- **Cross-device and accessibility testing** — only a 375 px viewport was exercised, by hand.

---

## 7. Remediation plan

### Fix immediately — before any further payment testing

1. **BLOCK-1** — set `RAZORPAY_WEBHOOK_SECRET` in Vercel from the Razorpay dashboard; redeploy; send a test webhook; confirm a `signatureValid = true` row. **S**
2. **BLOCK-2** — make the webhook secret required when Razorpay is configured, and surface rejected deliveries somewhere a human sees. **S**
3. **Repair `.env.local`** — line 1 is an orphaned secret fragment and three Razorpay values are empty. Rotate anything that may have been mishandled. **S**

### Fix before a controlled pilot

4. **BLOCK-3** — `npm audit fix`; re-run build and tests; re-audit. **M**
5. **RISK-3** — add error monitoring and alert on webhook rejections and 5xx. **M**
6. **RISK-2** — rate-limit `checkout/order` and `checkout/verify`. **S**
7. **BLOCK-4** — merge the three outstanding commits. **S**
8. **RISK-5** — confirm backups are on, and perform one documented restore drill. **M**
9. Verify the reconciliation cron (`/api/v1/cron/reconcile-payments`) actually catches an order the webhook missed — this is the safety net that should have caught BLOCK-1. **M**

### Improve after launch

10. **RISK-1** — move CSP from report-only to enforced, after testing the Razorpay modal. **M**
11. **RISK-7** — decide the stock policy for products that genuinely run out. **M**
12. Accessibility and cross-device passes. **M**
13. The five product-page elements with no data behind them — image gallery, attributes, ratings, stock counts, price history. **L**

---

## 8. Test report

| Command | Result |
| --- | --- |
| `npm run build` | ✅ compiles, 74 static pages generated |
| `npx tsc --noEmit` | ✅ clean |
| `npx eslint src scripts tests` | ⚠️ 0 errors, 1 pre-existing warning (`service-bookings.ts:796`) |
| `npm test` | ✅ 725 pass, 0 fail |
| `npm audit --omit=dev` | ❌ 9 vulnerabilities — 1 critical, 8 high |
| Live header inspection | ✅ HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy; ⚠️ CSP report-only |
| Live route checks | ✅ `/`, `/categories`, `/c/[slug]`, `/api/v1/health` all 200 |
| Database inspection (read-only) | ✅ 4 orders, 4 payments, 46 webhook rows |
| Client bundle secret scan | ✅ no secret values found |
| Admin guard coverage | ✅ 21/21 pages, 26/26 routes |

**Not executed:** live payment transaction, load testing, automated
accessibility testing, cross-browser testing, restore drill.

---

## 9. Final decision

### NO-GO for public launch

**Blocking:** BLOCK-1 (payment settlement confirmed failing) and BLOCK-2
(the same failure can recur silently).

Both are configuration and observability problems against a payment
architecture that is, on inspection, better than most — server-authoritative
pricing, idempotency, webhook-only settlement, and an audit table that made
this diagnosis possible at all.

**Path to GO FOR CONTROLLED PILOT:** fix BLOCK-1 and BLOCK-2, complete the
retest checklist in `QUOIN_LAUNCH_READINESS.md` §Retest, and run five
test-mode orders end to end with five corresponding `signatureValid = true`
webhook rows. At that point the payment score moves from 35 to a tested
number and the decision can be revisited.

**Do not enable live mode** until: BLOCK-1 is fixed and verified; the Razorpay
account is activated; `RAZORPAY_KEY_ID` reads `rzp_live_` in Vercel production
only; and a refund has been exercised once in test mode.


---

## 10. Fixes applied, 24 October 2026

Only BLOCK-2 was fixable from here. BLOCK-1 is a Vercel and Razorpay
dashboard action — see §7.1.

### BLOCK-2 — closed, in two halves

A *missing* secret and a *wrong* secret are different faults and need
different detection. The original finding conflated them; both are now
covered.

**Half one — a missing secret can no longer take money.**
`isRazorpayConfigured()` now requires `RAZORPAY_WEBHOOK_SECRET` alongside
the two API keys (`src/lib/payments/razorpay.ts`). Because that gate is
what `CheckoutFlow` consults before offering the online tile, and what
`checkout/order` enforces, a deployment that cannot verify settlement
**stops offering online payment** and falls back to "Confirm with an
expert" — the order is still written and a human takes payment.

Deliberately *not* a hard failure in `env.ts`: throwing there takes down
browsing, sign-in and order history over a payment misconfiguration,
which is a worse outage than the one being prevented.

**Half two — a wrong secret is now visible.** A present-but-mismatched
secret is indistinguishable from a correct one until a delivery arrives
and fails, so no configuration check can catch it. `DashboardMetrics`
gains `webhookRejections` — count over seven days, last rejection, and
last *accepted* delivery — and the admin dashboard raises a red banner
above every other figure when the count is non-zero, naming the variable
and reminding the reader to check test-vs-live mode.

Seven days, not today: rejections arrive whenever customers happen to be
paying, and an IST-midnight counter would have read zero to anyone
looking the next morning.

**Verified against production data:**

```
webhookRejections: { count: 0,
                     lastAt:         2026-09-14T14:58,
                     lastAcceptedAt: 2026-10-05T16:34 }
```

Correct: the 45 rejections fall outside the seven-day window, so the
banner is silent, while `lastAt` and `lastAcceptedAt` still carry the
history. The same run confirmed the audit's configuration finding —
`razorpayMissingConfigIn` names all three Razorpay variables as missing
in the local environment.

**Tests:** `tests/payment-settlement-gate.test.mts` — six cases pinning
the rule, including the empty-string case that actually occurred.

The rule is a pure function (`razorpayMissingConfigIn`) rather than a
read of `env`, because `env.ts` freezes `process.env` at import and a
suite that reads the environment can only assert one configuration per
process. The first version of these tests re-imported with a
cache-busting query string, silently got the same frozen answer every
time, and passed for the wrong reason.

### Checks after the fix

| Command | Result |
| --- | --- |
| `npm test` | ✅ 731 pass (was 725), 0 fail |
| `npm run build` | ✅ compiles |
| `npx tsc --noEmit` | ✅ clean |
| `npx eslint src scripts tests` | ⚠️ 0 errors, 1 pre-existing warning |

### Still open: BLOCK-1

Nothing in this change sets a correct secret in production. Until the
Vercel variable is fixed, the effect of half one is that **online payment
is not offered at all** on a deployment missing it — which is the
intended safe state, not a working checkout.
