# Environment variables

## Environment variable reference

| Variable | Required? | Used by | What it does |
| --- | --- | --- | --- |
| `DATABASE_URL` | Always | App at request time | Pooled connection string (port 6543 with `?pgbouncer=true` on Supabase). The only database URL the app reads at runtime. |
| `DIRECT_DATABASE_URL` | For migrations only | `prisma migrate` | Direct connection (port 5432) used only by schema migrations. Omitted from runtime validation; the deployed build is unaffected by a missing value. |
| `AUTH_SECRET` | Always | `src/lib/auth/session.ts` and `src/lib/auth/otp.ts` | Signs session JWTs and peppers OTP hashes. Minimum 32 characters. Rotating it invalidates every session and every pending OTP. |
| `MSG91_AUTH_KEY` | Production only | SMS delivery | Authentication key for MSG91. Required in production along with `MSG91_TEMPLATE_ID`; sign-in is unavailable unless both are set; the app still boots and browsing works. A partial configuration is refused outright in production rather than falling back to the console sender, which would print login codes to the server log. |
| `MSG91_TEMPLATE_ID` | Production only | SMS delivery | DLT-approved template ID for MSG91. Required in production along with `MSG91_AUTH_KEY`; sign-in is unavailable unless both are set; the app still boots and browsing works. |
| `MSG91_SENDER_ID` | Optional | SMS delivery | DLT-approved sender ID for MSG91. Optional; MSG91 altogether is optional in development. |
| `GOOGLE_CLIENT_ID` | Optional | `src/lib/auth/google.ts`, `/api/v1/auth/google/*` | OAuth 2.0 client id from Google Cloud Console. Optional, with both this and `GOOGLE_CLIENT_SECRET` required together — with either unset, `isGoogleSignInConfigured()` is false and the "Continue with Google" button is not shown. No boot guard, unlike MSG91: the unconfigured state is simply "the button is absent," which is safe rather than dangerous. |
| `GOOGLE_CLIENT_SECRET` | Optional | `src/lib/auth/google.ts` | The corresponding OAuth client secret. Server-only: never `NEXT_PUBLIC_`, never in a response body or a log line, exchanged for tokens only in `POST /api/v1/auth/google/callback`. |
| `RAZORPAY_KEY_ID` | Optional | Checkout | Public key handed to the browser to open the payment modal. Not secret. Optional; with it unset, checkout reports payment unavailable. |
| `RAZORPAY_KEY_SECRET` | Optional | Server-to-server API calls and checkout signature verification | Secret key for API authentication and to verify the checkout modal's signed handoff. Must never reach the client. Optional; with it unset, checkout reports payment unavailable. |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | Webhook verification | Signed webhook deliveries. Set separately from the API secret when creating the webhook in the Razorpay dashboard. Optional; without it every webhook is rejected and orders stay `PENDING_PAYMENT`. |
| `SHOW_SOURCE_IMAGES` | Optional | Storefront rendering | Renders product photography captured in `Product.sourceImageUrl`. Off unless set to `"1"` or `"true"`. Those images belong to the sites they were scraped from and serving them hotlinks someone else's CDN — fine behind a private demo link, not for a public storefront. |
| `OPENAI_API_KEY` | Optional | `src/lib/parcha-openai.ts` (at request time) and `npm run images:generate` | Reads an uploaded parcha — `POST /api/v1/parcha/extract` (aliased as `POST /api/parse-parcha`) sends the photograph or PDF to OpenAI and returns the materials as text for the customer to check on `/upload`. The same key also backs the image generation script, which runs on a laptop and never at request time. Server-only: never `NEXT_PUBLIC_`, never in a response body or a log line. Optional; with it unset the app boots normally, typing a list is priced end to end, and an attached file is routed to a person instead — the behaviour before automatic reading existed. |
| `OPENAI_MODEL` | Optional | `src/lib/parcha-openai.ts` | Which model reads the file. Defaults to `DEFAULT_PARCHA_MODEL` (`gpt-5-mini`) when unset. A variable rather than a constant because model names age faster than deploys: an account without access to the default is a dashboard change, not a code change — `gpt-4.1-mini` is the drop-in. The extract route logs the model name alongside any upstream refusal, which is how that case is identified. |
| `CRON_SECRET` | Production (strongly recommended) | `src/lib/cron.ts`, `/api/v1/cron/*`, and the detail half of `/api/v1/health` | Authenticates the scheduled jobs. Vercel Cron sends it as `Authorization: Bearer <value>` on every invocation once set on the project; the same header works from curl for a manual run, and unlocks the full `/api/v1/health` payload (unauthenticated callers get `{ "ok": true }` only). Generate with `openssl rand -base64 32`. Optional in the schema so a deploy without it still boots and serves — but **fail-closed**: with it unset every job refuses every caller, which means nothing recovers a payment whose webhook was lost (`reconcile-payments`) and nothing gives back stock an abandoned checkout is holding (`release-reservations`). Set it in production. |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional | `src/lib/whatsapp/client.ts` | The id of the WhatsApp Business number that sends order notifications (WhatsApp Manager → API Setup). Paired with `WHATSAPP_ACCESS_TOKEN`: `isWhatsAppConfigured()` is false unless both are set. No boot guard, unlike MSG91 — with these unset the app boots, orders work end to end, and every notification is recorded as FAILED with "WhatsApp is not configured" on it, visible on the admin order page and retryable once the credentials land. |
| `WHATSAPP_ACCESS_TOKEN` | Optional | `src/lib/whatsapp/client.ts` | A permanent System User token with `whatsapp_business_messaging`. Can send as the business number, so server-only: never `NEXT_PUBLIC_`, never in a response body or a log line. The 24-hour token from the API Setup page expires and should only ever be used for a first smoke test. |
| `WHATSAPP_API_VERSION` | Optional | `src/lib/whatsapp/client.ts` | Graph API version. Defaults to `v21.0`. A variable rather than a constant for the reason `OPENAI_MODEL` is one: Meta retires versions on its own schedule, not on this app's deploy schedule. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional | `src/lib/whatsapp/client.ts` | The language code the six templates were approved under. Defaults to `en`; set it to `en_US` if that is what the dashboard shows. A mismatch is the commonest cause of "Template name does not exist in the translation", which surfaces as a FAILED notification with that text on it. |
| `WHATSAPP_MESSAGE_MODE` | Optional | `src/lib/whatsapp/client.ts` | `template` (the default, and the only production answer) or `text`. `text` sends the rendered body as a free-form message, which WhatsApp delivers only inside a 24-hour window the recipient opened by messaging the business first — useless for customers, and exactly right for the days before six templates clear review. Anything that is not exactly `text` means `template`. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Optional | `GET /api/v1/webhooks/whatsapp` | Answers Meta's subscription challenge. You choose it and type the same value into the Meta app's webhook configuration. Unset, that route refuses to verify — fail closed, like `CRON_SECRET`. Only needed to receive delivery statuses; sending works without it. |
| `WHATSAPP_APP_SECRET` | Optional | `POST /api/v1/webhooks/whatsapp` | The Meta **app secret** (App Settings → Basic), which signs every webhook delivery as `X-Hub-Signature-256`. Not the access token: a deploy can hold a valid sending token and still be unable to trust a single incoming delivery. Unset, the webhook rejects every request rather than trusting a public URL — so "the provider later said this message failed" reporting is lost, and nothing else. Server-only. |
| `NODE_ENV` | Optional | Environment checks | Deployment environment. Defaults to `development`. Values: `development`, `test`, `production`. The refusal to fall back to the console OTP sender applies only when this is `production`. |

## Local (`.env.local`)

For a working development machine, copy `.env.example` to `.env.local` and fill in the required fields:

- **`DATABASE_URL`**: Point to a Supabase or Neon Postgres instance. Use the pooled connection string on port 6543 (Supabase) or the pooler URL. Required.
- **`DIRECT_DATABASE_URL`**: Point to the same database on port 5432 (the direct, unpooled connection). Set it in `.env.local` if you run migrations locally; omit it otherwise.
- **`AUTH_SECRET`**: Generate a fresh value with `openssl rand -base64 48`. Required.
- **`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`**: Leave empty. With these unset, the app boots normally and login codes are printed to the server log (visible in `npm run dev` output). Only SMS delivery fails, which is fine for local development. No boot guard exists in development.
- **`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`**: Leave empty unless you are specifically testing Google sign-in. With these unset the "Continue with Google" button simply does not render and phone sign-in is unaffected. To test it locally, create an OAuth client in Google Cloud Console with `http://localhost:3000/api/v1/auth/google/callback` as an authorised redirect URI (see `docs/deploying.md`).
- **`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`**: Leave empty. With these unset, the app boots normally and checkout reports that payment is unavailable. The code path works end to end without the keys; only money fails to move. This is deliberate: gateway KYC takes days, and a deploy must stay up while approval is pending.
- **`SHOW_SOURCE_IMAGES`**: Leave empty or set to `"0"`. Competitor imagery is fine behind a private demo link; omit it from your local setup.
- **`OPENAI_API_KEY`**: Optional. Leave empty and `/upload` still works — typing a list is priced end to end, and an attached photo or PDF reports that automatic reading is not switched on and offers the expert path instead. Set it to a real key to develop the extraction flow against live OpenAI; every call costs money, so it is off by default. CSV uploads are read locally and need no key at all.
- **`OPENAI_MODEL`**: Leave empty unless testing a different model.
- **`WHATSAPP_*`**: Leave all seven empty. With them unset in development the lifecycle still runs end to end — the console sender writes each rendered message to the `npm run dev` output, which is enough to read the copy, check the variables and follow a vendor's dispatch link. Nothing is sent and nothing costs money. To send for real locally you need a tunnel for the delivery-status webhook; see `docs/whatsapp-orders.md`.

## Vercel Preview

Preview deployments are isolated environments for testing branches before they reach production. They need:

- **`DATABASE_URL`**: The pooled connection string (port 6543, `?pgbouncer=true`).
- **`DIRECT_DATABASE_URL`**: The direct connection string (port 5432). Required for migrations run during preview deployments.
- **`AUTH_SECRET`**: A fresh value, independent of the local and production values. Generate with `openssl rand -base64 48`.
- **`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`**: Optional in preview. Leave unset if SMS delivery is not needed for testing a branch. The app boots normally and login codes print to the logs.
- **`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`**: Leave unset. A preview deployment's hostname is a fresh `*.vercel.app` subdomain on every deploy, and Google rejects any `redirect_uri` that is not pre-registered in the Cloud Console — a hostname that changes on every push cannot be registered ahead of time. Google sign-in is therefore not testable on previews; phone sign-in is unaffected.
- **`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`**: Use the `rzp_test_` key pair from the Razorpay dashboard, never production keys. Optional; omit to test checkout without taking money.
- **`SHOW_SOURCE_IMAGES`**: Leave unset unless testing that feature specifically.
- **`OPENAI_API_KEY`**: Set it if the branch touches the parcha upload flow — extraction is a request-time feature now, so an unset key on preview means uploads report themselves unavailable. Use a key with a low spend cap: a preview URL is a public endpoint that spends money per request.
- **`OPENAI_MODEL`**: Leave unset unless the branch is specifically testing a different model.

Do not share production secrets (`MSG91_AUTH_KEY`, production Razorpay `rzp_live_` keys) with preview. A compromised preview branch must not leak credentials that can harm the production deployment.

## Vercel Production

A production deployment requires the full set:

- **`DATABASE_URL`**: The pooled connection string (port 6543, `?pgbouncer=true`).
- **`DIRECT_DATABASE_URL`**: The direct connection string (port 5432). Required for any schema migrations run against the production database.
- **`AUTH_SECRET`**: A fresh value, independent of local and preview. Generate with `openssl rand -base64 48`.
- **`MSG91_AUTH_KEY`**: Required in production. Sign-in by SMS is unavailable unless this and `MSG91_TEMPLATE_ID` are both set; the app still boots and the catalogue still serves. A partial configuration is refused rather than falling back to printing login codes to the server log, which would let anyone with log access take over an account.
- **`MSG91_TEMPLATE_ID`**: Required in production. Sign-in by SMS is unavailable unless this and `MSG91_AUTH_KEY` are both set; the app still boots and the catalogue still serves. Until DLT approval is complete, sign-in cannot go live.
- **`MSG91_SENDER_ID`**: Your DLT-approved sender ID. Required for SMS delivery to actually reach customers.
- **`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`**: Optional. Set both to turn on "Continue with Google"; leave both unset to ship with phone sign-in only. There is no boot guard — an unset pair is a safe, working state, not a broken one. See `docs/deploying.md` for creating the OAuth client and registering the production redirect URI.
- **`RAZORPAY_KEY_ID`**: The `rzp_live_` key from the Razorpay dashboard. Optional; there is no boot guard on it. Unset, the storefront runs normally and checkout reports payment unavailable — a correct state whilst gateway activation is pending.
- **`RAZORPAY_KEY_SECRET`**: The corresponding `rzp_live_` secret. Optional for the same reason; the two Razorpay keys must both be set or both be unset.
- **`RAZORPAY_WEBHOOK_SECRET`**: The webhook signing secret set when you created the webhook in the Razorpay dashboard. Optional; without it, webhooks are rejected and orders stay `PENDING_PAYMENT`.
- **`SHOW_SOURCE_IMAGES`**: Leave unset. Competitor imagery is not appropriate for a public storefront.
- **`OPENAI_API_KEY`**: Required for reading uploaded parchas. Without it `/upload` still works — typing a list is priced end to end and attached files are routed to a person — but the automatic reading customers are shown is off. Use a project-scoped key with a spend limit, and rotate it from the OpenAI dashboard rather than editing it anywhere in this repository.
- **`OPENAI_MODEL`**: Leave unset to take the default. Set it if the account has no access to the default model, or to move to a newer one without a deploy.

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
