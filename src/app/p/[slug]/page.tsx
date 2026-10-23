import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { PurchasePanel } from "@/components/storefront/PurchasePanel";
import { BrandCard } from "@/components/storefront/product/BrandCard";
import { Gallery } from "@/components/storefront/product/Gallery";
import { Specs } from "@/components/storefront/product/Specs";
import { RecordView } from "@/components/storefront/product/RecordView";
import { RoomPreview } from "@/components/storefront/product/RoomPreview";
import { JsonLd } from "@/components/analytics/JsonLd";
import { absolute, breadcrumbSchema, productSchema } from "@/lib/seo";
import { getProductStock } from "@/lib/data/product-stock";
import { canVisualise, defaultPlacement } from "@/lib/ai/eligibility";
import { ProductStickyBar } from "@/components/storefront/product/ProductStickyBar";
import { Badge } from "@/components/ui/Badge";
import { SectionHead, hasEnough } from "@/components/ui/Section";
import {
  Calendar,
  CheckCircle,
  Chevron,
  Clock,
  Refresh,
  Ruler,
  Shield,
  Truck,
} from "@/components/icons";
import {
  getCategories,
  getProductBySlug,
  getProductRows,
} from "@/lib/data/catalog";
import {
  BADGE_LABEL,
  PRICING_UNIT_LABEL,
  type Product,
  formatPrice,
  resolvePrice,
  type FulfilmentType,
} from "@/lib/types/catalog";
import {
  SCHEDULED_DELIVERY_BODY,
  SCHEDULED_DELIVERY_TITLE,
} from "@/lib/orders/delivery-estimate";

/** Priced from the database on every request — see the note in page.tsx. */
export const dynamic = "force-dynamic";

/** The full promise, spelled out — the card only has room for a chip. */
const PROMISE: Record<
  FulfilmentType,
  { Icon: typeof Clock; title: (d?: number) => string; body: string }
> = {
  instant: {
    Icon: Clock,
    title: () => "Delivered in 18 minutes",
    body: "In stock at your nearest Quoin store, inside the serviceable radius.",
  },
  scheduled: {
    Icon: Truck,
    /* The catalogue-wide promise, from `delivery-estimate.ts`, which is
       where it is written down once. A line with its own
       `leadTimeDays` still says its own number. */
    title: (d) => (d && d > 0 ? `Delivered in about ${d} days` : SCHEDULED_DELIVERY_TITLE),
    body: SCHEDULED_DELIVERY_BODY,
  },
  bookable: {
    Icon: Calendar,
    title: () => "Book a slot",
    body: "A verified Quoin expert attends your site at the time you choose.",
  },
  made_to_order: {
    Icon: Ruler,
    title: (d) => `Cut to order in about ${d ?? 7} days`,
    body: "Cut to your measurements after ordering. Not eligible for instant delivery.",
  },
};

/**
 * What Quoin commits to after the sale.
 *
 * Deliberately short and deliberately hedged where it must be: the
 * manufacturer warranty is the manufacturer's, and Quoin's part is
 * handling the claim. Promising "1 year warranty" on 3,000 imported SKUs
 * with no warranty field would be a promise made by a layout decision.
 */
const AFTER_SALE = [
  {
    Icon: Shield,
    title: "Manufacturer warranty",
    body: "Whatever the maker covers, covered. Quoin handles the claim on your behalf.",
  },
  {
    Icon: Refresh,
    title: "Returns",
    body: "Unopened and unfitted goods can be returned within 7 days. Cut-to-order items cannot.",
  },
  /* "Help choosing — a free video consultation" was a fourth entry here.
     It is the same offer as the "Not sure this is the right one?" panel
     further down, which has the copy that earns it and the button that
     acts on it; stated twice on one page plus the header's Consult card,
     it read as the site badgering rather than offering. */
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found — Quoin" };

  const title = `${product.title} — Quoin`;
  const description = `${product.title}${product.brand ? ` by ${product.brand}` : ""} on Quoin.`;
  const path = `/p/${product.slug}`;

  /* A photograph only, and only a real one. A generated illustration is
     captioned "actual product may vary" everywhere it appears on the
     site; a social card has no room for that caption, so sharing one as
     if it were the product would strip the one thing that keeps it
     honest. Those links fall back to the site-wide card instead. */
  const image =
    product.photo && !product.photoIsIllustration ? absolute(product.photo) : undefined;

  return {
    title,
    description,
    /* Relative, resolved against `metadataBase` in the root layout. This
       page had no canonical at all, which on a catalogue reachable with
       filter and tracking query strings is how one product becomes a
       dozen competing URLs. */
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: "Quoin",
      ...(image ? { images: [{ url: image, alt: product.title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  /* The department first, because the rails are split by its shelves —
     see `getProductRows`. */
  const categories = await getCategories();
  const category = categories.find((c) => c.id === product.categoryId);

  const [rows, stock] = await Promise.all([
    getProductRows(product, category?.slug),
    /* The same lookup the buy box does, pulled up here so the Product
       schema's `availability` reports what this page actually shows
       rather than assuming anything is in stock. */
    getProductStock([product.slug]),
  ]);
  const promise = PROMISE[product.fulfilment];

  /* The headline price: the cheapest option, flagged "onwards" when
     there is more than one. Standard rates, not Pro — this is a server
     component and membership is resolved in the client panel below. */
  const headline = resolvePrice(product, false);

  /**
   * The breadcrumb trail, once.
   *
   * Rendered visually below *and* emitted as `BreadcrumbList` structured
   * data from this same array — a second hand-written copy for the schema
   * is how the two start disagreeing about where a product sits. Every
   * entry carries an href here, including the product itself, because
   * schema.org wants a URL per position; the visible trail drops the href
   * on the last one, since nobody links to the page they are on.
   */
  const trail = [
    { label: "Home", href: "/" },
    { label: "Categories", href: "/categories" },
    ...(category ? [{ label: category.title, href: `/c/${category.slug}` }] : []),
    { label: product.title, href: `/p/${product.slug}` },
  ];

  return (
    <AppShell>
      {/* Renders nothing; records the view for the "where you left off"
          rail on the home page. */}
      <RecordView product={product} />

      {/* Structured data, from the same rows this page renders. The
          breadcrumb trail below is the *same array*, so the two can never
          drift apart — see `breadcrumbSchema`. */}
      <JsonLd
        data={productSchema({
          product,
          category,
          /* Not assumed. `getProductStock` is the same lookup the buy box
             uses, so the schema cannot claim InStock for something this
             page is showing as out of stock. */
          inStock: stock[product.slug]?.state === "available",
        })}
      />
      <JsonLd data={breadcrumbSchema(trail)} />

      <div className="pt-4 lg:pt-6">
        {/* Single column on a phone; gallery and buy box side by side once
            there is room for both to be read without scrolling. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
          <Gallery product={product} />

          <div className="px-5 lg:px-0">
            <div className="pt-6 lg:pt-0">
              {/* **Name and price in one card, directly under the
                  picture** — the reference design's arrangement, and the
                  order a customer reads in: what is it, then what does it
                  cost. The price used to sit three blocks down inside the
                  buy panel, under the delivery promise and the pincode
                  check, so the first screen of a product page answered
                  two questions nobody had asked yet and not the one
                  everybody does.

                  The delivery line heads the card rather than owning a
                  card of its own below: "Delivered today" is a fact about
                  this product that belongs with its name, and its longer
                  explanation follows underneath where it costs nothing. */}
              <div className="rounded-card border border-line bg-surface p-4">
                <p className="flex items-center gap-1.5 text-micro font-semibold text-accent">
                  <promise.Icon className="size-4 shrink-0" />
                  {promise.title(product.leadTimeDays)}
                </p>

                {/* A label, not a link. `BrandCard` below is the way
                    through to the rest of the range, and two anchors to
                    the same URL on one screen is one of them being
                    ignored. */}
                {product.brand && (
                  <p className="mt-2.5 text-micro font-semibold uppercase tracking-wide text-muted">
                    {product.brand}
                  </p>
                )}

                {/* Sans and bold, where every other heading on the site
                    is the display serif.

                    The reference sets it this way and there is a reason
                    beyond matching it: these are not headlines, they are
                    SKU names. "MYK Laticrete 307 Ceramic Tile Adhesive,
                    20 Kg Bag" in display serif at headline size runs to
                    three lines and pushes the price below the fold on a
                    375px screen. The serif is still the voice of the
                    site — section heads, category tiles, the price right
                    under this — and a product's own name is the one
                    string here that is manufacturer's copy rather than
                    ours. */}
                <h1 className="mt-1 text-title-sm font-bold leading-snug text-ink lg:text-title-lg">
                  {product.title}
                </h1>

                {/* The price, at the size the decision deserves, with the
                    list price struck beside it **only when there is a real
                    saving** — `resolvePrice` returns no strikethrough when
                    MRP equals the selling price, which is true of most of
                    this catalogue. A struck number identical to the one
                    beside it is a discount claimed where none exists. */}
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {/* The figure on its own plate, the way the reference
                      carries it — the one number on the page somebody is
                      actually deciding on, and previously just more text
                      in the stack.

                      Quoin's accent, not the reference's yellow: a
                      highlighter tone borrowed from another storefront
                      reads as a sticker on cream and brown surfaces, and
                      the job here is prominence rather than that
                      particular hue. */}
                  {/* Sans, like every other price in the app.

                      This was the one figure on the storefront set in
                      the display serif, and the serif rupee sign and
                      lining numerals inside a tinted plate read as a
                      different typeface having been pasted in — which it
                      was. The card grid, the sticky bar and the cart all
                      set money in `nums` sans; a product page is the
                      last place the number should look unfamiliar. */}
                  <span className="nums rounded-lg bg-accent-wash px-2.5 py-1 text-title-lg font-bold text-accent">
                    {formatPrice(headline.amount)}
                  </span>
                  {headline.strikethrough != null && (
                    <span className="nums text-body text-faint line-through">
                      MRP {formatPrice(headline.strikethrough)}
                    </span>
                  )}
                  <span className="text-caption text-muted">
                    {headline.isFrom
                      ? "onwards"
                      : PRICING_UNIT_LABEL[product.pricingUnit]}
                  </span>
                </p>

                {product.badges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {product.badges.map((b) => (
                      <Badge
                        key={b}
                        tone="accent"
                        icon={<CheckCircle className="size-3.5" />}
                      >
                        {BADGE_LABEL[b]}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* "View details", opening where it stands.

                    It has been three things: a tall edged box ranged
                    right (orphaned, with no attribute chips to anchor
                    it), then a row that jumped down the page to the
                    Specifications block. Both made the reader go
                    somewhere. This opens underneath itself, which is
                    what the control has said all along.

                    A native `<details>`, so it needs no JavaScript, and
                    the whole table is in the markup for a crawler
                    whether or not anyone opens it. The separate
                    Specifications section below is gone on a phone
                    rather than left to say the same thing twice; the
                    desktop layout keeps its own, where there is a column
                    for it. */}
                <details className="group mt-3 border-t border-line-hair pt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-caption font-semibold text-accent transition-colors hover:text-accent-bright [&::-webkit-details-marker]:hidden">
                    View details
                    <Chevron className="size-4 shrink-0 transition-transform group-open:-rotate-90" />
                  </summary>

                  <div className="mt-3">
                    <Specs product={product} categoryTitle={category?.title} />
                  </div>
                </details>
              </div>

              {/* The manufacturer, straight under the price — where the
                  reference has it, and where somebody still comparing
                  goes next. */}
              {product.brand && (
                <div className="mt-3">
                  <BrandCard brand={product.brand} />
                </div>
              )}


              {/* The pincode check was here, between the brand and the
                  buy panel. Taken out at the owner's instruction.

                  It asked "will it reach me" before the customer had
                  decided they wanted the thing, which put a form in
                  front of a decision. The header already names the
                  chosen locality on every page, and checkout asks for
                  the address properly — `DeliveryCheck` is kept for
                  wherever it is wanted next rather than deleted. */}

              {/* `id` is the sticky bar's scroll target for products
                  whose options must be chosen before adding. */}
              <div id="buy" className="mt-6 scroll-mt-24">
                <PurchasePanel product={product} />
              </div>

              {/* Under the buy panel rather than above it: somebody who
                  has decided is here to add to cart, and a render takes
                  up to a minute. It is for the customer who has *not*
                  decided, and they scroll.

                  Absent for services — there is nothing to place in a
                  photograph of a room. One rule, shared with the route
                  that spends the money; see `canVisualise`. */}
              {canVisualise(product, category?.slug) && (
                <div className="mt-3">
                  <RoomPreview
                    slug={product.slug}
                    title={product.title}
                    defaultPlacement={defaultPlacement(category?.slug)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Everything below the fold, in the order a buyer needs it:
            what it is, then what Quoin does after they have bought it,
            then what else is in the same aisle. */}
        <div className="mt-14 space-y-12 lg:mt-20 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12 lg:space-y-0">
          <div className="space-y-3 lg:space-y-12">
            {/* Accordions on a phone, open sections on a desktop.

                Collapsed blocks are right where vertical space is the
                scarce resource and wrong where it is not: on a 1440px
                screen a customer comparing two products should not have to
                open the same panel twice. `defaultOpen` is set from the
                breakpoint the page is built for, and the `<details>` is
                simply forced open by CSS from `lg` up. */}
            <section id="specs-lg" className="hidden scroll-mt-24 lg:block">
              <SectionHead level={2} title="Specifications" size="sm" />
              <div className="px-5 lg:px-0">
                <Specs product={product} categoryTitle={category?.title} />
              </div>
            </section>

            {/* There is no Reviews block, and that is the point.

                There is no review table — no product has one rating — so
                a "Reviews" heading here would be a section that never
                has anything under it, which teaches a reader to scroll
                past that part of the page and makes the shop look
                unused. (Inventing a 4.6 from 213 ratings would be far
                worse: every other number here is real, and one
                fabricated one makes the rest suspect.)

                A consult panel used to stand in its place — "Not sure
                this is the right one? Ask an expert" — offering the
                thing Quoin has rather than consolation for the thing it
                does not. It came out at the owner's instruction: Consult
                is in the header of every page and in the footer, and a
                third invitation on one screen reads as the site
                badgering rather than offering. When reviews exist, this
                is where they go. */}
          </div>

          <aside className="px-5 lg:px-0">
            <h2 className="font-display mb-3 text-title-sm font-semibold text-ink">
              After you buy
            </h2>
            <ul className="space-y-3">
              {AFTER_SALE.map(({ Icon, title, body }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-card border border-line-soft bg-surface p-4"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-ink">{title}</p>
                    <p className="mt-0.5 text-caption leading-relaxed text-muted">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <ProductStickyBar product={product} />

        {/* Three rails, and each one answers a different question.

            There used to be one, headed "Goes well with", holding eight
            rows taken out of the same department — which on a bag of
            tile adhesive was six more bags of tile adhesive. The shelves
            make a better answer available for nothing: same shelf is
            *instead of this*, another shelf in the department is
            *alongside this*, and the brand is *more of these*. See
            `getProductRows`.

            Four or nothing on each — see `hasEnough`. A row holding one
            card is a shop that looks out of stock, and these sit at the
            bottom of every product page. */}
        {hasEnough(rows.complements) && (
          <section className="mt-16">
            <SectionHead
              title="Goes well with"
              subtitle={
                category ? `Fitted alongside it, from ${category.title}` : undefined
              }
              href={category ? `/c/${category.slug}` : "/products"}
            />
            <Rail products={rows.complements} />
          </section>
        )}

        {hasEnough(rows.sameShelf) && (
          <section className="mt-12">
            <SectionHead
              title={rows.shelfLabel ? `More ${rows.shelfLabel.toLowerCase()}` : "Similar products"}
              subtitle="Other options on the same shelf"
              href={
                category && rows.shelfId
                  ? `/c/${category.slug}?type=${rows.shelfId}`
                  : category
                    ? `/c/${category.slug}`
                    : "/products"
              }
            />
            <Rail products={rows.sameShelf} />
          </section>
        )}

        {product.brand && hasEnough(rows.sameBrand) && (
          <section className="mt-12">
            <SectionHead
              title={`More from ${product.brand}`}
              subtitle="Elsewhere in the catalogue"
              href={`/products?brand=${brandSlug(product.brand)}`}
            />
            <Rail products={rows.sameBrand} />
          </section>
        )}

      </div>
    </AppShell>
  );
}

/**
 * A horizontal row of products on a phone, a grid on a desktop.
 *
 * Three sections render one, and the only thing that varied between
 * them was the array — so it is one component rather than three copies
 * of a class string that would drift the first time one of them was
 * adjusted.
 */
function Rail({ products }: { products: Product[] }) {
  return (
    <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

/** Matches `BrandCard`'s own slugifier — see the note there. */
function brandSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
