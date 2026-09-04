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

## The MSG91 catch

`src/lib/env.ts` refuses to boot in production without `MSG91_AUTH_KEY`.
That guard is deliberate: the fallback OTP sender prints login codes to the
server log, and a deployed instance doing that would let anyone with log
access take over an account.

The consequence is that **the app will not start with that variable unset**
— every request returns a 500. Until you have DLT-approved MSG91
credentials, set it to any non-empty placeholder. The app then boots and
browsing works fully, because browse is public; only sign-in fails, at the
point MSG91 rejects the key.

TRAI requires DLT registration of the sender ID and template before
transactional SMS is delivered at all, and approval takes days. Start it
early — it is the long pole on a working login, not a deploy step.

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

**Not built:** order persistence. Checkout re-prices the basket against the
live catalogue, splits it by fulfilment and confirms, then hands the order
to a person, because there is no `Order` table to write to. `/account/orders`
says so rather than showing an invented history.

## Verifying a deploy

`/api/v1/health` reports which modules can reach their dependencies, and
names the module that threw when one cannot. Check it first — a 500 on
every page with `MSG91_AUTH_KEY` unset looks identical to a database
outage, and this endpoint is what tells the two apart.
