import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  InvalidPhoneError,
  maskPhone,
  resolveDeliveryPhoneInput,
} from "@/lib/auth/phone";

/**
 * GET /api/v1/me
 *
 * The storefront bootstrap call: who is signed in, their tier (which
 * drives every price on the page) and their default address.
 */
export const GET = handler(async () => {
  const user = await requireUser();

  const defaultAddress = await db.address.findFirst({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  return ok({
    user: {
      ...user,
      /* Masked even to the account owner: this response is rendered into
         a shared device's page and copied into support tickets. Null for
         a Google account that has never given checkout a number — there
         is nothing to mask. */
      phone: user.phone ? maskPhone(user.phone) : null,
      /* Same masking reasoning, for the unverified shipping contact — see
         `deliveryPhoneFor` in `src/lib/auth/phone.ts`. */
      deliveryPhone: user.deliveryPhone ? maskPhone(user.deliveryPhone) : null,
      isPro: user.tier === "PRO",
    },
    defaultAddress,
  });
});

const PatchBody = z.object({
  /* `null` clears the saved number; a string is validated below. Not
     `.optional()` — a client omitting the key entirely would mean "leave
     it alone", which this endpoint has no other field to make true of, so
     the key is required and `null` is the explicit way to say "remove". */
  deliveryPhone: z.string().max(20).nullable(),
});

/**
 * PATCH /api/v1/me
 *
 * Sets or clears `User.deliveryPhone` — the unverified shipping contact,
 * never `User.phone`. See the doc comment on both columns in
 * `prisma/schema.prisma` and `deliveryPhoneFor` in `src/lib/auth/phone.ts`
 * for why the two must never be confused.
 *
 * Refuses when the account already has a verified `phone`: that number is
 * already what every order ships to (`deliveryPhoneFor` prefers it
 * outright), so a delivery phone typed in here would be stored and then
 * silently ignored everywhere it is read — better to say so than to accept
 * a value that does nothing.
 */
export const PATCH = handler(async (request) => {
  const user = await requireUser();
  const { deliveryPhone } = await parseBody(request, PatchBody);

  if (user.phone) {
    throw new ApiError(
      "conflict",
      "Your verified number is used for deliveries.",
    );
  }

  let resolved: string | null;
  try {
    resolved = resolveDeliveryPhoneInput(deliveryPhone);
  } catch (error) {
    if (error instanceof InvalidPhoneError) {
      throw new ApiError("bad_request", error.message, {
        deliveryPhone: error.message,
      });
    }
    throw error;
  }

  await db.user.update({
    where: { id: user.id },
    data: { deliveryPhone: resolved },
  });

  return ok({ deliveryPhone: resolved ? maskPhone(resolved) : null });
});
