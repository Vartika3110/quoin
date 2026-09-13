-- AlterTable
-- `deliveryPhone` is a plain, unverified shipping contact — not the OTP
-- identity column, so it carries no unique index (a household may share
-- one number across two accounts).
ALTER TABLE "users" ADD COLUMN "deliveryPhone" TEXT;
