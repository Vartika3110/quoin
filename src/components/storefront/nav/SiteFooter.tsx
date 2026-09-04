import Link from "next/link";
import { Shield, Truck, Headset, CheckCircle } from "@/components/icons";

/**
 * The footer.
 *
 * Exists mostly so the desktop page has an ending. On a phone it sits
 * above the tab bar and is padded to clear it.
 *
 * The trust row is four claims Quoin can actually stand behind — a
 * verified-supplier catalogue, a delivery promise scoped per item, staffed
 * support, and returns. Nothing here says "100% genuine" or "best price",
 * because neither is a commitment anyone in the business has made.
 */

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/categories", label: "All categories" },
      { href: "/products", label: "All products" },
      { href: "/deals", label: "Deals" },
      { href: "/products?sort=newest", label: "New arrivals" },
    ],
  },
  {
    title: "Build",
    links: [
      { href: "/projects", label: "Project Hub" },
      { href: "/upload", label: "Upload Parcha" },
      { href: "/services", label: "Expert services" },
      { href: "/consult", label: "Talk to an expert" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/account", label: "Your account" },
      { href: "/account/orders", label: "Orders" },
      { href: "/account/wishlist", label: "Saved products" },
      { href: "/pro", label: "Quoin Pro" },
    ],
  },
];

const TRUST = [
  { Icon: CheckCircle, label: "Verified brands and suppliers" },
  { Icon: Truck, label: "Delivery promised per item" },
  { Icon: Headset, label: "Support from people who build" },
  { Icon: Shield, label: "Secure checkout" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line-soft bg-surface">
      {/* `pb-28` on a phone clears the fixed tab bar. Without it the
          copyright line sits underneath it and cannot be read. */}
      <div className="mx-auto max-w-shell px-5 pb-28 pt-10 lg:px-6 lg:pb-14 lg:pt-14">
        <ul className="grid grid-cols-2 gap-4 border-b border-line-hair pb-8 lg:grid-cols-4">
          {TRUST.map(({ Icon, label }) => (
            <li key={label} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4.5 shrink-0 text-accent" />
              <span className="text-caption leading-snug text-muted">{label}</span>
            </li>
          ))}
        </ul>

        <div className="grid gap-8 pt-8 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <p className="font-display text-title-lg tracking-[0.18em] text-ink">
              QUOIN
            </p>
            <p className="mt-3 max-w-xs text-body-sm leading-relaxed text-muted">
              Materials, premium interiors and verified expert services —
              brought together so a build is one project rather than forty
              separate purchases.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-micro font-semibold uppercase tracking-wide text-ink">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-body-sm text-muted transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-10 border-t border-line-hair pt-6 text-micro text-faint">
          © {new Date().getFullYear()} Quoin. Prices include GST where
          applicable. Delivery times apply to the areas listed at checkout.
        </p>
      </div>
    </footer>
  );
}
