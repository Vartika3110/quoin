"use client";

import Link from "next/link";
import { ACCOUNT_SECTIONS } from "@/components/storefront/account/account-sections";
import { plural } from "@/lib/account/greeting";
import { Chevron } from "@/components/icons";
import { useWishlist } from "@/lib/store/wishlist";
import { formatPrice, type Paise } from "@/lib/types/catalog";

/**
 * The account, as a list of rows.
 *
 * What a phone wants here. The desktop overview is a dashboard — summary
 * cards, a Pro card, staff tools — because there is room for one and a
 * pointer to scan it with. On a 390px screen the same layout is six
 * stacked cards and a scroll, when what someone opening "Account" wants is
 * to get to Orders.
 *
 * So: 52px rows, an icon each, the whole row a target. Every section is
 * listed including the empty ones, because a row that appears only once it
 * has data is a row customers never learn exists.
 *
 * Every count here except Saved comes down from the server-rendered
 * overview (`getAccountOverview`, `src/lib/data/account-overview.ts`) that
 * the desktop cards already read — projects moved off `localStorage` onto
 * the account months before this row list did (see "Client state" in
 * `docs/design-system.md`), so there is no reason left to make this list
 * re-fetch a project count through `useProjects()` just to show it a
 * second time. Saved products are the one figure that still lives only in
 * this browser, so it is the one sub-label that still reads "loading…"
 * for a frame rather than a wrong number.
 */
export function AccountLinks({
  activeProjectCount,
  activeOrderCount,
  upcomingServiceCount,
  documentCount,
  addressCount,
  walletPaise,
  isPro,
}: {
  activeProjectCount: number;
  activeOrderCount: number;
  upcomingServiceCount: number;
  documentCount: number;
  addressCount: number;
  walletPaise: Paise;
  isPro: boolean;
}) {
  const { count: savedCount, ready: wishlistReady } = useWishlist();

  const subLabel = (href: string): string => {
    switch (href) {
      case "/account/orders":
        return activeOrderCount === 0
          ? "No active orders"
          : `${activeOrderCount} ${plural(activeOrderCount, "active order", "active orders")}`;
      case "/account/projects":
        return activeProjectCount === 0
          ? "None started yet"
          : `${activeProjectCount} ${plural(activeProjectCount, "active project", "active projects")}`;
      case "/account/services":
        return upcomingServiceCount === 0
          ? "Nothing upcoming"
          : `${upcomingServiceCount} ${plural(upcomingServiceCount, "upcoming service", "upcoming services")}`;
      case "/account/wishlist":
        if (!wishlistReady) return "Everything you have shortlisted";
        return savedCount === 0
          ? "Nothing saved yet"
          : `${savedCount} ${plural(savedCount, "product saved", "products saved")}`;
      case "/account/documents":
        return documentCount === 0
          ? "Nothing filed yet"
          : `${documentCount} ${plural(documentCount, "document", "documents")}`;
      case "/account/addresses":
        return addressCount === 0
          ? "Save an address for faster delivery"
          : `${addressCount} ${plural(addressCount, "address", "addresses")} saved`;
      case "/account/payments":
        return `Wallet balance ${formatPrice(walletPaise)}`;
      case "/account/settings":
        return "Your details and this device's session";
      case "/account/support":
        return "Get in touch, or find an answer";
      case "/pro":
        return "You are a Pro member";
      default:
        return "";
    }
  };

  const sections = ACCOUNT_SECTIONS.filter(
    (s) => s.href !== "/account" && (s.href !== "/pro" || isPro),
  );

  return (
    <nav aria-label="Account sections" className="lg:hidden">
      <ul className="divide-y divide-line-hair overflow-hidden rounded-card border border-line-soft bg-surface">
        {sections.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-13 items-center gap-3.5 px-4 py-3 transition-colors active:bg-hover"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-muted">
                <Icon className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ink">{label}</span>
                <span className="block truncate text-caption text-muted">
                  {subLabel(href)}
                </span>
              </span>
              <Chevron className="size-4 shrink-0 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
