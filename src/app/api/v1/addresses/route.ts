import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, parseBody, requireUser } from "@/lib/http";

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
});

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
      data: { ...input, userId: user.id, isDefault: makeDefault },
    });
  });

  return ok({ address }, { status: 201 });
});
