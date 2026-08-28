import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import {
  Building,
  Chevron,
  Crown,
  Bricks,
  Helmet,
  Lamp,
  Partners,
  Shield,
  Box,
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

const ENTRIES = [
  {
    href: "/studio",
    eyebrow: "QUOIN",
    label: "Your Design Platform",
    Icon: Building,
  },
  {
    href: "/c/services",
    eyebrow: "SERVICES",
    label: "Professional Services",
    Icon: Helmet,
  },
  {
    href: "/products",
    eyebrow: "PRODUCTS",
    label: "Construction Materials",
    Icon: Bricks,
  },
  {
    href: "/products?sort=price",
    eyebrow: "ARCHITECTURAL PREMIUM STUDIO",
    label: "Bespoke Products",
    Icon: Lamp,
  },
];

/** The four ways into the catalogue, above everything else on the page. */
export function EntryTiles() {
  return (
    <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
      {ENTRIES.map(({ href, eyebrow, label, Icon }) => (
        <Link
          key={eyebrow}
          href={href}
          className="group relative flex w-44 flex-col items-center gap-2 rounded-card border border-line-soft bg-surface px-3 pb-9 pt-4 text-center transition-colors hover:border-accent-edge lg:w-auto"
        >
          {/* Two lines of headroom so a long name does not shove the icon
              down and break alignment across the row. */}
          <p className="flex min-h-8 items-center text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink">
            {eyebrow}
          </p>
          <Icon className="size-9 text-deep" />
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
      className="flex items-center justify-between gap-3 rounded-card border border-line-soft bg-surface px-4 py-3 transition-colors hover:border-accent-edge"
    >
      <div>
        <p className="text-sm font-semibold leading-tight text-accent">
          Video consultation
        </p>
        <p className="text-xs text-muted">Talk to our experts</p>
      </div>
      <Video className="size-8 shrink-0 text-deep" />
      <Chevron className="size-4 shrink-0 text-muted" />
    </Link>
  );
}

/* -------------------------------------------------------------------- hero */

/**
 * The headline promise.
 *
 * The reference carries a photograph here. Until Quoin has one it is a
 * warm gradient — deliberately not a competitor's building shot — and the
 * type is sized to survive the swap without reflowing.
 */
export function Hero() {
  return (
    <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-[#f3e6d8] via-[#eddcc9] to-[#e2c9ae] px-6 py-7 lg:px-10 lg:py-10">
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
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-deep px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-deep-soft"
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
  { Icon: Shield, label: "Trusted by professionals" },
  { Icon: Box, label: "Powered by the Quoin network" },
  { Icon: Partners, label: "Industry partners" },
];

export function TrustBar() {
  return (
    <ul className="flex items-center justify-between gap-2 rounded-card border border-line-soft bg-surface px-4 py-3 text-[11px] text-muted">
      {TRUST.map(({ Icon, label }, i) => (
        <li
          key={label}
          className={`flex flex-1 items-center gap-2 ${
            i > 0 ? "border-l border-line-soft pl-3" : ""
          }`}
        >
          <Icon className="size-4 shrink-0 text-accent" />
          <span className="leading-tight">{label}</span>
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
 */
export function CategoryCards({
  categories,
  priceFloors,
}: {
  categories: Category[];
  priceFloors: Map<string, number>;
}) {
  return (
    <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
      {categories.map((c) => {
        const floor = priceFloors.get(c.id);
        return (
          <Link
            key={c.id}
            href={`/c/${c.slug}`}
            className="flex w-44 flex-col rounded-card border border-line-soft bg-surface p-3 transition-colors hover:border-accent-edge lg:w-auto"
          >
            <h3 className="text-sm font-medium leading-snug text-ink">
              {c.title}
            </h3>

            <div className="my-3 flex items-end justify-center gap-1">
              {c.images.slice(0, 3).map((img) => (
                <span
                  key={img}
                  className="overflow-hidden rounded-lg border border-line-soft"
                >
                  <Swatch swatchKey={img} label="" className="size-14" />
                </span>
              ))}
            </div>

            <span className="mt-auto flex items-center justify-between rounded-lg bg-accent-wash px-2.5 py-1.5 text-[11px] text-accent">
              {floor != null ? `From ${formatPrice(floor)}` : `${c.productCount} products`}
              <Chevron className="size-3" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- category chips */

export function CategoryChips({ categories }: { categories: Category[] }) {
  return (
    <div className="rail gap-2 px-5 lg:flex-wrap lg:overflow-visible lg:px-0">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/c/${c.slug}`}
          className="flex items-center gap-2 rounded-full border border-line-soft bg-surface px-3 py-2 text-[11px] text-ink transition-colors hover:border-accent-edge hover:text-accent"
        >
          <span className="overflow-hidden rounded-md">
            <Swatch swatchKey={c.images[0] ?? "cement"} label="" className="size-6" />
          </span>
          <span className="whitespace-nowrap">{c.title}</span>
        </Link>
      ))}
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
