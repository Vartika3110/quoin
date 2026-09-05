import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { PricingRow } from "@/components/admin/PricingRow";
import { requireStaffPage } from "@/lib/auth/staff";
import { listUnpricedProducts } from "@/lib/data/catalog";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — Quoin",
  /* An internal tool has no business in a search index. */
  robots: { index: false, follow: false },
};

/**
 * Prices the products a catalogue import could not.
 *
 * A manufacturer catalogue gives a name, a code and a photograph; the
 * price is the one thing only a merchandiser can decide, so those rows
 * arrive without a variant and stay out of the storefront. This is where
 * they get one.
 *
 * Staff only, and a non-staff visitor gets the 404 rather than a refusal
 * — telling someone an internal tool lives at this URL is free
 * reconnaissance, and they cannot use it either way.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const page = Number(one((await searchParams).page)) || 1;
  const { items, total, totalPages } = await listUnpricedProducts(page);

  return (
    <AdminShell
      current="/admin/pricing"
      title="Products awaiting a price"
      subtitle={
        total === 0
          ? "Nothing is waiting. Every imported product has a price."
          : `${total} product${total === 1 ? "" : "s"} imported with a photograph and a
             description but no price. They are hidden from the storefront until
             one is set.`
      }
    >
      {items.length > 0 && (
        <>
          <ul className="mt-6 space-y-2">
            {items.map((p) => (
              <PricingRow key={p.id} product={p} />
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-4 text-xs">
              {page > 1 ? (
                <Link href={`/admin/pricing?page=${page - 1}`} className="text-accent">
                  Previous
                </Link>
              ) : (
                <span className="text-faint">Previous</span>
              )}
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={`/admin/pricing?page=${page + 1}`} className="text-accent">
                  Next
                </Link>
              ) : (
                <span className="text-faint">Next</span>
              )}
            </nav>
          )}

          {/* Priced rows leave the list only on reload — they are filtered
              by "has no variant", and the row already says it saved. */}
          <p className="mt-6 text-center text-[11px] text-faint">
            Saved rows disappear from this list when you reload.
          </p>
        </>
      )}
    </AdminShell>
  );
}
