import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { InvalidPhoneError, normalizePhone } from "@/lib/auth/phone";

/**
 * Coordinates are required, not optional.
 *
 * Serviceability is decided on lat/lng (see `geo.ts`), so an address
 * saved without them cannot be delivered to. The client must geocode —
 * via map pin or device location — before it may save.
 */
export const AddressInput = z.object({
  label: z.enum(["HOME", "WORK", "SITE", "OTHER"]).default("HOME"),
  line1: z.string().trim().min(3, "Enter the flat, building or plot"),
  line2: z.string().trim().optional(),
  landmark: z.string().trim().optional(),
  city: z.string().trim().min(2, "Enter the city"),
  state: z.string().trim().min(2, "Enter the state"),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
  /* Who receives a delivery here, when it is not the account holder — see
     the doc comment on both columns in prisma/schema.prisma. Both bounded
     the same way `deliveryPhone` is on `PATCH /api/v1/me`: a raw string in
     and out of zod, with "blank clears, real value normalises" decided in
     the handler below rather than here, because normalising can fail and
     zod has no clean way to turn that into this route's field-error shape. */
  recipientName: z.string().trim().max(80, "Keep the recipient's name under 80 characters").optional(),
  recipientPhone: z.string().trim().max(20, "Enter a valid phone number").optional(),
});

/**
 * Turns the raw `recipientName`/`recipientPhone` of a request body into
 * what should be written to those columns.
 *
 * A key the client never sent stays out of the result entirely, which
 * Prisma reads as "leave alone" on an `update` and "use the column
 * default" — null, since neither column has one — on a `create`. That is
 * the same rule `resolveDeliveryPhoneInput` uses for `User.deliveryPhone`,
 * so a field left blank and a field never touched do not need two
 * separate code paths here or in `[id]/route.ts`. Throws
 * `InvalidPhoneError` for the caller to turn into a field error, exactly
 * like every other phone in this app.
 */
export function resolveRecipientFields(input: {
  recipientName?: string;
  recipientPhone?: string;
}): { recipientName?: string | null; recipientPhone?: string | null } {
  const out: { recipientName?: string | null; recipientPhone?: string | null } = {};
  if (input.recipientName !== undefined) {
    out.recipientName = input.recipientName === "" ? null : input.recipientName;
  }
  if (input.recipientPhone !== undefined) {
    out.recipientPhone =
      input.recipientPhone === "" ? null : normalizePhone(input.recipientPhone);
  }
  return out;
}

/** GET /api/v1/addresses — the customer's saved addresses, default first. */
export const GET = handler(async () => {
  const user = await requireUser();

  const addresses = await db.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  return ok({ addresses });
});

/** POST /api/v1/addresses — saves a new address. */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, AddressInput);

  let recipient: { recipientName?: string | null; recipientPhone?: string | null };
  try {
    recipient = resolveRecipientFields(input);
  } catch (error) {
    if (error instanceof InvalidPhoneError) {
      throw new ApiError("bad_request", error.message, { recipientPhone: error.message });
    }
    throw error;
  }

  const address = await db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId: user.id } });

    /* The first address is always the default — otherwise a new customer
       finishes onboarding with addresses but nothing selected at
       checkout. */
    const makeDefault = input.isDefault || count === 0;

    if (makeDefault) {
      await tx.address.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: { ...input, ...recipient, userId: user.id, isDefault: makeDefault },
    });
  });

  return ok({ address }, { status: 201 });
});
