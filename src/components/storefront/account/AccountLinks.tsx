import Link from "next/link";
import { ACCOUNT_SECTIONS } from "@/components/storefront/account/AccountShell";
import { Chevron, Headset } from "@/components/icons";

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
 */
export function AccountLinks() {
  return (
    <nav aria-label="Account sections" className="lg:hidden">
      <ul className="divide-y divide-line-hair overflow-hidden rounded-card border border-line-soft bg-surface">
        {ACCOUNT_SECTIONS.filter((s) => s.href !== "/account").map(
          ({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-13 items-center gap-3.5 px-4 py-3 transition-colors active:bg-hover"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-muted">
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1 text-body text-ink">{label}</span>
                <Chevron className="size-4 shrink-0 text-faint" />
              </Link>
            </li>
          ),
        )}

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
            <span className="min-w-0 flex-1 text-body text-ink">
              Help &amp; support
            </span>
            <Chevron className="size-4 shrink-0 text-faint" />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
