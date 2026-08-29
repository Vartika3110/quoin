import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ImagePairing } from "@/components/admin/ImagePairing";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listBrandsMissingPhotos, listProductsWithoutPhoto } from "@/lib/data/catalog";
import { listHarvestSources } from "@/lib/data/harvest";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Product images — Quoin",
  robots: { index: false, follow: false },
};

/**
 * Attach catalogue photography to the products it belongs to.
 *
 * The images were harvested from manufacturer PDFs that do not say which
 * product each one depicts — Häfele lists five finish article numbers per
 * table row, Simonswerk outlines its text as artwork. Guessing would put
 * a wrong photograph on a real SKU, so a person does the matching here.
 */
export default async function ImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) notFound();

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { isStaff: true },
  });
  if (!user?.isStaff) notFound();

  const sp = await searchParams;
  const page = Number(one(sp.page)) || 1;
  const brand = one(sp.brand);

  const [{ items, total, totalPages }, brands, sources] = await Promise.all([
    listProductsWithoutPhoto(page, 12, brand),
    listBrandsMissingPhotos(),
    listHarvestSources(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-xl font-semibold text-ink">Product images</h1>
      <p className="mt-1 text-sm text-muted">
        {total === 0
          ? "Every product in this filter has a photograph."
          : `${total} product${total === 1 ? "" : "s"} without one.`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <FilterChip href="/admin/images" label="All brands" active={!brand} />
        {brands.slice(0, 10).map((b) => (
          <FilterChip
            key={b.slug}
            href={`/admin/images?brand=${b.slug}`}
            label={`${b.name} (${b.missing})`}
            active={brand === b.slug}
          />
        ))}
      </div>

      {items.length > 0 && sources.length > 0 ? (
        <div className="mt-6">
          <ImagePairing products={items} sources={sources} />

          {totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-4 text-xs">
              <PageLink
                href={`/admin/images?${brand ? `brand=${brand}&` : ""}page=${page - 1}`}
                disabled={page <= 1}
                label="Previous"
              />
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <PageLink
                href={`/admin/images?${brand ? `brand=${brand}&` : ""}page=${page + 1}`}
                disabled={page >= totalPages}
                label="Next"
              />
            </nav>
          )}

          <p className="mt-6 text-center text-[11px] text-faint">
            Paired products leave this list when you reload.
          </p>
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted">
          {sources.length === 0
            ? "No harvested images found. Run research/extract-brand-catalogue.py --harvest first."
            : "Nothing left to pair here."}
        </p>
      )}
    </main>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active ? "bg-accent-wash text-accent" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) return <span className="text-faint">{label}</span>;
  return (
    <Link href={href} className="text-accent">
      {label}
    </Link>
  );
}
