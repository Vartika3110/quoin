-- CreateEnum
CREATE TYPE "ImageQuality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
-- Nullable rather than defaulted, because the column means "what an image
-- model was asked to spend", and that is a question with no answer for a
-- photograph. Defaulting it would assert LOW about 1,838 rows carrying
-- real photography.
ALTER TABLE "products"
    ADD COLUMN "imageQuality" "ImageQuality";

-- Backfill
-- Everything generated before this column existed came out of the first
-- catalogue pass, which ran at LOW. Sixty of them have since been redone
-- at MEDIUM and are corrected by `scripts/backfill-image-quality.ts`,
-- which identifies them by file timestamp — the only trace left, since an
-- upgraded row and an original one are the same kind of URL in the same
-- bucket. That is the gap this column closes.
UPDATE "products"
   SET "imageQuality" = 'LOW'
 WHERE "imageIsGenerated" = true
   AND "image" <> '';
