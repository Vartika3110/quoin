import Link from "next/link";
import { Shield, Truck, Headset, CheckCircle } from "@/components/icons";

/**
 * The footer.
 *
 * Exists mostly so the desktop page has an ending. On a phone it sits
 * above the tab bar and is padded to clear it.
 *
 * Two columns of links on a phone, four across from `lg`. Stacked in one
 * column it was three screens of ladder — thirteen links at a row each,
 * under a heading each, under a paragraph — and a phone already carries
 * six of those destinations in the tab bar, so the reader is scrolling
 * past a list of places they are standing in. Two columns halves it
 * without hiding anything behind a disclosure, which is the other way
 * this gets solved and the one that makes a link unfindable.
 *
 * **Installed, almost all of this goes.** A footer is how a web page
 * ends; an app does not end, and nobody has ever scrolled to the bottom
 * of a tab to navigate. Under `app:` the trust row, the wordmark and the
 * three link columns are hidden and every destination in them is reached
 * the way it already is on a phone — the four tabs, the header menu, and
 * the home page's own entry cards and quick actions.
 *
 * The one thing that stays is the last line, and it stays because it is a
 * disclosure rather than navigation: prices include GST, delivery times
 * are scoped to the areas at checkout. That does not become optional
 * because the customer installed the icon.
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
      { href: "/studio", label: "Project Studio" },
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
  /* Not optional decoration. An Indian e-commerce site takes payments
     through a gateway, and Razorpay, PayU and Cashfree all require these
     five pages — and a named grievance officer with a response time — to
     be reachable from every page before they will activate an account.
     The footer is where a reviewer looks for them. */
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/refunds", label: "Refunds & cancellations" },
      { href: "/grievance", label: "Grievance officer" },
      { href: "/contact", label: "Contact us" },
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
    <footer className="mt-16 border-t border-line-soft bg-surface app:mt-6 app:border-t-0 app:bg-transparent">
      {/* The bottom padding on a phone clears the fixed bars, and there
          can still be two: the tab bar is about 60px and the floating
          cart bar adds roughly 76 above it. A page's own `StickyBar` is
          no longer one of the pairs — `MobileTabBar` stands down for it,
          so a product or listing page has a single bar — but the cart bar
          rides above the tab bar and the deepest case is unchanged.
          Padded for the worst case rather than measured, because the
          alternative is making the footer a client component to ask
          whether a bar is mounted, and the cost of being wrong is 48px of
          blank paper. */}
      <div className="mx-auto max-w-shell px-5 pb-36 pt-8 app:pt-6 lg:px-6 lg:pb-14 lg:pt-14">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line-hair pb-6 app:hidden lg:grid-cols-4 lg:gap-4 lg:pb-8">
          {TRUST.map(({ Icon, label }) => (
            <li key={label} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
              <span className="text-micro leading-snug text-muted lg:text-caption">
                {label}
              </span>
            </li>
          ))}
        </ul>

        <div className="pt-7 app:hidden lg:grid lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8 lg:pt-8">
          <div>
            <p className="font-display text-title tracking-[0.18em] text-ink lg:text-title-lg">
              QUOIN
            </p>
            <p className="mt-2 max-w-xs text-body-sm leading-relaxed text-muted lg:mt-3">
              Materials, premium interiors and verified expert services —
              brought together so a build is one project rather than forty
              separate purchases.
            </p>
          </div>

          {/* `lg:contents` dissolves this wrapper from `lg`, so the three
              navs become direct children of the four-column grid above
              rather than one cell inside it. Two layouts, one tree. */}
          <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-7 lg:mt-0 lg:contents">
            {COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-micro font-semibold uppercase tracking-wide text-ink">
                  {column.title}
                </h2>
                <ul className="mt-2.5 space-y-1.5 lg:mt-3 lg:space-y-2">
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
        </div>

        {/* Inset from the right on a phone so the floating consult button
            never sits on top of it. This is the last text on the page and
            the bubble is pinned just above the tab bar, so without the
            inset they overlap every time — on a line that says what the
            prices include, which is the one line that has to be readable. */}
        {/* The `app:` resets are because everything this line was sitting
            under is gone in the app: a rule and 32px of margin above the
            only remaining paragraph would be a divider dividing nothing. */}
        <p className="mt-8 border-t border-line-hair pt-5 pr-20 text-micro leading-relaxed text-faint app:mt-0 app:border-t-0 app:pt-0 lg:mt-10 lg:pr-0 lg:pt-6">
          © {new Date().getFullYear()} Quoin. Prices include GST where
          applicable. Delivery times apply to the areas listed at checkout.
        </p>
      </div>
    </footer>
  );
}
