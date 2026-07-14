-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('INSTAPAY', 'CASH', 'EWALLET');

-- CreateEnum
CREATE TYPE "ReferralType" AS ENUM ('NEW', 'NETWORK', 'OLD', 'CONTINUOUS');

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN "payment_method" "PaymentMethod";

-- AlterTable
ALTER TABLE "trainee_profiles" ADD COLUMN "referral_type" "ReferralType";
