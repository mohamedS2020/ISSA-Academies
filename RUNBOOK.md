# ISSA Academies — Operations Runbook

Day-to-day operational procedures. For architecture see [README.md](README.md); for
outstanding pre-launch work see
[Pre-Launch Hardening Plan.md](Pre-Launch%20Hardening%20Plan.md).

---

## Provisioning a new academy

Sign in as the super admin → **Create Academy**. Provisioning runs inside the HTTP
request and does three things:

1. `CREATE SCHEMA tenant_<slug>`
2. Applies `prisma/tenant/migrations/` into that schema
3. Seeds the first branch and the academy's Admin user, and registers the Admin's
   phone in the platform-wide login index

The Admin password is generated and shown **once** — capture it before closing the
dialog. Hand it to the academy and have them change it via **Change password**.

The slug becomes the schema name (`aqua` → `tenant_aqua`) and, when
`NEXT_PUBLIC_ROOT_DOMAIN` is set, the academy's subdomain. It cannot be changed
afterwards — the schema name is derived from it.

**If creation fails partway**, the schema may exist without a tenant row. Check for an
orphan before retrying with the same slug:

```sql
SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%';
SELECT slug, schema_name, status FROM public.tenants;
```

A schema with no matching tenant row is safe to `DROP SCHEMA ... CASCADE`.

---

## Non-payment: suspend and reactivate

There is no platform billing — academies are invoiced manually and enforced with
status changes.

Super admin → the academy → **Suspend**. Effective immediately: every user of that
academy is refused at login with *"Your academy account has been suspended."*
Reactivate the same way. Both directions are safe and lossless:

```
ACTIVE ⇄ SUSPENDED
```

Suspension does **not** touch the data, stop scheduled jobs from skipping it (jobs only
process `ACTIVE` academies), or delete anything.

---

## ⚠️ Deleting an academy — irreversible

`DELETED` is not a soft delete of the data. `changeTenantStatus` also:

- deletes the academy's rows from the platform login index, and
- **drops the academy's PostgreSQL schema** — every trainee, payment, receipt and
  attendance record it contains.

The tenant row is retained for audit history, but the data is gone and there is no
in-app undo. `DELETED` cannot transition back to anything.

**Before deleting:** take a backup (below), and prefer **Suspend** unless the academy
has genuinely left and asked for removal.

---

## Rolling out a schema change to existing academies

New academies get the current tenant migrations automatically at provisioning.
Existing ones do **not** — they stay at the migration they were created with.

```bash
# 1. Create the migration against the tenant schema
npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name <change>

# 2. Apply it to every ACTIVE academy
npm run migrate:tenants
```

`migrate:tenants` iterates active academies and runs `migrate deploy` per schema. It is
idempotent — already-applied migrations are skipped, recorded in each schema's own
`_prisma_migrations` table — so it is safe to re-run. It reports per-academy success
and exits non-zero if any failed; re-run after fixing rather than leaving academies on
mixed versions.

Platform-schema changes are separate and need no fan-out:

```bash
npx prisma migrate dev --schema=prisma/platform/schema.prisma --name <change>
npx prisma migrate deploy --schema=prisma/platform/schema.prisma   # in production
```

> ⚠️ Never merge `prisma/platform/migrations/` and `prisma/tenant/migrations/`.
> `migrate deploy` applies every migration in the folder it is given regardless of
> `--schema`. See README → Migrations.

Do not use `prisma db push` against either database.

---

## Background jobs

Three cron jobs run from [src/jobs/scheduler.ts](src/jobs/scheduler.ts):

| Job | Schedule (UTC) | What it does |
| --- | --- | --- |
| `subscription-expiry` | daily 00:05 | Expires subscriptions past their end date or session count |
| `archive-records` | Sunday 01:00 | Moves old records to the archive tables |
| `session-generation` | Monday 02:00 | Extends each group's rolling 4-week session window |

**They run only where `RUN_SCHEDULER="true"`.** Set it on exactly one service — a
dedicated worker, not the web service. Every replica boots the same hook, so setting it
on a web service with 2+ replicas runs every job once per replica: duplicate expiry,
duplicate archiving, duplicate sessions.

A Postgres advisory lock sits behind that flag as a second line of defence — a second
runner logs *"already running elsewhere — skipping"* and exits. The lock is taken on
`DIRECT_DATABASE_URL`; if that is unset the jobs still run but log a warning that they
are unprotected.

**Verifying:** each job logs `Running <job> for N tenant(s)` on start and
`<job> finished in Ns` on completion. Exactly one of each per scheduled time across the
whole fleet. A per-academy failure logs
`<job> failed for tenant=<id>` and the run continues — one academy cannot take down the
rest.

**Running a job by hand** is not currently exposed; trigger by temporarily adjusting the
cron expression on the worker, or call the job function from a one-off `tsx` script.

---

## Health and monitoring

`GET /api/health` — unauthenticated, cheap, uncached.

- `200 {"status":"ok","db":"up"}` — process alive and the database is reachable
- `503 {"status":"degraded","db":"down"}` — alive but the database is not reachable

Point the platform healthcheck and an external uptime monitor at it. A 503 means the
instance should not receive traffic; check the database first, not the app.

> There is currently **no error reporting** — see hardening plan §8. Until Sentry is
> wired in, production failures are only visible in platform logs.

---

## Backup and restore

Backups are provided by the database host (Neon), not by this application.

**Before anything destructive** — deleting an academy, a bulk migration, a manual data
fix — take a restore point:

1. Neon console → the project → **Backups / Restore**
2. Confirm point-in-time restore is available and note the current timestamp

**Restoring** rolls back the whole database, every academy together — there is no
per-academy restore. If one academy needs recovery, restore to a branch/clone and copy
the affected schema across rather than rolling back everyone.

The schema itself can be rebuilt from migrations:

```bash
npx prisma migrate deploy --schema=prisma/platform/schema.prisma
npx tsx prisma/seed.ts          # re-creates the super admin
```

Academy schemas are then recreated by provisioning, or restored from the backup.

> ⚠️ Free-tier retention is minimal. Confirm the plan's retention window actually covers
> your recovery needs before launch — see hardening plan §10.

---

## Common failures

**`prepared statement "s0" already exists`**
`DATABASE_URL` points at a pooled endpoint without `pgbouncer=true`. Add it. See
[.env.example](.env.example) → Database.

**`Transaction already closed` / `Transaction API error`**
A transaction ran past the 30s limit. Usually means work that should sit outside a
transaction was nested inside one — look for a `withTenantContext` callback that calls
another service which opens its own.

**Login returns 500 for every user of one academy**
That academy's schema is missing a column the app selects — it was provisioned before a
migration and never caught up. Run `npm run migrate:tenants`.

**"This account belongs to a different academy"**
The user reached an academy subdomain their account does not belong to. Expected: log in
on the correct subdomain or the root domain.

**Subdomains not working at all**
`NEXT_PUBLIC_ROOT_DOMAIN` is unset, so it falls back to `localhost`. Railway's
`*.up.railway.app` cannot host per-academy subdomains — a custom domain is required.
