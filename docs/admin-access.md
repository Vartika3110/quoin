# Who may administer, and where

Two locks on the internal tools, neither of which is a value in the
database. `src/lib/auth/admin-access.ts` decides **who**;
`src/lib/auth/admin-host.ts` decides **where**. They are independent: the
gate still runs on the admin host, and the admin host still refuses
`/admin` on the storefront name even for the owner.

## Why

`User.isStaff` used to be the whole answer — one boolean, set by a
script, trusted by every gate. That made administration a property of a
database row, and a row can be written by things nobody approved:

- a script run against the live database from a laptop,
- a restored backup,
- a leaked `DATABASE_URL`,
- `resolveSupabaseUser` case 2, which deliberately claims a pre-existing
  account whose phone matches a number Supabase has just verified. That
  is correct for a customer who signed up before the migration. It also
  means that whoever holds a number sitting on a staff row inherits it.

The first user row ever written to this database was created locally,
during development of sign-in, with the placeholder number every comment
in this repository uses as an example — `+91 98765 43210`. It was given
the flag four days later so somebody could look at `/admin`, and it kept
it for two months: no name, no email, no orders. The day WhatsApp sign-in
goes live, whoever actually holds that number verifies it, case 2 claims
the row, and they are an administrator. It was deleted on 2026-11-20, and
`tests/admin-access.test.mts` keeps it as a case.

So the flag is now **necessary and not sufficient**, and the other half
lives where a Postgres connection cannot reach it: one environment
variable, with every administrator on it and no one exempt.

## The rule

```
canAccessAdmin(user):
  user.isStaff && on ADMIN_ALLOWLIST  -> yes
  anything else                       -> 404
```

Both halves, for everybody. **There is no owner constant and no
last-resort account anywhere in the source** — no identity is written
into the code, so there is one place to look and no exception that
outlives the person it was written for.

The consequence is worth stating plainly: **an empty `ADMIN_ALLOWLIST`
admits nobody**, including whoever deployed the site. Set it, with your
own phone number and email address in it, in the Vercel project settings
and in `.env.local`. When it is empty, `approvedAdminIdentities` says so
in the log and `npm run admin:grant --list` says so on the terminal,
because the symptom on its own — `/admin` answering 404 to the person who
built it — looks like a bug rather than a setting.

- **Two identities per person, deliberately.** A WhatsApp sign-in arrives
  as a phone and a Google sign-in as an email, and the same person
  reaches the console either way. A Google account carries no phone at
  all until checkout collects one, so listing only numbers would refuse
  the browser they used Google on. Either identity on the list admits
  the account; listing both is the robust thing to do for yourself.
- **The flag can still be taken away in one line**, and that is why it is
  checked before the list: `npm run admin:grant <identity> --revoke`
  removes access immediately, without anybody editing the environment or
  waiting for a deploy. Day-to-day revocation is a database write;
  approval is an environment change. That asymmetry is the design.

### Adding an administrator

Two steps, in two systems, on purpose.

1. Add their phone number or email address to `ADMIN_ALLOWLIST` in the
   Vercel project settings, alongside anything already there — your own
   entry included, since removing yourself from that list removes your
   own access — and redeploy. Add it to `.env.local` as well to work on
   the console locally.
2. `npm run admin:grant +919999988888` (or their email address, which is
   the only way to find an account created with Google — it has no phone
   until checkout collects one).

Step 2 refuses outright if step 1 has not happened, and prints the line
to paste. The account has to exist first; signing in once creates it, and
signing in is also what proves the person controls that number or inbox.

`npm run admin:grant --list` shows every row carrying the flag and
whether it actually grants anything, plus the allowlist it is reading.
Note that it reads **your laptop's** `.env.local`; what the deployed site
admits is the copy in Vercel.

### When somebody is refused

A refusal at the gate raises an `admin_access_refused` alert
(`ALERT_WEBHOOK_URL`, else the server log) — but only when the row
actually carries the flag. A signed-in customer typing `/admin` is noise;
a flagged row that the allowlist does not approve is either an approval
nobody finished — including the case that will bite first, *your own
account on a deploy where the variable never got set* — or an account
that acquired the flag without a decision.
The alert carries a masked phone and email, because it is posted into a
chat room.

## Where: the host split

`ADMIN_HOST` moves the console to its own name. Unset, nothing happens
and both live on one origin, as they always have.

| Request | Result |
| --- | --- |
| `/` on the admin host | 307 to `/admin`, or to `/signin?next=/admin` when no session cookie is present — typing the admin hostname means "take me to the console" |
| `/admin/*`, `/api/v1/admin/*` on the admin host | served |
| `/signin`, `/robots.txt`, `/_vercel/*` on the admin host | served — the session cookie is host-only, so signing in has to be possible there |
| any other storefront path on the admin host | 307 to `SITE_URL` (404 if that is unset) |
| `/admin/*`, `/api/v1/admin/*` on the storefront | 404, never a redirect — a redirect would tell every scanner walking the public domain where the console went |
| an unrecognised host | treated as the storefront: unknown means less access, never more |

A `/admin` URL that exists on the public storefront is a URL the whole
internet rattles, and an XSS on a product page is a same-origin problem
with the console only while they share an origin. Hence the split.

Enforced in three places, deliberately overlapping:

- `src/proxy.ts` for pages, which is also what sets
  `X-Robots-Tag: noindex` on every response from the admin host;
- the `handler` wrapper in `src/lib/http.ts` for `/api/v1/admin/*`,
  because the proxy's matcher excludes `/api`. Only that tree:
  `requireStaff` also guards `/api/v1/consultations` and
  `/api/v1/parcha/submissions`, which customers call on the public host;
- `requireStaffPage`, one layer in, so the guard that must not be
  bypassed does not depend on a matcher regex.

The decision itself is `hostVerdict`, a pure function, tested
exhaustively in `tests/admin-host.test.mts`.

### Setting it up

1. Attach `admin.<domain>` to the **same** Vercel project. One
   deployment answering two names — not a second app, not a second
   build.
2. Set `ADMIN_HOST=admin.<domain>` on the project and redeploy.
3. Make sure `SITE_URL` names the storefront, or storefront paths on the
   admin host 404 instead of redirecting home.
4. If Google sign-in is to work on the console, add
   `https://admin.<domain>/api/v1/auth/google/callback` to the authorised
   redirect URIs of the OAuth client. Phone sign-in needs nothing extra.
5. Sign in again on the admin host. The session cookie does not travel
   between hostnames; this is a feature, not a bug — a session minted on
   the storefront has no business carrying into the console.

Leave `ADMIN_HOST` unset locally. `npm run dev` serves one origin, and the
split is relaxed on localhost (and only outside production) for that
reason.
