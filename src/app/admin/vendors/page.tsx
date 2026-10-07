import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { VendorDirectory } from "@/components/admin/VendorDirectory";
import { requireStaffPage } from "@/lib/auth/staff";
import { listUnclaimedServiceAreas, listVendors } from "@/lib/data/admin-vendors";
import { isWhatsAppConfigured } from "@/lib/whatsapp/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vendors — Quoin",
  robots: { index: false, follow: false },
};

/**
 * Vendors — the stores that hold the stock, send the goods, and receive
 * the new-order WhatsApp.
 *
 * A vendor is a `Store`, and deliberately not a second table: what an
 * order line reserved stock from and what gets told to pick it are the
 * same shop. This page is where a number gets filled in after the order
 * page says a vendor notification failed for want of one, and where a new
 * store is added without opening a terminal.
 *
 * `isWhatsAppConfigured()` is read here, on the server, and passed down as
 * a boolean. The component must never import that module — it reads
 * `src/lib/env.ts`, which throws if it is bundled into the client, and
 * the whole point of that is that an access token cannot reach a browser.
 */
export default async function AdminVendorsPage() {
  await requireStaffPage();

  const [vendors, unclaimedAreas] = await Promise.all([
    listVendors(),
    listUnclaimedServiceAreas(),
  ]);

  const live = vendors.filter((vendor) => vendor.isActive).length;

  return (
    <AdminShell
      current="/admin/vendors"
      title="Vendors"
      subtitle={`${vendors.length} store${vendors.length === 1 ? "" : "s"}, ${live} live. These are who new-order WhatsApps go to.`}
      actions={
        <Button href="/admin/inventory" variant="outline" size="sm">
          Inventory
        </Button>
      }
    >
      <VendorDirectory
        vendors={vendors}
        unclaimedAreas={unclaimedAreas}
        whatsappConfigured={isWhatsAppConfigured()}
      />

      <p className="mt-8 text-caption text-muted">
        A vendor added here is not in <code>prisma/seed.ts</code>, and that script switches off
        every store whose code it does not know — so running <code>npm run db:seed</code> against
        this database will switch a hand-added vendor off again. Add it to <code>STORES</code>{" "}
        there once it is real.
      </p>
    </AdminShell>
  );
}
