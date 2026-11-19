/**
 * The academy's currency and each branch's time format, and the payroll hours
 * fix: pay from the exact minutes worked.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { getDisplaySettings, setBranchTimeFormat } from '@/services/display-settings.service';
import { listBranches, updateBranch } from '@/services/branch.service';
import { calculatePayrollPreview } from '@/services/payroll.service';
import { createTestGroup, destroyTestAcademy, provisionTestAcademy, type TestAcademy } from '../helpers/test-academy';

let academy: TestAcademy | null = null;

beforeAll(async () => {
  academy = await provisionTestAcademy('display');
}, 60_000);

afterAll(async () => {
  await destroyTestAcademy(academy);
}, 60_000);

describe('display settings', () => {
  test('a new academy counts in EGP and shows 12-hour times', async () => {
    expect(await getDisplaySettings(academy!.tenantId, academy!.branchId)).toEqual({ currency: 'EGP', timeFormat: '12h', country: 'EG' });
  });

  test("the academy's currency is what it was created with", async () => {
    await platformPrisma.tenantConfig.update({ where: { tenantId: academy!.tenantId }, data: { currency: 'KWD' } });
    expect((await getDisplaySettings(academy!.tenantId, academy!.branchId)).currency).toBe('KWD');
    await platformPrisma.tenantConfig.update({ where: { tenantId: academy!.tenantId }, data: { currency: 'EGP' } });
  });

  test('each branch keeps its own time format, also when two are saved at once', async () => {
    const other = await withTenantContext(academy!.tenantId, (tx) =>
      tx.branch.create({ data: { name: 'Other', code: `O${Date.now().toString(36)}`.toUpperCase() }, select: { id: true } })
    );
    await Promise.all([
      setBranchTimeFormat(academy!.tenantId, academy!.branchId, '24h'),
      setBranchTimeFormat(academy!.tenantId, other.id, '24h'),
    ]);
    expect((await getDisplaySettings(academy!.tenantId, academy!.branchId)).timeFormat).toBe('24h');
    expect((await getDisplaySettings(academy!.tenantId, other.id)).timeFormat).toBe('24h');

    // Through the branch edit, as the admin does it.
    await updateBranch(academy!.tenantId, other.id, { timeFormat: '12h' }, academy!.adminId);
    const branches = await listBranches(academy!.tenantId);
    expect(branches.find((b) => b.id === other.id)?.timeFormat).toBe('12h');
    expect(branches.find((b) => b.id === academy!.branchId)?.timeFormat).toBe('24h');
  });
});

describe('payroll hours', () => {
  test('pays the exact minutes: 12 h 50 min at 150 is 1,925, not 12.83 × 150', async () => {
    const group = await createTestGroup(academy!);
    await withTenantContext(academy!.tenantId, async (tx) => {
      await tx.captainProfile.update({ where: { id: academy!.captainId }, data: { hourlyRate: 150 } });
      // 9 sessions of 50 minutes and 4 of 80: 770 minutes, 12 h 50 min.
      const durations = [...Array(9).fill(50), ...Array(4).fill(80)];
      await tx.session.createMany({
        data: durations.map((d, i) => ({
          branchId: academy!.branchId,
          groupId: group.id,
          scheduledAt: new Date(Date.UTC(2026, 0, 2 + i, 15)),
          durationMinutes: d,
          status: 'COMPLETED' as const,
        })),
      });
    });
    const preview = await calculatePayrollPreview(academy!.tenantId, academy!.branchId, academy!.captainId, '2026-01-01', '2026-01-31');
    expect(preview).toMatchObject({ minutesWorked: 770, totalAmount: 1925 });
  });
});
