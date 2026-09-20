-- ISSA — PLATFORM baseline (squashed).
--
-- Replaces the 9 migrations that previously lived in the shared prisma/migrations/
-- folder. That folder served BOTH schemas, and `prisma migrate deploy` applies every
-- migration in a folder regardless of which --schema it was given — so platform
-- migrations ran inside every tenant schema and vice versa. Worse, the old
-- 20260616092748_init_tenant dropped "tenants", "tenant_configs" and "super_admins"
-- without recreating them, so building the platform DB from migrations produced a
-- platform DB with no platform tables at all.
--
-- Migrations are now split per schema (prisma/platform/, prisma/tenant/), each with
-- its own migration_lock.toml, so a deploy can only ever touch its own set.
--
-- Generated from prisma/platform/schema.prisma via `migrate diff --from-empty`, so it
-- includes tenant_configs.theme_key — the column that was previously declared in the
-- schema but never created by any migration.

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "contact_name" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "contact_email" VARCHAR(255),
    "schema_name" VARCHAR(100) NOT NULL,
    "max_branches" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'EGP',
    "default_timezone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Cairo',
    "theme_key" VARCHAR(40) NOT NULL DEFAULT 'swimming',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_phone_index" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_phone_index_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "tenants"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configs_tenant_id_key" ON "tenant_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_phone_number_key" ON "super_admins"("phone_number");

-- CreateIndex
CREATE INDEX "user_phone_index_phone_number_idx" ON "user_phone_index"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_index_phone_number_tenant_id_key" ON "user_phone_index"("phone_number", "tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_configs" ADD CONSTRAINT "tenant_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_phone_index" ADD CONSTRAINT "user_phone_index_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

