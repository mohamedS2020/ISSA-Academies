-- At most ONE queued (UPCOMING) renewal per trainee, enforced by the database.
--
-- renewSubscription checks for an existing UPCOMING renewal with a plain read
-- before creating one. That check gives the common case a clear message, but a
-- transaction does not lock rows it only reads: two people renewing the same
-- trainee at the same moment would both see "none queued" and both charge for
-- it. This partial index lets exactly one through; the other gets a clear 409
-- (see insertUpcomingSubscription in subscription.service.ts).
--
-- Same pattern, and the same note on Prisma, as
-- 20260928000000_one_active_subscription_per_trainee: partial indexes cannot be
-- expressed in schema.prisma, so this lives only here.

CREATE UNIQUE INDEX "trainee_subscriptions_one_upcoming_per_trainee"
  ON "trainee_subscriptions" ("trainee_id")
  WHERE "status" = 'UPCOMING';
