# Deploying Quoin

A single Next.js deployment plus a managed Postgres. Everything below can
be done on free tiers, which is enough to share a working link.

## 1. Database

Create a Postgres instance. [Neon](https://neon.tech) and
[Supabase](https://supabase.com) both have a free tier; pick the region
closest to your users — Quoin's customers, pricing and SMS are all in
India, so a Mumbai or Singapore region matters more here than usual.

Copy the **pooled** connection string, not the direct one. Serverless
functions open a connection per invocation and will exhaust a direct
Postgres connection limit under any real traffic.

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

## 3. Vercel

Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Private
repos are supported. Framework detection picks up Next.js; the build
command in `package.json` is already correct and needs no override.

The function region is pinned to Mumbai (`bom1`) in `vercel.json`, so there
is nothing to set in the dashboard. Vercel's default is US East, which
would put every database round trip across an ocean from both the users
and the database.

Environment variables, for Production and Preview:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the pooled connection string |
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

Working: the home storefront, category browse, product listings with
search, filters, sorting and paging, product detail pages, and
serviceability.

Not working: sign-in (until MSG91 is live), and `/pro` and `/cart`, which
are linked from the shell but not built yet.
