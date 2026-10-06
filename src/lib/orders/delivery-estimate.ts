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
 * The owner's instruction is that a bulk order lands in about three
 * hours. `BULK_DELIVERY_HOURS` is that number and the only place it is
 * written down; changing the promise is an edit to this one constant.
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

/** The owner's promise for bulk goods, in hours. See above. */
export const BULK_DELIVERY_HOURS = 3;

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
  /* Heavy or bulk goods — the owner's three hours. */
  { fulfilment: "SCHEDULED", label: `Within about ${BULK_DELIVERY_HOURS} hours` },
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
