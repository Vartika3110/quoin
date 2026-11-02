# Phone sign-in over WhatsApp

Everything described here is already built and merged. Phone sign-in is
off because the credentials are not set, not because anything is
missing. This is the configuration, in the order it has to happen, and
the traps that cost time.

## Why WhatsApp and not SMS

An SMS to an Indian handset needs a DLT-registered header and template
under TRAI's TCCCPR, registered by the business whose brand the message
carries. That approval wants the incorporation certificate, the company
PAN and the GSTIN, and takes days. WhatsApp is not SMS, TCCCPR does not
reach it, and nothing in this path touches an Indian telecom operator.

It is not approval-free — Meta verifies the business and approves the
template — but that queue is usually shorter, and for a contractor
buying cement a WhatsApp is a more natural thing to receive.

## Who does what

**Supabase Auth generates the code, stores it, checks it, expires it and
counts the attempts.** Everything that makes it an auth system.

**This app only carries the code to the handset.** Supabase cannot send
WhatsApp, so it calls `POST /api/v1/auth/supabase/send-otp` — its "Send
SMS Hook", which despite the name sends no SMS. Nothing in this app
decides whether a code is valid.

- Delivery: `src/lib/auth/whatsapp.ts`
- The hook: `src/app/api/v1/auth/supabase/send-otp/route.ts`
- Signature check: `src/lib/auth/sms-hook.ts`
- Whether sign-in is offered: `isPhoneSignInAvailable()` in
  `src/lib/auth/supabase.ts`

## 1. Meta — the long pole

Meta Business Manager → WhatsApp → API Setup.

1. Complete business verification.
2. Add and verify a sender number. It **cannot** be a number already
   registered on the consumer WhatsApp app.
3. Collect the **Phone number ID**.
4. Create the access token — see the trap below.
5. Submit an **Authentication** template and wait for approval.

### Trap 1 — the API Setup token expires in 24 hours

The token on the setup page is temporary. Sign-in will work for a day
and then stop. Create a **System User** in Business Settings, give it
the `whatsapp_business_messaging` permission, and generate a token with
no expiry.

### Trap 2 — the template needs a copy-code button

`CloudApiSender.send` posts the code twice: once as the body parameter
and once as the URL button parameter at index 0. Meta rejects the
message if a template has no such button, and rejects it again if the
two values disagree. The template must be category **Authentication**
with a copy-code button — which is also what makes the code tappable
rather than something the customer retypes from a notification, and most
of the reason to prefer WhatsApp over SMS here.

### Trap 3 — the language code must match exactly

`WHATSAPP_OTP_LANGUAGE` defaults to `en`. A template registered as
`en_US` needs that variable set to `en_US`. A mismatch fails at Meta
with an error that reads like a credentials problem.

## 2. Supabase

Enable phone sign-in, then Authentication → Hooks → Send SMS, pointed at

```
https://quoin.co.in/api/v1/auth/supabase/send-otp
```

Copy the signing secret. Paste it however the dashboard formats it —
`decodeHookSecret` strips `v1,` and `whsec_` prefixes.

## 3. Vercel (Production), then redeploy

| Variable | Notes |
| :-- | :-- |
| `SUPABASE_URL` | Also needed at build time for the image optimiser's allow-list |
| `SUPABASE_ANON_KEY` | |
| `SUPABASE_SMS_HOOK_SECRET` | From the hook, above |
| `WHATSAPP_PHONE_NUMBER_ID` | |
| `WHATSAPP_ACCESS_TOKEN` | The System User token, not the setup one |
| `WHATSAPP_OTP_TEMPLATE` | The template's **name**, not its text |
| `WHATSAPP_OTP_LANGUAGE` | Only if the template is not `en` |

All of them are required together:
`isPhoneSignInAvailable() = isSupabaseAuthConfigured() && isWhatsAppOtpConfigured()`.
With any one missing the sign-in page hides phone entirely and offers
only Google. That is the gate working, and a correct state rather than a
dangerous one — the same pattern the Razorpay gate uses.

The hook refuses every caller when `SUPABASE_SMS_HOOK_SECRET` is unset.
It messages an arbitrary number on request, so "send anyway" would be an
open relay billed to the WhatsApp account.

## 4. Verify

`https://quoin.co.in/api/v1/health` is public and reports presence —
never values — of each variable above. All present means the gate will
open.

That endpoint exists because an earlier version of it reported five
variables while naming none of the four that were actually misconfigured
in production, and read `ok: true` through three weeks of failing
payments. It is worth actually looking at.

Then sign in with a real number, end to end. If the hook is reached but
delivery fails you get a 502 and a masked-number line in the Vercel
logs. The code itself is never logged — `ConsoleSender` exists for local
development and `getWhatsAppSender()` refuses to return it in
production, because a login code in a log anyone with dashboard access
can read is account takeover.

## Local development

With no WhatsApp credentials, `getWhatsAppSender()` returns
`ConsoleSender`, which prints the code and a masked number to the server
log. That is enough to sign in locally without any Meta setup. It cannot
become the active sender on a deployed instance.
