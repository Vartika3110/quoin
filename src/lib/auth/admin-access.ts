import { raise } from "@/lib/alerts";
import { env } from "@/lib/env";
import { maskPhone, normalizePhone } from "@/lib/auth/phone";

/**
 * Who is allowed to reach the internal tools, and who decides.
 *
 * `User.isStaff` used to be the whole answer: one boolean, set by a
 * script, trusted by every gate. That made admin access a property of a
 * *database row*, which is the wrong place for it to live. Anything that
 * can write that row — a stray script, a restored backup, a leaked
 * `DATABASE_URL`, a sign-in flow that claims a pre-existing account by
 * phone match (`resolveSupabaseUser`, case 2) — could hand someone the
 * tools that decide what the storefront sells and for how much.
 *
 * It was not hypothetical. The first row in this database was a test
 * account created locally with the placeholder number every comment in
 * this repo uses, `+91 98765 43210`, and it carried `isStaff = true` for
 * two months. Nobody granted it on purpose. The day phone sign-in goes
 * live, whoever actually holds that number verifies it, case 2 claims
 * the row, and they are an administrator.
 *
 * So the decision is now made **outside** the database, in one list:
 *
 *   ADMIN_ALLOWLIST   the identities — phone numbers, email addresses —
 *                     that may administer. Nobody is exempt and nobody
 *                     is hard-coded: an account reaches `/admin` only if
 *                     it is named here *and* carries `isStaff`.
 *
 * Two conditions, held in two systems, on purpose. The flag is how
 * access is given and taken day to day, from a laptop with
 * `DATABASE_URL`; the list is the approval, and only whoever can sign in
 * to Vercel can edit it. Nothing reachable from a Postgres connection
 * can put a name on it.
 *
 * **The empty list admits nobody.** There is no owner constant and no
 * last-resort account: with the variable unset, `/admin` 404s for
 * everyone, including whoever deployed it. That is the deliberate shape
 * of it — one place to look, no identity buried in the source, no
 * exception that outlives the person it was written for — and it means
 * the variable has to be set in the Vercel project settings, and in
 * `.env.local` for the console to work on a development machine.
 * `approvedAdminIdentities` says so in the log when it finds nothing.
 *
 * Read by `requireStaffPage` (pages), `requireStaff` (routes) and
 * `scripts/grant-staff.ts`, which refuses to grant to an identity this
 * module would not admit.
 */

/** The shape every gate already has to hand. */
export interface AdminCandidate {
  phone: string | null;
  email: string | null;
  isStaff: boolean;
}

/**
 * One identity, in the one form this module compares.
 *
 * An `@` means an email and nothing else — `normalizePhone` would reject
 * it, and treating "not a valid mobile number" as "not approved" is a
 * confusing way to learn that the wrong column was read. Everything else
 * goes through the app's own phone normaliser, so `9876543210`,
 * `+91 98765 43210` and `09876543210` are one entry rather than three,
 * exactly as they are one customer.
 *
 * Returns `null` for anything that is neither, which is how a typo in
 * the environment ends up ignored rather than fatal.
 */
export function normalizeIdentity(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.includes("@")) return value.toLowerCase();
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

/**
 * Every identity an account can be recognised by, normalised.
 *
 * Both columns, because the app has two ways in: a WhatsApp sign-in
 * arrives as a phone and a Google sign-in as an email, and the same
 * person reaches the console either way. A Google account carries no
 * phone at all until checkout collects one, so an allowlist that only
 * matched numbers would refuse the browser they used Google on.
 */
export function identitiesOf(user: {
  phone: string | null;
  email: string | null;
}): string[] {
  const out: string[] = [];
  for (const raw of [user.phone, user.email]) {
    if (!raw) continue;
    const id = normalizeIdentity(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Parses `ADMIN_ALLOWLIST`.
 *
 * Commas, spaces, semicolons and newlines all separate, because this
 * value gets pasted into a Vercel text box by a human and the shape it
 * arrives in should not matter.
 *
 * **Malformed entries are dropped, not thrown on.** An entry that is
 * neither a valid Indian mobile number nor an email address means one
 * person cannot reach `/admin` until it is fixed; a throw here means a
 * `ZodError` at boot and a storefront that serves nobody. The whole
 * reasoning is recorded on `SHOW_SOURCE_IMAGES` in `src/lib/env.ts`: an
 * optional setting must never be able to take the site down. The count
 * is logged so a typo is discoverable rather than silent.
 */
export function parseAdminAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const approved: string[] = [];
  let ignored = 0;

  for (const entry of raw.split(/[\s,;]+/)) {
    if (!entry) continue;
    const id = normalizeIdentity(entry);
    if (!id) {
      ignored += 1;
      continue;
    }
    if (!approved.includes(id)) approved.push(id);
  }

  if (ignored > 0) {
    /* Deliberately without the entries themselves. A log line is the
       wrong place for a phone number — `maskPhone` exists for that
       reason — and the person who typed the value is the only person who
       needs to find the typo in it. */
    console.warn(
      `[admin] ADMIN_ALLOWLIST: ignored ${ignored} entr${ignored === 1 ? "y" : "ies"} that are neither an Indian mobile number nor an email address`,
    );
  }

  return approved;
}

/* Parsed once. `env` already snapshots `process.env` at first import, so
   re-parsing per request would buy no freshness — a change to the
   variable is a new deployment either way. */
let approvedCache: readonly string[] | null = null;

/**
 * The approved identities, from the environment.
 *
 * Says so, once, when there are none. An empty list is a legitimate
 * state — it is what a deploy looks like before anybody has been
 * approved — but it is indistinguishable at the gate from a variable
 * that was forgotten, and the symptom either way is `/admin` answering
 * 404 to the person who built it. One log line turns ten minutes of
 * "why am I locked out of my own admin" into a glance.
 */
export function approvedAdminIdentities(): readonly string[] {
  if (approvedCache === null) {
    approvedCache = parseAdminAllowlist(env.ADMIN_ALLOWLIST);
    if (approvedCache.length === 0) {
      console.warn(
        "[admin] ADMIN_ALLOWLIST is empty — /admin answers 404 for everyone, including you. Add your own phone number or email address to it.",
      );
    }
  }
  return approvedCache;
}

/** Only for tests, which need more than one allowlist per process. */
export function resetApprovedAdminIdentities(): void {
  approvedCache = null;
}

/** Whether this identity has been approved to administer, flag aside. */
export function isApprovedAdmin(
  user: { phone: string | null; email: string | null },
  approved: readonly string[] = approvedAdminIdentities(),
): boolean {
  return identitiesOf(user).some((id) => approved.includes(id));
}

/**
 * The one question every gate asks.
 *
 * The flag **and** the approval, both, for everybody — there is no
 * identity in this file that bypasses either half. Note the order:
 * `isStaff` is checked first, so an account that was approved once and
 * has since had its access revoked is refused without the allowlist
 * needing to be edited. Day-to-day revocation stays a one-line script;
 * approval stays a deploy.
 */
export function canAccessAdmin(
  user: AdminCandidate,
  approved: readonly string[] = approvedAdminIdentities(),
): boolean {
  if (!user.isStaff) return false;
  return isApprovedAdmin(user, approved);
}

/**
 * Why an account would be refused, in words, for the grant script.
 *
 * `null` when it would be admitted. Never shown to the person being
 * refused — a gate that explains itself to a stranger explains that an
 * internal tool lives at this URL, which is the disclosure `notFound()`
 * exists to avoid.
 */
export function adminAccessRefusal(
  user: AdminCandidate,
  approved: readonly string[] = approvedAdminIdentities(),
): string | null {
  if (canAccessAdmin(user, approved)) return null;

  const identities = identitiesOf(user);
  if (identities.length === 0) {
    return "That account has neither a phone number nor an email address, so there is nothing to approve it by.";
  }

  return [
    `${identities.join(" / ")} is not an approved administrator.`,
    "",
    "Staff access is granted in two places on purpose, so that nothing with database access alone can take over the tools:",
    "",
    "  1. Add the identity to ADMIN_ALLOWLIST in the Vercel project settings (and in .env.local to test it here), alongside anything already there:",
    `       ADMIN_ALLOWLIST="${[...approved, identities[0]].join(",")}"`,
    "  2. Re-run this script to set the flag on the row.",
    "",
    "Only step 2 is a database change, and on its own it grants nothing.",
  ].join("\n");
}

/** First character and domain. Enough to recognise, not enough to be a mailing list. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Tells somebody that a staff flag was refused.
 *
 * Only when the row actually carries `isStaff`, which is the whole point
 * of the signal: a signed-in customer who types `/admin` out of
 * curiosity is noise, but a row that *has* been given the flag and is
 * not on the allowlist is either an approval that was never finished —
 * including the one case that matters most, your own account on a deploy
 * where the variable never got set — or an account that acquired the
 * flag without a decision. Both are worth hearing about on the day they
 * happen rather than at the next audit.
 *
 * Masked, because this leaves the building: `ALERT_WEBHOOK_URL` is a
 * Slack or Discord endpoint, and an alert is not a reason to post a
 * customer's phone number into a chat room.
 */
export function reportRefusedAdmin(user: AdminCandidate, where: string): void {
  if (!user.isStaff) return;

  raise({
    kind: "admin_access_refused",
    summary: `A staff-flagged account that is not on ADMIN_ALLOWLIST was refused ${where}`,
    detail: {
      phone: user.phone ? maskPhone(user.phone) : null,
      email: user.email ? maskEmail(user.email) : null,
      at: where,
    },
  });
}
