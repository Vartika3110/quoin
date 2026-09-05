-- AlterTable
ALTER TABLE "parcha_submissions" ADD COLUMN     "ipHash" TEXT;

-- CreateIndex
CREATE INDEX "parcha_submissions_ipHash_createdAt_idx" ON "parcha_submissions"("ipHash", "createdAt");
