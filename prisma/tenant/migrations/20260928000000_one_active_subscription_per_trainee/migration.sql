-- At most ONE active subscription per trainee, enforced by the database.
--
-- enrollTrainee and renewSubscription both checked for an existing ACTIVE
-- subscription with a plain read and then created one. At Postgres's default
-- isolation level (READ COMMITTED) a transaction does not lock rows it only
-- reads, so two concurrent requests could both see "none active" and both
-- create one — each with its own receipt and income ledger entry. Reproduced:
-- 6 of 10 staggered attempts produced two ACTIVE subscriptions. That is a
-- double charge.
--
-- A PARTIAL unique index makes the rule hold however requests interleave: only
-- rows with status = 'ACTIVE' take part, so a trainee may still have any number
-- of EXPIRED or FROZEN subscriptions in their history.
--
-- Prisma cannot express partial indexes in schema.prisma, so this lives only in
-- the migration. Verified that Prisma treats it as non-drift: a schema built
-- from these migrations plus this index diffs empty against schema.prisma, so a
-- future `prisma migrate dev` will not generate a DROP for it. Do not remove it
-- by hand when editing a generated migration.

-- Refuse to proceed if duplicates already exist, rather than silently choosing
-- which subscription to keep. Deciding that means deciding which of two charges
-- stands — a business decision about real money, not a migration's to make.
DO $$
DECLARE
  offenders integer;
BEGIN
  SELECT COUNT(*) INTO offenders
  FROM (
    SELECT trainee_id
    FROM trainee_subscriptions
    WHERE status = 'ACTIVE'
    GROUP BY trainee_id
    HAVING COUNT(*) > 1
  ) duplicated;

  IF offenders > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce one active subscription per trainee: % trainee(s) already have more than one. '
      'Resolve them first (expire the unintended duplicate and refund or credit it), then re-run. '
      'Find them with: SELECT trainee_id, COUNT(*) FROM trainee_subscriptions '
      'WHERE status = ''ACTIVE'' GROUP BY trainee_id HAVING COUNT(*) > 1;',
      offenders;
  END IF;
END $$;

CREATE UNIQUE INDEX "trainee_subscriptions_one_active_per_trainee"
  ON "trainee_subscriptions" ("trainee_id")
  WHERE "status" = 'ACTIVE';
