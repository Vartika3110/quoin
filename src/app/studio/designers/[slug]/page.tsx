import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { PinGrid } from "@/components/storefront/studio/PinGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sofa } from "@/components/icons";
import { getDesignerBySlug } from "@/lib/data/studio";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const found = await getDesignerBySlug(slug);
  if (!found) return { title: "Designer not found — Quoin Studio" };

  return {
    title: `${found.designer.name} — Quoin Studio`,
    description: found.designer.headline || found.designer.bio,
    alternates: { canonical: `/studio/designers/${found.designer.slug}` },
  };
}

/**
 * A designer's public page: who they are, and the rooms they built.
 *
 * The rooms are the same masonry the discovery grid draws, which is not
 * laziness — a designer's portfolio and Studio's wall are the same object
 * filtered differently, and a second grid component for one page is a
 * second place for the save button to behave differently.
 *
 * No infinite scroll: `getDesignerBySlug` takes the first sixty rooms and
 * hands them over with no cursor. Nobody in this business has sixty
 * photographed rooms yet, and a paginated portfolio can be added the day
 * somebody does.
 */
export default async function DesignerPage({ params }: Params) {
  const { slug } = await params;
  const found = await getDesignerBySlug(slug);
  if (!found) notFound();

  const { designer, rooms } = found;

  return (
    <StudioShell
      header={<StudioChrome title={designer.name} subtitle={designer.headline} />}
      barTitle={designer.name}
    >
      <div className="flex flex-col gap-5">
        <div className="px-5 lg:hidden">
          <h1 className="font-display text-headline font-light tracking-tight text-ink">
            {designer.name}
          </h1>
          {designer.headline && (
            <p className="mt-1 text-body-sm text-muted">{designer.headline}</p>
          )}
        </div>

        {designer.bio && (
          <p className="max-w-prose px-5 text-body text-muted lg:px-0">{designer.bio}</p>
        )}

        <PinGrid
          initial={rooms}
          initialCursor={null}
          queryString=""
          label={`Rooms by ${designer.name}`}
          empty={
            <EmptyState icon={<Sofa className="size-6" />} title="No rooms published yet" compact>
              {designer.name} has no public rooms in Studio at the moment.
            </EmptyState>
          }
        />
      </div>
    </StudioShell>
  );
}
