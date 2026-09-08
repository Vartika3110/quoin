-- CreateEnum
CREATE TYPE "StudioVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "StudioRoom" AS ENUM ('LIVING_ROOM', 'KITCHEN', 'BEDROOM', 'BATHROOM', 'DINING', 'BALCONY', 'HOME_OFFICE', 'ENTRANCE', 'EXTERIOR', 'OTHER');

-- CreateEnum
CREATE TYPE "StudioItemKind" AS ENUM ('IDEA', 'PRODUCT', 'MATERIAL', 'COLOR', 'NOTE');

-- AlterEnum
ALTER TYPE "StoredFileKind" ADD VALUE 'STUDIO_IDEA';

-- CreateTable
CREATE TABLE "studio_ideas" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT,
    "fileId" TEXT,
    "assetPath" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "blurDataUrl" TEXT,
    "room" "StudioRoom",
    "styles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colors" JSONB NOT NULL DEFAULT '[]',
    "visibility" "StudioVisibility" NOT NULL DEFAULT 'PRIVATE',
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_saves" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_spaces" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" "StudioRoom" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "coverIdeaId" TEXT,
    "projectId" TEXT,
    "budgetPaise" INTEGER NOT NULL DEFAULT 0,
    "visibility" "StudioVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_space_items" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" "StudioItemKind" NOT NULL,
    "ideaId" TEXT,
    "productSlug" TEXT,
    "variantId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "hex" TEXT,
    "surface" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT '',
    "unitPricePaise" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_space_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_moodboards" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "canvasWidth" INTEGER NOT NULL DEFAULT 1200,
    "canvasHeight" INTEGER NOT NULL DEFAULT 900,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_moodboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_moodboard_items" (
    "id" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 300,
    "height" INTEGER NOT NULL DEFAULT 300,
    "z" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_moodboard_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_ideas_slug_key" ON "studio_ideas"("slug");

-- CreateIndex
CREATE INDEX "studio_ideas_visibility_createdAt_idx" ON "studio_ideas"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "studio_ideas_visibility_saveCount_idx" ON "studio_ideas"("visibility", "saveCount");

-- CreateIndex
CREATE INDEX "studio_ideas_visibility_room_createdAt_idx" ON "studio_ideas"("visibility", "room", "createdAt");

-- CreateIndex
CREATE INDEX "studio_ideas_userId_createdAt_idx" ON "studio_ideas"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "studio_saves_userId_createdAt_idx" ON "studio_saves"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "studio_saves_userId_ideaId_key" ON "studio_saves"("userId", "ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_spaces_slug_key" ON "studio_spaces"("slug");

-- CreateIndex
CREATE INDEX "studio_spaces_userId_createdAt_idx" ON "studio_spaces"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "studio_spaces_projectId_idx" ON "studio_spaces"("projectId");

-- CreateIndex
CREATE INDEX "studio_spaces_visibility_createdAt_idx" ON "studio_spaces"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "studio_space_items_spaceId_kind_position_idx" ON "studio_space_items"("spaceId", "kind", "position");

-- CreateIndex
CREATE INDEX "studio_space_items_ideaId_idx" ON "studio_space_items"("ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_moodboards_spaceId_key" ON "studio_moodboards"("spaceId");

-- CreateIndex
CREATE INDEX "studio_moodboard_items_moodboardId_z_idx" ON "studio_moodboard_items"("moodboardId", "z");

-- CreateIndex
CREATE UNIQUE INDEX "studio_moodboard_items_moodboardId_itemId_key" ON "studio_moodboard_items"("moodboardId", "itemId");

-- AddForeignKey
ALTER TABLE "studio_ideas" ADD CONSTRAINT "studio_ideas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_ideas" ADD CONSTRAINT "studio_ideas_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_saves" ADD CONSTRAINT "studio_saves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_saves" ADD CONSTRAINT "studio_saves_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "studio_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_spaces" ADD CONSTRAINT "studio_spaces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_spaces" ADD CONSTRAINT "studio_spaces_coverIdeaId_fkey" FOREIGN KEY ("coverIdeaId") REFERENCES "studio_ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_spaces" ADD CONSTRAINT "studio_spaces_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_space_items" ADD CONSTRAINT "studio_space_items_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "studio_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_space_items" ADD CONSTRAINT "studio_space_items_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "studio_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_moodboards" ADD CONSTRAINT "studio_moodboards_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "studio_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_moodboard_items" ADD CONSTRAINT "studio_moodboard_items_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "studio_moodboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_moodboard_items" ADD CONSTRAINT "studio_moodboard_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "studio_space_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

