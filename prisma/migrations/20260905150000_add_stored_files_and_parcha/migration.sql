-- CreateEnum
CREATE TYPE "StoredFileKind" AS ENUM ('PARCHA', 'PROJECT_DOCUMENT', 'PRODUCT_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "StoredFileStatus" AS ENUM ('PENDING', 'STORED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ParchaSource" AS ENUM ('TYPED', 'UPLOAD');

-- CreateEnum
CREATE TYPE "ParchaStatus" AS ENUM ('AWAITING_EXTRACTION', 'EXTRACTING', 'NEEDS_REVIEW', 'AWAITING_MANUAL_REVIEW', 'FAILED', 'COMPLETED');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "StoredFileKind" NOT NULL,
    "status" "StoredFileStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcha_submissions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "source" "ParchaSource" NOT NULL,
    "status" "ParchaStatus" NOT NULL,
    "fileId" TEXT,
    "rawText" TEXT,
    "extractionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "extractedAt" TIMESTAMP(3),

    CONSTRAINT "parcha_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcha_items" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "raw" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "matchedProductSlug" TEXT,
    "matchedVariantId" TEXT,
    "confidence" INTEGER,
    "accepted" BOOLEAN,

    CONSTRAINT "parcha_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "stored_files"("storageKey");

-- CreateIndex
CREATE INDEX "stored_files_userId_createdAt_idx" ON "stored_files"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "stored_files_status_createdAt_idx" ON "stored_files"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "parcha_submissions_reference_key" ON "parcha_submissions"("reference");

-- CreateIndex
CREATE INDEX "parcha_submissions_userId_createdAt_idx" ON "parcha_submissions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "parcha_submissions_status_createdAt_idx" ON "parcha_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "parcha_items_submissionId_position_idx" ON "parcha_items"("submissionId", "position");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcha_submissions" ADD CONSTRAINT "parcha_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcha_submissions" ADD CONSTRAINT "parcha_submissions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcha_items" ADD CONSTRAINT "parcha_items_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "parcha_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
