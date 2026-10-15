/**
 * What to tell a customer about when their order arrives.
 *
 * Until now the answer was the same sentence for every order — "Date
 * confirmed on call" — written on the confirmation screen as a literal.
 * That was honest while nothing in the system knew anything, but it is
 * the first thing a customer looks for after paying, and "we will ring
 * you" is a poor answer when the business already knows the shape of its
 * own promise.
 *
 * The owner's instruction, 15 October, is that a scheduled order lands
 * **the same day, usually within 45 minutes**. That supersedes the
 * earlier three-hour figure for bulk goods, and the reason it can is
 * that Quoin holds no stock: an order is picked up from the vendor who
 * has it rather than waiting on a warehouse run. The constants below
 * are the only place the promise is written down, and every surface
 * that quotes it — the product card's chip, the product page's promise
 * block, the cart's group heading and the order confirmation — reads
 * them, so changing the promise is an edit to this one file.
 *
 * ## Why fulfilment, and not a weight or a line count
 *
 * "Bulk" is already modelled. `Fulfilment.SCHEDULED` is defined in the
 * schema as "real stock, delivered on a chosen date — heavy or bulk
 * goods", and it is what every sellable product in the catalogue
 * currently is: 2,512 of them, against one `BOOKABLE` service and no
 * `INSTANT` lines at all. So the bulk estimate is in practice the
 * estimate, and deriving it from the enum means it stays correct on the
 * day a dark store does carry `INSTANT` stock, rather than becoming a
 * flat three hours that quietly over-promises on quick goods and
 * under-promises on made-to-order ones.
 *
 * The order's own lines carry it — `OrderLine.fulfilment` is copied from
 * the product at checkout precisely so an order can still be read this
 * way after the catalogue has moved on.
 *
 * ## Slowest wins
 *
 * A basket is not required to be one kind. When it mixes, the estimate
 * is the least certain of its lines, never an average and never the
 * best one — a customer told "three hours" who then waits a week for the
 * cut-to-order worktop in the same order has been misled, and the fact
 * that the other four lines did arrive in three hours does not fix it.
 *
 * ## What this never does
 *
 * It does not invent a *date*. `Order.expectedDeliveryOn` is a real day
 * a person in operations commits to, and wherever it is set it wins over
 * everything here — see `deliverySummaryLabel` on the order page. This
 * is the estimate shown before anybody has looked at the order, which is
 * exactly the window the customer is standing in when they finish
 * paying.
 */

/** The quick case, in minutes, and the figure the card chip shows. */
export const SCHEDULED_DELIVERY_MINUTES = 45;

/** The card chip. Short because it sits in a 60px pill over a picture. */
export const SCHEDULED_DELIVERY_SHORT = `${SCHEDULED_DELIVERY_MINUTES} mins`;

/** The product page's promise, where there is room for the whole of it. */
export const SCHEDULED_DELIVERY_TITLE = "Delivered today";
export const SCHEDULED_DELIVERY_BODY =
  `Collected from the vendor who stocks it and delivered the same day — usually within ${SCHEDULED_DELIVERY_MINUTES} minutes.`;

/**
 * Least certain first. The order is the whole rule: `estimateFor` walks
 * this list and answers on the first kind the basket contains, so adding
 * a fulfilment type means deciding where its promise sits among these
 * rather than editing a chain of conditionals.
 */
const BY_CONFIDENCE = [
  /* Cut or manufactured after the order is placed, so the clock does not
     start until somebody schedules the work. No hour figure can be true
     here and the call is a real one. */
  { fulfilment: "MADE_TO_ORDER", label: "Confirmed on call" },
  /* A professional's time slot, not a delivery at all. */
  { fulfilment: "BOOKABLE", label: "Scheduled with the professional" },
  /* Everything in the catalogue. Same day, because nothing is held in
     a warehouse waiting for a run — see the note at the top. */
  {
    fulfilment: "SCHEDULED",
    label: `Today — usually within ${SCHEDULED_DELIVERY_MINUTES} minutes`,
  },
  /* Dark-store stock. The per-store figure lives on `Store.baseEtaMinutes`
     and is quoted against an address; this is the catalogue-wide promise
     the home page makes, and no product is INSTANT today. */
  { fulfilment: "INSTANT", label: "Within about 18 minutes" },
] as const;

/** What an order with no lines we can read says. Also the answer for a
    fulfilment value this file has never heard of — a new enum member
    reaching production before this list is updated should fall back to
    the sentence that is always true, not to a guess. */
const UNKNOWN = "Date confirmed on call";

/**
 * The estimate for a basket, from the fulfilment of each of its lines.
 *
 * Takes strings rather than the Prisma enum so the checkout's quote
 * (`QuoteLine.fulfilment`, already a string on the wire) and an order's
 * stored lines can both call it without either side importing the
 * other's types.
 */
export function estimateFor(fulfilments: readonly string[]): string {
  if (fulfilments.length === 0) return UNKNOWN;

  const present = new Set(fulfilments);
  for (const { fulfilment, label } of BY_CONFIDENCE) {
    if (present.has(fulfilment)) return label;
  }

  return UNKNOWN;
}
