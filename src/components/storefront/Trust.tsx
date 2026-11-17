import { CheckCircle, Headset, Shield, Truck } from "@/components/icons";

/**
 * The four things Quoin stands behind.
 *
 * The wording lived in `SiteFooter.tsx` until the home page needed the
 * same four lines under its hero. Two copies of four claims is how a
 * site ends up promising "Delivery promised per item" in one place and
 * "Fast delivery" in another — so the strings moved here. The home
 * page's row has since been taken out and the pills above the footer
 * are the only rendering left, but the strings stay here: one list is
 * what kept the two honest, and it is what any third would read from.
 *
 * Every line is deliberately a fact rather than an adjective. The design
 * reference this row is drawn from labels them *Premium Quality*,
 * *Expert Guidance*, *Wide Selection* and *Fast Delivery*; those are the
 * prototype's words and they are not used, because three of them claim
 * nothing checkable and the fourth is a delivery promise this app does
 * not make anywhere else — the catalogue says a date per item, which is
 * a narrower and truer thing. Take the prototype's layout, not its
 * guarantees.
 *
 * There was a second, shorter wording per claim — "Verified brands",
 * "Delivery dates" — cut to four 80px columns under the hero. It went
 * with that row. If a cramped rendering ever needs one again, shorten
 * the claim, never upgrade it: the temptation at four columns is to
 * write "Fast Delivery", which is the one thing this list must not say.
 */
export const TRUST = [
  { Icon: CheckCircle, label: "Verified brands and suppliers" },
  { Icon: Truck, label: "Delivery promised per item" },
  { Icon: Headset, label: "Support from people who build" },
  { Icon: Shield, label: "Secure checkout" },
];

/**
 * The four claims, as pills, at the foot of the page.
 *
 * They used to be a 2x2 grid of icon-and-text rows inside the footer's
 * own panel, above a rule. That made them look like the footer's first
 * column — a heading-less list among three headed ones — when they are
 * not navigation at all. A pill reads as a badge: a short standing fact,
 * complete in itself, not a link you failed to notice.
 *
 * Outside `<footer>` so they sit on the page's ground with the footer's
 * top border beneath them. The separation is the point of the change:
 * the page ends with what Quoin stands behind, and then the footer
 * begins.
 *
 * A rail on a phone, a centred wrap from `lg`. Four pills of this length
 * is more than 375px holds, and wrapping them there gives two ragged
 * rows; scrolled, the row stays one line and reads as one statement.
 */
export function TrustPills() {
  return (
    <div className="mx-auto w-full max-w-shell app:hidden lg:px-6">
      {/* `-mx-5 px-5` lets the row bleed to the screen edge on a phone
          while keeping the first and last pill off it, and `scroll-pl-5`
          is what stops snap parking a pill flush against that edge — see
          the note on `.rail` in globals.css. All three reset at `lg`,
          where the row wraps and centres instead. */}
      <ul className="rail -mx-5 gap-2 px-5 pb-6 scroll-pl-5 lg:mx-0 lg:flex-wrap lg:justify-center lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-10 lg:scroll-pl-0">
        {TRUST.map(({ Icon, label }) => (
          <li key={label}>
            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line-soft bg-surface px-3.5 py-2 text-micro text-muted lg:text-caption">
              <Icon className="size-4 shrink-0 text-accent" />
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
