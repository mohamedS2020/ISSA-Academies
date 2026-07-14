-- Manual income (income not tied to a subscription). Mirrors the expenses table.

CREATE TABLE IF NOT EXISTS "manual_incomes" (
  "id"          UUID NOT NULL,
  "branch_id"   UUID NOT NULL,
  "category"    VARCHAR(100) NOT NULL,
  "amount"      DECIMAL(10,2) NOT NULL,
  "description" TEXT,
  "date"        DATE NOT NULL,
  "created_by"  UUID NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL,
  CONSTRAINT "manual_incomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_incomes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "manual_incomes_branch_id_date_idx" ON "manual_incomes"("branch_id", "date");
