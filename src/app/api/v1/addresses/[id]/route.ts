import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { AddressInput } from "../route";

const AddressPatch = AddressInput.partial();

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ownership check.
 *
 * Every mutation filters on `userId` as well as `id`. An address id is a
 * guessable handle to someone's home address, so a route that trusted the
 * id alone would let any signed-in customer read or overwrite another
 * customer's addresses.
 */
async function ownedAddress(userId: string, id: string) {
  const address = await db.address.findFirst({ where: { id, userId } });
  /* 404 rather than 403 — confirming the row exists but belongs to
     someone else is itself a disclosure. */
  if (!address) throw new ApiError("not_found", "Address not found");
  return address;
}

/** PATCH /api/v1/addresses/:id */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await ownedAddress(user.id, id);

  const input = await parseBody(request, AddressPatch);

  const address = await db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId: user.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return tx.address.update({ where: { id }, data: input });
  });

  return ok({ address });
});

/** DELETE /api/v1/addresses/:id */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const existing = await ownedAddress(user.id, id);

  await db.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });

    /* Deleting the default must not leave the account with none, or
       checkout has nothing preselected. */
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  return ok({ deleted: true });
});
