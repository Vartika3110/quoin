import Image from "next/image";
import Link from "next/link";
import { CategoryTile } from "@/components/storefront/sections";
import { BRAND_LOGOS } from "@/lib/brand-logos";
import {
  Boards,
  Building,
  Bricks,
  Chevron,
  Crown,
  Grid,
  Hammer,
  Headset,
  Helmet,
  Lamp,
  Shield,
  Tap,
  Truck,
  Video,
} from "@/components/icons";
import { formatPrice, type Category } from "@/lib/types/catalog";

/**
 * Home page sections.
 *
 * Kept apart from `sections.tsx`, which holds the pieces reused across
 * browse and detail. Everything here appears on the home page only.
 */

/* ------------------------------------------------------------ entry tiles */

/**
 * The four ways in.
 *
 * Each carries its own ground rather than the white card the rest of the
 * page uses. Four identical white boxes in a row, distinguished only by a
 * word and a line drawing, make the reader stop and read all four to find
 * out which is which — the tint does that work before the type is read,
 * and the four grounds are drawn from the same warm palette as the hero
 * so the row still belongs to the page.
 */
const ENTRIES = [
  {
    href: "/studio",
    eyebrow: "QUOIN",
    label: "Your Design Platform",
    Icon: Building,
    tint: "var(--quoin-tile-1)",
  },
  {
    href: "/c/services",
    eyebrow: "SERVICES",
    label: "Professional Services",
    Icon: Helmet,
    tint: "var(--quoin-tile-2)",
  },
  {
    href: "/products",
    eyebrow: "PRODUCTS",
    label: "Construction Materials",
    Icon: Bricks,
    tint: "var(--quoin-tile-3)",
  },
  {
    href: "/products?sort=price",
    eyebrow: "ARCHITECTURAL PREMIUM STUDIO",
    label: "Bespoke Products",
    Icon: Lamp,
    tint: "var(--quoin-tile-4)",
  },
];

export function EntryTiles() {
  return (
    /* A grid at every width. These four are the top of the page and the
       whole point of it — two of them parked off-screen behind a swipe is
       two entry points most people never see. */
    <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-4 lg:px-0">
      {ENTRIES.map(({ href, eyebrow, label, Icon, tint }) => (
        <Link
          key={eyebrow}
          href={href}
          style={{ background: tint }}
          className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-card px-3 pb-10 pt-5 text-center transition-transform duration-200 hover:-translate-y-0.5"
        >
          {/* Two lines of headroom so a long name does not shove the mark
              down and break alignment across the row. */}
          <p className="flex min-h-8 items-center text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink">
            {eyebrow}
          </p>

          {/* The mark sits on a lifted plate rather than straight on the
              tint. Against a gradient a bare line drawing loses its
              lighter strokes wherever the ground darkens under it. */}
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-plate text-ink shadow-sm ring-1 ring-plate-edge transition-colors group-hover:bg-plate-solid">
            <Icon className="size-9" />
          </span>

          <p className="text-[11px] leading-tight text-muted">{label}</p>

          <span className="absolute bottom-3 right-3 grid size-6 place-items-center rounded-full bg-accent text-surface transition-colors group-hover:bg-accent-bright">
            <Chevron className="size-3.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- consultation cta */

export function ConsultCta() {
  return (
    <Link
      href="/consult"
      className="flex items-center gap-3 rounded-card border border-line-soft bg-surface px-4 py-3 transition-colors hover:border-accent-edge"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
        <Video className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight text-accent">
          Video consultation
        </span>
        <span className="block text-xs text-muted">
          Talk to an expert about your project before you buy
        </span>
      </span>
      <Chevron className="size-4 shrink-0 text-muted" />
    </Link>
  );
}

/* -------------------------------------------------------------------- hero */

/**
 * The headline promise.
 *
 * A photograph fills the half of the band the reference gives to one, and
 * `HeroArt` — the drawn stand-in that held the space until there was a
 * picture — is retired. On narrow screens it drops away rather than
 * competing with the type for the width the headline needs.
 *
 * A frame at golden hour, mid-build: slab and column still bare, services
 * not yet in, and the finished rooms already lit behind the glass. That is
 * the whole proposition in one image, which is why it beats a photograph
 * of a finished lobby.
 */
export function Hero() {
  return (
    /* `min-h` from `sm` up, which is exactly where the photograph appears.
       Without it the band is only as tall as the headline, subhead and
       button make it — about 342px against a 660px-wide photo box, a
       1.93:1 slot for a 1.42:1 frame. `object-cover` resolves that by
       cutting 27% of the picture's height, top and bottom, which takes the
       top storey and the stacked block and cement at the base: the two
       things that say "mid-build". At 26rem the cut is nearer 11%.

       A minimum rather than a fixed height so longer copy still grows the
       band instead of overflowing it, and `items-center` so the type sits
       in the middle of the taller box rather than stranded at its top. */
    <div className="relative flex min-h-0 flex-col justify-center overflow-hidden rounded-card bg-gradient-to-br from-[#f3e6d8] via-[#eddcc9] to-[#e2c9ae] px-6 py-7 sm:min-h-[22rem] lg:min-h-[26rem] lg:px-10 lg:py-10">
      {/* The photograph is masked, not boxed.

          Cropping it to a panel and butting the type up against it draws a
          seam down the middle of the band — two things sharing a rectangle
          rather than one image. Fading its own left edge to transparent
          instead lets the band's gradient come through underneath, and
          because the frame was shot into a pale sky that is already very
          near `#f3e6d8`, there is no line where one becomes the other. It
          also means the birds and the treeline carry on into the type's
          half instead of stopping at a border.

          Masking rather than an opaque overlay on top: an overlay has to
          guess a single flat colour to paint, and the band underneath is a
          three-stop gradient, so the guess is visible everywhere it is
          wrong. */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[72%] sm:block"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, #000 42%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 42%)",
        }}
      >
        {/* `priority`: this is the largest element above the fold, so
            leaving it to lazy-load makes it the Largest Contentful Paint
            and then delays it on purpose. */}
        <Image
          src="/hero/under-construction.webp"
          alt=""
          fill
          priority
          /* The rendered box, not half the viewport: the sidebar and the
             1400px cap bound the main column. Overstating this makes
             `next/image` reach for the 1920px variant of a 630px box. */
          sizes="(min-width: 1024px) 800px, 72vw"
          /* Anchored right so the mask eats sky and treeline on the left
             rather than cutting the corner off the building. */
          className="object-cover object-right"
        />
      </div>

      <div className="relative max-w-md">
        <h2 className="font-display text-3xl leading-[1.1] text-deep lg:text-4xl">
          Repair.
          <br />
          Renovate.
          <br />
          Reimagine.
        </h2>
        <p className="mt-2 font-display text-xl italic text-accent">
          Sorted in minutes.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-deep-soft">
          Spaces that inspire.
          <br />
          Solutions that last.
        </p>

        <Link
          href="/products"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-deep px-5 text-xs font-medium text-white transition-colors hover:bg-deep-soft"
        >
          Explore the catalogue
          <Chevron className="size-3.5" />
        </Link>
      </div>

      <Link
        href="/products?sort=newest"
        className="absolute right-4 top-4 hidden items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-[11px] text-ink shadow-sm transition-colors hover:text-accent sm:inline-flex"
      >
        Top brands
        <Chevron className="size-3" />
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------- trust bar */

const TRUST = [
  { Icon: Shield, label: "Premium Quality" },
  { Icon: Headset, label: "Expert Guidance" },
  { Icon: Grid, label: "Wide Selection" },
  { Icon: Truck, label: "Fast Delivery" },
];

export function TrustBar() {
  return (
    /* Four claims across, mark above label.
       They were one card each, full width, after a previous pass moved
       them off a hairline strip that read as a footer which had drifted up
       the page. That reasoning holds and the card is kept — but a fourth
       claim turns a column of full-width cards into a screen of its own
       before the catalogue is reached. Stacking the mark over the label
       fits all four on the narrowest phone without shrinking either. */
    <ul className="grid grid-cols-4 gap-2">
      {TRUST.map(({ Icon, label }) => (
        <li
          key={label}
          className="flex flex-col items-center gap-2 rounded-card border border-line-soft bg-surface px-1 py-3 text-center"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
            <Icon className="size-4.5" />
          </span>
          <span className="text-[11px] leading-tight text-ink sm:text-xs">{label}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------- category cards */

/**
 * Category tiles with a real price floor.
 *
 * `From ₹49` is the cheapest active variant in the category, not a
 * marketing number — a floor nobody can actually buy at is the fastest
 * way to lose trust on the first click.
 *
 * The tile itself is shared with the `/categories` grid. The two show the
 * same categories one tap apart and differ only in what the caption says,
 * so they must not drift into two different objects.
 */
export function CategoryCards({
  categories,
  priceFloors,
}: {
  categories: Category[];
  priceFloors: Map<string, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-4 lg:px-0">
      {categories.map((c) => {
        const floor = priceFloors.get(c.id);
        return (
          <CategoryTile
            key={c.id}
            category={c}
            fill
            caption={
              floor != null ? `From ${formatPrice(floor)}` : `${c.productCount} products`
            }
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- brand strip */

/**
 * Associated brands, one line deep.
 *
 * Three across on a phone, one line of eight on a desktop. This was a
 * scrolling rail, on the argument that eighteen plates stacked three rows
 * high gave a footnote the vertical weight of a category section. Only
 * eight are fetched now, so that reasoning no longer holds, and the page
 * asks for no sideways swipe anywhere — a brand nobody scrolls to is not
 * on the page.
 *
 * Each plate carries the manufacturer's own mark where `BRAND_LOGOS` has
 * the artwork and the brand's name set in type where it does not. The
 * second case is not a placeholder waiting to be fixed: a logo is a
 * trademark, so a mark appears only once we hold the file and the right
 * to show it, and a name is the honest way to say the rest.
 */
export function BrandStrip({
  brands,
}: {
  brands: { id: string; slug: string; name: string }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-5 sm:grid-cols-4 lg:grid-cols-8 lg:px-0">
      {brands.map((b) => {
        const logo = BRAND_LOGOS[b.slug];
        return (
          <Link
            key={b.id}
            href={`/products?brand=${b.slug}`}
            className="group grid h-12 w-full place-items-center rounded-xl border border-line-soft bg-surface px-3 transition-colors hover:border-accent-edge"
          >
            {logo ? (
              /* Not next/image: these are already optimised vector files a
                 few kilobytes each, and routing them through the image
                 pipeline rasterises artwork drawn to stay sharp. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={b.name}
                loading="lazy"
                decoding="async"
                className="max-h-6 max-w-full object-contain"
              />
            ) : (
              <span className="max-w-full truncate text-[13px] font-medium text-deep-soft transition-colors group-hover:text-accent">
                {b.name}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- pro banner */

export function ProBanner({ cartCount }: { cartCount: number }) {
  return (
    <div className="grid gap-3 px-5 sm:grid-cols-[1fr_auto] lg:px-0">
      <Link
        href="/pro"
        className="flex items-center gap-3 rounded-card bg-deep px-4 py-3.5 transition-colors hover:bg-deep-soft"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pro/20 text-pro">
          <Crown className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white">
            Unlock professional benefits
          </span>
          <span className="block text-[11px] leading-tight text-white/65">
            Join Quoin Pro for trade pricing and a dedicated project manager
          </span>
        </span>
        <Chevron className="size-4 shrink-0 text-white/70" />
      </Link>

      <Link
        href="/cart"
        className="flex items-center gap-3 rounded-card border border-line-soft bg-surface px-4 py-3.5 transition-colors hover:border-accent-edge"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
          <Bricks className="size-5" />
        </span>
        <span>
          <span className="block text-sm font-medium text-ink">Cart</span>
          <span className="block text-[11px] text-muted">
            {cartCount} {cartCount === 1 ? "item" : "items"}
          </span>
        </span>
        <Chevron className="size-4 shrink-0 text-muted" />
      </Link>
    </div>
  );
}

/* --------------------------------------------------------- department row */

/**
 * Icons for the department strip, by category slug.
 *
 * A small hand-made map rather than a picture: at this size a photograph
 * of a tap is a grey smudge, and the row is for orientation rather than
 * browsing. Categories without an entry fall back to the crate, which
 * reads as "goods" and never as the wrong thing.
 */
const DEPARTMENT_ICONS: Record<string, typeof Chevron> = {
  "bathware-plumbing": Tap,
  "kitchen-sinks-faucets": Tap,
  "electricals-lighting": Lamp,
  "hardware-locks": Hammer,
  "kitchen-wardrobe-fittings": Hammer,
  "tools-safety": Helmet,
  "cement-steel": Bricks,
  "tiling-adhesives": Bricks,
  "plywood-laminates": Boards,
  "paints-finishes": Boards,
  "gypsum-false-ceiling": Boards,
  "home-appliances-security": Shield,
  waterproofing: Tap,
  services: Building,
};

/**
 * Departments, as a row of names under icons.
 *
 * The category cards above sell four; this reaches the rest without
 * another wall of tiles, and is the fastest route to a section for
 * someone who already knows what they came for.
 */
export function DepartmentRow({ categories }: { categories: Category[] }) {
  return (
    <div className="rail gap-1 px-5 lg:gap-3 lg:px-0">
      {categories.map((c) => {
        const Icon = DEPARTMENT_ICONS[c.slug] ?? Crown;
        return (
          <Link
            key={c.id}
            href={`/c/${c.slug}`}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 rounded-tile px-1 py-2 text-center transition-colors hover:bg-hover lg:w-24"
          >
            <Icon className="size-7 text-deep transition-colors group-hover:text-accent" />
            <span className="text-[10px] leading-tight text-muted group-hover:text-ink lg:text-[11px]">
              {c.title}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
