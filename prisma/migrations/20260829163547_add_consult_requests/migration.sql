-- CreateEnum
CREATE TYPE "ConsultMode" AS ENUM ('VIDEO', 'SITE_VISIT');

-- CreateEnum
CREATE TYPE "ConsultSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "ConsultStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "consult_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "mode" "ConsultMode" NOT NULL,
    "status" "ConsultStatus" NOT NULL DEFAULT 'REQUESTED',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "areaId" TEXT,
    "pincode" TEXT,
    "categoryId" TEXT,
    "notes" TEXT,
    "preferredDate" DATE,
    "preferredSlot" "ConsultSlot",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consult_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consult_requests_reference_key" ON "consult_requests"("reference");

-- CreateIndex
CREATE INDEX "consult_requests_phone_createdAt_idx" ON "consult_requests"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "consult_requests_status_createdAt_idx" ON "consult_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "consult_requests" ADD CONSTRAINT "consult_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consult_requests" ADD CONSTRAINT "consult_requests_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "service_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consult_requests" ADD CONSTRAINT "consult_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
