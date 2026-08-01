import { db } from "@/lib/db";
import { handler, ok, requireUser } from "@/lib/http";
import { maskPhone } from "@/lib/auth/phone";

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
         a shared device's page and copied into support tickets. */
      phone: maskPhone(user.phone),
      isPro: user.tier === "PRO",
    },
    defaultAddress,
  });
});
