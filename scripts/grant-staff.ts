/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/auth/phone";

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

  console.info(`${staff.length} account(s) with staff access:`);
  for (const user of staff) console.info(`  ${describe(user)}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    await list();
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

  await db.user.update({ where: { id: user.id }, data: { isStaff: !revoke } });
  console.info(
    `${describe(user)} ${revoke ? "no longer has" : "now has"} staff access.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
