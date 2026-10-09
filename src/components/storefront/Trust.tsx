import { CheckCircle, Headset, Shield, Truck } from "@/components/icons";

/**
 * The four things Quoin stands behind, and the two ways they are drawn.
 *
 * The wording lived in `SiteFooter.tsx` until the home page needed the
 * same four lines under its hero. Two copies of four claims is how a
 * site ends up promising "Delivery promised per item" in one place and
 * "Fast delivery" in another — so the strings moved here, and both
 * renderings read from one array.
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
 * Each claim carries two wordings, and the second one is why.
 *
 * `label` is the full line, used wherever there is room for a sentence
 * — the pills above the footer, which sit on their own row and wrap
 * freely. `short` is for the four-across row under the home hero, where
 * each column is about 80px on a 375px screen: every full line broke
 * onto three ragged lines there, and four sentences across a phone was
 * never going to work. The reference gets away with four columns
 * because its labels are two words each.
 *
 * The short forms say less, not something different. "Verified brands"
 * is the same claim as "Verified brands and suppliers" with the second
 * noun dropped; "Delivery dates" is the promise the catalogue actually
 * makes, item by item. None of them is upgraded into something bigger
 * on the way down — the temptation at four columns is to write "Fast
 * Delivery", which is the one thing this list must not say.
 */
export const TRUST = [
  {
    Icon: CheckCircle,
    label: "Verified brands and suppliers",
    short: "Verified brands",
  },
  { Icon: Truck, label: "Delivery promised per item", short: "Delivery dates" },
  {
    Icon: Headset,
    label: "Support from people who build",
    short: "Expert support",
  },
  { Icon: Shield, label: "Secure checkout", short: "Secure checkout" },
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

/**
 * The same four claims, as a row of four under the home page's hero.
 *
 * Icon above label rather than beside it, and four equal columns rather
 * than a scrolling rail: this one sits directly beneath the hero card at
 * the top of the page, where it is read as part of the opening rather
 * than as a footnote, and where four across is what the reference draws.
 *
 * **Four across at every width**, as the reference draws it, which is
 * only possible because this row uses `short` rather than `label` —
 * see the note on `TRUST`. Each column is about 80px on a 375px
 * screen, so the type steps down to 10px there and back up from `lg`.
 * That is the same trick the reference uses; its labels are set at 9px.
 *
 * `whitespace-nowrap` is deliberate and is the thing to watch. It
 * guarantees one line, which is what was asked for, and the cost is
 * that a longer label added here will overflow its column rather than
 * wrap out of sight. Keep anything added to this list to roughly the
 * length of the existing four.
 *
 * Only the home page renders this, and the home page suppresses the
 * pills above the footer in exchange — see `showTrustPills` on
 * `AppShell`. Four claims twice on one page is not twice as reassuring.
 */
export function TrustRow() {
  return (
    <ul className="grid grid-cols-4 gap-x-2 pt-6 lg:gap-x-6">
      {TRUST.map(({ Icon, short }) => (
        <li key={short} className="flex flex-col items-center gap-2 text-center">
          <Icon className="size-5 shrink-0 text-accent" />
          <span className="whitespace-nowrap text-[0.625rem] font-medium leading-none text-muted lg:text-caption">
            {short}
          </span>
        </li>
      ))}
    </ul>
  );
}
