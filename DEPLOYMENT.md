# Deployment Checklist

A pre-flight checklist for standing the platform up on Railway + Neon. Work top to
bottom and **verify each step before moving on** — several failures here are silent,
and the whole point of the order is that you only ever debug one new thing at a time.

This file does not restate configuration. The variables and what they mean live in
[.env.example](.env.example); day-to-day operations live in [RUNBOOK.md](RUNBOOK.md).
If those disagree with this file, they are right and this is stale.

> **Status:** partially complete. Steps marked 🚧 depend on hardening-plan work that is
> not finished yet — today that is only Redis (§6). Sentry is wired and ready to
> configure (step 5). See `Pre-Launch Hardening Plan.md`.

---

## 0. The variable matrix

The single most common way to break this deployment is putting the right variable on
the wrong service. Two services, different needs:

| Variable | Web | Worker | Notes |
| --- | :-: | :-: | --- |
| `DATABASE_URL` | ✅ | ✅ | Pooled endpoint. **Must** carry `pgbouncer=true&connection_limit=10` |
| `DIRECT_DATABASE_URL` | ✅ | ✅ | Non-pooled. Not just for migrations — see below |
| `JWT_ACCESS_SECRET` | ✅ | ✅ | Identical on both, 32+ random chars |
| `JWT_REFRESH_SECRET` | ✅ | ✅ | Identical on both, different from the access secret |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` / `JWT_REMEMBER_ME_EXPIRY` | ✅ | ✅ | |
| `RUN_SCHEDULER` | ❌ **unset** | ✅ `"true"` | **Exactly one service.** See step 4 |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | — | Subdomains are inert without it. **Build-time** (see below) |
| `TRUSTED_PROXY_HOPS` | ✅ | — | `1` for Railway. Security-relevant — read the note in `.env.example` |
| `RATE_LIMIT_*` | ✅ | — | Defaults are fine to start |
| `TENANT_CLIENT_CACHE_MAX` | ✅ | ✅ | Default 25 |
| `NODE_ENV` | ✅ `production` | ✅ `production` | JWT secret strength is only enforced in production |
| `NEXT_PUBLIC_APP_NAME` | ✅ | — | **The platform's name** — the only place it is set. **Build-time** (see below) |
| `SENTRY_DSN` | ✅ | ✅ | Server-side error reporting. Public by design, not a secret |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ | — | Browser error reporting — same value as `SENTRY_DSN`. **Build-time** |
| `SENTRY_ORG` / `SENTRY_PROJECT` | ✅ | optional | Source-map upload during the build, so stack traces are readable. On the worker only if you want readable traces for job errors |
| `SENTRY_AUTH_TOKEN` | ✅ | optional | Same upload. ⚠️ **A real secret** — Railway variables only, never `NEXT_PUBLIC_`, never committed |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | optional | optional | Leave unset (0) on the free tier — `.env.example` explains why |
| `PRIVILEGE_CACHE_TTL_MS` | optional | optional | Default `30000`. Worst-case delay before a revoked moderator privilege stops working on another replica |
| `REDIS_URL` 🚧 | ✅ | ✅ | Step 5 |

**`NEXT_PUBLIC_` variables are baked in when the app is built, not read when it
runs:** `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_SENTRY_DSN` and
`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`. Set them **before** the build. After changing
one, deploy a **new build**: Restart re-runs the old build, and Railway's docs do not
promise that Redeploy rebuilds either — pushing a commit to `main` always does. Then
check the change is live (for the name: the login page and the browser tab). The Sentry
upload variables are read during the build too; Railway passes service variables to it.

**CI needs none of these.** GitHub Actions builds only to check the code; that build is
never deployed, so uploading its source maps would attach them to a release nothing
runs.

**`DIRECT_DATABASE_URL` is required on the web service, not only the worker.** Creating
an academy runs `CREATE SCHEMA` and `prisma migrate deploy` inside the HTTP request
(`tenant.service.ts` → `migration-runner.ts`), and falls back to `DATABASE_URL` if the
direct URL is missing — pushing DDL through the pooler, which is exactly how academy
creation breaks. The worker needs it for the advisory lock and refuses to start without
it.

---

## 1. Database (Neon)

- [ ] Project created, and **note its region** — you need it in step 2
- [ ] Copy **both** connection strings: the pooled one (host contains `-pooler`) and the
      direct one (same host without `-pooler`)
- [ ] Append to the **pooled** string only: `&pgbouncer=true&connection_limit=10`
- [ ] Paid plan if this is production: no autosuspend, real backups/PITR

> ⚠️ Without `pgbouncer=true` on a pooled URL, Prisma throws
> `prepared statement "s0" already exists` under concurrency. It is invisible at low
> traffic and appears exactly when you get busy.

**Verify:** the pooled URL contains `-pooler` **and** `pgbouncer=true`; the direct URL
contains neither.

---

## 2. Web service (Railway)

- [ ] Service created from the repo, deploying `main`
- [ ] **Region matches Neon's.** Cross-region adds ~100ms per round trip and a request
      makes several — the single biggest latency lever you have
- [ ] All Web-column variables from the matrix set
- [ ] `RUN_SCHEDULER` **not set** here
- [ ] Healthcheck path set to `/api/health`

Build and start commands are auto-detected (`npm run build` / `npm start`).
`postinstall` generates both Prisma clients — they are no longer committed to the repo,
so a failure there fails the build.

**Verify:** deployment is green and `curl https://<your-app>/api/health` returns
`{"status":"ok","db":"up",...}`. A `503` with `"db":"down"` means the app is up but
cannot reach Postgres — check step 1 before anything else.

---

## 3. First smoke deploy — do not skip

Before adding the worker, Sentry, Redis or replicas, confirm the **base** deployment
works. Each later step then changes one thing, so a failure has one obvious cause.

- [ ] `GET /api/health` returns 200
- [ ] Platform migrations applied:
      `npx prisma migrate deploy --schema=prisma/platform/schema.prisma`
- [ ] Super admin seeded: `npx tsx prisma/seed.ts`, with `SEED_SUPER_ADMIN_NAME`,
      `SEED_SUPER_ADMIN_PHONE` and `SEED_SUPER_ADMIN_PASSWORD` set for that one run.
      ⚠️ Use a **new** password — the one previously hardcoded in the seed is public
      (it is in this public repository's git history). Remove the variables afterwards.
- [ ] Log in as the super admin
- [ ] **Create one academy** — this exercises `CREATE SCHEMA`, tenant migrations and
      seeding in a single request, and is historically the most Railway-fragile path
- [ ] Log in as that academy's Admin, add a branch and a trainee

If academy creation fails, check `DIRECT_DATABASE_URL` on the **web** service first.

---

## 4. Worker service (background jobs)

Jobs run **only** where `RUN_SCHEDULER="true"`. Every replica boots the same hook, so
setting it on a web service with 2+ replicas runs every job once per replica —
duplicate subscription expiry, duplicate archiving, duplicate sessions.

- [ ] New Railway service, same repo, same region
- [ ] `RUN_SCHEDULER=true`
- [ ] `DIRECT_DATABASE_URL` set to the **non-pooled** endpoint
- [ ] All other Worker-column variables set
- [ ] Confirm `RUN_SCHEDULER` is still unset on the web service

> The worker **refuses to start** without a non-pooled `DIRECT_DATABASE_URL`, and says
> so in the logs. That is deliberate: advisory locks are session-scoped and cannot be
> held across a transaction pooler, and running jobs unlocked is the duplication this
> exists to prevent.

**Verify:** worker logs show
`[scheduler] Background jobs registered`, and the web service logs show
`[scheduler] RUN_SCHEDULER is not "true" — background jobs are disabled`. Exactly one
service should be registering.

---

## 5. Observability and shared state

**Sentry — ready** (the code landed with hardening-plan §8):

- [ ] Web service: all five Sentry variables from the matrix. Worker: `SENTRY_DSN`, plus
      the three upload variables if you want readable traces for job errors
- [ ] A **new build** deployed after setting them — `NEXT_PUBLIC_SENTRY_DSN` is build-time
- [ ] Browser reporting works: on the live site, run
      `setTimeout(() => { throw new Error('sentry check') })` in the browser console. It
      should appear in Sentry → Issues within a minute; resolve it afterwards
- [ ] Source maps uploaded: Sentry → Project Settings → Source Maps lists an upload from
      the new build (the build log stays quiet about it on Railway)
- [ ] The first real server error arrives tagged with `tenantId` and `role`, and with
      **no** phone numbers or tokens in it

**Uptime:**

- [ ] External uptime monitor pointed at `/api/health`

**🚧 Redis — waits on hardening-plan §6:**

- [ ] Upstash Redis created, `REDIS_URL` on both services

Do this **before** step 6. Adding replicas is when you most need to be able to see what
is happening.

---

## 6. Scale

- [ ] Railway plan upgraded
- [ ] Web service scaled to ≥2 replicas
- [ ] Load test (see the hardening plan's load-testing section — warm Neon first, give
      each virtual user a distinct phone number, pre-authenticate a session pool)

**Verify with 2 replicas running:**

- [ ] Each job logs exactly once per scheduled time across the whole fleet
- [ ] The login limit is enforced globally, not per-replica (needs step 5's Redis)
- [ ] Spoofing `x-forwarded-for` does not reset the login counter
- [ ] No `prepared statement "s0" already exists` under concurrent load

---

## 7. Go-live

- [ ] Custom domain attached, `NEXT_PUBLIC_ROOT_DOMAIN` set to it — then a **new build**
      (it is build-time)
- [ ] Platform name chosen: `NEXT_PUBLIC_APP_NAME` set — also build-time — and the login
      page shows it
- [ ] Local test runs no longer point at the production database (hardening plan §31)
- [ ] Wildcard DNS (`*.yourdomain.com`) so academy subdomains resolve
- [ ] Log in via an academy subdomain and confirm it themes correctly
- [ ] **Take a fresh backup** and note the timestamp — your first known-good restore
      point (see RUNBOOK → Backup and restore for why the date matters)
- [ ] Re-read RUNBOOK → "⚠️ Deleting an academy" so the whole team knows `DELETED`
      destroys the academy's data irreversibly

---

## If something breaks

RUNBOOK.md has a common-failures table keyed to the actual error strings. The three you
are most likely to meet here:

| Symptom | Cause |
| --- | --- |
| `prepared statement "s0" already exists` | Pooled `DATABASE_URL` without `pgbouncer=true` (step 1) |
| Academy creation fails | `DIRECT_DATABASE_URL` missing on the **web** service (step 0) |
| Jobs never run, or run twice | `RUN_SCHEDULER` on no service, or on more than one (step 4) |
