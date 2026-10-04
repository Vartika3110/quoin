import { siteOrigin } from "@/lib/env";
import type { Category, Product } from "@/lib/types/catalog";

/**
 * Structured data.
 *
 * None of this existed: no Product schema, no Organization, no
 * breadcrumbs, and no Open Graph tags outside Studio — so a shared
 * product link previewed as a bare URL and a catalogue of three thousand
 * priced items was invisible to the rich results that make a shopping
 * query useful.
 *
 * Two rules run through everything below, and both are the same rule the
 * rest of this app follows about money and provenance.
 *
 * **Only claim what the page actually shows.** Every field here is read
 * from the same row the page renders from. There is no invented rating,
 * no review count, no fabricated `priceValidUntil` — those are the fields
 * that win rich results, and inventing them is lying to a search engine
 * about a product someone is about to buy. When Quoin has real reviews
 * they can be added from real rows.
 *
 * **Prices are GST-inclusive, and said so.** The catalogue stores what
 * the customer pays, tax already inside it — see `taxForLine`. Schema.org
 * has a field for exactly this (`valueAddedTaxIncluded`), and setting it
 * is the difference between a listing that matches the price on the page
 * and one that a shopping surface decides to "correct" upward.
 */

/** Absolute, because every one of these fields requires it. */
export function absolute(path: string): string {
  return new URL(path, siteOrigin()).toString();
}

/** Paise to the decimal string schema.org wants ("4150.00"). */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Organization, for the home page only.
 *
 * Deliberately thin. `sameAs` (social profiles), `logo` beyond the app
 * icon, a telephone and a postal address all belong here eventually — and
 * all of them are facts about a legal entity that this codebase does not
 * yet hold. The legal pages carry the same gap as explicit
 * `[LEGAL TO CONFIRM]` markers rather than filled-in guesses, and this
 * follows the same discipline: an incomplete Organization block is
 * honest, an invented one is a false statement about a real company.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Quoin",
    url: absolute("/"),
    logo: absolute("/icon-512.png"),
    description:
      "Construction materials, premium interiors and verified expert services, delivered to your project.",
  };
}

/**
 * WebSite with a search action, so a site-links search box can work.
 *
 * Points at `/products?q=`, which is the real catalogue search — not the
 * command palette's API route, which answers JSON and would be useless to
 * someone arriving from a search result.
 */
export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Quoin",
    url: absolute("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absolute("/products")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Product, from the row the page is already rendering.
 *
 * `offers` takes the cheapest active variant, matching the "from" price
 * the card and the detail page show, and `availability` is passed in by
 * the page rather than assumed — the caller has already done the stock
 * lookup and this must not claim `InStock` for something the page itself
 * is showing as out of stock.
 *
 * `sku` is the variant's own SKU rather than the product id, because that
 * is the code on the invoice, in the admin, and on the shelf — it is what
 * a person matching this listing to a real thing would use.
 */
export function productSchema(input: {
  product: Product;
  category?: Category;
  inStock: boolean;
}) {
  const { product, category, inStock } = input;

  /* The page shows a "from" price taken the same way. Sorting here rather
     than trusting input order: nothing in `Product.variants` promises
     one, and a schema price that disagrees with the visible price is the
     kind of mismatch a shopping surface penalises. */
  const cheapest = [...product.variants].sort((a, b) => a.price - b.price)[0];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    url: absolute(`/p/${product.slug}`),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(category ? { category: category.title } : {}),
    /* Only a real photograph. A generated illustration is labelled as one
       everywhere it is rendered ("actual product may vary"), and passing
       it off as product imagery in structured data would undo that
       labelling at exactly the surface where nobody can see the caption. */
    ...(product.photo && !product.photoIsIllustration
      ? { image: absolute(product.photo) }
      : {}),
    ...(cheapest
      ? {
          sku: cheapest.sku,
          offers: {
            "@type": "Offer",
            url: absolute(`/p/${product.slug}`),
            priceCurrency: "INR",
            price: rupees(cheapest.price),
            /* The one field that keeps this listing honest about Indian
               pricing — see the module comment. */
            valueAddedTaxIncluded: true,
            itemCondition: "https://schema.org/NewCondition",
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: "Quoin" },
          },
        }
      : {}),
  };
}

/**
 * Breadcrumbs, from the same trail the page renders visually.
 *
 * Takes the list rather than deriving it, so the two cannot disagree: if
 * the visible breadcrumb changes, this changes with it because it is the
 * same array.
 */
export function breadcrumbSchema(items: { label: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: absolute(item.href),
    })),
  };
}
