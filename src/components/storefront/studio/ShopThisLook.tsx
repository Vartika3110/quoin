import Link from "next/link";
import { AddLookToSpace } from "@/components/storefront/studio/AddLookToSpace";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Cart } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import type { ShopTheLook } from "@/lib/types/studio";

/**
 * What you could buy to build this.
 *
 * The honesty of this section is the whole feature. Section 14 of the
 * brief says "do not claim AI identified products if the system did not
 * actually identify them", and nothing here did: these are the materials
 * somebody typed on the idea, run through the same catalogue matcher a
 * handwritten parcha goes through. So the heading says "matched from",
 * every card says which word it came from, and the tags that matched
 * nothing are listed rather than quietly dropped — a shorter list would
 * be a claim that the idea contains less than it says.
 *
 * There is no percentage. See `LookMatch` for why.
 *
 * Every product links to its real page under `/p/`. Studio does not
 * duplicate product-detail logic, does not have its own cart, and does
 * not price a variant — that happens where the customer's tier is known
 * and where the money is actually being committed.
 */
export function ShopThisLook({ look }: { look: ShopTheLook }) {
  if (look.matches.length === 0 && look.unmatched.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-title-sm font-semibold text-ink">Shop this look</h2>
        <p className="mt-1 text-body-sm text-muted">
          Matched from the materials on this idea, against the Quoin catalogue.
        </p>
      </div>

      {look.matches.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2">
            {look.matches.map((match) => (
              <li key={match.slug}>
                <Link
                  href={`/p/${match.slug}`}
                  className="flex items-center gap-3 rounded-card border border-line-soft bg-surface p-2.5 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-photo-edge bg-photo">
                    <ProductImage
                      photo={match.photo}
                      swatchKey={match.image}
                      label={match.title}
                      className="size-full"
                    />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-ink">
                      {match.title}
                    </span>
                    <span className="truncate text-caption text-faint">
                      {match.brand ? `${match.brand} · ` : ""}
                      matched on “{match.term}”
                    </span>
                  </span>

                  <span className="nums shrink-0 text-body font-semibold text-accent">
                    {match.pricePaise > 0 ? formatPrice(match.pricePaise) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Card tone="sunk" padding="md" className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body-sm font-medium text-ink">Indicative total</p>
              <p className="text-caption text-faint">
                {/* Says exactly what the number is. One of each is not a
                    quantity anyone has chosen, and calling this an
                    estimate for the room would be inventing a scope. */}
                One of each, at standard prices. Quantities are yours to set.
              </p>
            </div>
            <p className="nums shrink-0 text-title font-semibold text-ink">
              {formatPrice(look.totalPaise)}
            </p>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <AddLookToSpace matches={look.matches} />
          </div>

          <p className="flex items-start gap-2 text-caption text-faint">
            <Cart className="mt-0.5 size-3.5 shrink-0" />
            Open a product to choose a variant, a quantity and add it to your
            cart. Studio does not have a cart of its own.
          </p>
        </>
      ) : null}

      {look.unmatched.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-caption text-faint">Not in the catalogue yet:</span>
          {look.unmatched.map((term) => (
            <Badge key={term} tone="neutral" size="sm">
              {term}
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}
