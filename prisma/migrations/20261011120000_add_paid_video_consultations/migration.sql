-- Paid video consultations.
--
-- Entirely additive: two new enums, one new value on an existing enum,
-- nine nullable-or-defaulted columns on `consult_requests`, and three
-- indexes. No column is dropped, no column changes type, and no existing
-- row is rewritten — the free call-back requests and site visits already
-- in this table keep working untouched, with `topic` null, `feePaise` 0
-- and `paymentStatus` NOT_REQUIRED, which is the truth about them.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on
-- PostgreSQL versions before 12. Supabase is well past that, so this file
-- is left as one statement per line and Prisma's own wrapping applies.

-- CreateEnum
CREATE TYPE "ConsultTopic" AS ENUM ('REPAIR', 'PRODUCTS', 'INTERIOR');

-- CreateEnum
CREATE TYPE "ConsultPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "ConsultStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'REQUESTED';

-- AlterTable
ALTER TABLE "consult_requests"
  ADD COLUMN "topic" "ConsultTopic",
  ADD COLUMN "feePaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paymentStatus" "ConsultPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "razorpayOrderId" TEXT,
  ADD COLUMN "razorpayPaymentId" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "videoRoom" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "consult_requests_razorpayOrderId_key" ON "consult_requests"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "consult_requests_razorpayPaymentId_key" ON "consult_requests"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "consult_requests_videoRoom_key" ON "consult_requests"("videoRoom");

-- CreateIndex
CREATE INDEX "consult_requests_startsAt_paymentStatus_idx" ON "consult_requests"("startsAt", "paymentStatus");
