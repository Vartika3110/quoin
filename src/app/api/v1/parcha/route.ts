import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/http";
import { matchParchaLines } from "@/lib/data/search";
import { db } from "@/lib/db";

const Body = z.object({
  /* Capped so a paste of an entire BOQ cannot turn one request into a
     thousand database lookups. Longer lists are a conversation with an
     expert, which is what the page offers past this point. */
  terms: z.array(z.string().trim().min(1).max(160)).min(1).max(40),
});

/**
 * POST /api/v1/parcha
 *
 * Takes the search terms read out of a materials list and returns the
 * best catalogue match for each, with its price, in the same order.
 *
 * A POST rather than a GET with forty query parameters: the list is the
 * request body's whole reason to exist, and a URL long enough to carry a
 * parcha will be truncated by something between here and the customer.
 * Nothing is written, so it is safe to retry.
 *
 * Public, like the rest of browse. Pricing a list is exactly the thing
 * someone does before deciding whether to make an account.
 */
export const POST = handler(async (request) => {
  const { terms } = await parseBody(request, Body);

  const matches = await matchParchaLines(terms);

  /* The suggestion carries a slug and a photo but not a price — the
     palette does not need one. Here it is the whole point, so the matched
     rows are priced in one further query rather than one per line.

     Products only. A line like "steel" now comes back as a *department*
     (see `matchParchaDepartment`), which has a name and a link and no
     price, and must not be sent through the product pricing query — its
     href is `/c/…`, so stripping `/p/` left it whole and a `/c/…` string
     went out of this route in a field every caller reads as a product
     slug. */
  const slugs = matches.flatMap((m) =>
    m?.kind === "product" ? [m.href.replace("/p/", "")] : [],
  );
  const priced = slugs.length
    ? await db.product.findMany({
        where: { slug: { in: slugs } },
        select: {
          slug: true,
          pricingUnit: true,
          variants: {
            where: { isActive: true },
            orderBy: { pricePaise: "asc" },
            take: 1,
            select: { pricePaise: true, minQty: true, stepQty: true },
          },
        },
      })
    : [];
  const bySlug = new Map(priced.map((p) => [p.slug, p]));

  return ok({
    matches: matches.map((match) => {
      if (!match) return null;

      /* A department, not a product: we stock this kind of thing and
         here is where it lives, but nobody has said which one, so there
         is no price and no slug to add to a basket. `kind` is what the
         caller reads to tell the two apart — a `href` alone would make
         every caller re-derive it from the URL shape. */
      if (match.kind !== "product") {
        return {
          kind: "department" as const,
          slug: null,
          href: match.href,
          title: match.label,
          brand: match.sublabel ?? null,
          photo: null,
          pricePaise: null,
          minQty: 1,
          stepQty: 1,
          pricingUnit: null,
        };
      }

      const slug = match.href.replace("/p/", "");
      const row = bySlug.get(slug);
      const variant = row?.variants[0];
      return {
        kind: "product" as const,
        slug,
        href: match.href,
        title: match.label,
        brand: match.sublabel ?? null,
        photo: match.photo ?? null,
        pricePaise: variant?.pricePaise ?? null,
        minQty: variant?.minQty ?? 1,
        stepQty: variant?.stepQty ?? 1,
        pricingUnit: row?.pricingUnit ?? null,
      };
    }),
  });
});
