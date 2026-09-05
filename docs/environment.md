# Environment variables

## Environment variable reference

| Variable | Required? | Used by | What it does |
| --- | --- | --- | --- |
| `DATABASE_URL` | Always | App at request time | Pooled connection string (port 6543 with `?pgbouncer=true` on Supabase). The only database URL the app reads at runtime. |
| `DIRECT_DATABASE_URL` | For migrations only | `prisma migrate` | Direct connection (port 5432) used only by schema migrations. Omitted from runtime validation; the deployed build is unaffected by a missing value. |
| `AUTH_SECRET` | Always | `src/lib/auth/session.ts` and `src/lib/auth/otp.ts` | Signs session JWTs and peppers OTP hashes. Minimum 32 characters. Rotating it invalidates every session and every pending OTP. |
| `MSG91_AUTH_KEY` | Production only | SMS delivery | Authentication key for MSG91. Required in production along with `MSG91_TEMPLATE_ID`; the app refuses to boot with only one of them. A partial configuration silently falls back to the console sender, which prints login codes to the server log. |
| `MSG91_TEMPLATE_ID` | Production only | SMS delivery | DLT-approved template ID for MSG91. Required in production along with `MSG91_AUTH_KEY`; the app refuses to boot with only one of them. |
| `MSG91_SENDER_ID` | Optional | SMS delivery | DLT-approved sender ID for MSG91. Optional; MSG91 altogether is optional in development. |
| `RAZORPAY_KEY_ID` | Optional | Checkout | Public key handed to the browser to open the payment modal. Not secret. Optional; with it unset, checkout reports payment unavailable. |
| `RAZORPAY_KEY_SECRET` | Optional | Server-to-server API calls and checkout signature verification | Secret key for API authentication and to verify the checkout modal's signed handoff. Must never reach the client. Optional; with it unset, checkout reports payment unavailable. |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | Webhook verification | Signed webhook deliveries. Set separately from the API secret when creating the webhook in the Razorpay dashboard. Optional; without it every webhook is rejected and orders stay `PENDING_PAYMENT`. |
| `SHOW_SOURCE_IMAGES` | Optional | Storefront rendering | Renders product photography captured in `Product.sourceImageUrl`. Off unless set to `"1"` or `"true"`. Those images belong to the sites they were scraped from and serving them hotlinks someone else's CDN — fine behind a private demo link, not for a public storefront. |
| `OPENAI_API_KEY` | Optional | `npm run images:generate` | Third-party key for image generation. Used only by the images generation script, never at request time. Everything the script writes is flagged as generated and labelled "Illustration - actual product may vary" in the storefront. |
| `NODE_ENV` | Optional | Environment checks | Deployment environment. Defaults to `development`. Values: `development`, `test`, `production`. The MSG91 boot guard — which requires both `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` — applies only when this is `production`. |

## Local (`.env.local`)

For a working development machine, copy `.env.example` to `.env.local` and fill in the required fields:

- **`DATABASE_URL`**: Point to a Supabase or Neon Postgres instance. Use the pooled connection string on port 6543 (Supabase) or the pooler URL. Required.
- **`DIRECT_DATABASE_URL`**: Point to the same database on port 5432 (the direct, unpooled connection). Set it in `.env.local` if you run migrations locally; omit it otherwise.
- **`AUTH_SECRET`**: Generate a fresh value with `openssl rand -base64 48`. Required.
- **`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`**: Leave empty. With these unset, the app boots normally and login codes are printed to the server log (visible in `npm run dev` output). Only SMS delivery fails, which is fine for local development. No boot guard exists in development.
- **`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`**: Leave empty. With these unset, the app boots normally and checkout reports that payment is unavailable. The code path works end to end without the keys; only money fails to move. This is deliberate: gateway KYC takes days, and a deploy must stay up while approval is pending.
- **`SHOW_SOURCE_IMAGES`**: Leave empty or set to `"0"`. Competitor imagery is fine behind a private demo link; omit it from your local setup.
- **`OPENAI_API_KEY`**: Leave empty. Used only by `npm run images:generate`, which is not part of normal development.

## Vercel Preview

Preview deployments are isolated environments for testing branches before they reach production. They need:

- **`DATABASE_URL`**: The pooled connection string (port 6543, `?pgbouncer=true`).
- **`DIRECT_DATABASE_URL`**: The direct connection string (port 5432). Required for migrations run during preview deployments.
- **`AUTH_SECRET`**: A fresh value, independent of the local and production values. Generate with `openssl rand -base64 48`.
- **`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`**: Optional in preview. Leave unset if SMS delivery is not needed for testing a branch. The app boots normally and login codes print to the logs.
- **`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`**: Use the `rzp_test_` key pair from the Razorpay dashboard, never production keys. Optional; omit to test checkout without taking money.
- **`SHOW_SOURCE_IMAGES`**: Leave unset unless testing that feature specifically.
- **`OPENAI_API_KEY`**: Leave unset unless testing image generation.

Do not share production secrets (`MSG91_AUTH_KEY`, production Razorpay `rzp_live_` keys) with preview. A compromised preview branch must not leak credentials that can harm the production deployment.

## Vercel Production

A production deployment requires the full set:

- **`DATABASE_URL`**: The pooled connection string (port 6543, `?pgbouncer=true`).
- **`DIRECT_DATABASE_URL`**: The direct connection string (port 5432). Required for any schema migrations run against the production database.
- **`AUTH_SECRET`**: A fresh value, independent of local and preview. Generate with `openssl rand -base64 48`.
- **`MSG91_AUTH_KEY`**: Required in production. The app refuses to boot without both this and `MSG91_TEMPLATE_ID`. A partial configuration silently falls back to printing login codes to the server log, which would let anyone with log access take over an account.
- **`MSG91_TEMPLATE_ID`**: Required in production. The app refuses to boot without both this and `MSG91_AUTH_KEY`. Until DLT approval is complete, sign-in cannot go live.
- **`MSG91_SENDER_ID`**: Your DLT-approved sender ID. Required for SMS delivery to actually reach customers.
- **`RAZORPAY_KEY_ID`**: The `rzp_live_` key from the Razorpay dashboard. Optional; there is no boot guard on it. Unset, the storefront runs normally and checkout reports payment unavailable — a correct state whilst gateway activation is pending.
- **`RAZORPAY_KEY_SECRET`**: The corresponding `rzp_live_` secret. Optional for the same reason; the two Razorpay keys must both be set or both be unset.
- **`RAZORPAY_WEBHOOK_SECRET`**: The webhook signing secret set when you created the webhook in the Razorpay dashboard. Optional; without it, webhooks are rejected and orders stay `PENDING_PAYMENT`.
- **`SHOW_SOURCE_IMAGES`**: Leave unset. Competitor imagery is not appropriate for a public storefront.
- **`OPENAI_API_KEY`**: Leave unset. Image generation is an operational task, not a deployed feature.

Production deployments sit in Mumbai (`bom1` in `vercel.json`) to be close to the database. Both must be in the same region, or round-trip latency on every query rises for the customer. Move them together or not at all.

## Generating secrets

`AUTH_SECRET` must be at least 32 characters. Generate a cryptographically strong value with:

```bash
openssl rand -base64 48
```

This produces a base64-encoded random string of 48 bytes (384 bits), which is well above the minimum. Generate a fresh secret for each environment: local, preview, production. Never reuse the same secret across deployments.

Rotating `AUTH_SECRET` invalidates every session cookie and every pending OTP challenge in the database, which is the desired behaviour if the secret ever leaks — a new value lets you revoke the old one. Plan a rotation as a breaking change: every user will be logged out.

## `DATABASE_URL` vs `DIRECT_DATABASE_URL`

The pooled and direct connections exist because Supabase uses Supavisor, a connection pooler that runs in transaction mode. In that mode, the database closes prepared statements at the end of each transaction, which breaks Prisma migrations — they need prepared statements to survive across multiple SQL commands in a single logical transaction.

| | Port | Connection pooler | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | 6543 | Supavisor (pooled) | The app, at every request. Serverless functions open a connection per invocation and exhaust direct connection limits under real traffic; pooling keeps that sustainable. |
| `DIRECT_DATABASE_URL` | 5432 | None (direct) | `prisma migrate` only, never at request time. Migrations need a direct connection that keeps prepared statements alive. |

If you use Neon, which has a pooler that *does* keep prepared statements, you can use the same connection string for both, or omit `DIRECT_DATABASE_URL` altogether — Prisma falls back to `DATABASE_URL` if the direct URL is unset.

Ensure `DIRECT_DATABASE_URL` is never used at request time. If you deploy a function that reads it at runtime, you are consuming a direct connection per request instead of pooling, and you will hit the connection limit. It is not secret; the security risk is the limit.

`DIRECT_DATABASE_URL` is not validated by the app at all — it does not appear in the zod schema in `src/lib/env.ts`. Prisma reads it directly from `process.env` via the `directUrl` declaration in `prisma/schema.prisma`. The app neither knows nor cares whether it is set; only `prisma migrate` needs it.
