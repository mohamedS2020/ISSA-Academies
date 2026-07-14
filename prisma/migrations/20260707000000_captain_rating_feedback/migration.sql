-- Captain ratings (trainee → captain, editable) + captain feedback (captain → trainee, history).

CREATE TABLE IF NOT EXISTS "captain_ratings" (
  "id"         UUID NOT NULL,
  "branch_id"  UUID NOT NULL,
  "captain_id" UUID NOT NULL,
  "trainee_id" UUID NOT NULL,
  "stars"      INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "captain_ratings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "captain_ratings_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "captain_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "captain_ratings_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "captain_ratings_captain_id_trainee_id_key" ON "captain_ratings"("captain_id", "trainee_id");
CREATE INDEX IF NOT EXISTS "captain_ratings_captain_id_idx" ON "captain_ratings"("captain_id");

CREATE TABLE IF NOT EXISTS "captain_feedbacks" (
  "id"         UUID NOT NULL,
  "branch_id"  UUID NOT NULL,
  "captain_id" UUID NOT NULL,
  "trainee_id" UUID NOT NULL,
  "message"    TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "captain_feedbacks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "captain_feedbacks_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "captain_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "captain_feedbacks_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee_profiles"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "captain_feedbacks_trainee_id_created_at_idx" ON "captain_feedbacks"("trainee_id", "created_at");
CREATE INDEX IF NOT EXISTS "captain_feedbacks_captain_id_idx" ON "captain_feedbacks"("captain_id");
