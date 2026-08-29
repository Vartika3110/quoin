/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/auth/phone";

/**
 * Grant or revoke access to the internal tools.
 *
 *   npx tsx scripts/grant-staff.ts +919876543210
 *   npx tsx scripts/grant-staff.ts +919876543210 --revoke
 *
 * Deliberately a script and not an endpoint. Staff access decides who can
 * change what the storefront sells and for how much; making it grantable
 * over HTTP means one forgotten authorisation check away from anyone
 * granting it to themselves.
 */
const db = new PrismaClient();

async function main() {
  const [rawPhone, ...flags] = process.argv.slice(2);
  if (!rawPhone) throw new Error("usage: grant-staff.ts <phone> [--revoke]");

  const phone = normalizePhone(rawPhone);
  const revoke = flags.includes("--revoke");

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error(
      `No account for ${phone}. Sign in on the storefront once to create it, then re-run this.`,
    );
  }

  await db.user.update({ where: { id: user.id }, data: { isStaff: !revoke } });
  console.info(`${phone} ${revoke ? "no longer has" : "now has"} staff access.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
