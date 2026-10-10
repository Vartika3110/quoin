import { formatPrice } from "@/lib/types/catalog";
import {
  InvalidRupeeAmountError,
  rupeesToPaise,
} from "@/lib/services/booking-helpers";

/**
 * What a staff member asking for a refund has actually asked for.
 *
 * Pure, and separate from `RefundForm` for the same reason
 * `booking-helpers` keeps `rupeesToPaise` out of the quote form: this is
 * the only place in the app where somebody types an amount of money that
 * is about to *leave* the account, and the boundaries — blank, zero, junk,
 * more than is left — are worth being able to test without a browser.
 *
 * It decides what to send and what to say, and nothing else. Whether the
 * refund is allowed at all is `refundOrder`'s (`src/lib/data/orders.ts`),
 * which re-derives the outstanding amount from the payment itself and
 * refuses anything above it regardless of what arrives.
 */

export type RefundMode = "full" | "partial";

export interface PlannedRefund {
  /**
   * Paise to refund, or null when there is nothing usable to send yet —
   * which is what disables the confirm checkbox and the button.
   */
  amountPaise: number | null;
  /** What to tell the person about what they typed, if anything. */
  problem: string | null;
}

export function planRefund(input: {
  mode: RefundMode;
  /** Exactly what is in the box, untrimmed. */
  typed: string;
  /** The captured payment less everything already refunded against it. */
  refundablePaise: number;
}): PlannedRefund {
  /* "Everything left" deliberately does not go through the box. The form
     sends no amount at all in this case and lets the server work out what
     is outstanding when it runs, which is the right answer if another
     refund landed while this page was open — the figure here is only what
     the person is shown. */
  if (input.mode === "full") {
    return input.refundablePaise > 0
      ? { amountPaise: input.refundablePaise, problem: null }
      : { amountPaise: null, problem: "There is nothing left to refund." };
  }

  const trimmed = input.typed.trim();
  /* Empty is not an error. Nobody has typed anything wrong yet, and a
     field that turns red the moment it is focused and emptied is a field
     that reads as broken. */
  if (trimmed === "") return { amountPaise: null, problem: null };

  let paise: number;
  try {
    paise = rupeesToPaise(trimmed);
  } catch (error) {
    return {
      amountPaise: null,
      problem:
        error instanceof InvalidRupeeAmountError
          ? error.message
          : "That is not an amount.",
    };
  }

  if (paise === 0) {
    return { amountPaise: null, problem: "A refund has to be more than nothing." };
  }
  if (paise > input.refundablePaise) {
    return {
      amountPaise: null,
      problem: `That is more than the ${formatPrice(input.refundablePaise)} still outstanding.`,
    };
  }

  return { amountPaise: paise, problem: null };
}

/**
 * Whether this refund empties the payment.
 *
 * Decides one sentence of copy, and it is a sentence worth getting right:
 * a refund of everything outstanding moves the order to REFUND_PENDING and
 * then REFUNDED, while a part refund deliberately leaves the order where
 * it is, because both of those statuses are claims about the whole of what
 * was paid. Staff should be able to read which of the two they are about
 * to do before they do it.
 */
export function refundEmptiesPayment(
  amountPaise: number | null,
  refundablePaise: number,
): boolean {
  return amountPaise !== null && amountPaise >= refundablePaise;
}
