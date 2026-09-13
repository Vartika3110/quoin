"use client";

import Link from "next/link";
import { ACCOUNT_SECTIONS } from "@/components/storefront/account/account-sections";
import { Chevron, Headset } from "@/components/icons";
import { useProjects } from "@/lib/store/projects";
import { useWishlist } from "@/lib/store/wishlist";
import { formatPrice, type Paise } from "@/lib/types/catalog";

/**
 * The account, as a list of rows.
 *
 * What a phone wants here. The desktop overview is a dashboard — summary
 * figures, a Pro card, staff tools — because there is room for one and a
 * pointer to scan it with. On a 390px screen the same layout is four
 * stacked cards and a scroll, when what someone opening "Account" wants is
 * to get to Orders.
 *
 * So: 52px rows, an icon each, the whole row a target. Every section is
 * listed including the empty ones, because a row that appears only once it
 * has data is a row customers never learn exists.
 *
 * Sub-labels are true or they are neutral — never the two counts that live
 * only in this browser's `localStorage` (projects, saved products) shown
 * with more confidence than they deserve. Those two read "loading…" for
 * one frame rather than a wrong number, the same rule `AccountSummary`
 * follows for the desktop dashboard.
 *
 * Quoin Pro is not a row here: a member on the Standard tier sees it as
 * its own banner above this list, and a Pro member already has "Quoin
 * Pro" as a badge on the profile card — this list adds it back only for a
 * Pro member, as the one place to see the plan again.
 */
export function AccountLinks({
  orderCount,
  addressCount,
  consultationCount,
  walletPaise,
  isPro,
}: {
  orderCount: number;
  addressCount: number;
  consultationCount: number;
  walletPaise: Paise;
  isPro: boolean;
}) {
  const { projects, ready: projectsReady } = useProjects();
  const { count: savedCount, ready: wishlistReady } = useWishlist();

  const subLabel = (href: string): string => {
    switch (href) {
      case "/account/orders":
        return orderCount === 0
          ? "No orders yet"
          : `${orderCount} order${orderCount === 1 ? "" : "s"} placed`;
      case "/account/projects":
        if (!projectsReady) return "Budget, materials and tasks";
        return projects.length === 0
          ? "None started yet"
          : `${projects.length} project${projects.length === 1 ? "" : "s"}`;
      case "/account/wishlist":
        if (!wishlistReady) return "Everything you have shortlisted";
        return savedCount === 0
          ? "Nothing saved yet"
          : `${savedCount} product${savedCount === 1 ? "" : "s"} saved`;
      case "/account/services":
        return consultationCount === 0
          ? "Track, reschedule or book a call"
          : `${consultationCount} consultation${consultationCount === 1 ? "" : "s"} booked`;
      case "/account/addresses":
        return addressCount === 0
          ? "Save an address for faster delivery"
          : `${addressCount} address${addressCount === 1 ? "" : "es"} saved`;
      case "/account/payments":
        return `Wallet balance ${formatPrice(walletPaise)}`;
      case "/account/documents":
        return "Nothing filed yet";
      case "/account/settings":
        return "Your details and this device's session";
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

        {/* Not a section of its own — there is no help centre to route to
            — so it goes where a customer looks for it and lands on the one
            real way to reach a person. */}
        <li>
          <Link
            href="/consult"
            className="flex min-h-13 items-center gap-3.5 px-4 py-3 transition-colors active:bg-hover"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-muted">
              <Headset className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body text-ink">Help &amp; support</span>
              <span className="block text-caption text-muted">
                Book a call or a site visit
              </span>
            </span>
            <Chevron className="size-4 shrink-0 text-faint" />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
