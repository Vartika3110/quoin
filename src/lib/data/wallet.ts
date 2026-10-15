import { Prisma, type WalletEntryKind } from "@prisma/client";
import { db } from "@/lib/db";
import type { Paise } from "@/lib/types/catalog";

/**
 * The customer wallet.
 *
 * A ledger, not a balance — see the note on `WalletEntry` in
 * `prisma/schema.prisma` for why there is no `balancePaise` column
 * anywhere. Everything here follows from that one decision:
 *
 *  - **The balance is a `SUM`.** It cannot drift from its own history,
 *    because it has no separate existence to drift into.
 *  - **Nothing is ever updated or deleted.** A mistake is corrected by
 *    a second row pointing the other way, with a note saying why.
 *  - **Every entry carries a `reference`** naming the event that caused
 *    it, under a unique index. That is the idempotency guard: a webhook
 *    delivered twice writes one row, because the second insert collides
 *    rather than quietly doubling somebody's money. It is the same
 *    discipline `settleCapturedPayment` uses on `providerPaymentId`.
 *
 * ## What this does not do yet
 *
 * Nothing spends from the wallet at checkout. `spend` below exists and
 * is correct, but no route calls it, because two decisions have to be
 * taken by the business before one can: whether a wallet balance may
 * cover part of an order with the gateway taking the rest, and whether
 * a refund goes back to the card it came from or into the wallet. The
 * second is a question for the refunds policy, not for this file.
 *
 * Nothing adds money either. `TOPUP` exists in the enum because a wallet
 * that can only be credited by staff is not a wallet; paying money in
 * needs a gateway order of its own, which is its own build.
 *
 * What works today: staff can credit an account, a refund can be
 * credited to one, the customer sees the balance and every row behind
 * it, and the arithmetic is auditable.
 */

export interface WalletEntryView {
  id: string;
  amountPaise: Paise;
  kind: WalletEntryKind;
  note: string;
  createdAt: Date;
}

/**
 * What the customer has, in paise.
 *
 * `0` for an account with no entries, which is most of them — the
 * aggregate returns null for an empty set and that is not a balance.
 */
export async function getWalletBalance(userId: string): Promise<Paise> {
  const total = await db.walletEntry.aggregate({
    where: { userId },
    _sum: { amountPaise: true },
  });
  return total._sum.amountPaise ?? 0;
}

/** The history, newest first. Paged by `take` rather than by cursor:
    a wallet with more than a hundred movements is not a thing yet. */
export async function listWalletEntries(
  userId: string,
  take = 50,
): Promise<WalletEntryView[]> {
  return db.walletEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, amountPaise: true, kind: true, note: true, createdAt: true },
  });
}

export class WalletAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletAmountError";
  }
}

export class InsufficientBalanceError extends Error {
  constructor(
    readonly balancePaise: Paise,
    readonly requestedPaise: Paise,
  ) {
    super(
      `That wallet holds ${balancePaise} paise and the spend is for ${requestedPaise}.`,
    );
    this.name = "InsufficientBalanceError";
  }
}

/**
 * Puts money in.
 *
 * Idempotent on `reference`: calling twice with the same one is a
 * no-op that returns the balance as it already stands, which is what
 * makes this safe to call from a webhook. The collision is caught
 * rather than pre-checked, because a check followed by an insert is two
 * statements with a race between them.
 */
export async function credit(input: {
  userId: string;
  amountPaise: Paise;
  kind: Extract<WalletEntryKind, "REFUND" | "GOODWILL" | "TOPUP" | "ADJUSTMENT">;
  /** `refund:<id>`, `topup:<paymentId>`, `goodwill:<uuid>` — see the
      schema note. Must be unique across the whole table. */
  reference: string;
  note: string;
}): Promise<Paise> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new WalletAmountError("A credit must be a whole number of paise, above zero.");
  }

  try {
    await db.walletEntry.create({
      data: {
        userId: input.userId,
        amountPaise: input.amountPaise,
        kind: input.kind,
        reference: input.reference,
        note: input.note,
      },
    });
  } catch (error) {
    /* P2002 is this reference already being in the ledger, which means
       the event it names has already been credited. Not an error. */
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  return getWalletBalance(input.userId);
}

/**
 * Takes money out.
 *
 * The balance is re-summed *inside* a serializable transaction and the
 * spend is refused if it does not cover the amount. That isolation
 * level is the point: two spends arriving together would each read the
 * same balance and each find it sufficient, and the account would go
 * negative by the amount of the smaller one. Serializable makes the
 * second fail to commit, and Prisma surfaces that as a write conflict
 * for the caller to retry.
 *
 * Writes a negative row. The sign convention is the whole ledger's —
 * see the schema note — so a spend is never stored as a positive
 * number with a `kind` to tell you to subtract it.
 */
export async function spend(input: {
  userId: string;
  amountPaise: Paise;
  /** `order:<reference>` — one spend per order, enforced by the index. */
  reference: string;
  note: string;
}): Promise<Paise> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new WalletAmountError("A spend must be a whole number of paise, above zero.");
  }

  return db.$transaction(
    async (tx) => {
      const total = await tx.walletEntry.aggregate({
        where: { userId: input.userId },
        _sum: { amountPaise: true },
      });
      const balance = total._sum.amountPaise ?? 0;
      if (balance < input.amountPaise) {
        throw new InsufficientBalanceError(balance, input.amountPaise);
      }

      await tx.walletEntry.create({
        data: {
          userId: input.userId,
          amountPaise: -input.amountPaise,
          kind: "ORDER_PAYMENT",
          reference: input.reference,
          note: input.note,
        },
      });

      return balance - input.amountPaise;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** How a movement reads in the customer's own history. */
export const WALLET_KIND_LABEL: Record<WalletEntryKind, string> = {
  REFUND: "Refund",
  GOODWILL: "Credit from Quoin",
  TOPUP: "Money added",
  ORDER_PAYMENT: "Paid for an order",
  ADJUSTMENT: "Adjustment",
};
