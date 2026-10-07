# WhatsApp order lifecycle

How an order gets from a captured payment to a delivered parcel, who is
told what at each step, and everything that has to be configured outside
this repository for any of it to happen.

Read `docs/django-to-prisma.md` first if you are touching the catalogue.
This document is about orders.

---

## 1. The lifecycle

Four stages, and one exceptional outcome:

```
placed  ->  dispatched  ->  out for delivery  ->  delivered
                       cancelled
```

There is **no accepted, preparing or ready stage**. A vendor does not
accept a Quoin order; they are told about it and they dispatch it. That
decision lives in exactly one file — `src/lib/orders/lifecycle.ts` — and
everything else reads it: the customer's stepper, the admin timeline, the
order board's columns, and which statuses produce a WhatsApp.

### How that maps onto `OrderStatus`

`OrderStatus` still has twelve values and deliberately was **not**
rewritten. Five of them are payment facts that have nothing to do with a
parcel (`PENDING_PAYMENT`, `FAILED`, `REFUND_PENDING`, `REFUNDED`, and
`PAID` itself), and deleting the three fulfilment statuses that went away
would have deleted the history of every order that passed through them.

| Stage | `OrderStatus` | Set by |
| --- | --- | --- |
| *(pre-lifecycle)* | `PENDING_PAYMENT`, `FAILED` | checkout / the gateway |
| `placed` | `PAID` | the Razorpay webhook, the reconciler, or "Mark payment received" |
| `placed` *(retired)* | `CONFIRMED`, `PROCESSING`, `PACKED` | nothing, any more |
| `dispatched` | `DISPATCHED` | a vendor's own link, or staff |
| `out_for_delivery` | `OUT_FOR_DELIVERY` | staff |
| `delivered` | `DELIVERED` | staff |
| `cancelled` | `CANCELLED` | staff |
| *(money, not parcels)* | `REFUND_PENDING`, `REFUNDED` | the existing refund implementation |

**Retired means retired as a destination.** `CONFIRMED`, `PROCESSING` and
`PACKED` are refused by `isAdminTransitionAllowed`, so nothing can move an
order into one of them. Their *outgoing* edges stay in
`ORDER_TRANSITIONS`, and each gained a direct edge to `DISPATCHED`, so an
order that was already sitting in one when this shipped can still be moved
forward rather than being stranded where no button reaches it. They render
as "Order placed" everywhere a customer can see.

`PAID` is still reachable exactly three ways and none of them is a status
endpoint: a signature-verified `payment.captured` webhook, the payment
reconciler recovering a lost delivery, and the staff offline-payment
action. `POST .../status` refuses `toStatus: "PAID"` outright.

---

## 2. Who is told what

| Event | Customer | Vendor |
| --- | --- | --- |
| Payment confirmed | `order_placed_customer` | `new_order_vendor` (their items only) |
| Vendor dispatches the last outstanding leg | `order_dispatched_customer` | — |
| Staff set out for delivery | `order_out_for_delivery_customer` | — |
| Staff set delivered | `order_delivered_customer` | — |
| Staff cancel | `order_cancelled_customer` | — (outstanding legs are closed) |

Nothing is sent for a payment attempt, a retired status, or a refund
state. `messageTypeForStatus` (`src/lib/data/order-whatsapp.ts`) is the
list, and its `null`s are the specification rather than an oversight.

**The customer's message is never triggered by the browser.** The
confirmation screen's `POST /api/v1/checkout/verify` proves Razorpay
replied, not that money moved, and a customer who closes the tab on a
successful payment must still get their message. `onOrderPlaced` is
called from the webhook, the reconciler and the offline-payment action,
and from nowhere else.

---

## 3. Vendors

**A store is this app's only idea of a vendor.** There is no vendor
roster behind Quoin; what physically holds the stock an order line
reserved is the `Store` frozen onto `OrderLine.storeId`. So "notify the
vendor" means "notify that store", and two columns make one reachable.

Manage them at **`/admin/vendors`**: every store, its WhatsApp number and
contact name, whether it is live, how much tracked stock it holds, and how
many orders are waiting on it to dispatch. The order page links straight
here from a vendor with no number, which is the commonest cause of a
failed notification.

The same two columns are still settable from a script, which is the right
tool for a deploy script or a bulk edit:

```
npm run vendors:whatsapp -- --list
npm run vendors:whatsapp -- GKP-01 +919876543210 "Ramesh"
npm run vendors:whatsapp -- GKP-01 --clear
```

A store with no number is not a silent failure: the vendor notification is
written as FAILED with "No WhatsApp number on file for this recipient",
which the admin order page shows, and retrying after filling the number in
picks the new one up. Changing a number never rewrites history —
`OrderFulfilment.vendorPhone` snapshots what each past order's message was
actually addressed to.

### Adding one

`/admin/vendors` → **Add a vendor**. Needs a code (`DEL-JNK`), a name, the
coordinates, a delivery radius and a pick-and-pack time.

**A new vendor is created switched off, and that is not a setting.** Every
serviceability read in this app filters on `isActive: true`, and
`resolveServiceability` picks the *nearest active store within its own
radius* — so the moment a store is live it starts winning that contest for
every address it covers. A new store has no stock, so it would then fail
to reserve for all of them, and those customers would see "Some items in
this basket are no longer in stock at your delivery address" with nothing
connecting it to the store somebody added that morning. Inactive, it is
genuinely inert: nothing reads it, no promise changes, no order routes to
it.

So the order is: add it, stock it from `/admin/inventory`, then switch it
on. Switching on a store that still holds no tracked stock asks first and
names that consequence; switching one *off* is always safe, and leaves
past orders and outstanding legs alone because both snapshot the store.

One thing the UI cannot protect against, and says so on the page: a
vendor added there is not in `prisma/seed.ts`, and that script switches
off every store whose code it does not know. Running `npm run db:seed`
against the same database will switch a hand-added vendor off again — add
it to `STORES` there once it is real.

### Split orders

A basket can span stores — a tracked `INSTANT` line reserves from the dark
store covering the address while a tracked `SCHEDULED` line can fall back
to the default warehouse. So `OrderFulfilment` is one row per store per
order, created the moment the payment settles, and:

- each vendor is messaged **their own lines only**, with their own
  subtotal (never the order total);
- the *order* reaches `DISPATCHED` only when **every** leg has;
- the customer is messaged once, when the whole order is on its way.

The customer never sees vendor-level state. Their lifecycle is the same
four stages whether one store or three are involved.

An order with **no** legs is normal, not broken: a callback order, a
made-to-order basket or a basket of untracked products reserved stock
nowhere, so Quoin fulfils it and staff dispatch it through "Change
status". The queue shows "Quoin" in the vendor column for those.

### The vendor's credential

There is no vendor account system, and inventing one would be a second
authentication surface to get wrong. Instead the new-order WhatsApp
carries a link ending in `OrderFulfilment.actionToken` — 32 bytes of
`randomBytes` as hex — and holding it authorises **one action on one
fulfilment**:

- `GET /vendor/orders/{token}` renders that leg's lines, the delivery
  address and one button. The projection carries no account id, no email
  and no other vendor's items, so what it cannot select cannot leak.
- `POST /api/v1/vendor/fulfilments/{token}/dispatch` marks that leg
  dispatched. It is the only write an unauthenticated caller can make
  anywhere in this app, it is rate-limited, and a token of the wrong
  shape is refused before the database is touched.

The token does not expire — a vendor dispatching two days late must not be
locked out of their only button — and is revocable by rotating the column.
`/vendor` is in `robots.txt` and the page sends `noindex, nocache`.

---

## 4. WhatsApp Business configuration

### Prerequisites, in order

1. A **Meta Business account** with business verification completed.
2. A **WhatsApp Business Account** with a phone number registered to it.
   The number cannot be in use on the consumer WhatsApp app.
3. A **Meta app** of type Business with the WhatsApp product added.
4. A **System User** with `whatsapp_business_messaging` and a permanent
   token generated for it. The 24-hour token on the API Setup page is for
   a first smoke test only; it expires and messages then silently fail.

Set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` from steps 2
and 4. See `docs/environment.md` for all seven variables.

### The six templates

Register each one in WhatsApp Manager → Message Templates, under the
**UTILITY** category (not MARKETING — a transactional order update
submitted as marketing is routinely rejected, and would be subject to
marketing limits if approved). Use the exact names below; this app looks
them up by name and does not discover them.

The body text is in `src/lib/whatsapp/templates.ts` (`renderBody`) and the
`{{n}}` positions are `bodyParameters`'s own order. **That ordering is the
contract** — reordering it silently swaps two values in a live message.

#### 1. `order_placed_customer`

```
🛒 ORDER CONFIRMED

Hi {{1}},

Your Quoin order #{{2}} has been placed successfully.

Items:
{{3}}

Total:
₹{{4}}

Delivery Address:
{{5}}

We'll keep you updated about your order.
```

`{{1}}` customer name · `{{2}}` order reference · `{{3}}` items ·
`{{4}}` total · `{{5}}` delivery address.

#### 2. `new_order_vendor`

```
🛒 NEW QUOIN ORDER

Order: #{{1}}

Customer:
{{2}}

Phone:
{{3}}

Items:
{{4}}

Quantity:
{{5}}

Total:
₹{{6}}

Payment:
{{7}}

Delivery Address:
{{8}}

Status:
NEW ORDER
```

Plus **one URL button**, labelled "Dispatch order", of type *dynamic*,
with base URL `https://<your-domain>/` — this app passes the whole
absolute dispatch URL as the button's dynamic suffix.

`{{1}}` order reference · `{{2}}` customer name · `{{3}}` customer phone ·
`{{4}}` that vendor's items · `{{5}}` that vendor's picking list ·
`{{6}}` that vendor's subtotal · `{{7}}` payment status ·
`{{8}}` delivery address.

#### 3. `order_dispatched_customer`

```
🚚 ORDER DISPATCHED

Your Quoin order #{{1}} has been dispatched.

We'll update you when it is out for delivery.
```

#### 4. `order_out_for_delivery_customer`

```
🛵 OUT FOR DELIVERY

Your Quoin order #{{1}} is out for delivery.

It should reach you soon.
```

#### 5. `order_delivered_customer`

```
✅ ORDER DELIVERED

Your Quoin order #{{1}} has been delivered successfully.

Thank you for shopping with Quoin!
```

#### 6. `order_cancelled_customer`

```
❌ ORDER CANCELLED

Your Quoin order #{{1}} has been cancelled.

{{2}}
```

`{{2}}` is the refund line, built from the order's own payments and
refunds by `cancellationNote` — never a promise the gateway has not been
asked for.

**Do not create** `order_accepted`, `order_preparing` or `order_ready`
templates. Those statuses do not exist.

### Before approval lands

Set `WHATSAPP_MESSAGE_MODE=text`, message your own business number from a
handset to open a 24-hour window, and drive the whole lifecycle. The
rendered bodies above are what gets sent. Unset it before going live.

---

## 5. Webhooks

| Webhook | Route | Secret | What breaks without it |
| --- | --- | --- | --- |
| Razorpay `payment.captured` | `POST /api/v1/webhooks/razorpay` | `RAZORPAY_WEBHOOK_SECRET` | Orders never reach `PAID`, so nothing is ever placed or notified. **This is the one that matters.** |
| WhatsApp delivery statuses | `GET`/`POST /api/v1/webhooks/whatsapp` | `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | A message Meta accepted and then dropped keeps reading as "Sent" on the admin page. Sending is unaffected. |

Subscribe the WhatsApp one in Meta app → WhatsApp → Configuration →
Webhook, at `https://<your-domain>/api/v1/webhooks/whatsapp`, subscribed
to the **`messages`** field. The `GET` answers Meta's challenge; the
`POST` verifies `X-Hub-Signature-256` over the raw body and fails closed
when the app secret is unset.

**Inbound customer messages are deliberately ignored.** A customer
replying "where is my order" is a support conversation for a person. A
webhook that let an incoming WhatsApp move an order would make WhatsApp
the source of truth for anybody who can spoof a phone number.

---

## 6. Idempotency

Every send goes through one key, `WhatsAppNotification.eventKey`, with a
unique index behind it:

- `{reference}:{MESSAGE_TYPE}` for a customer message;
- `{reference}:NEW_VENDOR_ORDER:{storeCode}:{fulfilmentId}` for a vendor's.

The index is what enforces it, not a `findFirst` two statements earlier
that a concurrent request can pass at the same time. So all of these
message each person exactly once:

- Razorpay redelivering `payment.captured` (it retries by design);
- the reconciler settling a payment a late webhook also settles;
- two staff clicking the same transition;
- a vendor tapping their dispatch link twice;
- a customer refreshing the confirmation screen.

A **failed** send heals: when the key already exists and the row says
FAILED, the next trigger claims it with a guarded `FAILED -> RETRYING`
update and tries again. A **successful** one never repeats.

`createFulfilmentsForOrder` is a `skipDuplicates` insert on
`(orderId, storeId)`, so a second settlement creates no second leg and —
critically — mints no second `actionToken` that would break the link
already in a vendor's WhatsApp.

---

## 7. A WhatsApp failure cannot break an order

This is the rule the whole design is arranged around:

```
payment captured  ->  order PAID (committed)  ->  WhatsApp fails
```

The order exists. Its status is correct. It is in the admin queue. The
failed notification is a row with the provider's own words on it and a
Retry button. Nothing is rolled back and Razorpay is answered `200`.

Mechanically: `sendOrderMessage` and every function in
`src/lib/data/order-whatsapp.ts` swallow everything, the notification row
is written **before** the provider is called (a row written afterwards
would mean a send that succeeded and was never recorded, which the next
retry would repeat), and every send is downstream of a committed
transaction. The one function that throws is
`retryOrderNotification`, because a staff member is waiting on the answer
to a button press.

---

## 8. Security

Access control in this app is **server-side**, not Supabase RLS, and that
is worth being explicit about because the database is hosted on Supabase.

Nothing in this application talks to Supabase as a data API. Prisma
connects over `DATABASE_URL` as the schema owner, and a table owner
bypasses its own RLS policies unless the table is explicitly set to
`FORCE ROW LEVEL SECURITY`. Policies added to these tables would
therefore be inert for every read this app makes — they would look like
protection and provide none. Supabase here is Postgres, Auth (phone
sign-in) and Storage; the authorisation boundary is `src/lib/http.ts` and
the queries themselves.

What that boundary actually guarantees:

**Customers** see their own orders only. `getOrderForUser` has the
`userId` *in the `where` clause*, so another customer's reference matches
nothing rather than being fetched and then checked — and "exists but not
mine" is indistinguishable from "does not exist". There is no customer
route that writes `Order.status` at all.

**Vendors** have no account, and their token authorises one action on one
fulfilment. `getFulfilmentByToken` projects that leg's lines alone, so
vendor A cannot be shown vendor B's items or anything about the customer
beyond the name, number and address on the parcel. The dispatch route
cannot set any status other than that leg's own, and the order-level
roll-up is computed server-side.

**Staff** (`User.isStaff`) see and move everything, through
`requireStaff()` for routes and `requireStaffPage()` for pages — both of
which read the row rather than trusting the session token, so access
removed is access gone. Every status change writes an
`OrderStatusChange` in the same transaction; a status that changed with
nobody attached to it is the gap that table exists to close.

**Secrets** stay server-side. `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_APP_SECRET`, `RAZORPAY_KEY_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY` are read only through `src/lib/env.ts`, which
throws if bundled into the client, and none of them has a
`NEXT_PUBLIC_` prefix. No component imports `src/lib/whatsapp/client.ts`.
Customer phone numbers are masked (`maskPhone`) everywhere the admin
renders them, including in the WhatsApp activity list.

---

## 9. Testing it

`npm test` covers everything that can be checked without a database: the
stage mapping, the transition table, the admin boundary's refusal of the
retired statuses, all six templates and their parameter order, the event
keys' uniqueness properties, the queue's WhatsApp summary, and the
dispatch token's shape guard.

The rest needs a database and a phone. In development, leave the WhatsApp
variables unset — the console sender prints each rendered message to the
`npm run dev` output, including the vendor's dispatch URL, which is enough
to walk the whole thing.

1. **Place an order.** Pay through Razorpay test mode. Expect
   `Order.status = PAID`; an `ORDER_PLACED` row to the customer and a
   `NEW_VENDOR_ORDER` row per store, both SENT; and "Order placed" at the
   top of the admin timeline.
2. **Dispatch as the vendor.** Open the dispatch URL from the vendor's
   message and press the button. Expect that leg DISPATCHED; on a
   single-store order, `Order.status = DISPATCHED`, an
   `ORDER_DISPATCHED` row, and a timeline entry attributed to the store
   rather than to a staff account.
3. **Split order.** Put an `INSTANT` line and a `SCHEDULED` line that
   resolve to different stores in one basket. Expect two vendor messages,
   each listing only its own items; dispatching one leaves the order at
   `PAID` with **no** customer message; dispatching the second moves the
   order and sends one.
4. **Out for delivery, then delivered.** From the admin order page.
   Expect the statuses, the history rows, and one customer message each.
5. **A WhatsApp failure.** Clear a store's number — empty the field at
   `/admin/vendors`, or `npm run vendors:whatsapp -- <code> --clear` —
   and place an order. Expect the order to be completely unaffected, a
   FAILED vendor notification saying no number is on file, and a
   successful Retry after setting the number back.
6. **A duplicate webhook.** Redeliver `payment.captured` from the
   Razorpay dashboard. Expect no second order, no second fulfilment, no
   second message, and `outcome: "duplicate"` on the delivery.
7. **An unauthorised vendor.** `POST` to another fulfilment's dispatch
   route with a made-up token. Expect `404` and no write.
8. **A customer.** There is no customer-facing route that writes a
   status; confirm `POST /api/v1/admin/orders/{ref}/status` answers `404`
   to a signed-in non-staff account.

---

## 10. What is still manual

- **Templates.** Six of them, submitted and approved in WhatsApp Manager.
  Nothing in this repository can do that.
- **Stocking a new vendor.** `/admin/vendors` adds the store and
  `/admin/inventory` gives it stock, but the two are separate acts on
  purpose — see "Adding one" above for why a new store starts switched
  off, and why switching it on before it has stock is the one way that
  screen can lose orders.
- **Keeping `prisma/seed.ts` in step.** A vendor added through the admin
  is not known to the seed script, which switches off every store whose
  code it does not recognise.
- **Refund initiation.** Unchanged by this work and still unbuilt — see
  `docs/production-audit.md`. The cancellation message says what the
  database actually records and promises nothing further.
- **Out-for-delivery and delivered.** Staff actions. There is no rider
  app and no courier integration, so there is nothing to automate them
  from; a status moved by a person who looked is better than one moved by
  a guess.
