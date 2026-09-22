import Link from "next/link";
import { Box, Briefcase, CreditCard, Layers, Package, Truck, Upload, User } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { SUPPORT_CATEGORIES } from "@/lib/support/faq";
import type { SupportCategorySlug } from "@/lib/data/support";

/** One icon per category. Kept here rather than on `SupportCategoryInfo`
    itself, so `faq.ts` stays plain content with no React import. */
const ICON: Record<SupportCategorySlug, typeof Package> = {
  orders: Package,
  payments: CreditCard,
  delivery: Truck,
  products: Box,
  projects: Layers,
  services: Briefcase,
  parcha: Upload,
  account: User,
};

/**
 * The eight entry points into the FAQ.
 *
 * Plain links to `?category=`, not a client component — the result is a
 * URL a colleague can be sent, same reasoning as `OrderStatusFilterForm`.
 * Clicking the tile already active clears the filter rather than doing
 * nothing, so there is always a way back to "everything" without a
 * separate control.
 */
export function SupportCategoryTiles({ current }: { current?: SupportCategorySlug }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {SUPPORT_CATEGORIES.map(({ slug, label, summary }) => {
        const Icon = ICON[slug];
        const on = slug === current;
        return (
          <Link
            key={slug}
            href={on ? "/account/support" : `/account/support?category=${slug}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex flex-col gap-2 rounded-card border p-3.5 text-left transition-colors",
              on
                ? "border-accent-edge bg-accent-wash"
                : "border-line-soft bg-surface hover:border-accent-edge hover:bg-hover",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                on ? "bg-accent text-on-accent" : "bg-accent-wash text-accent",
              )}
            >
              <Icon className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-body-sm font-semibold text-ink">{label}</span>
              <span className="mt-0.5 block text-micro leading-snug text-muted">{summary}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
