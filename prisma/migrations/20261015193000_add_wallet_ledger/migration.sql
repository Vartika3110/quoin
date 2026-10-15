-- The customer wallet, as an append-only ledger. See the note on
-- `WalletEntry` in schema.prisma for why there is no balance column.

CREATE TYPE "WalletEntryKind" AS ENUM ('REFUND', 'GOODWILL', 'TOPUP', 'ORDER_PAYMENT', 'ADJUSTMENT');

CREATE TABLE "wallet_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "kind" "WalletEntryKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- The idempotency guard: one entry per source event, so a webhook
-- delivered twice collides instead of doubling somebody's money.
CREATE UNIQUE INDEX "wallet_entries_reference_key" ON "wallet_entries"("reference");

CREATE INDEX "wallet_entries_userId_createdAt_idx" ON "wallet_entries"("userId", "createdAt");

ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
