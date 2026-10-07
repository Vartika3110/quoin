import { ApiError, handler, ok } from "@/lib/http";
import { enforce } from "@/lib/rate-limit";
import {
  dispatchByVendorToken,
  FulfilmentNotDispatchableError,
  FulfilmentNotFoundError,
} from "@/lib/data/order-dispatch";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/v1/vendor/fulfilments/{token}/dispatch
 *
 * "Dispatch order", pressed by a vendor. The only write a vendor can make
 * anywhere in this app.
 *
 * **The token is the credential, and the whole of it.** There is no
 * vendor account system here and inventing one would be a second
 * authentication surface to get wrong — so instead the new-order WhatsApp
 * carries a link ending in 32 bytes of CSPRNG
 * (`OrderFulfilment.actionToken`), and holding it authorises exactly one
 * action on exactly one fulfilment. It cannot be used to read another
 * order, another vendor's items, a customer list, or anything at all
 * outside the one leg it names. It is revocable by rotating the column,
 * and it does not expire, because a vendor dispatching two days late must
 * not be locked out of the one button they have.
 *
 * **No session, and no `requireUser`.** The caller is a shopkeeper with a
 * phone, not an account holder. That is also why this is the one route
 * under `/api/v1` outside `/webhooks` with no session at all — and why it
 * is rate-limited, in a bucket of its own (`vendorDispatch`,
 * `src/lib/rate-limit.ts`): an unauthenticated POST that writes needs a
 * ceiling on how fast it can be guessed at. A 64-hex-character token is
 * not brute-forcible at any rate; the limit is there so that trying
 * costs something, and the separate bucket is so a vendor tapping a
 * button cannot spend a customer's search or pricing budget.
 *
 * **Every rejection says the same thing.** An unknown token and a token
 * for a cancelled order are both 404-shaped, deliberately: a caller who
 * cannot prove they hold a live fulfilment does not get told whether one
 * exists. The one exception is a cancelled *order*, where the vendor is
 * told plainly not to send it — that is information they need, and they
 * only reach it by holding the real token for that order's own leg.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  enforce("vendorDispatch", request);

  const { token } = await params;

  try {
    const result = await dispatchByVendorToken(token);

    return ok({
      reference: result.orderReference,
      storeName: result.storeName,
      /* False on a repeat tap. The client says "already dispatched"
         rather than reporting an error for something that is, from the
         vendor's point of view, simply done. */
      changed: result.changed,
      /* So the confirmation can say "we're waiting on one other store"
         instead of implying the customer has been told. */
      outstandingLegs: result.outstandingLegs,
    });
  } catch (error) {
    if (error instanceof FulfilmentNotFoundError) {
      throw new ApiError("not_found", error.message);
    }
    if (error instanceof FulfilmentNotDispatchableError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }
});
