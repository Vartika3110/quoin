# Production audit

**Date:** 5 September 2026
**Commit:** `07ea3e0`
**Scope:** every route, model and library in the repository, read directly.

This is the state of QUOIN measured against what a real customer must be able
to do — sign up, find a product, add it, get a server-computed total, pay,
receive a confirmed order, and see it in their account while staff see it in
theirs.

Baseline, measured on this commit:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint src prisma scripts tests` | clean |
| `npm test` | 52 pass, 0 fail (12 suites) |
| `npm run build` | succeeds |
| `npm run lint` (as configured on `07ea3e0`) | 364 errors, 7268 warnings — **all** from `.claude/worktrees`, none from project source. Fixed by ignoring that path; now clean. |

## Progress since this audit

| Phase | Status | What it closed |
| --- | --- | --- |
| 1 — order money, lifecycle, idempotency | **done** | GST double-charge (extraction), `discountPaise`/`deliveryFeePaise`/`currency`, 12-value `OrderStatus` + `canTransition` guard, `Refund` + `PaymentWebhook`, user-scoped order idempotency |
| 2 — inventory engine | **done** | `InventoryItem`/`InventoryMovement`, opt-in `Product.stockTracked`, DB-enforced overselling guard, reserve/release/commit, expiry release |
| 3 — checkout wiring + order history | **done** | quote → order → Razorpay → confirm; `GET /api/v1/orders(/[reference])`; real `/account/orders`; callback orders now persisted |
| 4 — admin | **done** | Admin shell + staff page guard, dashboard, orders queue + detail + guarded status transitions with an `OrderStatusChange` audit trail, inventory list/adjustments/movement history, customers; the two orphan tools folded into the shell |
| 5 — object storage + Parcha backend | **done** | `StorageProvider` over Supabase (signed direct upload, private bucket), `StoredFile` lifecycle, persisted `ParchaSubmission`/`ParchaItem`, real CSV extraction, `OcrProvider` interface left honestly unconfigured |
| 6 — Project Hub to the database | **done** | `Project`/`Task`/`Material`/`Milestone`/`Document`/`Order` tables, a full ownership-scoped API, the client store swapped off `localStorage` with a one-time import prompt for anything already in a browser |
| 7 — notifications (SMS/email/push) | next | |

Verified end to end in a browser against the dev database: OTP sign-in, address, four checkout steps, order written, order visible in the account. Measured on a real order — `subtotal 300, tax 46, total 300`, i.e. tax extracted rather than added. Overselling prevention was proven with five concurrent reservations against real Postgres for a single unit: one succeeded, four were rejected, no oversell.

Defects found in review or verification and fixed, beyond the phase scopes: the OTP console-sender production gap (NEEDS WORK 9a); an unauthenticated write amplifier in the webhook audit table; a double-deduct race in capture settlement that the unique index could not catch; orders promising an expert callback while writing nothing; empty `shipName` on real orders; and an order detail reading "Total paid" on an unpaid order.

## The headline

The order and payment backend is **built and good** — server-authoritative
pricing, snapshotted order lines, a signature-verified idempotent Razorpay
webhook — and **nothing in the UI calls it**. `CheckoutFlow.tsx` fetches
`/api/v1/checkout/quote` and then places the order with
`onPlace={() => setPlaced(true)}`. `POST /api/v1/checkout/order` has no caller.
`/account/orders` still renders "there is no `Order` table in the schema", which
stopped being true one commit ago.

The second headline is that **there is no inventory system of any kind** — no
model, no column, no check. Every product is infinitely sellable.

The third is that **GST is currently charged twice**. Catalogue prices are
imported from manufacturer MRPs and competitor retail listings, both of which are
tax-inclusive under Indian law, and checkout then adds the slab on top again.
Confirmed in both importers — see NEEDS WORK 8.

---

## DONE

Genuinely implemented and production-usable as they stand.

### Identity and sessions
- Phone OTP sign-in/sign-up as one call, revealing nothing about whether a
  number is registered. `src/app/api/v1/auth/otp/request/route.ts`
- Codes stored as HMAC (`AUTH_SECRET`-peppered, phone bound into the digest so a
  code cannot be replayed against another number), constant-time compare, 5-min
  TTL, 5-attempt cap, 5-per-15-min per-phone limit, 30s resend cooldown.
- Sessions are `jose` HS256 JWTs in an httpOnly, `sameSite=lax`, `secure`-in-prod
  cookie, 30-day TTL. Tier and staff flag are re-read from the row on every
  privileged call, so a revoked Pro or a revoked staff grant takes effect
  immediately despite the token being unrevocable. `src/lib/http.ts`
- `isStaff` is set out of band, by database access only. No endpoint can grant it.
- MSG91 behind an `OtpSender` interface. Production refuses to return the
  console sender at all, so it can never print live codes; with SMS
  half-configured, sign-in reports itself unavailable instead. See NEEDS
  WORK 9a — the original guard checked one variable where the sender needs
  two, and a deploy walked straight through it.

### Catalogue
- `Brand` / `Category` (self-referential, `Restrict` on delete) / `Product` /
  `ProductVariant` / `PriceTier`. Money is integer paise throughout.
- GST slab per product (`gstRatePct`), Pro tier pricing, volume price tiers,
  `minQty`/`stepQty` quantity grids.
- Competitor provenance quarantined behind `source*` columns and
  `SHOW_SOURCE_IMAGES`, off unless explicitly enabled.
- `imageIsGenerated` forces an "illustration" label wherever a generated image
  is rendered.

### Serviceability
- Distance-based against `Store.serviceRadiusKm` (haversine), with
  `ServiceArea`/`ServicePincode` as the coarse "do you operate here" lookup.
  Correctly refuses to let a pincode decide the delivery promise.

### Pricing and quoting
- `quoteCart()` (`src/lib/data/checkout.ts`) re-prices every line against the
  live catalogue, snaps quantities onto the sellable grid, and returns a **diff**
  — `price_changed`, `unavailable`, `quantity_adjusted` — so a change is shown
  before the customer agrees to it. Cross-checks that the variant belongs to the
  claimed product slug, so a variant id cannot be bought under a cheaper
  product's name.
- `POST /api/v1/checkout/quote` is open to guests; the Pro rate is read from the
  user row, never from the request.

### Orders (backend only — see NEEDS WORK)
- `Order` + `OrderLine` with **immutable snapshots**: no FK from `OrderLine` to
  `ProductVariant`, and title, variant label, unit price, MRP, GST rate, tax and
  fulfilment are all frozen onto the line. The delivery address is copied, not
  joined.
- Per-line GST, rounded half-up, computed from each product's own slab
  (`taxForLine`). Correct for a mixed basket spanning four slabs.
- Order + lines written in one transaction; reference collisions retried against
  the unique index rather than pre-checked.

### Payments (backend only)
- Razorpay over `fetch`, no SDK, 10s timeouts. `amount` passed through in paise
  with no conversion anywhere.
- `POST /api/v1/webhooks/razorpay` reads the **raw body** before parsing,
  verifies the HMAC in constant time, 401s only on a bad signature, and 200s
  everything a retry cannot fix. Only `payment.captured` moves an order to PAID.
- Settlement is idempotent on the unique `providerPaymentId` — the database
  decides, not a prior read — so concurrent retries collapse to one write.
- A capture for less than the order total is recorded as a discrepancy and
  **does not** mark the order paid.
- A late `payment.failed` cannot overwrite a settled capture.
- Checkout-handoff signature verification exists and is correctly documented as
  *not* authority for payment.

### Consultations
- Server-side, referenced, rate-limited, with a `REQUESTED → SCHEDULED →
  COMPLETED / CANCELLED` status set. Staff list endpoint behind `requireStaff`.

### Parcha parsing
- `parseParcha()` handles the five real-world line shapes, normalises 40+ unit
  spellings, and refuses to strip a number that is part of a product name
  ("8 inch pipe", "40mm bend"). Pure, dependency-free, shared by browser and
  server, covered by tests.
- `POST /api/v1/parcha` matches terms to real catalogue rows and prices them.

### API conventions
- One envelope for every route (`{data}` / `{error:{code,message,fields}}`), zod
  validation on every body with bounded lengths and array caps, `requireUser` /
  `requireStaff`, and staff routes that answer 404 rather than 403 so an internal
  tool's existence is not disclosed.

### PWA
- `manifest.webmanifest` with maskable icons, three shortcuts, `standalone`
  display; `appleWebApp` metadata; `viewportFit: cover` with safe-area insets;
  per-scheme `themeColor`; pre-hydration theme script; zoom preserved to 5×
  (WCAG 1.4.4).

### Environment
- `src/lib/env.ts` validates at boot with a readable failure, with a deliberate
  and correctly reasoned exemption for `next build`.

---

## NEEDS WORK

Exists, but is not production-safe or not reachable.

### 1. Checkout is not connected to the order API — *blocking*
`src/components/storefront/checkout/CheckoutFlow.tsx` never calls
`POST /api/v1/checkout/order`. Placing an order sets local React state; the
sticky bar's Confirm button links to `/consult`; UPI, card and COD are rendered
as permanently unavailable. No customer can buy anything. The component's own
doc comment ("There is no payments module and no orders table behind this app")
is now false.

### 2. No order history — *blocking*
There is no `GET /api/v1/orders`, no `GET /api/v1/orders/[reference]`, and
`/account/orders` renders an empty state explaining a table that now exists. A
customer who paid has no way to see what they bought.

### 3. Order lifecycle stops at PAID
`OrderStatus` is `PENDING_PAYMENT | PAID | FAILED | CANCELLED`. Stage 6 needs
`CONFIRMED`, `PROCESSING`, `PACKED`, `DISPATCHED`, `OUT_FOR_DELIVERY`,
`DELIVERED`, `REFUND_PENDING`, `REFUNDED`, and a guard that rejects invalid
transitions. Today any status could be written by any future caller.

### 4. No idempotency on order creation
A double-clicked "Pay" or a retried request creates a second `Order` **and** a
second Razorpay order. Needs a client-supplied idempotency key with a unique
index, or reuse of an existing `PENDING_PAYMENT` order for the same basket.

### 5. Order money model is incomplete
`Order` has `subtotalPaise`, `taxPaise`, `totalPaise`. Missing: `discountPaise`,
`deliveryFeePaise`, `currency`. There is no delivery-fee or discount calculation
anywhere in the codebase — Stage 3 steps 7 and 8 have no implementation at all.

### 6. No refunds
No `Refund` model, no refund API, no gateway refund call, and `REFUNDED` exists
on `PaymentStatus` with nothing able to set it.

### 7. No webhook event log
Idempotency is inferred from the `Payment` row's state. There is no
`PaymentWebhook` table recording deliveries, so a disputed or dropped event
cannot be reconstructed, and non-payment events are discarded silently.

### 8. GST is charged twice — *confirmed defect, blocks taking real money*
`taxForLine` adds GST **on top of** the line price. `src/lib/data/orders.ts` says
outright that this is a claim about the source data rather than a free choice,
and asks that the catalogue be checked. It has now been checked, and the claim is
**false on both import paths**:

- `prisma/import-brand-catalogue.ts:269` — *"The catalogue price is the MRP. Sell
  price starts equal to it"*. It reads a manufacturer MRP price list. An Indian
  MRP is tax-inclusive by law.
- `prisma/import-catalogue.ts:338` — sets `mrpPaise` and `pricePaise` to the
  scraped competitor listing price, which is a customer-facing retail price and
  therefore also tax-inclusive.

So every `pricePaise` in the database already contains GST, and every order
adds it a second time. A ₹1,000 item on an 18% slab is charged ₹1,180, and a
28% cement line is charged ₹1,280. This is not a rounding concern — it is an
overcharge on every order the moment payments go live, and it is the reason
phase 3 must not ship before phase 1 resolves it.

Two ways out, and the choice is a pricing-policy decision rather than a
technical one:

- **Extract** — treat catalogue prices as gross and back out GST for the invoice
  line (`tax = gross − gross / (1 + rate)`). Displayed prices do not move.
- **Strip at import** — convert stored prices to net, and let checkout keep
  adding tax on top. Displayed prices fall by the slab unless merchandising
  raises them.

Either way `Order.taxPaise` stays a stored per-line figure, and a GST invoice
still has to show the rate and the tax per line.

### 9. Rate limiting is one endpoint deep
Only OTP request is limited, and only per phone. There is no IP or global limit,
so SMS spend can be driven up across many numbers. `/checkout/quote`,
`/checkout/order`, `/parcha` and `/search` have no limit of any kind.

### 9a. Production could silently print login codes to the log — *fixed during phase 1*
`src/lib/env.ts` refused to boot production without `MSG91_AUTH_KEY`, and the
comment explains exactly why: the console sender prints OTPs, so anyone with log
access could take over an account. But `getOtpSender()` in
`src/lib/auth/sender.ts` selects MSG91 only when the auth key **and**
`MSG91_TEMPLATE_ID` are both present. A deploy carrying the key but no template
therefore passed the guard and then fell straight back to the console sender.

Not a hypothetical configuration: DLT template approval lands days after the
MSG91 account does, so "key present, template pending" is the state a launching
deploy naturally sits in. Found while reviewing the drafted
`docs/environment.md`, which recommended precisely that configuration as a way
to boot while DLT was pending.

Fixed: the guard now requires both, and carries a note that it must stay in step
with the condition in `sender.ts`.

### 10. No security headers
No `middleware.ts`, so no CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`
or `Referrer-Policy`.

### 11. Admin is two narrow tools
`/admin/pricing` (price the rows an import could not) and `/admin/images`, plus
harvest endpoints. There is no orders view, no inventory view, no customers view,
no dashboard. Authorization on what exists is correct.

### 12. Parcha photographs are not stored
The workbench offers a file picker and a rear-camera capture, and the page is
honest that nothing reads the handwriting. But there is also no upload endpoint,
no storage and no document record — the attached file currently goes nowhere at
all. No `multipart`/`formData` handling exists in the repository.

### 13. `npm run lint` is unusable as a gate
`eslint` with no path walks `.claude/worktrees`, producing 7,632 problems from a
stale worktree copy. Project source is clean. One line in `eslint.config.mjs`
fixes it, and until it is fixed "run lint after each phase" cannot be honoured.

### 14. `shipName` can be empty
Order creation passes `user.name ?? ""`. A delivery label with no name on it.

---

## MISSING

Not started.

| # | Area | Notes |
| --- | --- | --- |
| 1 | **Inventory — entire subsystem** | No model, no column, no check anywhere. No stock, reserved, available, low-stock threshold, movement history or per-store stock. Overselling is unbounded, and nothing is deducted when an order is paid. This is the single largest gap. |
| 2 | **Project Hub persistence** | `src/lib/store/projects.tsx` is `localStorage` only. No `Project`, `ProjectMaterial`, `ProjectDocument`, `ProjectTask`, `ProjectMilestone` or `ProjectOrder` models. A project created on web cannot appear on mobile — which breaks the stated success criterion outright. The store is, to its credit, already shaped as whole-object replaces keyed by id, so the swap is an implementation change rather than a component rewrite. |
| 3 | **Object storage** | No provider, no abstraction, no upload route. Needed by Parcha documents, project documents and product images. Nothing may be written to the Vercel filesystem. |
| 4 | **Notifications** | Only OTP SMS exists. No email at all, no order/payment/dispatch/delivery/cancellation/refund messages, no push. |
| 5 | **Error monitoring** | `console.error` only. No Sentry or equivalent; failed payments, failed webhooks and database errors are visible only in platform logs. |
| 6 | **SEO** | No `sitemap.ts`, no `robots.ts`, no canonical URLs, no product or category structured data, no Open Graph images. Product pages carry titles and descriptions but nothing else. |
| 7 | **Testing beyond pure functions** | 52 tests, all of pure logic. Nothing in Stage 20 is covered: no order creation test, no duplicate-order test, no webhook signature/duplicate test, no inventory test, no cross-user authorization test. There is no test database harness. |
| 8 | **Capacitor / native shells** | Nothing. No native file picker, camera bridge, push registration, deep links or share. |
| 9 | **`docs/environment.md`** | `docs/deploying.md` covers much of it well but the per-environment variable reference the brief asks for does not exist. `.env.example` is present and good. |
| 10 | **Server-side cart** | The cart is client-held and the client sends lines to be re-priced. This is defensible — the server still computes every amount — but "retrieve the user's current cart" (Stage 3.1) implies a persisted cart, and a cart does not survive a device change today. |

---

## Recommended build order

Sequenced so nothing is built on something that has to move afterwards.

| Phase | Work | Why here |
| --- | --- | --- |
| **1** | Lint gate fix; `Order` money columns, lifecycle statuses + transition guard; `Refund`, `PaymentWebhook`; idempotency key. All models, one migration. | Every later phase writes against these tables. Changing them after orders exist is a data migration. |
| **2** | Inventory engine: models, movements, reserve/release/commit, overselling prevention, multi-store. | Order creation must reserve before it can be wired to a UI. |
| **3** | Wire the checkout: quote → order → Razorpay → confirmation. Order history API + `/account/orders`. Delivery fee and discount calculation. | Closes the blocking gap. First point at which a real purchase is possible. |
| **4** | Admin: dashboard, orders, inventory, customers. | Nobody can fulfil what they cannot see. |
| **5** | Object storage abstraction; Parcha upload + document record + OCR interface. | |
| **6** | Project Hub → database. | |
| **7** | Notifications (SMS/email/push abstraction), wired to the order lifecycle. | Needs the lifecycle from phase 1 and the orders from phase 3. |
| **8** | Security hardening: middleware headers, rate limiting, full authz sweep. | |
| **9** | Test suite against a test database, covering Stage 20 in full. | |
| **10** | SEO, performance, PWA polish. | |
| **11** | Capacitor preparation, then Android, then iOS. | |

**Decision that blocks phase 3:** catalogue prices are confirmed
tax-inclusive (see NEEDS WORK 8) while checkout adds GST on top, so every order
would overcharge by the slab. Whether that is fixed by extracting tax from the
displayed price or by stripping tax from stored prices at import is a pricing
decision, and it must be made before the first real payment.

## How this work is being run

- **Opus — manager.** Audit, architecture, schema and money decisions, task
  decomposition, review of every returned slice, and the phase gates
  (`tsc`, `eslint`, `npm test`, `npm run build`).
- **Sonnet — senior developer** (`.claude/agents/senior-dev.md`). One scoped
  slice at a time, end to end, with its tests. Owns anything touching money,
  inventory, auth, payments, transactions or state machines.
- **Haiku — mechanical developer** (`.claude/agents/mechanical-dev.md`).
  Precisely specified low-judgement work: scaffolding to a given shape,
  repetitive edits, renames, metadata and SEO boilerplate, `.env.example`
  entries, code inventories. Explicitly barred from schema, `src/lib/data/`,
  `src/lib/payments/`, `src/lib/auth/` and webhook routes.
