import { CheckCircle, Headset, Shield, Truck } from "@/components/icons";

/**
 * Four claims, each one Quoin can actually stand behind.
 *
 * Deliberately not "100% genuine products" or "lowest price guaranteed".
 * Those are the two badges every marketplace prints and neither is a
 * commitment anyone here has made; printing them anyway is what makes a
 * trust row read as decoration. What is left is true: the catalogue is
 * imported from manufacturer price lists, every product card carries its
 * own delivery promise rather than the header's, support is staffed by
 * people who have built, and checkout does not hold card details.
 *
 * Two renderings of the same four claims. Directly under the banner on a
 * phone this is a strip — a mark and two words, no card, no rule, four
 * across and about 60px tall, read as reassurance in passing rather than
 * as content. Four bordered cards there would be the second block on the
 * first screen and would push the catalogue below two folds. From `lg`
 * there is room for the sentence that makes each claim mean something,
 * so it gets one.
 */
const CLAIMS = [
  {
    Icon: CheckCircle,
    /* The strip's label is the claim compressed, never a different and
       larger claim than the card beside it makes. */
    short: "Brand-verified",
    title: "Brand-verified catalogue",
    detail: "Priced from manufacturer lists, not resold listings",
  },
  {
    Icon: Headset,
    short: "Expert guidance",
    title: "Advice before you order",
    detail: "Free video consultation with a working expert",
  },
  {
    Icon: Truck,
    short: "Real delivery times",
    title: "A promise per item",
    detail: "Every product shows its own real delivery time",
  },
  {
    Icon: Shield,
    short: "Secure checkout",
    title: "Secure checkout",
    detail: "No card details are stored by Quoin",
  },
];

/** The phone strip. Under `lg` only — see the note above. */
export function TrustStrip() {
  return (
    <ul className="grid grid-cols-4 items-start gap-2 px-5 lg:hidden">
      {CLAIMS.map(({ Icon, short }) => (
        <li key={short} className="flex flex-col items-center gap-1.5 text-center">
          <Icon className="size-5 shrink-0 text-accent" />
          {/* 10px, and two lines of headroom: at four across on a 360px
              screen a cell is 76px, which is one word — and the claims
              that matter most are the two-word ones. */}
          <span className="text-[10px] leading-[1.25] text-muted">{short}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One line, at every width.
 *
 * This was four cards, each with an icon, a heading and a sentence under
 * it — a grid of boxes closing a page whose whole problem was too many
 * boxes. Four claims set as four cards also reads as four features being
 * sold; set as one line it reads as what it is, a footnote a reader
 * glances at on the way past.
 *
 * The short labels are the ones the phone strip already used, so the
 * claim is identical at both sizes rather than growing a longer promise
 * on a wider screen. The sentences underneath are not lost — each is on
 * the page that can actually honour it: the delivery promise on a product
 * page, the consultation on /consult, the card-storage line in the
 * checkout and the refunds policy.
 */
export function TrustBar() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 text-caption text-muted lg:px-0">
      {CLAIMS.map(({ Icon, short }) => (
        <li key={short} className="flex items-center gap-1.5">
          <Icon className="size-4 shrink-0 text-accent" />
          {short}
        </li>
      ))}
    </ul>
  );
}
