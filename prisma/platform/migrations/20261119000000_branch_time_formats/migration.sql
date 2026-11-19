-- How each branch of an academy shows times of day (12- or 24-hour), keyed by
-- branch id. Platform schema only: academy (tenant) schemas are not touched.
ALTER TABLE "tenant_configs" ADD COLUMN "branch_time_formats" JSONB NOT NULL DEFAULT '{}';
