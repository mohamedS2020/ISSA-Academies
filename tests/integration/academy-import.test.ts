/**
 * Academy data import against a real academy schema: what one import creates,
 * that it creates nothing else (no receipts, no income), the logins it hands
 * out, and the rules that hold under concurrency (only into an empty branch,
 * once).
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import ExcelJS from 'exceljs';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { comparePassword } from '@/lib/auth/password';
import { checkImport, getImportContext, runImport, ImportRejectedError, generateLoginPassword } from '@/services/import.service';
import { calculatePayrollPreview } from '@/services/payroll.service';
import { filledTemplate, freshSample, SAMPLE, type Filled } from '@/lib/import/test-workbook';
import { provisionTestAcademy, destroyTestAcademy, type TestAcademy } from '../helpers/test-academy';

let academy: TestAcademy | null = null;
const SUPER_ADMIN_ID = '11111111-1111-4111-8111-111111111111';

async function newBranch(code: string): Promise<string> {
  const b = await withTenantContext(academy!.tenantId, (tx) =>
    tx.branch.create({ data: { name: `Branch ${code}`, code, timezone: 'Africa/Cairo' }, select: { id: true } })
  );
  return b.id;
}

const sample = freshSample;

async function credentialsOf(file: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const rows: Array<{ kind: string; name: string; phone: string; password: string; trainees: string }> = [];
  ws.eachRow((row, n) => {
    if (n <= 2) return;
    rows.push({ kind: row.getCell(1).text, name: row.getCell(2).text, phone: row.getCell(3).text, password: row.getCell(4).text, trainees: row.getCell(5).text });
  });
  return rows;
}

beforeAll(async () => {
  academy = await provisionTestAcademy('import');
}, 60_000);

afterAll(async () => {
  await destroyTestAcademy(academy);
}, 60_000);

describe('academy import', () => {
  let branchId: string;
  let result: Awaited<ReturnType<typeof runImport>>;

  beforeAll(async () => {
    branchId = await newBranch('IMP1');
    result = await runImport(academy!.tenantId, branchId, await filledTemplate(sample()), 'academy.xlsx', SUPER_ADMIN_ID);
  }, 120_000);

  test('creates the plans, captains, groups and trainees in the branch', async () => {
    const counts = await withTenantContext(academy!.tenantId, async (tx) => ({
      plans: await tx.subscriptionPlan.count({ where: { branchId } }),
      levels: await tx.subscriptionPlanLevel.count({ where: { plan: { branchId } } }),
      captains: await tx.captainProfile.count({ where: { branchId } }),
      groups: await tx.group.count({ where: { branchId } }),
      trainees: await tx.traineeProfile.count({ where: { branchId } }),
      parents: await tx.user.count({ where: { branchId, role: 'TRAINEE' } }),
      sessions: await tx.session.count({ where: { branchId } }),
    }));
    expect(counts).toMatchObject({ plans: 2, levels: 4, captains: 2, groups: 2, trainees: 4, parents: 3 });
    expect(counts.sessions).toBeGreaterThan(0); // four weeks generated, as the weekly job does
    expect(result.summary).toMatchObject({ trainees: 4, parentAccounts: 3, activeSubscriptions: 2, endedSubscriptions: 1, withoutSubscription: 1 });
    expect(result.sessionWarnings).toEqual([]);
  });

  test('siblings share one parent account; trainees are numbered from the branch code', async () => {
    const trainees = await withTenantContext(academy!.tenantId, (tx) =>
      tx.traineeProfile.findMany({ where: { branchId }, orderBy: { systemCode: 'asc' }, select: { name: true, systemCode: true, userId: true } })
    );
    expect(trainees.map((t) => t.systemCode)).toEqual(['IMP1-000001', 'IMP1-000002', 'IMP1-000003', 'IMP1-000004']);
    const salma = trainees.find((t) => t.name === 'Salma Ali')!;
    const omar = trainees.find((t) => t.name === 'Omar Ali')!;
    expect(salma.userId).toBe(omar.userId);
  });

  test('subscriptions carry the sessions left and the money paid, as balances, not income', async () => {
    const data = await withTenantContext(academy!.tenantId, async (tx) => ({
      subs: await tx.traineeSubscription.findMany({
        where: { trainee: { branchId } },
        select: { status: true, totalSessions: true, attendedSessions: true, amountPaid: true, amountDue: true, paymentStatus: true, trainee: { select: { name: true } } },
      }),
      receipts: await tx.receipt.count({ where: { branchId } }),
      ledger: await tx.financialTransaction.count({ where: { branchId } }),
      seats: await tx.groupTrainee.findMany({ where: { group: { branchId } }, select: { trainee: { select: { name: true } } } }),
    }));
    const by = Object.fromEntries(data.subs.map((s) => [s.trainee.name, s]));
    expect(by['Salma Ali']).toMatchObject({ status: 'ACTIVE', totalSessions: 8, attendedSessions: 3, paymentStatus: 'PARTIAL' });
    expect(Number(by['Salma Ali'].amountPaid)).toBe(300);
    expect(Number(by['Salma Ali'].amountDue)).toBe(200);
    expect(by['Omar Ali']).toMatchObject({ status: 'EXPIRED', paymentStatus: 'UNPAID' });
    expect(by['ليلى محمود']).toMatchObject({ status: 'ACTIVE', paymentStatus: 'PAID' });
    expect(data.subs).toHaveLength(3);

    // Paid before the system: no receipts, no ledger rows, no income.
    expect(data.receipts).toBe(0);
    expect(data.ledger).toBe(0);
    // Only current subscriptions take a seat.
    expect(data.seats.map((s) => s.trainee.name).sort()).toEqual(['Salma Ali', 'ليلى محمود'].sort());
  });

  test('every new login works with its password from the credentials file, and nowhere else', async () => {
    const creds = await credentialsOf(result.credentials);
    expect(creds).toHaveLength(5); // 2 captains + 3 parents
    expect(creds.find((c) => c.name === 'Ali Hassan')?.trainees).toBe('Salma Ali، Omar Ali');

    for (const c of creds) {
      const user = await withTenantContext(academy!.tenantId, (tx) =>
        tx.user.findFirstOrThrow({ where: { phoneNumber: c.phone, isActive: true }, select: { id: true, passwordHash: true } })
      );
      expect(c.password).toMatch(/^[A-Za-z2-9]{8}$/);
      expect(await comparePassword(c.password, user.passwordHash)).toBe(true);
      const index = await platformPrisma.userPhoneIndex.findFirst({ where: { tenantId: academy!.tenantId, phoneNumber: c.phone } });
      expect(index?.userId).toBe(user.id);
    }
  });

  test("a captain imported without pay can't run payroll until it is set", async () => {
    const captain = await withTenantContext(academy!.tenantId, (tx) =>
      tx.captainProfile.findFirstOrThrow({ where: { branchId, hourlyRate: null }, select: { id: true } })
    );
    await expect(calculatePayrollPreview(academy!.tenantId, branchId, captain.id, '2026-01-01', '2026-01-31')).rejects.toThrow(/pay isn't set/);
  });

  test('is listed in the import history, and the branch no longer takes an import', async () => {
    const ctx = await getImportContext(academy!.tenantId);
    expect(ctx.history[0]).toMatchObject({ id: result.importId, branchId, fileName: 'academy.xlsx' });
    expect(ctx.history[0].summary?.trainees).toBe(4);
    expect(ctx.branches.find((b) => b.id === branchId)?.isEmpty).toBe(false);

    const again = runImport(academy!.tenantId, branchId, await filledTemplate(sample()), 'again.xlsx', SUPER_ADMIN_ID);
    await expect(again).rejects.toBeInstanceOf(ImportRejectedError);
    await expect(again).rejects.toMatchObject({ result: { issues: expect.arrayContaining([expect.objectContaining({ code: 'branch.notEmpty' })]) } });
  });
});

describe('academy import checks', () => {
  test('checking writes nothing and reports phones the academy already uses', async () => {
    const branchId = await newBranch('IMP2');
    const admin = await withTenantContext(academy!.tenantId, (tx) =>
      tx.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { phoneNumber: true } })
    );
    // Fresh numbers (the first import above took the sample's), except one
    // captain, who has the academy admin's.
    const data: Filled = JSON.parse(JSON.stringify(sample()).replace(/010(\d{8})/g, '012$1'));
    data.captains![0].phone = admin.phoneNumber;

    const check = await checkImport(academy!.tenantId, branchId, await filledTemplate(data));
    expect(check.ok).toBe(false);
    expect(check.issues).toEqual([{ code: 'phone.inUse', sheet: 'captains', row: 2, column: 'phone' }]);
    expect(check.markedFile).not.toBeNull();

    const written = await withTenantContext(academy!.tenantId, (tx) => tx.subscriptionPlan.count({ where: { branchId } }));
    expect(written).toBe(0);
  }, 60_000);

  test('two imports into one empty branch at once: exactly one gets in', async () => {
    const branchId = await newBranch('IMP3');
    const file = await filledTemplate({
      plans: SAMPLE.plans,
      captains: [{ name: 'Solo Captain', phone: '01066666666', days: 'Sunday' }],
      groups: [{ name: 'Solo', captain: 'Solo Captain', plan: 'Monthly 8', days: 'Sunday', startTime: '10:00', duration: 60, minTrainees: 1, maxTrainees: 5 }],
    });
    const results = await Promise.allSettled([
      runImport(academy!.tenantId, branchId, file, 'a.xlsx', SUPER_ADMIN_ID),
      runImport(academy!.tenantId, branchId, file, 'b.xlsx', SUPER_ADMIN_ID),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const counts = await withTenantContext(academy!.tenantId, async (tx) => ({
      plans: await tx.subscriptionPlan.count({ where: { branchId } }),
      captains: await tx.captainProfile.count({ where: { branchId } }),
    }));
    expect(counts).toEqual({ plans: 2, captains: 1 });
  }, 120_000);

  test('the main branch, which already has data, is refused', async () => {
    const check = await checkImport(academy!.tenantId, academy!.branchId, await filledTemplate(sample()));
    expect(check.issues[0]).toEqual({ code: 'branch.notEmpty' });
  }, 60_000);
});

test('login passwords: 8 characters, a letter and a digit, nothing that reads alike', () => {
  for (let i = 0; i < 200; i++) {
    const p = generateLoginPassword();
    expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{8}$/);
    expect(p).toMatch(/[A-Za-z]/);
    expect(p).toMatch(/\d/);
  }
});
