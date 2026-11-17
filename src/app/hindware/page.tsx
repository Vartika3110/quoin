import type { Metadata } from "next";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppShell } from "@/components/storefront/AppShell";
import { SectionHead } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  CataloguePreviewGallery,
  type PreviewRow,
} from "@/components/catalogue-preview/CataloguePreviewGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hindware Catalogue A — extraction preview",
  description:
    "Every product image lifted out of the Hindware Catalogue A PDF, shown at the size the storefront grid would draw it.",
  robots: { index: false, follow: false },
};

/**
 * What came out of the Hindware PDF, drawn at storefront size.
 *
 * ## This is an inspection page, not a shelf
 *
 * Nothing here is a Quoin product. These rows are not in the database,
 * they are not for sale, and the page is `noindex`. It exists to answer
 * one question before any of this is imported: **are the pictures inside
 * that PDF good enough to sell from?**
 *
 * Which is why the default view draws each image in a tile exactly as
 * wide as `ProductCard` asks for (300px at desktop width), rather than in
 * whatever box flatters it. A gallery that shows catalogue art at 120px
 * tells you nothing; every picture looks sharp at 120px.
 *
 * ## Where the files come from
 *
 * `public/catalogue-preview/hindware-a/` — written by
 * `research/build-catalogue-preview.py` from the extraction output on
 * disk, and **committed**, the same way `public/catalogue` is. They are
 * run output rather than source, which argues for ignoring them, but the
 * page has to work on a deployed URL in front of someone, and a deploy
 * without them is a page that explains why it is empty.
 *
 * The index is still read with `fs` at request time rather than imported,
 * because a missing directory should degrade to a page that says what is
 * missing — not to a build that fails. Rebuilding the files is one
 * command and nobody should have to discover that from a stack trace.
 *
 * ## What was done to the pictures
 *
 * The copies under `public/` are not the extraction's output. A PDF keeps
 * an image's colour and its transparency in two separate streams and a
 * browser cannot pair them, so each copy has its alpha composited onto
 * white and is then trimmed to the artwork's own bounding box. The
 * untouched originals stay on the Desktop; nothing here writes to them.
 *
 * Nothing is ever upscaled. The pixel count on each tile is the real one.
 */
export default async function HindwarePreviewPage() {
  const index = await readIndex();

  return (
    <AppShell showTrustPills={false}>
      <div className="pt-4 lg:pt-6">
        <SectionHead
          level={1}
          size="lg"
          title="Hindware Catalogue A"
          subtitle="Every product picture inside the PDF, drawn at the size the storefront grid would draw it. Nothing on this page is for sale."
        />

        <div className="mb-8 px-5 lg:px-0">
          <div className="rounded-card border border-line-soft bg-raised p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="warning" size="sm">
                Extraction preview
              </Badge>
              <Badge tone="neutral" size="sm">
                Not in the catalogue
              </Badge>
              <Badge tone="neutral" size="sm">
                Not indexed
              </Badge>
            </div>
            <p className="text-body-sm leading-relaxed text-muted">
              These images were lifted out of{" "}
              <span className="text-ink">
                Catalogue A — Rest of India LR.pdf
              </span>{" "}
              as the exact streams the PDF carries, then composited onto
              white and trimmed to the artwork so a browser can draw them.
              None of them has been enlarged, so the pixel count on each
              tile is the true one. The originals are untouched on disk.
            </p>
          </div>
        </div>

        {index ? (
          <CataloguePreviewGallery rows={index.rows} />
        ) : (
          <div className="px-5 lg:px-0">
            <EmptyState
              title="The preview images are not on this machine"
              action={{ href: "/", label: "Back to the storefront" }}
            >
              <span className="text-body-sm text-muted">
                They belong in{" "}
                <code className="text-ink">
                  public/catalogue-preview/hindware-a/
                </code>
                . Rebuild them with{" "}
                <code className="text-ink">
                  python3 research/build-catalogue-preview.py
                  public/catalogue-preview/hindware-a
                </code>{" "}
                and this page fills in.
              </span>
            </EmptyState>
          </div>
        )}
      </div>
    </AppShell>
  );
}

type Index = { count: number; rows: PreviewRow[] };

/**
 * Read the prep script's index, or return null when the directory is not
 * there. A missing file is the expected state on a fresh clone and on
 * every deploy, so it is not logged as a failure — but a file that is
 * present and unreadable is a real problem and says so.
 */
async function readIndex(): Promise<Index | null> {
  const file = path.join(
    process.cwd(),
    "public",
    "catalogue-preview",
    "hindware-a",
    "index.json",
  );

  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Index;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("[hindware-preview] could not read the image index", error);
    return null;
  }
}
