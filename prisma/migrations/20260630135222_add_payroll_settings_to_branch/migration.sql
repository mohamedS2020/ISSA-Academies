-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "payroll_custom_days" INTEGER,
ADD COLUMN     "payroll_frequency" "PayrollFrequency" NOT NULL DEFAULT 'MONTHLY';
