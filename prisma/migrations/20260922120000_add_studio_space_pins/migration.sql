-- CreateEnum
CREATE TYPE "StudioIdeaKind" AS ENUM ('SPACE', 'PRODUCT');

-- CreateTable
CREATE TABLE "studio_designers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarPath" TEXT,
    "serviceSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_designers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_designers_slug_key" ON "studio_designers"("slug");

-- CreateTable
CREATE TABLE "studio_hotspots" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "productSlug" TEXT NOT NULL,
    "variantId" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_hotspots_ideaId_position_idx" ON "studio_hotspots"("ideaId", "position");

-- AddForeignKey
ALTER TABLE "studio_hotspots" ADD CONSTRAINT "studio_hotspots_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "studio_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "studio_ideas"
    ADD COLUMN "kind" "StudioIdeaKind" NOT NULL DEFAULT 'PRODUCT',
    ADD COLUMN "location" TEXT,
    ADD COLUMN "designerId" TEXT;

-- AddForeignKey
ALTER TABLE "studio_ideas" ADD CONSTRAINT "studio_ideas_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "studio_designers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "studio_ideas_visibility_createdAt_idx";
DROP INDEX "studio_ideas_visibility_saveCount_idx";
DROP INDEX "studio_ideas_visibility_room_createdAt_idx";

-- CreateIndex
CREATE INDEX "studio_ideas_kind_visibility_createdAt_idx" ON "studio_ideas"("kind", "visibility", "createdAt");
CREATE INDEX "studio_ideas_kind_visibility_saveCount_idx" ON "studio_ideas"("kind", "visibility", "saveCount");
CREATE INDEX "studio_ideas_kind_visibility_room_createdAt_idx" ON "studio_ideas"("kind", "visibility", "room", "createdAt");
CREATE INDEX "studio_ideas_designerId_createdAt_idx" ON "studio_ideas"("designerId", "createdAt");
