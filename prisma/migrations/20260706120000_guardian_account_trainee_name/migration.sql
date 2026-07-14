-- Guardian account model: one User (account/guardian) now owns many TraineeProfiles.
-- Athletes get their own name; User.name becomes the account/guardian name.

-- Athlete name — add nullable, backfill from the account user's name, then enforce NOT NULL.
ALTER TABLE "trainee_profiles" ADD COLUMN IF NOT EXISTS "name" VARCHAR(255);
UPDATE "trainee_profiles" tp
   SET "name" = u."name"
  FROM "users" u
 WHERE u."id" = tp."user_id" AND tp."name" IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "trainee_profiles" WHERE "name" IS NULL) THEN
    ALTER TABLE "trainee_profiles" ALTER COLUMN "name" SET NOT NULL;
  END IF;
END $$;

-- 1:1 → 1:N — drop the unique index on user_id, keep a plain index.
DROP INDEX IF EXISTS "trainee_profiles_user_id_key";
CREATE INDEX IF NOT EXISTS "trainee_profiles_user_id_idx" ON "trainee_profiles"("user_id");
