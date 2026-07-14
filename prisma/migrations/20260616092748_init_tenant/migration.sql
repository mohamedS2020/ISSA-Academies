/*
  Warnings:

  - You are about to drop the `super_admins` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenant_configs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenants` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MODERATOR', 'CAPTAIN', 'TRAINEE');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('FROM_SUBSCRIPTION_DATE', 'FROM_MONTH_START');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'FROZEN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollType" AS ENUM ('HOURS', 'SALARY_PERCENTAGE');

-- CreateEnum
CREATE TYPE "PayrollFrequency" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'LOGIN', 'PASSWORD_RESET', 'STATUS_CHANGE');

-- DropForeignKey
ALTER TABLE "tenant_configs" DROP CONSTRAINT "tenant_configs_tenant_id_fkey";

-- DropTable
DROP TABLE "super_admins";

-- DropTable
DROP TABLE "tenant_configs";

-- DropTable
DROP TABLE "tenants";

-- DropEnum
DROP TYPE "TenantStatus";

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(50),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Cairo',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_privileges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "privilege" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_privileges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainee_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "system_code" VARCHAR(50) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "whatsapp_number" VARCHAR(50) NOT NULL,
    "parent_id_card" VARCHAR(50) NOT NULL,
    "medical_condition" TEXT NOT NULL,
    "past_experience" TEXT,
    "other_academies" TEXT,
    "level_id" UUID,
    "marital_status" VARCHAR(50),
    "father_job" VARCHAR(255),
    "father_qualifications" VARCHAR(255),
    "mother_job" VARCHAR(255),
    "mother_qualifications" VARCHAR(255),
    "birth_order" INTEGER,
    "personality_traits" TEXT,
    "height" DECIMAL(5,2),
    "weight" DECIMAL(5,2),
    "arm_length" DECIMAL(5,2),
    "foot_length" DECIMAL(5,2),
    "chest_circumference" DECIMAL(5,2),
    "waist_circumference" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trainee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "captain_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "specialization" VARCHAR(255),
    "attending_days" "DayOfWeek"[],
    "payroll_type" "PayrollType" NOT NULL,
    "hourly_rate" DECIMAL(10,2),
    "base_salary" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "captain_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "min_sessions" INTEGER NOT NULL,
    "period_type" "PeriodType" NOT NULL,
    "period_days" INTEGER,
    "freeze_sessions" INTEGER NOT NULL,
    "freeze_retake_days" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_levels" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainee_subscriptions" (
    "id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "attended_sessions" INTEGER NOT NULL DEFAULT 0,
    "freeze_used" INTEGER NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_due" DECIMAL(10,2) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trainee_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "captain_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "min_trainees" INTEGER NOT NULL,
    "max_trainees" INTEGER NOT NULL,
    "days_per_week" INTEGER NOT NULL,
    "schedule_days" "DayOfWeek"[],
    "start_time" VARCHAR(5) NOT NULL,
    "session_duration" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_trainees" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_trainees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelled_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "is_retake" BOOLEAN NOT NULL DEFAULT false,
    "marked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_by" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainee_evaluations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trainee_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "receipt_number" VARCHAR(50) NOT NULL,
    "seq" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "reference_id" UUID,
    "date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "captain_payrolls" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "captain_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "payroll_type" "PayrollType" NOT NULL,
    "hours_worked" DECIMAL(6,2),
    "hourly_rate" DECIMAL(10,2),
    "base_salary" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "percentage_base" DECIMAL(10,2),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "captain_payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_attendance_records" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "is_retake" BOOLEAN NOT NULL,
    "marked_at" TIMESTAMPTZ NOT NULL,
    "marked_by" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_trainee_subscriptions" (
    "id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "attended_sessions" INTEGER NOT NULL,
    "freeze_used" INTEGER NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL,
    "amount_due" DECIMAL(10,2) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_trainee_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_financial_transactions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "reference_id" UUID,
    "date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_receipts" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "receipt_number" VARCHAR(50) NOT NULL,
    "seq" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "issued_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_expenses" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_captain_payrolls" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "captain_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "payroll_type" "PayrollType" NOT NULL,
    "hours_worked" DECIMAL(6,2),
    "hourly_rate" DECIMAL(10,2),
    "base_salary" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "percentage_base" DECIMAL(10,2),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "is_paid" BOOLEAN NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_captain_payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "users_phone_number_idx" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_branch_id_phone_number_key" ON "users"("branch_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_privileges_user_id_privilege_key" ON "user_privileges"("user_id", "privilege");

-- CreateIndex
CREATE UNIQUE INDEX "trainee_profiles_user_id_key" ON "trainee_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainee_profiles_system_code_key" ON "trainee_profiles"("system_code");

-- CreateIndex
CREATE INDEX "trainee_profiles_system_code_idx" ON "trainee_profiles"("system_code");

-- CreateIndex
CREATE INDEX "trainee_profiles_branch_id_idx" ON "trainee_profiles"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "captain_profiles_user_id_key" ON "captain_profiles"("user_id");

-- CreateIndex
CREATE INDEX "captain_profiles_branch_id_idx" ON "captain_profiles"("branch_id");

-- CreateIndex
CREATE INDEX "subscription_plans_branch_id_idx" ON "subscription_plans"("branch_id");

-- CreateIndex
CREATE INDEX "subscription_plan_levels_plan_id_idx" ON "subscription_plan_levels"("plan_id");

-- CreateIndex
CREATE INDEX "trainee_subscriptions_trainee_id_status_idx" ON "trainee_subscriptions"("trainee_id", "status");

-- CreateIndex
CREATE INDEX "trainee_subscriptions_status_idx" ON "trainee_subscriptions"("status");

-- CreateIndex
CREATE INDEX "groups_branch_id_idx" ON "groups"("branch_id");

-- CreateIndex
CREATE INDEX "groups_captain_id_idx" ON "groups"("captain_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_trainees_group_id_trainee_id_key" ON "group_trainees"("group_id", "trainee_id");

-- CreateIndex
CREATE INDEX "sessions_branch_id_scheduled_at_idx" ON "sessions"("branch_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "sessions_group_id_scheduled_at_idx" ON "sessions"("group_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "attendance_records_branch_id_idx" ON "attendance_records"("branch_id");

-- CreateIndex
CREATE INDEX "attendance_records_trainee_id_idx" ON "attendance_records"("trainee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_trainee_id_key" ON "attendance_records"("session_id", "trainee_id");

-- CreateIndex
CREATE INDEX "trainee_evaluations_trainee_id_idx" ON "trainee_evaluations"("trainee_id");

-- CreateIndex
CREATE INDEX "trainee_evaluations_session_id_idx" ON "trainee_evaluations"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "receipts_branch_id_seq_idx" ON "receipts"("branch_id", "seq");

-- CreateIndex
CREATE INDEX "receipts_receipt_number_idx" ON "receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "financial_transactions_branch_id_date_idx" ON "financial_transactions"("branch_id", "date");

-- CreateIndex
CREATE INDEX "financial_transactions_type_idx" ON "financial_transactions"("type");

-- CreateIndex
CREATE INDEX "expenses_branch_id_date_idx" ON "expenses"("branch_id", "date");

-- CreateIndex
CREATE INDEX "captain_payrolls_branch_id_period_start_idx" ON "captain_payrolls"("branch_id", "period_start");

-- CreateIndex
CREATE INDEX "captain_payrolls_captain_id_idx" ON "captain_payrolls"("captain_id");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_created_at_idx" ON "audit_logs"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "archived_attendance_records_branch_id_idx" ON "archived_attendance_records"("branch_id");

-- CreateIndex
CREATE INDEX "archived_attendance_records_trainee_id_idx" ON "archived_attendance_records"("trainee_id");

-- CreateIndex
CREATE INDEX "archived_attendance_records_session_id_trainee_id_idx" ON "archived_attendance_records"("session_id", "trainee_id");

-- CreateIndex
CREATE INDEX "archived_trainee_subscriptions_trainee_id_idx" ON "archived_trainee_subscriptions"("trainee_id");

-- CreateIndex
CREATE INDEX "archived_trainee_subscriptions_status_idx" ON "archived_trainee_subscriptions"("status");

-- CreateIndex
CREATE INDEX "archived_financial_transactions_branch_id_date_idx" ON "archived_financial_transactions"("branch_id", "date");

-- CreateIndex
CREATE INDEX "archived_receipts_branch_id_idx" ON "archived_receipts"("branch_id");

-- CreateIndex
CREATE INDEX "archived_receipts_receipt_number_idx" ON "archived_receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "archived_expenses_branch_id_date_idx" ON "archived_expenses"("branch_id", "date");

-- CreateIndex
CREATE INDEX "archived_captain_payrolls_branch_id_period_start_idx" ON "archived_captain_payrolls"("branch_id", "period_start");

-- CreateIndex
CREATE INDEX "archived_captain_payrolls_captain_id_idx" ON "archived_captain_payrolls"("captain_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_privileges" ADD CONSTRAINT "user_privileges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_profiles" ADD CONSTRAINT "trainee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_profiles" ADD CONSTRAINT "trainee_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_profiles" ADD CONSTRAINT "trainee_profiles_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "subscription_plan_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captain_profiles" ADD CONSTRAINT "captain_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captain_profiles" ADD CONSTRAINT "captain_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_levels" ADD CONSTRAINT "subscription_plan_levels_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_subscriptions" ADD CONSTRAINT "trainee_subscriptions_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_subscriptions" ADD CONSTRAINT "trainee_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_subscriptions" ADD CONSTRAINT "trainee_subscriptions_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "subscription_plan_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "captain_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_trainees" ADD CONSTRAINT "group_trainees_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_trainees" ADD CONSTRAINT "group_trainees_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_evaluations" ADD CONSTRAINT "trainee_evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_evaluations" ADD CONSTRAINT "trainee_evaluations_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_evaluations" ADD CONSTRAINT "trainee_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "trainee_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captain_payrolls" ADD CONSTRAINT "captain_payrolls_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captain_payrolls" ADD CONSTRAINT "captain_payrolls_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "captain_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
