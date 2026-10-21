import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Partners } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { listVendors } from "@/lib/data/vendors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vendors — Quoin",
  robots: { index: false, follow: false },
};

const STATUS_TONE = {
  DRAFT: "neutral",
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "neutral",
} as const;

const STATUS_LABEL = {
  DRAFT: "Draft",
  PENDING: "Needs a look",
  ACTIVE: "Verified",
  SUSPENDED: "Suspended",
} as const;

/**
 * The vendor list.
 *
 * Two numbers beside each name, and they are the two that decide
 * whether this vendor can ever appear on a payout statement: how many
 * products they supply, and how many of those nobody has costed. A
 * vendor with forty lines and forty uncosted ones is a vendor Quoin
 * cannot pay, however verified their bank details are, and the list
 * says so rather than leaving it to be discovered on a Monday.
 */
export default async function VendorsPage() {
  await requireStaffPage();
  const vendors = await listVendors();

  const payable = vendors.filter((v) => v.payable).length;
  const uncosted = vendors.reduce((sum, v) => sum + v.uncostedCount, 0);

  return (
    <AdminShell
      current="/admin/vendors"
      title="Vendors"
      subtitle="Who Quoin buys from, and whether they can be paid."
      actions={
        <Button href="/admin/vendors/new" size="sm">
          Add a vendor
        </Button>
      }
    >
      {vendors.length === 0 ? (
        <EmptyState
          icon={<Partners className="size-6" />}
          title="No vendors yet."
          action={{ href: "/admin/vendors/new", label: "Add the first one" }}
        >
          A vendor is who Quoin hands money to — not the brand on the box. One
          vendor usually supplies several brands.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-body-sm text-muted">
            {vendors.length} {vendors.length === 1 ? "vendor" : "vendors"} ·{" "}
            {payable} ready to pay
            {uncosted > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="text-warning">
                  {uncosted} supplied {uncosted === 1 ? "line has" : "lines have"} no
                  cost
                </span>
              </>
            )}
          </p>

          <div className="space-y-2">
            {vendors.map((vendor) => (
              <Card key={vendor.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/vendors/${vendor.id}`}
                    className="text-body font-semibold text-ink hover:text-accent"
                  >
                    {vendor.tradeName || vendor.legalName}
                  </Link>
                  {vendor.tradeName && (
                    <p className="text-caption text-muted">{vendor.legalName}</p>
                  )}
                  <p className="nums mt-1 text-caption text-muted">
                    {vendor.gstin ?? "No GSTIN"} · {vendor.phone}
                  </p>
                  <p className="mt-1 text-caption text-muted">
                    {vendor.productCount}{" "}
                    {vendor.productCount === 1 ? "product" : "products"}
                    {vendor.uncostedCount > 0 && (
                      <span className="text-warning">
                        {" "}
                        · {vendor.uncostedCount} without a cost
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={STATUS_TONE[vendor.status]} size="sm">
                    {STATUS_LABEL[vendor.status]}
                  </Badge>
                  {/* Verified and payable are different facts: a vendor
                      can be checked and still have nowhere to send
                      money. The list shows the second one because it is
                      the one that stops a payout. */}
                  {!vendor.payable && vendor.status === "ACTIVE" && (
                    <span className="text-micro text-danger">No payment route</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </AdminShell>
  );
}
