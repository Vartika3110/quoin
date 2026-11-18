import { db } from "@/lib/db";
import { ApiError, handler, ok, requireStaff } from "@/lib/http";
import {
  NotificationNotFoundError,
  NotificationNotRetryableError,
  retryOrderNotification,
} from "@/lib/data/order-whatsapp";
import { listOrderWhatsAppActivity } from "@/lib/data/whatsapp-notifications";

type Ctx = { params: Promise<{ reference: string; notificationId: string }> };

/**
 * POST /api/v1/admin/orders/{reference}/whatsapp/{notificationId}/retry
 *
 * Re-sends one failed WhatsApp message. The admin half of "a WhatsApp
 * failure must never break an order": the order was always fine, the
 * message was not, and this is the one click that fixes the message.
 *
 * The message is rebuilt from the order as it is *now* rather than
 * replayed from a stored body — see `retryOrderNotification`. That is
 * what makes the commonest case work at all: a vendor message that failed
 * because nobody had put a number against the store is retried after
 * somebody does, and it has to pick the new number up.
 *
 * `reference` is checked against the notification's own order for the
 * reason the fulfilment dispatch route checks it: a mismatched pair means
 * the page was looking at a different order, and re-sending somebody
 * else's message because the id happened to be valid is not a thing a
 * staff tool should do quietly.
 *
 * Returns the order's whole refreshed activity list rather than the one
 * row, so the card re-renders from a single source of truth instead of
 * patching a row the client has guessed the new shape of.
 */
export const POST = handler(async (_request, { params }: Ctx) => {
  await requireStaff();
  const { reference, notificationId } = await params;

  const row = await db.whatsAppNotification.findUnique({
    where: { id: notificationId },
    select: { orderId: true, order: { select: { reference: true } } },
  });
  if (!row || row.order.reference !== reference) {
    throw new ApiError("not_found", "No such notification on this order");
  }

  try {
    await retryOrderNotification(notificationId);
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      throw new ApiError("not_found", error.message);
    }
    if (error instanceof NotificationNotRetryableError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }

  const activity = await listOrderWhatsAppActivity(row.orderId);
  return ok({ activity });
});
