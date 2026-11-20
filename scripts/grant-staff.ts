/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/auth/phone";
import {
  adminAccessRefusal,
  approvedAdminIdentities,
  isApprovedAdmin,
} from "../src/lib/auth/admin-access";

/**
 * Grant or revoke access to the internal tools, and list who has it.
 *
 *   npx tsx scripts/grant-staff.ts --list
 *   npx tsx scripts/grant-staff.ts +919876543210
 *   npx tsx scripts/grant-staff.ts someone@quoin.co.in
 *   npx tsx scripts/grant-staff.ts +919876543210 --revoke
 *
 * Deliberately a script and not an endpoint. Staff access decides who can
 * change what the storefront sells and for how much; making it grantable
 * over HTTP means one forgotten authorisation check away from anyone
 * granting it to themselves.
 *
 * **A phone or an email, because the app has two ways in.** A
 * phone-verified account is matched on `User.phone` and a Google account
 * has no phone at all until checkout collects one — so an account created
 * by signing in with Google can only be found by its email. An argument
 * containing `@` is treated as an email and nothing else: `normalizePhone`
 * would reject it, and the resulting "not a valid mobile number" is a
 * confusing way to learn that the wrong column was searched.
 *
 * Either way the account has to exist first. Nothing here creates one:
 * the row is made by signing in, which is also what proves the person
 * controls that number or that inbox.
 *
 * **This script no longer decides who is an administrator.** It sets
 * `User.isStaff`, which is one of the two things access needs; the other
 * is the identity being the owner's or appearing in `ADMIN_ALLOWLIST`,
 * which lives in the environment precisely so that database access alone
 * cannot grant it (`src/lib/auth/admin-access.ts`). So this refuses to
 * set the flag on an account that would be refused at the gate anyway,
 * rather than leaving a flag lying around that looks like access and is
 * not. Revoking is never refused.
 *
 * It reads the *local* `.env.local`. That is the right file to test
 * against and the wrong one to trust: what the deployed site admits is
 * whatever `ADMIN_ALLOWLIST` says in the Vercel project settings, so
 * `--list` prints the list it is reading and says so.
 */
const db = new PrismaClient();

/** Phone, name, email — whatever the account actually has. */
function describe(user: {
  phone: string | null;
  email: string | null;
  name: string | null;
}): string {
  const identity = user.phone ?? user.email ?? "(no phone or email)";
  return user.name ? `${identity} — ${user.name}` : identity;
}

async function list() {
  const staff = await db.user.findMany({
    where: { isStaff: true },
    orderBy: { createdAt: "asc" },
    select: { phone: true, email: true, name: true, createdAt: true },
  });

  if (staff.length === 0) {
    console.info(
      "No account has staff access. /admin returns 404 for everyone, including you.",
    );
    return;
  }

  console.info(`${staff.length} account(s) with the staff flag:`);
  for (const user of staff) {
    /* The flag is not the answer any more, so saying only that it is set
       would be the one thing this listing must not do. */
    const mark = isApprovedAdmin(user)
      ? "approved in ADMIN_ALLOWLIST"
      : "NOT APPROVED — this flag grants nothing";
    console.info(`  ${describe(user)}  [${mark}]`);
  }
}

/** What this machine's environment approves, which is not what Vercel's does. */
function reportAllowlist() {
  const approved = approvedAdminIdentities();
  console.info("");
  console.info(
    approved.length === 0
      ? "ADMIN_ALLOWLIST (this machine's .env.local): EMPTY — /admin answers 404 for everyone, including you"
      : `ADMIN_ALLOWLIST (this machine's .env.local): ${approved.join(", ")}`,
  );
  console.info(
    "The deployed site uses the copy in the Vercel project settings, which this cannot see.",
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    await list();
    reportAllowlist();
    return;
  }

  const [identifier, ...flags] = args;
  if (!identifier) {
    throw new Error("usage: grant-staff.ts <phone|email> [--revoke] | --list");
  }

  const revoke = flags.includes("--revoke");

  const where = identifier.includes("@")
    ? { email: identifier.trim().toLowerCase() }
    : { phone: normalizePhone(identifier) };
  const shown = "email" in where ? where.email : where.phone;

  const user = await db.user.findUnique({
    where,
    select: { id: true, phone: true, email: true, name: true },
  });
  if (!user) {
    throw new Error(
      `No account for ${shown}. Sign in on the storefront once to create it, then re-run this.` +
        (identifier.includes("@")
          ? ""
          : " If you signed in with Google, pass your email address instead — a Google account has no phone number on it."),
    );
  }

  /* Refuse before writing, not after: a flag set on an identity the gate
     will not admit is worse than no flag at all, because the listing
     above and the badge on the account screen would both suggest an
     access that does not exist. Only on the way *in* — taking access
     away must never be blocked by a configuration problem. */
  if (!revoke) {
    const refusal = adminAccessRefusal({ ...user, isStaff: true });
    if (refusal) throw new Error(refusal);
  }

  await db.user.update({ where: { id: user.id }, data: { isStaff: !revoke } });
  console.info(
    `${describe(user)} ${revoke ? "no longer has" : "now has"} staff access.`,
  );

  if (!revoke) {
    console.info(
      "Reachable on the deployed site only if ADMIN_ALLOWLIST in the Vercel project settings lists this identity too.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
