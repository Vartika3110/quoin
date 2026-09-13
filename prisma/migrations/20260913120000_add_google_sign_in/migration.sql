-- AlterTable
-- `phone` becomes nullable: a Google account has none until checkout
-- collects one. Postgres permits any number of NULLs under a unique
-- index, so `users_phone_key` needs no change to keep phone-verified
-- accounts unique.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");
