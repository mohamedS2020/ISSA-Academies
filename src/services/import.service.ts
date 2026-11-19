/**
 * Academy data import (super admin): an Excel file, made from the template in
 * src/lib/import/, becomes an academy branch's plans, captains, groups,
 * trainees with their parent accounts, and each trainee's current
 * subscription.
 *
 *   checkImport → read and check everything; writes nothing.
 *   runImport   → the same checks again (the file is re-sent, never trusted
 *                 from an earlier check), then one transaction.
 *
 * Rules:
 *   - Only into an EMPTY branch (no plans, captains, groups or trainees),
 *     re-checked inside the transaction with the branch row locked, so two
 *     imports, or an import and a registration, can't both get in.
 *   - All or nothing: any problem saves nothing.
 *   - Money paid before the system is recorded on the subscription (paid,
 *     outstanding) but is NOT income: no receipts, no ledger entries. The
 *     balance collected later through Record payment is income, as usual.
 *   - Logins: a random password per new account (parents and captains),
 *     returned once in the credentials file, never stored readable.
 *   - Every created record is audited under the import's id; that audit trail
 *     is also the import history shown on the academy page.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { format, addDays } from 'date-fns';
import { withTenantContext, type TransactionClient } from '@/lib/db/tenant-client';
import { hashPassword } from '@/lib/auth/password';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/error-handler';
import { AuditAction, UserRole } from '@/types';
import { syncLoginIndex, withPhoneGuard } from './login-index';
import { formatSystemCode } from './trainee.service';
import { generateSessionsForGroup } from './schedule.service';
import { getTenantById } from './tenant.service';
import { getAcademyCurrency } from './display-settings.service';
import { readWorkbook } from '@/lib/import/read';
import { validateImport, summarize, type ImportPlan, type ImportSummary } from '@/lib/import/validate';
import { buildCredentials, markUpErrors, type Credential } from '@/lib/import/workbooks';
import { IMPORT_LIMITS } from '@/lib/import/template';
import type { ImportIssue } from '@/lib/import/messages';
import { nameKey } from '@/lib/import/parse';

/** The audit entity type of an import's summary entry (the history). */
export const IMPORT_AUDIT_ENTITY = 'DataImport';

// ─── Branches ─────────────────────────────────────────────────

async function branchIsEmpty(tx: TransactionClient, branchId: string): Promise<boolean> {
  const where = { branchId };
  const [plans, captains, groups, trainees] = await Promise.all([
    tx.subscriptionPlan.count({ where }),
    tx.captainProfile.count({ where }),
    tx.group.count({ where }),
    tx.traineeProfile.count({ where }),
  ]);
  return plans + captains + groups + trainees === 0;
}

export interface ImportHistoryEntry {
  id: string;
  at: Date;
  branchId: string;
  fileName: string | null;
  summary: ImportSummary | null;
}

/** The academy's branches (which can still take an import) and past imports. */
export async function getImportContext(tenantId: string) {
  return withTenantContext(tenantId, async (tx) => {
    const branches = await tx.branch.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, code: true },
    });
    const withState = [];
    for (const b of branches) withState.push({ ...b, isEmpty: await branchIsEmpty(tx, b.id) });

    const logs = await tx.auditLog.findMany({
      where: { entityType: IMPORT_AUDIT_ENTITY },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const history: ImportHistoryEntry[] = logs.map((l) => {
      const v = (l.newValues ?? {}) as { fileName?: string; summary?: ImportSummary };
      return { id: l.entityId, at: l.createdAt, branchId: l.branchId, fileName: v.fileName ?? null, summary: v.summary ?? null };
    });
    return { branches: withState, history, currency: await getAcademyCurrency(tenantId) };
  });
}

// ─── Checking ─────────────────────────────────────────────────

/** Today's date in the branch's time zone, YYYY-MM-DD. */
function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function looksLikeXlsx(file: Buffer): boolean {
  // An .xlsx is a zip: "PK\x03\x04".
  return file.length > 4 && file[0] === 0x50 && file[1] === 0x4b && file[2] === 0x03 && file[3] === 0x04;
}

interface Checked {
  plan: ImportPlan;
  issues: ImportIssue[];
  branch: { id: string; name: string; code: string; timezone: string };
}

async function checkFile(tenantId: string, branchId: string, file: Buffer): Promise<Checked> {
  const branch = await withTenantContext(tenantId, (tx) =>
    tx.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true, name: true, code: true, timezone: true } })
  );
  if (!branch) throw new NotFoundError('Branch not found');

  const empty: ImportPlan = { plans: [], captains: [], groups: [], accounts: [], trainees: [] };
  if (file.length > IMPORT_LIMITS.maxFileSize) return { plan: empty, issues: [{ code: 'file.tooLarge' }], branch };
  if (!looksLikeXlsx(file)) return { plan: empty, issues: [{ code: 'file.notXlsx' }], branch };

  const read = await readWorkbook(file);
  if (read.issues.length) return { plan: empty, issues: read.issues, branch };

  const { plan, issues } = validateImport(read.sheets, todayIn(branch.timezone));

  // Academy-wide: the branch is empty, and no new login's phone is taken.
  await withTenantContext(tenantId, async (tx) => {
    if (!(await branchIsEmpty(tx, branchId))) issues.unshift({ code: 'branch.notEmpty' });
    const phones = [...plan.captains.map((c) => c.phone), ...plan.accounts.map((a) => a.phone)];
    if (!phones.length) return;
    const taken = new Set(
      (await tx.user.findMany({ where: { phoneNumber: { in: phones }, isActive: true }, select: { phoneNumber: true } })).map((u) => u.phoneNumber)
    );
    for (const c of plan.captains) if (taken.has(c.phone)) issues.push({ code: 'phone.inUse', sheet: 'captains', row: c.row, column: 'phone' });
    for (const a of plan.accounts) {
      if (taken.has(a.phone)) for (const row of a.rows) issues.push({ code: 'phone.inUse', sheet: 'trainees', row, column: 'parentPhone' });
    }
  });

  return { plan, issues, branch };
}

export interface CheckResult {
  ok: boolean;
  summary: ImportSummary;
  issues: ImportIssue[];
  /** The academy's file with each problem marked, when there are problems in it. */
  markedFile: Buffer | null;
}

export async function checkImport(tenantId: string, branchId: string, file: Buffer): Promise<CheckResult> {
  const { plan, issues } = await checkFile(tenantId, branchId, file);
  const fileProblem = issues.some((i) => i.code.startsWith('file.'));
  return {
    ok: issues.length === 0,
    summary: summarize(plan),
    issues,
    markedFile: issues.length && !fileProblem ? await markUpErrors(file, issues) : null,
  };
}

// ─── Importing ────────────────────────────────────────────────

/** 8 letters and digits, none that read alike (0/O, 1/l/I), easy to type on a phone. */
export function generateLoginPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 8) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface ImportResult {
  importId: string;
  summary: ImportSummary;
  credentials: Buffer;
  /** Groups whose first four weeks of sessions couldn't be generated (the weekly job retries). */
  sessionWarnings: string[];
}

/** Thrown when the file has problems; carries them for the response. */
export class ImportRejectedError extends BadRequestError {
  constructor(public readonly result: CheckResult) {
    super('The file has problems. Nothing was imported.', { issues: result.issues });
    this.name = 'ImportRejectedError';
  }
}

export async function runImport(
  tenantId: string,
  branchId: string,
  file: Buffer,
  fileName: string,
  superAdminId: string
): Promise<ImportResult> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new NotFoundError('Tenant not found');
  if (tenant.status !== 'ACTIVE') throw new BadRequestError('Only an active academy can take an import');

  const { plan, issues, branch } = await checkFile(tenantId, branchId, file);
  if (issues.length) {
    const fileProblem = issues.some((i) => i.code.startsWith('file.'));
    throw new ImportRejectedError({
      ok: false,
      summary: summarize(plan),
      issues,
      markedFile: fileProblem ? null : await markUpErrors(file, issues),
    });
  }

  // Passwords and their hashes first: bcrypt is slow, and the transaction
  // should not hold its connection while it runs.
  const passwords = new Map<string, string>(); // phone → password
  const hashes = new Map<string, string>();
  for (const phone of [...plan.captains.map((c) => c.phone), ...plan.accounts.map((a) => a.phone)]) {
    const password = generateLoginPassword();
    passwords.set(phone, password);
    hashes.set(phone, await hashPassword(password));
  }

  const importId = randomUUID();
  const summary = summarize(plan);
  const now = new Date();

  const created = await withPhoneGuard(() =>
    withTenantContext(
      tenantId,
      async (tx) => {
        // Lock the branch, then make sure it is still empty: nothing can be
        // added to it between the check and the writes.
        const [locked] = await tx.$queryRaw<{ code: string }[]>`
          SELECT "code" FROM "branches" WHERE "id" = ${branchId}::uuid FOR UPDATE
        `;
        if (!locked) throw new NotFoundError('Branch not found');
        if (!(await branchIsEmpty(tx, branchId))) {
          throw new ConflictError('This branch already has data. Import only into a new, empty branch.');
        }

        const audit: Array<{ entityType: string; entityId: string; newValues: Record<string, unknown> }> = [];

        // 1. Plans and their levels
        const plans = new Map<string, { id: string; amount: number; levels: Map<string, string> }>();
        for (const p of plan.plans) {
          const row = await tx.subscriptionPlan.create({
            data: {
              branchId,
              name: p.name,
              minSessions: p.minSessions,
              periodType: p.periodType,
              periodDays: p.periodDays,
              freezeSessions: p.freezeSessions,
              freezeRetakeDays: p.freezeRetakeDays,
              amount: p.amount,
              levels: { create: p.levels.map((name, sortOrder) => ({ name, sortOrder })) },
            },
            include: { levels: true },
          });
          plans.set(nameKey(p.name), { id: row.id, amount: p.amount, levels: new Map(row.levels.map((l) => [nameKey(l.name), l.id])) });
          audit.push({ entityType: 'SubscriptionPlan', entityId: row.id, newValues: { name: p.name, importId } });
        }

        // 2. Captains and their logins
        const captains = new Map<string, string>();
        const newUserIds: string[] = [];
        for (const c of plan.captains) {
          const user = await tx.user.create({
            data: { branchId, name: c.name, phoneNumber: c.phone, passwordHash: hashes.get(c.phone)!, role: UserRole.CAPTAIN, language: 'ar', isActive: true },
            select: { id: true },
          });
          const profile = await tx.captainProfile.create({
            data: {
              userId: user.id,
              branchId,
              specialization: c.specialization,
              attendingDays: c.attendingDays,
              payrollType: c.payrollType,
              hourlyRate: c.hourlyRate,
              baseSalary: c.baseSalary,
              percentage: c.percentage,
            },
            select: { id: true },
          });
          captains.set(nameKey(c.name), profile.id);
          newUserIds.push(user.id);
          audit.push({ entityType: 'captain', entityId: profile.id, newValues: { name: c.name, importId, paySet: c.paySet } });
        }

        // 3. Groups
        const groups = new Map<string, { id: string; planKey: string }>();
        for (const g of plan.groups) {
          const row = await tx.group.create({
            data: {
              branchId,
              captainId: captains.get(nameKey(g.captainName))!,
              planId: plans.get(nameKey(g.planName))!.id,
              name: g.name,
              minTrainees: g.minTrainees,
              maxTrainees: g.maxTrainees,
              daysPerWeek: g.scheduleDays.length,
              scheduleDays: g.scheduleDays,
              startTime: g.startTime,
              sessionDuration: g.sessionDuration,
            },
            select: { id: true },
          });
          groups.set(nameKey(g.name), { id: row.id, planKey: nameKey(g.planName) });
          audit.push({ entityType: 'Group', entityId: row.id, newValues: { name: g.name, importId } });
        }

        // 4. Parent accounts (siblings share one)
        const accountRows = plan.accounts.length
          ? await tx.user.createManyAndReturn({
              data: plan.accounts.map((a) => ({
                branchId,
                name: a.name,
                phoneNumber: a.phone,
                passwordHash: hashes.get(a.phone)!,
                role: UserRole.TRAINEE,
                language: 'ar',
                isActive: true,
              })),
              select: { id: true, phoneNumber: true },
            })
          : [];
        const accountOf = new Map(accountRows.map((u) => [u.phoneNumber, u.id]));
        newUserIds.push(...accountRows.map((u) => u.id));

        // 5. Trainees, numbered from the branch's counter in one step
        const n = plan.trainees.length;
        let codes: string[] = [];
        if (n) {
          const [seq] = await tx.$queryRaw<{ trainee_seq: number }[]>`
            UPDATE "branches" SET "trainee_seq" = "trainee_seq" + ${n} WHERE "id" = ${branchId}::uuid RETURNING "trainee_seq"
          `;
          const first = seq.trainee_seq - n + 1;
          codes = plan.trainees.map((_, i) => formatSystemCode(locked.code, first + i));
        }
        const levelOf = (t: ImportPlan['trainees'][number]) => {
          if (!t.subscription) return null;
          return plans.get(nameKey(t.subscription.planName))!.levels.get(nameKey(t.subscription.levelName))!;
        };
        const traineeRows = n
          ? await tx.traineeProfile.createManyAndReturn({
              data: plan.trainees.map((t, i) => ({
                userId: accountOf.get(t.parentPhone)!,
                branchId,
                name: t.name,
                systemCode: codes[i],
                dateOfBirth: new Date(`${t.dateOfBirth}T00:00:00Z`),
                whatsappNumber: t.whatsapp,
                parentIdCard: t.parentIdCard,
                medicalCondition: t.medicalCondition,
                levelId: levelOf(t),
              })),
              select: { id: true, systemCode: true },
            })
          : [];
        const traineeId = new Map(traineeRows.map((t) => [t.systemCode, t.id]));

        // 6. Current subscriptions; active ones take a seat in their group
        const subscriptions = plan.trainees.flatMap((t, i) => {
          const s = t.subscription;
          if (!s) return [];
          const p = plans.get(nameKey(s.planName))!;
          return [{
            traineeId: traineeId.get(codes[i])!,
            planId: p.id,
            levelId: levelOf(t)!,
            status: s.status,
            startDate: new Date(`${s.startDate}T00:00:00Z`),
            endDate: new Date(`${s.endDate}T00:00:00Z`),
            totalSessions: s.totalSessions,
            attendedSessions: s.attendedSessions,
            amountPaid: s.amountPaid,
            amountDue: s.amountDue,
            paymentStatus: s.paymentStatus,
            expiredAt: s.status === 'EXPIRED' ? now : null,
          }];
        });
        if (subscriptions.length) await tx.traineeSubscription.createMany({ data: subscriptions });

        const seats = plan.trainees.flatMap((t, i) =>
          t.subscription?.status === 'ACTIVE'
            ? [{ groupId: groups.get(nameKey(t.subscription.groupName))!.id, traineeId: traineeId.get(codes[i])! }]
            : []
        );
        if (seats.length) await tx.groupTrainee.createMany({ data: seats });

        for (const t of traineeRows) audit.push({ entityType: 'trainee', entityId: t.id, newValues: { systemCode: t.systemCode, importId } });

        // 7. Every new login, in the same transaction (CLAUDE.md: login index)
        for (const id of newUserIds) await syncLoginIndex(tx, tenantId, id);

        // 8. The audit trail, and the import's own entry (its history line)
        await tx.auditLog.createMany({
          data: [
            ...audit.map((a) => ({ branchId, userId: superAdminId, action: AuditAction.CREATE, ...a, newValues: a.newValues as object })),
            {
              branchId,
              userId: superAdminId,
              action: AuditAction.CREATE,
              entityType: IMPORT_AUDIT_ENTITY,
              entityId: importId,
              newValues: { fileName, summary } as object,
            },
          ],
        });

        return { groupIds: [...groups.values()].map((g) => g.id) };
      },
      // Hundreds of rows in one transaction: more than the default 30 s.
      { timeout: 180_000, maxWait: 15_000 }
    )
  );

  // Sessions for the next four weeks, as the weekly job makes them. Outside the
  // transaction (it opens its own per group); a failure here is not a failed
  // import, since the weekly job fills the gap.
  const from = format(now, 'yyyy-MM-dd');
  const to = format(addDays(now, 28), 'yyyy-MM-dd');
  const sessionWarnings: string[] = [];
  for (const groupId of created.groupIds) {
    try {
      await generateSessionsForGroup(tenantId, groupId, from, to);
    } catch (err) {
      console.error(`[import] tenant=${tenantId} group=${groupId} session generation failed:`, err);
      sessionWarnings.push(groupId);
    }
  }

  const traineesOf = new Map<string, string[]>();
  for (const t of plan.trainees) traineesOf.set(t.parentPhone, [...(traineesOf.get(t.parentPhone) ?? []), t.name]);
  const credentials: Credential[] = [
    ...plan.captains.map((c) => ({ kind: 'CAPTAIN' as const, name: c.name, phone: c.phone, password: passwords.get(c.phone)! })),
    ...plan.accounts.map((a) => ({
      kind: 'PARENT' as const,
      name: a.name,
      phone: a.phone,
      password: passwords.get(a.phone)!,
      trainees: traineesOf.get(a.phone),
    })),
  ];

  return {
    importId,
    summary,
    credentials: await buildCredentials(tenant.name, branch.name, credentials),
    sessionWarnings,
  };
}
