import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { IdeaDetail } from "@/components/storefront/studio/IdeaDetail";
import { ShopThisLook } from "@/components/storefront/studio/ShopThisLook";
import { IdeaMasonry } from "@/components/storefront/studio/IdeaMasonry";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getSession } from "@/lib/auth/session";
import { getIdeaBySlug, listRelatedIdeas, shopTheLook } from "@/lib/data/studio";

type Props = { params: Promise<{ slug: string }> };

/**
 * The share card for a public idea.
 *
 * `robots: noindex` when the idea is private — section 43's rule that a
 * customer's own material must not accidentally become indexable. The
 * page 404s for a stranger either way (visibility is in the `where`
 * clause), so this is belt and braces against the case where the *owner's*
 * browser is what a crawler is driving.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const session = await getSession();
  const idea = await getIdeaBySlug(slug, session?.userId ?? null);

  if (!idea) return { title: "Not found — Quoin Studio" };

  const isPublic = idea.visibility === "public";
  const description =
    idea.description ||
    `${[idea.room, ...idea.styles, ...idea.materials].filter(Boolean).join(", ")} — inspiration on Quoin Studio.`;

  return {
    title: `${idea.title} — Quoin Studio`,
    description,
    robots: isPublic ? undefined : { index: false, follow: false },
    alternates: isPublic ? { canonical: `/studio/idea/${idea.slug}` } : undefined,
    openGraph: isPublic
      ? {
          title: idea.title,
          description,
          url: `/studio/idea/${idea.slug}`,
          type: "article",
          /* The photograph itself. `/studio/image/{id}` 307s to wherever
             the bytes are, which is what a scraper needs — a signed URL
             written in here would have expired before anyone shared the
             link.

             Omitted entirely when there is none, rather than falling back
             to something generic: a share card is where a borrowed
             picture does the most damage, because it is the only thing
             most people will ever see of the page. */
          ...(idea.imageUrl
            ? {
                images: [
                  { url: idea.imageUrl, width: idea.width, height: idea.height },
                ],
              }
            : {}),
        }
      : undefined,
  };
}

const SIZES = "(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw";

export default async function IdeaPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();
  const viewer = session?.userId ?? null;

  const idea = await getIdeaBySlug(slug, viewer);
  if (!idea) notFound();

  /* Both depend on the idea, so they cannot start until it has loaded —
     but they do not depend on each other. */
  const [related, look] = await Promise.all([
    listRelatedIdeas(idea, viewer),
    shopTheLook(idea),
  ]);

  return (
    <StudioShell>
      <div className="px-5 lg:px-0">
        <div className="mb-4">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Studio", href: "/studio" },
              { label: idea.title },
            ]}
          />
        </div>

        <IdeaDetail idea={idea} />

        <div className="mt-10 max-w-2xl">
          <ShopThisLook look={look} />
        </div>

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display mb-4 text-title-sm font-semibold text-ink">
              More like this
            </h2>
            <IdeaMasonry ideas={related} label="Related ideas" sizes={SIZES} />
          </section>
        ) : null}
      </div>
    </StudioShell>
  );
}
