-- AlterEnum
-- Money taken outside any gateway and recorded by staff after the fact —
-- see the doc comment on `PaymentProvider.OFFLINE` in schema.prisma.
ALTER TYPE "PaymentProvider" ADD VALUE 'OFFLINE';

-- AlterTable
-- `providerOrderId` is Razorpay's own `order_id`; an OFFLINE payment never
-- reaches the gateway and so never has one. `offlineReference` and
-- `recordedByUserId` are new, OFFLINE-only columns — see
-- `recordOfflinePayment` in src/lib/data/orders.ts.
ALTER TABLE "payments" ALTER COLUMN "providerOrderId" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "offlineReference" TEXT;
ALTER TABLE "payments" ADD COLUMN "recordedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
