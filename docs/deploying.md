# Deploying Quoin

A single Next.js deployment plus a managed Postgres. Everything below can
be done on free tiers, which is enough to share a working link.

## 1. Database

[Supabase](https://supabase.com), Mumbai (`ap-south-1`). The users, the
pricing and the SMS are all Indian, so the database sits in India. This
was Neon in Singapore until 2026-08-30 — Neon has no India region, which
is the only reason it ever sat offshore.

Note that Supabase pauses idle projects on the free tier and Neon does
not. For a demo link somebody opens once a week, that pause is the thing
you will notice.

Two connection strings, and they are not interchangeable:

| | Port | Used by |
| --- | --- | --- |
| **Pooled** (Supavisor, `?pgbouncer=true`) | 6543 | the app, at request time |
| **Direct** | 5432 | `prisma migrate` only |

`DATABASE_URL` is the pooled one: serverless functions open a connection
per invocation and exhaust a direct connection limit under any real
traffic. `DIRECT_DATABASE_URL` is the direct one, because Supavisor's
transaction mode does not keep the prepared statements a migration needs.
The schema declares both. `prisma generate` needs neither, so the deployed
build is unaffected by a missing direct URL — only migrations are.

## 2. Load the schema and the catalogue

Run these from your laptop with `DATABASE_URL` pointing at the new
database — the deployed app does not do it for you:

```bash
DATABASE_URL="<pooled url>" npx prisma migrate deploy
```

```bash
DATABASE_URL="<pooled url>" npm run db:seed
```

```bash
DATABASE_URL="<pooled url>" npm run db:import
```

`db:seed` writes the dark stores that serviceability is computed against.
`db:import` loads ~880 products and is idempotent, so it is safe to re-run.
Skip the import and the storefront renders correctly but empty.

## Moving an existing database to another provider

The above builds a database from the files in this repo. If one already
holds real data — customers, consultation requests, prices edited in the
admin — rebuilding it loses that. Copy it instead.

Put both of the new database's URLs in `.env.local` as
`TARGET_DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (direct), leave
`DATABASE_URL` pointing at the old one, then:

```bash
DIRECT_DATABASE_URL="<new direct url>" DATABASE_URL="<new pooled url>" npx prisma migrate deploy
```

```bash
npm run db:copy -- --dry-run
```

```bash
npm run db:copy
```

`prisma migrate deploy` builds the schema on the target; `db:copy` moves
the rows into it, parent tables first, and then counts both ends to prove
nothing was dropped. It refuses a target that already has rows unless you
pass `--force`, which empties it first.

Primary keys are cuids rather than sequences, so they cross unchanged and
nothing needs resequencing afterwards. What is *not* reproducible from
this repo, and so is the whole reason to copy rather than re-import:
`User`, `Address`, `OtpChallenge`, `ConsultRequest`, and any price or
image set through the admin routes.

Only when the copy verifies clean, point `DATABASE_URL` at the new
database — locally and in Vercel — and keep the old one until the
deployed app has been exercised against the new one.

## 3. Vercel

Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Private
repos are supported. Framework detection picks up Next.js; the build
command in `package.json` is already correct and needs no override.

The function region is pinned to Mumbai (`bom1`) in `vercel.json`, so
there is nothing to set in the dashboard.

It tracks the database, not the customers. Rendering one page runs several
queries in sequence and pays the full round trip on each, while the
customer pays it once for the response — so the functions belong next to
Postgres, and both are now in Mumbai. While the database was in Singapore
this file read `sin1` for exactly the same reason.

Move them together or not at all. Functions in one country and the
database in another is the case worth avoiding, and it is the state you
land in by changing only one of these two files.

Environment variables, for Production and Preview:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the pooled connection string (6543, `?pgbouncer=true`) |
| `DIRECT_DATABASE_URL` | the direct connection string (5432) |
| `AUTH_SECRET` | `openssl rand -base64 48` — a fresh one, not the local value |
| `MSG91_AUTH_KEY` | see below |
| `MSG91_TEMPLATE_ID` | your DLT-approved template |
| `MSG91_SENDER_ID` | your DLT-approved sender |
| `RAZORPAY_KEY_ID` | from the Razorpay dashboard — see below |
| `RAZORPAY_KEY_SECRET` | the other half of that pair |
| `RAZORPAY_WEBHOOK_SECRET` | set when you create the webhook, not the same value |

The three Razorpay variables are genuinely optional and there is no boot
guard on them, unlike MSG91. Unset, the storefront runs normally and
checkout answers that online payment is not available — which is the
state a deploy sits in for as long as gateway activation takes.

## The MSG91 catch

Two variables, not one. `MSG91_AUTH_KEY` authenticates you; `MSG91_TEMPLATE_ID`
names the DLT-registered template MSG91 sends. **Neither works without the
other**, and this is the thing to get right, because getting it half right
used to fail silently.

With both set, sign-in sends SMS. With either missing, `getOtpSender()` in
`src/lib/auth/sender.ts` refuses to fall back to the console sender in
production, and `/api/v1/auth/otp/request` answers that sign-in by SMS is
not available yet. The app boots, the catalogue serves, the cart works and
the admin works — only sign-in is unavailable, and it says so. That is the
same shape as Razorpay being unconfigured, and for the same reason: a
feature that cannot run should report itself, not take the site down.

This document used to say something different and worse. It told you to set
`MSG91_AUTH_KEY` to "any non-empty placeholder" so the app would boot while
DLT approval was pending. That advice was wrong. The old boot guard checked
only `MSG91_AUTH_KEY`, while the sender needs the template id too — so a
placeholder key with no template passed the guard, quietly selected the
console sender, and printed every customer's login code into the platform
log, where anyone with dashboard access could read it and sign in as them.
If you followed that advice, treat those logs as compromised credentials
and rotate `AUTH_SECRET` to invalidate every session minted since.

Do not set placeholder credentials. Leave both unset until you have real
ones; sign-in will be honestly unavailable in the meantime.

### Getting the credentials

TRAI requires DLT registration before transactional SMS is delivered at
all, and approval takes days. Start it first — it is the long pole on a
working login, not a deploy step.

1. **DLT registration**, on any one telecom operator's portal (Jio, Airtel
   or Vodafone Idea — one registration propagates to all of them). Needs
   business proof: PAN, GST, and an authorisation letter on letterhead.
   You register three things in order, each approved before the next is
   useful: an **Entity** (your business, giving you an Entity ID), a
   **Header** (the six-character sender ID a customer sees, e.g. `QUOINX`),
   and a **Template** (the message body, with a variable where the code
   goes).
2. **MSG91** account at msg91.com, with the DLT Entity ID and Header
   linked to it.
3. Then read off the three values:

| | |
| --- | --- |
| `MSG91_AUTH_KEY` | MSG91 → Settings → API → Auth Key |
| `MSG91_TEMPLATE_ID` | the approved DLT template's id |
| `MSG91_SENDER_ID` | the approved six-character header |

The template body must keep a variable for the code — a template with the
digits hard-coded is approved and then useless.

Until all three exist, leave them **unset**. Sign-in reports itself
unavailable, which is true, and nothing is logged.

## Sharing the link

The production URL is `https://<project>.vercel.app`. If opening it prompts
for a Vercel login, that is Deployment Protection — turn it off under
*Settings → Deployment Protection* to make the link publicly shareable.

Note that Vercel's Hobby tier is for non-commercial use. A demo link is
fine; running the real storefront on it is not.

## What works on a fresh deploy

**Public, and fully working without an account:** the home storefront,
category browse, product listings with search, filters, sorting and paging,
product detail pages, serviceability, the command palette (⌘K), Upload
Parcha's list pricing, Services, Quoin Pro, and the consultation booking
form.

**Working, but held in the browser rather than on the server:** the cart,
the wishlist, Project Hub and recently-viewed all live in `localStorage`
until accounts own them. They survive a refresh and sync across tabs on one
device; they do not follow a customer to another device, and clearing site
data clears them. See `src/lib/store/`.

**Needs MSG91 to be live:** sign-in, and everything behind it — saved
addresses, the account area's server-backed sections, and the address step
of checkout.

**Needs Razorpay credentials:** paying for an order. The `Order`,
`OrderLine` and `Payment` tables exist and `POST /api/v1/checkout/order`
writes to them, but with the keys unset that endpoint answers that
payment is unavailable and the checkout falls back to the callback. See
*Payments* below.

**Not built:** anything after the money arrives. `OrderStatus` stops at
`PAID` on purpose — there is no dispatch, no roster and no delivery scan
behind this app, so fulfilment is a person, and statuses like `SHIPPED`
would be a promise nothing updates.

## Payments

Razorpay, and it needs a live site before it will let you take money — so
this comes after the domain, not before it. Activation is reviewed by a
person who opens the URL and looks for terms, privacy, refund, shipping
and contact pages reachable from the footer. The storefront does not have
them yet; that is the gating work, not the integration.

Until the account is activated, everything below works on the
`rzp_test_` key pair, so the code path can be finished and exercised end
to end while KYC is pending.

**Keys.** Dashboard → Settings → API Keys. `RAZORPAY_KEY_ID` is handed to
the browser and is not secret; `RAZORPAY_KEY_SECRET` never leaves the
server. Neither is read at build time, so switching from `rzp_test_` to
`rzp_live_` on activation day is an environment change and a restart, not
a redeploy.

**Capture mode.** Leave the account on *automatic* capture. With manual
capture a payment stops at `authorized`, `payment.captured` never fires,
and orders sit at `PENDING_PAYMENT` while the customer's money is held —
which looks exactly like a broken webhook and is not one.

**The webhook.** Dashboard → Settings → Webhooks:

| | |
| --- | --- |
| URL | `https://<your domain>/api/v1/webhooks/razorpay` |
| Events | `payment.captured` and `payment.failed` |
| Secret | any strong random string — this becomes `RAZORPAY_WEBHOOK_SECRET` |

That secret is **not** the API secret. Setting the API secret here is the
single most common way to land in the failure below.

The webhook is the only thing that marks an order paid. The signed
handoff the browser gets when the checkout modal closes is verified too,
but only to draw a confirmation screen — it travels through the
customer's own browser and is simply absent whenever someone closes the
tab on a successful payment.

**When a test payment succeeds but the order stays `PENDING_PAYMENT`**,
it is almost always the webhook, in this order: the secret does not
match (the logs show `rejected a webhook with an invalid signature`), the
URL is unreachable because Deployment Protection is still on, or the
events were never subscribed. Razorpay's dashboard shows delivery
attempts and their response codes per webhook, which answers all three.

Note that a webhook cannot reach `localhost`. Local end-to-end testing
needs a tunnel, or a deployed preview with its own test keys.

## File uploads

Object storage, for Parcha documents and anything else a customer sends.
Supabase, because the database already is — one account, one bill, and no
new vendor to review. The code sits behind a `StorageProvider` interface
(`src/lib/storage/`), so S3 or Cloudinary would be a new file rather than
a rewrite.

**The bucket.** Supabase dashboard → Storage → New bucket. Name it
`quoin-uploads` and leave it **private** — do not tick "Public bucket".
Nothing is ever served from a public URL: downloads are short-lived signed
URLs minted server-side, and only for the file's owner or for staff.

**The keys.** Settings → API gives you both:

| | |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key, **not** `anon` |
| `SUPABASE_STORAGE_BUCKET` | `quoin-uploads` |
| `STORAGE_PROVIDER` | `supabase` |

`service_role` bypasses row-level security completely. Treat it like
`RAZORPAY_KEY_SECRET`: server only, never `NEXT_PUBLIC_`, never in a
response body or a log line. The `anon` key is the wrong one here and will
fail on a private bucket, which is the correct outcome.

Unset, uploads report themselves unavailable and the rest of the app runs
normally — same as Razorpay before activation. There is no boot guard.

**Why signed direct upload.** The browser uploads straight to Supabase
rather than through a route handler. A serverless function caps its request
body at a few megabytes, and a phone photograph of a parcha routinely
exceeds that — proxying would fail on precisely the files this feature
exists for. The server issues a short-lived signed URL, the browser PUTs to
it, and a confirm step re-reads the object to check its real size and
content type against what was declared before the row is trusted.

## Reading an uploaded parcha

`/upload` takes a photograph, a scan or a PDF and reads the materials off
it, putting them into the same textarea a typed list goes in. The customer
edits what came back and presses "Price this list" — the pricing flow is
unchanged and unaware of where the text came from.

**The endpoint** is `POST /api/v1/parcha/extract`, with
`POST /api/parse-parcha` as an alias onto the same handler — one
implementation, two paths, one shared rate-limit budget, so calling both
does not double anyone's allowance. The versioned path is the canonical
one and the one the bundled browser code posts to; the alias exists for
callers already pointed at it.

**The key.** One variable, set in Vercel → Settings → Environment
Variables for **Production**, **Preview** and (if you want the flow
locally) **Development**:

| | |
| --- | --- |
| `OPENAI_API_KEY` | a project-scoped key from platform.openai.com, with a spend limit |
| `OPENAI_MODEL` | optional; leave unset for the default |

Server-only, both of them. There is deliberately no `NEXT_PUBLIC_`
equivalent and there must never be one: the browser posts the file to
`POST /api/v1/parcha/extract` and this app makes the OpenAI call. A key in
a `NEXT_PUBLIC_` variable is a key in the JavaScript bundle, which is a
key anyone can read and spend.

Unset, the app boots and `/upload` behaves exactly as it did before this
existed: typing a list is priced end to end, and an attached file reports
that automatic reading is not switched on and offers the expert path. No
boot guard, same reasoning as Razorpay and Supabase above. CSV uploads are
read locally by `extractCsvLines` and never touch OpenAI, so they keep
working with no key at all.

**The model.** `DEFAULT_PARCHA_MODEL` in `src/lib/parcha-openai.ts` is
`gpt-5-mini` — vision-capable, cheap per page, and able to read a whole
PDF rather than only its first page. `OPENAI_MODEL` overrides it. That
variable exists because model names age faster than deploys do: if the
account has no access to the default, the fix is a dashboard change, not a
release. The failure looks like every upload returning "we could not read
that file just now", with a server log line naming the reason and the
model —

    [parcha/extract] read failed { reason: 'upstream', model: 'gpt-5-mini', ... }

— which is the one place that distinguishes "no model access" from
"OpenAI is down". Nothing upstream is ever shown to the customer; those
messages quote organisation ids and quota figures.

**Why multipart here and signed direct upload there.** `/api/v1/uploads`
proxies nothing because the file is being *kept*. This route keeps
nothing — the bytes live for one request — so requiring an account and a
provisioned bucket to read a photograph would put a sign-up in front of
the feature. The cost is the platform's ~4.5MB body cap, which the browser
handles by re-encoding photographs before sending
(`src/lib/parcha-image.ts`); that same pass converts an iPhone's HEIC,
which OpenAI does not accept, at the one point in the chain where a
decoder for it exists.

**Rate limiting** is per-instance and in-memory (12 reads per caller per
ten minutes). It stops a runaway browser and an accidental retry storm; it
does not stop a determined attacker, because a burst spread across
instances gets a fresh budget per instance. The spend limit on the OpenAI
key is the real backstop. Making the limiter exact means a table and a
migration, which is the right change if this ever faces real abuse.

## Verifying a deploy

`/api/v1/health` reports which modules can reach their dependencies, and
names the module that threw when one cannot. Check it first — a 500 on
every page with `MSG91_AUTH_KEY` unset looks identical to a database
outage, and this endpoint is what tells the two apart.
