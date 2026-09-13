import { db } from "@/lib/db";
import { isStockBearing } from "@/lib/data/inventory";
import { deliveryPhoneFor } from "@/lib/auth/phone";

/**
 * "Tell me when this is back."
 *
 * A request, not a notification. Quoin has no channel that can send a
 * back-in-stock message today — MSG91 carries sign-in codes only, and a
 * second SMS template waits on its own DLT approval — so nothing here
 * sends anything. The requests wait on the admin inventory page for the
 * item, and the staff member who restocks it contacts each customer and
 * marks them contacted. The storefront says exactly that, and no more.
 */

export type StockAlertResult =
  | { ok: true; variantId: string }
  | { ok: false; reason: "not_found" | "not_tracked" | "no_contact" };

/** The variants this customer has an open request for — the cart's
    "Request saved" state survives a reload because of this. */
export async function listOpenStockAlertVariantIds(userId: string): Promise<string[]> {
  const rows = await db.stockAlert.findMany({
    where: { userId, contactedAt: null },
    select: { variantId: true },
  });
  return rows.map((r) => r.variantId);
}

export async function requestStockAlert(
  user: { id: string; phone: string | null; deliveryPhone: string | null; email: string | null },
  input: { productSlug: string; variantId: string },
): Promise<StockAlertResult> {
  /* Matched on slug as well as id, the same rule `quoteCart` applies, so
     a variant id lifted from another product cannot be filed under this
     one's name. */
  const variant = await db.productVariant.findFirst({
    where: { id: input.variantId, product: { slug: input.productSlug } },
    select: { id: true, product: { select: { stockTracked: true, fulfilment: true } } },
  });
  if (!variant) return { ok: false, reason: "not_found" };

  /* An untracked product never runs out, so a request against one would
     sit on no inventory page and nobody would ever act on it. */
  if (!variant.product.stockTracked || !isStockBearing(variant.product.fulfilment)) {
    return { ok: false, reason: "not_tracked" };
  }

  /* Staff contact people by hand. A request with no number and no email
     is a promise nobody could keep. */
  if (!deliveryPhoneFor(user) && !user.email) return { ok: false, reason: "no_contact" };

  await db.stockAlert.upsert({
    where: { userId_variantId: { userId: user.id, variantId: variant.id } },
    create: { userId: user.id, variantId: variant.id },
    /* Asking again after being contacted — the item sold out a second
       time — reopens the request rather than leaving it marked done. */
    update: { contactedAt: null },
  });

  return { ok: true, variantId: variant.id };
}

export interface StockAlertRow {
  id: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  requestedAt: Date;
  contactedAt: Date | null;
}

/** Everyone waiting on one variant, oldest request first — the order a
    fair callback list is worked through. Contacted rows follow the open
    ones so the list still shows who has already been reached. */
export async function listStockAlertsForVariant(variantId: string): Promise<StockAlertRow[]> {
  const rows = await db.stockAlert.findMany({
    where: { variantId },
    orderBy: [{ contactedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: {
      id: true,
      createdAt: true,
      contactedAt: true,
      user: { select: { name: true, phone: true, deliveryPhone: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    customerName: r.user.name,
    phone: deliveryPhoneFor(r.user),
    email: r.user.email,
    requestedAt: r.createdAt,
    contactedAt: r.contactedAt,
  }));
}

/** Returns false when the id does not exist, for the route to 404 on. */
export async function markStockAlertContacted(id: string): Promise<boolean> {
  const { count } = await db.stockAlert.updateMany({
    where: { id },
    data: { contactedAt: new Date() },
  });
  return count > 0;
}
