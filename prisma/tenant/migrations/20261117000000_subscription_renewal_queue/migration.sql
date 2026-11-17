-- Renewals paid in advance.
--
-- A trainee can renew while the current subscription is still running. The new
-- subscription is stored at once (its receipt and ledger entry are real money,
-- recorded the day it is paid) with status UPCOMING, and becomes ACTIVE when the
-- current one ends: by the nightly expiry job when the end date passes, or by
-- attendance when the last session is used.
--
-- group_id: the group an UPCOMING renewal moves the trainee into when it starts
-- (a renewal may change group; the move waits until the renewal begins). Kept
-- afterwards as a record of where the renewal placed the trainee. Nullable: older
-- subscriptions never stored it.
--
-- The UPCOMING value is added here and first used by the next migration: a new
-- enum value cannot be used in the transaction that adds it.

ALTER TYPE "SubscriptionStatus" ADD VALUE 'UPCOMING';

ALTER TABLE "trainee_subscriptions" ADD COLUMN "group_id" UUID;

ALTER TABLE "trainee_subscriptions"
  ADD CONSTRAINT "trainee_subscriptions_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Archive tables mirror their live tables (see 20261017000200_archive_alignment).
ALTER TABLE "archived_trainee_subscriptions" ADD COLUMN "group_id" UUID;
