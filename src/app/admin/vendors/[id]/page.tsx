import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { VendorForm } from "@/components/admin/VendorForm";
import { VendorCostTable, type CostRow } from "@/components/admin/VendorCostTable";
import { VendorVerifyForm } from "@/components/admin/VendorVerifyForm";
import { requireStaffPage } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { getVendor, isPayable } from "@/lib/data/vendors";
import { formatPrice } from "@/lib/types/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vendor — Quoin",
  robots: { index: false, follow: false },
};

type Ctx = { params: Promise<{ id: string }> };

const WHEN = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * One vendor: who they are, whether they can be paid, and what their
 * lines cost.
 *
 * The three are on one page because they are one question. "Can we pay
 * this vendor on Monday" needs all three answered — verified details, a
 * route for the money, and a cost against every line they supply — and
 * a page per answer would make the missing one somebody else's problem.
 */
export default async function VendorPage({ params }: Ctx) {
  await requireStaffPage();
  const { id } = await params;

  const vendor = await getVendor(id);
  if (!vendor) notFound();

  const products = await db.product.findMany({
    where: { vendorId: id },
    select: {
      sku: true,
      name: true,
      variants: {
        select: { id: true, pricePaise: true, costPaise: true, isDefault: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: CostRow[] = products.flatMap((product) => {
    const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
    if (!variant) return [];
    return [
      {
        sku: product.sku,
        name: product.name,
        variantId: variant.id,
        pricePaise: variant.pricePaise,
        costPaise: variant.costPaise,
      },
    ];
  });

  const costed = rows.filter((r) => r.costPaise != null);
  const payable = isPayable(vendor);
  /* Margin across what has been costed, which is the only thing that can
     honestly be averaged: including uncosted lines as zero would make a
     half-costed vendor look like a disaster. */
  const marginPaise = costed.reduce((sum, r) => sum + (r.pricePaise - (r.costPaise ?? 0)), 0);
  const chargedPaise = costed.reduce((sum, r) => sum + r.pricePaise, 0);

  return (
    <AdminShell
      current="/admin/vendors"
      title={vendor.tradeName || vendor.legalName}
      subtitle={vendor.tradeName ? vendor.legalName : undefined}
      actions={
        <Button href="/admin/vendors" variant="outline" size="sm">
          All vendors
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={vendor.status === "ACTIVE" ? "success" : "neutral"}>
          {vendor.status === "ACTIVE" ? "Verified" : vendor.status.toLowerCase()}
        </Badge>
        {!payable && (
          <Badge tone="warning">
            {vendor.status === "ACTIVE" ? "No payment route" : "Not payable yet"}
          </Badge>
        )}
        {rows.length > 0 && costed.length < rows.length && (
          <Badge tone="warning">
            {rows.length - costed.length} of {rows.length} lines have no cost
          </Badge>
        )}
        {vendor.verifiedAt && (
          <span className="text-caption text-muted">
            Checked {WHEN.format(vendor.verifiedAt)}
            {vendor.verificationNote ? ` — ${vendor.verificationNote}` : ""}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="What they supply"
              subtitle={
                costed.length > 0
                  ? `${costed.length} of ${rows.length} costed · ${formatPrice(marginPaise)} margin on ${formatPrice(chargedPaise)} of goods`
                  : "Nothing costed yet — a statement needs a cost against every line."
              }
            />
            <VendorCostTable vendorId={vendor.id} rows={rows} />
          </Card>

          <Card>
            <CardHeader title="Details" />
            <VendorForm
              vendorId={vendor.id}
              initial={{
                legalName: vendor.legalName,
                tradeName: vendor.tradeName,
                gstin: vendor.gstin ?? "",
                pan: vendor.pan ?? "",
                phone: vendor.phone,
                email: vendor.email ?? "",
                addressLine: vendor.addressLine,
                city: vendor.city,
                state: vendor.state,
                pincode: vendor.pincode,
                bankAccountName: vendor.bankAccountName,
                bankAccountNumber: vendor.bankAccountNumber,
                bankIfsc: vendor.bankIfsc,
                upiVpa: vendor.upiVpa,
                paymentTermsDays: vendor.paymentTermsDays,
                notes: vendor.notes,
              }}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card tone="sunk">
            <CardHeader
              title="Verification"
              subtitle="The only way a vendor becomes payable."
            />
            <VendorVerifyForm vendorId={vendor.id} status={vendor.status} />
          </Card>

          <Card>
            <CardHeader title="Paying them" />
            <dl className="space-y-1.5 text-body-sm">
              <Row label="Terms" value={`Every ${vendor.paymentTermsDays} days`} />
              <Row
                label="Account"
                value={
                  vendor.bankAccountNumber
                    ? `${vendor.bankAccountNumber} · ${vendor.bankIfsc}`
                    : "—"
                }
              />
              <Row label="UPI" value={vendor.upiVpa || "—"} />
              <Row label="GSTIN" value={vendor.gstin ?? "Unregistered"} />
              <Row label="PAN" value={vendor.pan ?? "—"} />
            </dl>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="nums min-w-0 truncate text-right text-ink">{value}</dd>
    </div>
  );
}
