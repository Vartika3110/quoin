-- Whether a Studio pin's picture came from an image model rather than a
-- camera. Mirrors products."imageIsGenerated"; the storefront labels it.
ALTER TABLE "studio_ideas"
  ADD COLUMN "imageIsGenerated" BOOLEAN NOT NULL DEFAULT false;
