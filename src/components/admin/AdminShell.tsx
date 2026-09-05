import Link from "next/link";
import { cn } from "@/components/ui/cn";
import {
  Box,
  Grid,
  Package,
  People,
  Rupee,
  Sparkle,
} from "@/components/icons";

/**
 * The internal tools' frame.
 *
 * Admin deliberately does not wear the storefront chrome. There is no
 * search bar, no cart, no area picker and no footer, because none of them
 * mean anything to someone processing an order — and because a screen that
 * looks like the shop invites the mistake of thinking you are looking at
 * what a customer sees. It uses the same design tokens, so it is
 * recognisably the same product, and none of the same furniture.
 *
 * Before this existed, `/admin/pricing` and `/admin/images` were two
 * unlinked URLs you had to already know about. They are sections here now:
 * a tool nobody can navigate to is a tool nobody uses.
 *
 * Not a guard. Every page calls `requireStaffPage()` itself — see the note
 * there on why the check does not belong in a layout.
 */

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Dashboard", Icon: Grid },
  { href: "/admin/orders", label: "Orders", Icon: Package },
  { href: "/admin/inventory", label: "Inventory", Icon: Box },
  { href: "/admin/customers", label: "Customers", Icon: People },
  { href: "/admin/pricing", label: "Pricing", Icon: Rupee },
  { href: "/admin/images", label: "Images", Icon: Sparkle },
] as const;

export function AdminShell({
  current,
  title,
  subtitle,
  actions,
  children,
}: {
  /** The `href` of the section being shown. */
  current: string;
  title: string;
  subtitle?: string;
  /** Buttons that belong to this screen, set beside its heading. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-bg">
      <header className="border-b border-line-soft bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <Link
            href="/admin"
            className="font-cormorant text-title-sm tracking-wide text-ink"
          >
            QUOIN
          </Link>
          {/* Says which side of the product you are on. Staff hold both
              this and the storefront open at once, and the two look alike
              enough at a glance to act on the wrong one. */}
          <span className="rounded-full bg-accent-wash px-2 py-0.5 text-micro font-medium uppercase tracking-wide text-accent">
            Internal
          </span>
          <Link
            href="/"
            className="ml-auto text-caption text-muted hover:text-ink"
          >
            View the storefront
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 lg:flex lg:gap-10 lg:py-8">
        <nav aria-label="Admin sections" className="lg:w-48 lg:shrink-0">
          {/* The rail on a desktop. */}
          <ul className="sticky top-6 hidden space-y-0.5 lg:block">
            {ADMIN_SECTIONS.map(({ href, label, Icon }) => {
              const on = href === current;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm transition-colors",
                      on
                        ? "bg-accent-wash font-medium text-accent"
                        : "text-muted hover:bg-raised hover:text-ink",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* A scrolling chip row on a phone. Same sections, same order —
              an admin who learns the rail should not have to relearn it on
              a handset at a warehouse door. */}
          <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADMIN_SECTIONS.map(({ href, label, Icon }) => {
              const on = href === current;
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption transition-colors",
                      on
                        ? "border-accent bg-accent-wash font-medium text-accent"
                        : "border-line-soft bg-surface text-muted",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 pt-6 lg:pt-0">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-title font-semibold text-ink">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-body-sm leading-relaxed text-muted">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
