-- CreateEnum
CREATE TYPE "ServiceBookingKind" AS ENUM ('BOOKING', 'QUOTE');

-- CreateEnum
CREATE TYPE "ServiceBookingStatus" AS ENUM ('REQUESTED', 'QUOTE_PENDING', 'QUOTE_RECEIVED', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ORDER_CONFIRMED', 'PAYMENT_SUCCESSFUL', 'ORDER_SHIPPED', 'ORDER_DELIVERED', 'SERVICE_BOOKED', 'SERVICE_REMINDER', 'QUOTE_RECEIVED', 'PROJECT_UPDATE');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('ORDERS', 'PAYMENTS', 'DELIVERY', 'PRODUCTS', 'PROJECTS', 'SERVICES', 'PARCHA', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- AlterEnum
ALTER TYPE "StoredFileKind" ADD VALUE 'SERVICE_DOCUMENT';

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "expectedDeliveryOn" DATE;

-- CreateTable
CREATE TABLE "service_bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "serviceSlug" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "kind" "ServiceBookingKind" NOT NULL,
    "status" "ServiceBookingStatus" NOT NULL,
    "preferredDate" DATE,
    "preferredSlot" "ConsultSlot",
    "scheduledAt" TIMESTAMP(3),
    "addressId" TEXT,
    "siteLine" TEXT NOT NULL,
    "siteCity" TEXT NOT NULL DEFAULT '',
    "sitePincode" TEXT NOT NULL DEFAULT '',
    "projectKind" "ProjectKind",
    "areaSqft" INTEGER,
    "requirements" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "quotePaise" INTEGER,
    "quoteNote" TEXT,
    "quotedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_booking_files" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_booking_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_booking_status_changes" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" "ServiceBookingStatus",
    "toStatus" "ServiceBookingStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_booking_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "orderId" TEXT,
    "bookingId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_bookings_reference_key" ON "service_bookings"("reference");

-- CreateIndex
CREATE INDEX "service_bookings_userId_createdAt_idx" ON "service_bookings"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "service_bookings_projectId_idx" ON "service_bookings"("projectId");

-- CreateIndex
CREATE INDEX "service_bookings_status_createdAt_idx" ON "service_bookings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "service_booking_files_bookingId_idx" ON "service_booking_files"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "service_booking_files_bookingId_fileId_key" ON "service_booking_files"("bookingId", "fileId");

-- CreateIndex
CREATE INDEX "service_booking_status_changes_bookingId_createdAt_idx" ON "service_booking_status_changes"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "support_requests_reference_key" ON "support_requests"("reference");

-- CreateIndex
CREATE INDEX "support_requests_userId_createdAt_idx" ON "support_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "support_requests_status_createdAt_idx" ON "support_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_booking_files" ADD CONSTRAINT "service_booking_files_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "service_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_booking_files" ADD CONSTRAINT "service_booking_files_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_booking_status_changes" ADD CONSTRAINT "service_booking_status_changes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "service_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_booking_status_changes" ADD CONSTRAINT "service_booking_status_changes_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "service_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

