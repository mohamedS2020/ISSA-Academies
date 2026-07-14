/**
 * GET /api/reports — report generation + export
 *
 * ?type=financial|attendance|subscription|captainPerformance
 * &format=json|pdf|excel (default json)
 * &dateFrom=&dateTo=&planId=&levelId=&captainId=&groupId=&traineeId=&status=
 *
 * format=json returns the raw report shape ({ summary, records }) for
 * on-screen tables/charts. format=pdf/excel streams a binary download.
 */

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/auth/middleware';
import { successResponse } from '@/lib/api/response';
import { reportQuerySchema } from '@/schemas/finance.schema';
import {
  getFinancialReport,
  getAttendanceReport,
  getSubscriptionReport,
  getCaptainPerformanceReport,
  getExpiringSoonReport,
  getTransitionsReport,
} from '@/services/report.service';
import {
  exportReportToPdf,
  exportReportToExcel,
  type ExportMeta,
} from '@/services/export.service';
import { getBranchById } from '@/services/branch.service';
import { requirePrivilege, requireRole } from '@/lib/auth/permissions';
import { UserRole } from '@/types';
import { subDays } from 'date-fns';

const REPORT_TITLES: Record<string, string> = {
  financial: 'Financial Report',
  attendance: 'Attendance Report',
  subscription: 'Subscription Report',
  captainPerformance: 'Captain Performance Report',
  expiringSoon: 'Expiring Soon — 1 Session Left',
  levelGroupTransitions: 'Level / Group Transitions',
};

export const GET = withErrorHandler(
  withAuth(async (request, ctx) => {
    if (ctx.role === UserRole.MODERATOR) {
      requirePrivilege(ctx, 'can_view_reports');
    } else {
      requireRole(ctx, UserRole.ADMIN);
    }

    const sp = new URL(request.url).searchParams;
    const query = reportQuerySchema.parse({
      type: sp.get('type') ?? undefined,
      format: sp.get('format') ?? undefined,
      dateFrom: sp.get('dateFrom') ?? undefined,
      dateTo: sp.get('dateTo') ?? undefined,
      planId: sp.get('planId') ?? undefined,
      levelId: sp.get('levelId') ?? undefined,
      captainId: sp.get('captainId') ?? undefined,
      groupId: sp.get('groupId') ?? undefined,
      traineeId: sp.get('traineeId') ?? undefined,
      status: sp.get('status') ?? undefined,
    });

    const dateTo = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : new Date();
    const dateFrom = query.dateFrom
      ? new Date(`${query.dateFrom}T00:00:00.000Z`)
      : subDays(dateTo, 30);

    let exportMeta: ExportMeta;
    let jsonData: unknown;

    switch (query.type) {
      case 'financial': {
        const data = await getFinancialReport(ctx.tenantId, ctx.branchId, dateFrom, dateTo);
        jsonData = data;
        const planIncomeTotal = Math.round(data.byPlan.reduce((s, p) => s + p.income, 0) * 100) / 100;
        const planTraineeTotal = data.byPlan.reduce((s, p) => s + p.traineeCount, 0);
        const refTotals = data.byPlan.reduce(
          (a, p) => ({
            new: a.new + p.referrals.new,
            network: a.network + p.referrals.network,
            continuous: a.continuous + p.referrals.continuous,
            old: a.old + p.referrals.old,
          }),
          { new: 0, network: 0, continuous: 0, old: 0 }
        );
        // Flatten the nested referral counts into columns for the export table.
        const planRows = data.byPlan.map((p) => ({
          planName: p.planName,
          traineeCount: p.traineeCount,
          refNew: p.referrals.new,
          refNetwork: p.referrals.network,
          refContinuous: p.referrals.continuous,
          refOld: p.referrals.old,
          income: p.income,
        }));
        exportMeta = {
          title: REPORT_TITLES.financial,
          summary: [
            { label: 'Revenue', value: data.summary.revenue },
            { label: 'Collections', value: data.summary.collections },
            { label: 'Expenses', value: data.summary.expenses },
            { label: 'Outstanding', value: data.summary.outstandingPayments },
            { label: 'Profit/Loss', value: data.summary.profitLoss },
          ],
          sections: [
            {
              title: 'Income by Subscription Plan',
              columns: [
                { key: 'planName', label: 'Plan' },
                { key: 'traineeCount', label: 'Trainees Paid' },
                { key: 'refNew', label: 'New' },
                { key: 'refNetwork', label: 'Network' },
                { key: 'refContinuous', label: 'Continuous' },
                { key: 'refOld', label: 'Old' },
                { key: 'income', label: 'Income' },
              ],
              rows: [
                ...planRows,
                {
                  planName: 'GRAND TOTAL',
                  traineeCount: planTraineeTotal,
                  refNew: refTotals.new,
                  refNetwork: refTotals.network,
                  refContinuous: refTotals.continuous,
                  refOld: refTotals.old,
                  income: planIncomeTotal,
                },
              ],
            },
          ],
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'type', label: 'Type' },
            { key: 'amount', label: 'Amount' },
          ],
          rows: data.records,
        };
        break;
      }
      case 'attendance': {
        const data = await getAttendanceReport(ctx.tenantId, ctx.branchId, {
          traineeId: query.traineeId,
          groupId: query.groupId,
          captainId: query.captainId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        });
        jsonData = data;
        exportMeta = {
          title: REPORT_TITLES.attendance,
          summary: [
            { label: 'Present', value: data.summary.present },
            { label: 'Absent', value: data.summary.absent },
            { label: 'Excused', value: data.summary.excused },
            { label: 'Attendance Rate', value: `${data.summary.attendanceRate}%` },
          ],
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'traineeName', label: 'Trainee' },
            { key: 'groupName', label: 'Group' },
            { key: 'status', label: 'Status' },
          ],
          rows: data.records,
        };
        break;
      }
      case 'subscription': {
        const data = await getSubscriptionReport(ctx.tenantId, ctx.branchId, {
          planId: query.planId,
          levelId: query.levelId,
          status: query.status,
          dateFrom: query.dateFrom,
        });
        jsonData = data;
        exportMeta = {
          title: REPORT_TITLES.subscription,
          summary: [
            { label: 'Active', value: data.summary.active },
            { label: 'Expired', value: data.summary.expired },
            { label: 'Frozen', value: data.summary.frozen },
            { label: 'Upcoming Renewals', value: data.summary.upcomingRenewals },
          ],
          columns: [
            { key: 'traineeName', label: 'Trainee' },
            { key: 'planName', label: 'Plan' },
            { key: 'levelName', label: 'Level' },
            { key: 'status', label: 'Status' },
            { key: 'startDate', label: 'Start Date' },
            { key: 'endDate', label: 'End Date' },
          ],
          rows: data.records,
        };
        break;
      }
      case 'captainPerformance': {
        const data = await getCaptainPerformanceReport(ctx.tenantId, ctx.branchId, {
          captainId: query.captainId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        });
        jsonData = data;
        exportMeta = {
          title: REPORT_TITLES.captainPerformance,
          columns: [
            { key: 'captainName', label: 'Captain' },
            { key: 'sessionsConducted', label: 'Sessions Conducted' },
            { key: 'attendanceRate', label: 'Attendance Rate (%)' },
            { key: 'evaluationsCount', label: 'Evaluations' },
          ],
          rows: data.records,
        };
        break;
      }
      case 'expiringSoon': {
        const data = await getExpiringSoonReport(ctx.tenantId, ctx.branchId);
        jsonData = data;
        exportMeta = {
          title: REPORT_TITLES.expiringSoon,
          summary: [{ label: 'Expiring Soon', value: data.summary.expiringSoon }],
          columns: [
            { key: 'traineeName', label: 'Trainee' },
            { key: 'phone', label: 'Phone' },
            { key: 'planName', label: 'Plan' },
            { key: 'levelName', label: 'Level' },
            { key: 'groupName', label: 'Group' },
            { key: 'sessions', label: 'Sessions' },
            { key: 'sessionsRemaining', label: 'Remaining' },
            { key: 'endDate', label: 'End Date' },
          ],
          rows: data.records,
        };
        break;
      }
      case 'levelGroupTransitions': {
        const data = await getTransitionsReport(ctx.tenantId, ctx.branchId, dateFrom, dateTo);
        jsonData = data;
        exportMeta = {
          title: REPORT_TITLES.levelGroupTransitions,
          summary: [{ label: 'Transitions', value: data.summary.total }],
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'traineeName', label: 'Trainee' },
            { key: 'levelChange', label: 'Level Change' },
            { key: 'groupChange', label: 'Group Change' },
            { key: 'changedBy', label: 'Changed By' },
          ],
          rows: data.records,
        };
        break;
      }
    }

    if (query.format === 'json') {
      return successResponse(jsonData);
    }

    const branch = await getBranchById(ctx.tenantId, ctx.branchId);
    exportMeta.branchName = branch?.name;
    exportMeta.dateRangeLabel = `${query.dateFrom ?? dateFrom.toISOString().slice(0, 10)} to ${
      query.dateTo ?? dateTo.toISOString().slice(0, 10)
    }`;

    const fileBaseName = `${query.type}-report-${new Date().toISOString().slice(0, 10)}`;

    if (query.format === 'pdf') {
      const buffer = await exportReportToPdf(exportMeta);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileBaseName}.pdf"`,
        },
      });
    }

    const buffer = await exportReportToExcel(exportMeta);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileBaseName}.xlsx"`,
      },
    });
  })
);
