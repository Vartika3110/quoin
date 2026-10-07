-- A product somebody hearted. See the model comment in schema.prisma for
-- why only the slug is stored and why it is not a foreign key.
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- Hearting twice is the same fact, not two.
CREATE UNIQUE INDEX "wishlist_items_userId_productSlug_key"
    ON "wishlist_items"("userId", "productSlug");

-- The list is always read by owner, newest first.
CREATE INDEX "wishlist_items_userId_createdAt_idx"
    ON "wishlist_items"("userId", "createdAt");

-- Cascade: a wishlist is not a record of anything, so deleting the
-- account should take it with them — unlike an order.
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
