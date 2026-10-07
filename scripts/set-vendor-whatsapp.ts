/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/auth/phone";

/**
 * Give a store the WhatsApp number its new-order messages go to.
 *
 *   npx tsx scripts/set-vendor-whatsapp.ts --list
 *   npx tsx scripts/set-vendor-whatsapp.ts GKP-01 +919876543210 "Ramesh"
 *   npx tsx scripts/set-vendor-whatsapp.ts GKP-01 --clear
 *
 * A store is this app's only idea of a vendor — it is what holds the stock
 * an order line reserved, and what `OrderLine.storeId` freezes — so
 * "notify the vendor" means "notify this store", and this is what makes
 * one reachable.
 *
 * Deliberately a script rather than an admin screen, for now. There is no
 * stores section in the internal tools at all: stores are created by
 * seeding and changed about once a year, and adding a whole CRUD surface
 * for two columns would be more code to maintain than the thing it
 * configures. The number is validated through the same `normalizePhone`
 * every customer number goes through, so a typo is refused here rather
 * than discovered as a failed notification three orders later.
 *
 * Changing a number does **not** rewrite history: `OrderFulfilment`
 * snapshots the number each order's vendor message was addressed to, so
 * past orders keep saying who was actually messaged. A *retry* from the
 * admin page does read the live number — which is the whole point of
 * running this when a vendor message failed for want of one.
 */
const db = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--list")) {
    const stores = await db.store.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, whatsappPhone: true, contactName: true, isActive: true },
    });
    if (stores.length === 0) {
      console.info("No stores. Run `npm run db:seed` first.");
      return;
    }
    for (const store of stores) {
      console.info(
        [
          store.code.padEnd(10),
          store.name.padEnd(28),
          (store.whatsappPhone ?? "— no WhatsApp number").padEnd(22),
          store.contactName ?? "",
          store.isActive ? "" : "(inactive)",
        ]
          .join(" ")
          .trimEnd(),
      );
    }
    return;
  }

  const [code, rawPhone, contactName] = args;
  if (!code || !rawPhone) {
    throw new Error(
      'usage: set-vendor-whatsapp.ts <store code> <phone|--clear> [contact name]\n' +
        "       set-vendor-whatsapp.ts --list",
    );
  }

  const store = await db.store.findUnique({ where: { code }, select: { id: true, name: true } });
  if (!store) throw new Error(`No store with code ${code}. Run with --list to see them.`);

  if (rawPhone === "--clear") {
    await db.store.update({
      where: { id: store.id },
      data: { whatsappPhone: null },
    });
    console.info(`${store.name} will no longer receive WhatsApp order notifications.`);
    return;
  }

  const whatsappPhone = normalizePhone(rawPhone);
  await db.store.update({
    where: { id: store.id },
    data: { whatsappPhone, ...(contactName ? { contactName } : {}) },
  });
  console.info(`${store.name} will now receive new-order WhatsApp messages on ${whatsappPhone}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
