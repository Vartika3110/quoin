-- CreateEnum
CREATE TYPE "StudioMedia" AS ENUM ('PHOTO', 'VIDEO');

-- AlterTable
-- Every existing row is a photograph, which is what the default says. No
-- backfill: `DEFAULT 'PHOTO'` fills the column as it is added, and there
-- is no state in which a row is momentarily neither.
ALTER TABLE "studio_ideas"
    ADD COLUMN "media" "StudioMedia" NOT NULL DEFAULT 'PHOTO',
    ADD COLUMN "videoUid" TEXT,
    ADD COLUMN "videoPath" TEXT,
    ADD COLUMN "durationSeconds" INTEGER;

-- AlterTable
ALTER TABLE "studio_hotspots"
    ADD COLUMN "atSeconds" INTEGER;

-- CreateIndex
CREATE INDEX "studio_ideas_media_kind_visibility_createdAt_idx" ON "studio_ideas"("media", "kind", "visibility", "createdAt");
