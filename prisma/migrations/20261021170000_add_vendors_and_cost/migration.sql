-- Vendors: who Quoin buys from, as distinct from whose name is on the box.
-- See the note on `Vendor` in schema.prisma.

CREATE TYPE "VendorStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT,
    "pan" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "addressLine" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "pincode" TEXT NOT NULL DEFAULT '',
    "bankAccountName" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "bankIfsc" TEXT NOT NULL DEFAULT '',
    "upiVpa" TEXT NOT NULL DEFAULT '',
    "status" "VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT NOT NULL DEFAULT '',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 7,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- One GSTIN is one registered business: a second vendor row carrying it
-- is a duplicate, and duplicates are what make a weekly payout pay twice.
CREATE UNIQUE INDEX "vendors_gstin_key" ON "vendors"("gstin");
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- Which vendor supplies a product, and what the line costs.
ALTER TABLE "products" ADD COLUMN "vendorId" TEXT;
CREATE INDEX "products_vendorId_idx" ON "products"("vendorId");
ALTER TABLE "products" ADD CONSTRAINT "products_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Nullable on purpose: absent means "never costed", which is not zero.
ALTER TABLE "product_variants" ADD COLUMN "costPaise" INTEGER;
