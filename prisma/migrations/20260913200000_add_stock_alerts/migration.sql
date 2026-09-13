-- CreateTable
-- A customer asking to hear when an out-of-stock variant is back. Nothing
-- is sent automatically: staff read these on the admin inventory page when
-- they receive stock and set "contactedAt" once they have been in touch.
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_alerts_variantId_contactedAt_idx" ON "stock_alerts"("variantId", "contactedAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_userId_variantId_key" ON "stock_alerts"("userId", "variantId");

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
