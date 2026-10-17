/**
 * Moderator permissions are enforced by the API — hardening plan §35.
 *
 * Before: attendance, enrollment and renewal, payments, receipts, groups and
 * the schedule checked only "at least a moderator", so a moderator with those
 * switches off could still use them through the API; "Manage groups" and
 * "Manage payroll" could never grant anything; and the dashboard showed revenue
 * to every moderator.
 *
 * This calls every affected route, with a real token, as a moderator holding
 * each privilege on its own, and checks the full matrix: allowed exactly where
 * the access table (src/lib/auth/access.ts) says, 403 everywhere else.
 * "Allowed" means "not 403" — the request may still fail validation (400) or
 * name a record that does not exist (404), which is the point: the permission
 * check let it through to that stage.
 */

import { randomUUID } from 'node:crypto';
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { generateAccessToken } from '@/lib/auth/jwt';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { createUser, setPrivileges } from '@/services/user.service';
import { MODERATOR_PRIVILEGES, type ModeratorPrivilege } from '@/types';
import { ACCESS, type AccessKey } from '@/lib/auth/access';
import { normalizePhone } from '@/lib/phone';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  createTestGroup,
  createTestTrainee,
  type TestAcademy,
} from '../helpers/test-academy';

import * as attendanceRoute from '@/app/api/attendance/route';
import * as attendanceSheetRoute from '@/app/api/attendance/[sessionId]/route';
import * as retakeRoute from '@/app/api/attendance/retake/route';
import * as scheduleRoute from '@/app/api/schedule/route';
import * as sessionRoute from '@/app/api/schedule/[id]/route';
import * as cancelRoute from '@/app/api/schedule/[id]/cancel/route';
import * as groupsRoute from '@/app/api/groups/route';
import * as groupRoute from '@/app/api/groups/[id]/route';
import * as groupTraineeRoute from '@/app/api/groups/[id]/trainees/[traineeId]/route';
import * as enrollRoute from '@/app/api/subscriptions/enroll/route';
import * as renewRoute from '@/app/api/subscriptions/renew/route';
import * as paymentsRoute from '@/app/api/subscriptions/[id]/payments/route';
import * as plansRoute from '@/app/api/subscriptions/plans/route';
import * as planRoute from '@/app/api/subscriptions/plans/[id]/route';
import * as receiptsRoute from '@/app/api/finance/receipts/route';
import * as receiptRoute from '@/app/api/finance/receipts/[id]/route';
import * as payrollRoute from '@/app/api/finance/payroll/route';
import * as payrollItemRoute from '@/app/api/finance/payroll/[id]/route';
import * as payrollCalcRoute from '@/app/api/finance/payroll/calculate/route';
import * as traineesRoute from '@/app/api/trainees/route';
import * as feedbackRoute from '@/app/api/trainees/[id]/feedback/route';
import * as captainsRoute from '@/app/api/captains/route';
import * as incomeRoute from '@/app/api/finance/income/route';
import * as expensesRoute from '@/app/api/finance/expenses/route';
import * as reportsRoute from '@/app/api/reports/route';
import * as usersRoute from '@/app/api/users/route';
import * as branchesRoute from '@/app/api/branches/route';
import * as evaluationsRoute from '@/app/api/evaluations/route';
import * as dashboardRoute from '@/app/api/dashboard/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as refreshRoute from '@/app/api/auth/refresh/route';

// The receipt and report routes import the PDF/Excel exporters, whose PDF
// library ships as ES modules Jest cannot load. No request here gets as far as
// exporting (the ids do not exist), so an empty stand-in is enough.
jest.mock('@/services/export.service', () => ({}));

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

let academy: TestAcademy | null = null;
let otherBranchId = '';
const tokens = new Map<ModeratorPrivilege | 'none' | 'admin', string>();

function call(
  handler: unknown,
  token: string,
  opts: { method?: string; url?: string; body?: unknown; params?: Record<string, string>; cookie?: string } = {}
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  return (handler as Handler)(
    new Request(`http://localhost${opts.url ?? '/api/test'}`, {
      method: opts.method ?? 'GET',
      headers,
      ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
    }),
    { params: Promise.resolve(opts.params ?? {}) }
  );
}

const id = () => randomUUID();

beforeAll(async () => {
  academy = await provisionTestAcademy('perms');
  const a = academy;

  // One moderator per privilege, and one with none.
  const holders: (ModeratorPrivilege | 'none')[] = ['none', ...MODERATOR_PRIVILEGES];
  await withTenantContext(a.tenantId, async (tx) => {
    for (const holder of holders) {
      const user = await tx.user.create({
        data: {
          branchId: a.branchId,
          name: `Mod ${holder}`,
          phoneNumber: `+2015${String(Date.now()).slice(-5)}${String(holders.indexOf(holder)).padStart(3, '0')}`,
          passwordHash: 'x',
          role: 'MODERATOR',
          privileges: holder === 'none' ? undefined : { create: [{ privilege: holder }] },
        },
      });
      tokens.set(
        holder,
        generateAccessToken({ userId: user.id, role: 'MODERATOR' as never, tenantId: a.tenantId, branchId: a.branchId })
      );
    }
    otherBranchId = (
      await tx.branch.create({
        data: { name: 'Other', code: `O${Date.now().toString(36)}`.toUpperCase().slice(0, 20) },
        select: { id: true },
      })
    ).id;
  });
  tokens.set(
    'admin',
    generateAccessToken({ userId: a.adminId, role: 'ADMIN' as never, tenantId: a.tenantId, branchId: a.branchId })
  );
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

/** Every affected route: who may call it, by access key (or admin only). */
const ROUTES: { name: string; access: AccessKey | 'adminOnly'; run: (token: string) => Promise<Response> }[] = [
  // Attendance
  { name: 'POST /attendance', access: 'markAttendance', run: (t) => call(attendanceRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'GET /attendance', access: 'viewAttendance', run: (t) => call(attendanceRoute.GET, t) },
  { name: 'GET /attendance/[sessionId]', access: 'viewAttendance', run: (t) => call(attendanceSheetRoute.GET, t, { params: { sessionId: id() } }) },
  { name: 'POST /attendance/retake', access: 'markAttendance', run: (t) => call(retakeRoute.POST, t, { method: 'POST', body: {} }) },
  // Schedule
  { name: 'GET /schedule', access: 'viewSchedule', run: (t) => call(scheduleRoute.GET, t, { url: '/api/schedule?limit=1' }) },
  { name: 'POST /schedule', access: 'manageSchedule', run: (t) => call(scheduleRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'GET /schedule/[id]', access: 'viewSchedule', run: (t) => call(sessionRoute.GET, t, { params: { id: id() } }) },
  { name: 'PATCH /schedule/[id]', access: 'manageSchedule', run: (t) => call(sessionRoute.PATCH, t, { method: 'PATCH', body: {}, params: { id: id() } }) },
  { name: 'POST /schedule/[id]/cancel', access: 'manageSchedule', run: (t) => call(cancelRoute.POST, t, { method: 'POST', body: {}, params: { id: id() } }) },
  // Groups
  { name: 'GET /groups', access: 'listGroups', run: (t) => call(groupsRoute.GET, t, { url: '/api/groups?limit=1&page=1' }) },
  { name: 'POST /groups', access: 'manageGroups', run: (t) => call(groupsRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'GET /groups/[id]', access: 'viewGroups', run: (t) => call(groupRoute.GET, t, { params: { id: id() } }) },
  { name: 'PATCH /groups/[id]', access: 'manageGroups', run: (t) => call(groupRoute.PATCH, t, { method: 'PATCH', body: { maxTrainees: -1 }, params: { id: id() } }) },
  { name: 'DELETE /groups/[id]/trainees/[traineeId]', access: 'manageGroups', run: (t) => call(groupTraineeRoute.DELETE, t, { method: 'DELETE', params: { id: id(), traineeId: id() } }) },
  // Subscriptions
  { name: 'POST /subscriptions/enroll', access: 'enroll', run: (t) => call(enrollRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'POST /subscriptions/renew', access: 'enroll', run: (t) => call(renewRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'POST /subscriptions/[id]/payments', access: 'recordPayments', run: (t) => call(paymentsRoute.POST, t, { method: 'POST', body: {}, params: { id: id() } }) },
  { name: 'GET /subscriptions/plans', access: 'viewPlans', run: (t) => call(plansRoute.GET, t) },
  { name: 'GET /subscriptions/plans/[id]', access: 'viewPlans', run: (t) => call(planRoute.GET, t, { params: { id: id() } }) },
  { name: 'POST /subscriptions/plans', access: 'adminOnly', run: (t) => call(plansRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'PATCH /subscriptions/plans/[id]', access: 'adminOnly', run: (t) => call(planRoute.PATCH, t, { method: 'PATCH', body: { amount: -1 }, params: { id: id() } }) },
  // Receipts
  { name: 'GET /finance/receipts', access: 'viewReceipts', run: (t) => call(receiptsRoute.GET, t) },
  { name: 'GET /finance/receipts/[id]', access: 'viewReceipts', run: (t) => call(receiptRoute.GET, t, { params: { id: id() } }) },
  // Payroll
  { name: 'GET /finance/payroll', access: 'managePayroll', run: (t) => call(payrollRoute.GET, t) },
  { name: 'POST /finance/payroll', access: 'managePayroll', run: (t) => call(payrollRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'PATCH /finance/payroll/[id]', access: 'managePayroll', run: (t) => call(payrollItemRoute.PATCH, t, { method: 'PATCH', params: { id: id() } }) },
  { name: 'GET /finance/payroll/calculate', access: 'managePayroll', run: (t) => call(payrollCalcRoute.GET, t) },
  // Trainees, coaches, finance, reports (checked before; now from the same table)
  { name: 'GET /trainees', access: 'viewTrainees', run: (t) => call(traineesRoute.GET, t) },
  { name: 'POST /trainees', access: 'manageTrainees', run: (t) => call(traineesRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'GET /trainees/[id]/feedback', access: 'viewTrainees', run: (t) => call(feedbackRoute.GET, t, { params: { id: id() } }) },
  { name: 'GET /captains', access: 'viewCaptains', run: (t) => call(captainsRoute.GET, t) },
  { name: 'GET /finance/income', access: 'viewFinances', run: (t) => call(incomeRoute.GET, t) },
  { name: 'GET /finance/expenses', access: 'viewExpenses', run: (t) => call(expensesRoute.GET, t) },
  { name: 'POST /finance/expenses', access: 'manageExpenses', run: (t) => call(expensesRoute.POST, t, { method: 'POST', body: {} }) },
  { name: 'GET /reports', access: 'viewReports', run: (t) => call(reportsRoute.GET, t) },
  { name: 'GET /evaluations', access: 'viewAttendance', run: (t) => call(evaluationsRoute.GET, t, { url: `/api/evaluations?sessionId=${id()}` }) },
  { name: 'POST /evaluations', access: 'markAttendance', run: (t) => call(evaluationsRoute.POST, t, { method: 'POST', body: {} }) },
  // Admin only, whatever the moderator holds
  { name: 'GET /users', access: 'adminOnly', run: (t) => call(usersRoute.GET, t) },
  { name: 'POST /branches', access: 'adminOnly', run: (t) => call(branchesRoute.POST, t, { method: 'POST', body: {} }) },
];

describe('every route enforces the access table', () => {
  test.each(ROUTES.map((r) => [r.name, r] as const))('%s', async (_name, route) => {
    const mismatches: string[] = [];
    for (const [holder, token] of tokens) {
      const allowed =
        holder === 'admin' ||
        (route.access !== 'adminOnly' &&
          holder !== 'none' &&
          (ACCESS[route.access] as readonly string[]).includes(holder));
      const status = (await route.run(token)).status;
      if (allowed ? status === 403 : status !== 403) {
        mismatches.push(`${holder}: ${status} (expected ${allowed ? 'not 403' : '403'})`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);
});

describe('the dashboard shows each section only with its permission', () => {
  test('revenue needs "View finances"; renewals need trainee or subscription access', async () => {
    const read = async (holder: ModeratorPrivilege) =>
      (await (await call(dashboardRoute.GET, tokens.get(holder)!)).json()).data;

    const attendanceOnly = await read('can_view_attendance');
    expect(attendanceOnly.revenueThisMonth).toBeNull();
    expect(attendanceOnly.outstandingBalances).toBeNull();
    expect(attendanceOnly.expiringSoon).toBeNull();
    expect(Array.isArray(attendanceOnly.todaySessions)).toBe(true);

    const finance = await read('can_view_finances');
    expect(typeof finance.revenueThisMonth).toBe('number');
    expect(finance.todaySessions).toBeNull();

    expect(Array.isArray((await read('can_view_trainees')).expiringSoon)).toBe(true);
  }, 60_000);
});

describe('ids from the request stay inside the caller\'s branch', () => {
  test('sessions cannot be generated for another branch\'s group', async () => {
    const a = academy!;
    const foreignGroup = await withTenantContext(a.tenantId, (tx) =>
      tx.group.create({
        data: {
          branchId: otherBranchId, captainId: a.captainId, planId: a.planId, name: 'Elsewhere',
          minTrainees: 1, maxTrainees: 10, daysPerWeek: 1, scheduleDays: ['MONDAY'],
          startTime: '10:00', sessionDuration: 60,
        },
        select: { id: true },
      })
    );
    const res = await call(scheduleRoute.POST, tokens.get('can_manage_schedule')!, {
      method: 'POST',
      body: { groupId: foreignGroup.id },
    });
    expect(res.status).toBe(404);
    const created = await withTenantContext(a.tenantId, (tx) =>
      tx.session.count({ where: { groupId: foreignGroup.id } })
    );
    expect(created).toBe(0);
  }, 60_000);

  test('a trainee from another branch cannot be enrolled here', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const foreign = await createTestTrainee(a);
    await withTenantContext(a.tenantId, (tx) =>
      tx.traineeProfile.update({ where: { id: foreign.id }, data: { branchId: otherBranchId } })
    );
    const res = await call(enrollRoute.POST, tokens.get('admin')!, {
      method: 'POST',
      body: {
        traineeId: foreign.id, planId: a.planId, levelId: a.levelId, groupId: group.id,
        amountPaid: 0, paymentStatus: 'UNPAID',
      },
    });
    expect(res.status).toBe(404);
  }, 60_000);

  test('evaluations are read only within the caller\'s branch', async () => {
    const a = academy!;
    const sessionId = await withTenantContext(a.tenantId, async (tx) => {
      const group = await tx.group.create({
        data: {
          branchId: otherBranchId, captainId: a.captainId, planId: a.planId, name: 'Elsewhere 2',
          minTrainees: 1, maxTrainees: 10, daysPerWeek: 1, scheduleDays: ['MONDAY'],
          startTime: '10:00', sessionDuration: 60,
        },
      });
      const session = await tx.session.create({
        data: { branchId: otherBranchId, groupId: group.id, scheduledAt: new Date(), durationMinutes: 60 },
      });
      const trainee = await tx.traineeProfile.findFirstOrThrow({ select: { id: true } });
      await tx.traineeEvaluation.create({
        data: { sessionId: session.id, traineeId: trainee.id, evaluatorId: a.adminId, notes: 'private' },
      });
      return session.id;
    });
    const res = await call(evaluationsRoute.GET, tokens.get('admin')!, {
      url: `/api/evaluations?sessionId=${sessionId}`,
    });
    expect((await res.json()).data).toEqual([]);
  }, 60_000);
});

describe('the browser learns a moderator\'s privileges', () => {
  test('from login, and again from every refresh after a change', async () => {
    const a = academy!;
    const phone = normalizePhone(`0122${String(Date.now()).slice(-7)}`);
    const password = 'Moderator-Pass-1';
    const mod = await createUser(
      a.tenantId,
      a.branchId,
      { name: 'Front desk', phoneNumber: phone, password, role: 'MODERATOR', privileges: ['can_view_trainees'], language: 'en' },
      a.adminId
    );

    const login = await call(loginRoute.POST, '', {
      method: 'POST',
      body: { phoneNumber: phone, password },
    });
    expect(login.status).toBe(200);
    expect((await login.json()).data.user.privileges).toEqual(['can_view_trainees']);

    // The refresh cookie the browser would send.
    const refreshCookie = (login.headers.get('set-cookie') ?? '')
      .split(/,(?=\s*\w+=)/)
      .map((c) => c.trim().split(';')[0])
      .find((c) => c.startsWith('refresh_token='))!;
    expect(refreshCookie).toBeDefined();

    await setPrivileges(
      a.tenantId, a.branchId, mod.id, { privileges: ['can_view_trainees', 'can_mark_attendance'] }, a.adminId
    );
    const refreshed = await call(refreshRoute.POST, '', { method: 'POST', cookie: refreshCookie });
    expect(refreshed.status).toBe(200);
    const data = (await refreshed.json()).data;
    expect(data.role).toBe('MODERATOR');
    expect([...data.privileges].sort()).toEqual(['can_mark_attendance', 'can_view_trainees']);
  }, 60_000);
});
