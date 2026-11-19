/**
 * Check a read workbook and turn it into what the import will create.
 *
 * Every rule the app's own forms enforce is checked here, row by row, plus the
 * rules that span tabs (a group's captain and plan exist, a level belongs to
 * its group's plan, a group isn't over capacity, siblings share one parent).
 * Nothing touches the database: the service adds the academy-wide checks
 * (phones already in use, the branch is empty) and writes.
 *
 * A problem in one record never cascades: a group whose plan has an error of
 * its own is not also reported as "unknown plan".
 *
 * Pure; client-safe.
 */
import type { ImportIssue, IssueCode, IssueParams } from './messages';
import * as P from './parse';
import type { CellValue } from './parse';
import type { RawRow, RawSheets } from './read';
import { SUBSCRIPTION_COLUMNS, type SheetKey, type Weekday } from './template';

export interface PlanRow {
  row: number;
  name: string;
  minSessions: number;
  periodType: 'FROM_SUBSCRIPTION_DATE' | 'FROM_MONTH_START';
  periodDays: number | null;
  freezeSessions: number;
  freezeRetakeDays: number;
  amount: number;
  levels: string[];
}

export interface CaptainRow {
  row: number;
  name: string;
  phone: string;
  attendingDays: Weekday[];
  specialization: string | null;
  payrollType: 'HOURS' | 'SALARY_PERCENTAGE';
  hourlyRate: number | null;
  baseSalary: number | null;
  percentage: number | null;
  /** False when the pay columns were left empty: set later from the captain's page. */
  paySet: boolean;
}

export interface GroupRow {
  row: number;
  name: string;
  captainName: string;
  planName: string;
  scheduleDays: Weekday[];
  startTime: string;
  sessionDuration: number;
  minTrainees: number;
  maxTrainees: number;
}

export interface SubscriptionRow {
  groupName: string;
  planName: string;
  levelName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalSessions: number;
  attendedSessions: number;
  amountPaid: number;
  /** What is still owed, as enrollTrainee stores it: price − paid. */
  amountDue: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  /** Ended (by date or sessions) subscriptions arrive EXPIRED, ready to renew. */
  status: 'ACTIVE' | 'EXPIRED';
}

export interface TraineeRow {
  row: number;
  name: string;
  dateOfBirth: string;
  parentName: string;
  parentPhone: string;
  whatsapp: string;
  parentIdCard: string;
  medicalCondition: string;
  subscription: SubscriptionRow | null;
}

export interface AccountRow {
  phone: string;
  name: string;
  /** The trainee rows this parent account holds (siblings share one). */
  rows: number[];
}

export interface ImportPlan {
  plans: PlanRow[];
  captains: CaptainRow[];
  groups: GroupRow[];
  accounts: AccountRow[];
  trainees: TraineeRow[];
}

export interface ImportSummary {
  plans: number;
  levels: number;
  captains: number;
  groups: number;
  trainees: number;
  parentAccounts: number;
  activeSubscriptions: number;
  endedSubscriptions: number;
  withoutSubscription: number;
  amountPaid: number;
  amountDue: number;
}

export function summarize(plan: ImportPlan): ImportSummary {
  const subs = plan.trainees.map((t) => t.subscription).filter((s): s is SubscriptionRow => s != null);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    plans: plan.plans.length,
    levels: plan.plans.reduce((n, p) => n + p.levels.length, 0),
    captains: plan.captains.length,
    groups: plan.groups.length,
    trainees: plan.trainees.length,
    parentAccounts: plan.accounts.length,
    activeSubscriptions: subs.filter((s) => s.status === 'ACTIVE').length,
    endedSubscriptions: subs.filter((s) => s.status === 'EXPIRED').length,
    withoutSubscription: plan.trainees.length - subs.length,
    amountPaid: round(subs.reduce((n, s) => n + s.amountPaid, 0)),
    amountDue: round(subs.reduce((n, s) => n + s.amountDue, 0)),
  };
}

// ─── Dates ────────────────────────────────────────────────────

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** Same rule as enrollTrainee: start + periodDays, or the end of the start's month. */
export function subscriptionEnd(plan: Pick<PlanRow, 'periodType' | 'periodDays'>, startDate: string): string {
  return plan.periodType === 'FROM_SUBSCRIPTION_DATE' ? addDays(startDate, plan.periodDays!) : endOfMonth(startDate);
}

// ─── Reading one row ──────────────────────────────────────────

class Checker {
  issues: ImportIssue[] = [];

  add(sheet: SheetKey, row: number | undefined, column: string | undefined, code: IssueCode, params?: IssueParams) {
    this.issues.push({ sheet, row, column, code, ...(params ? { params } : {}) });
  }

  /** A reader for one row: each method returns the value, or null after recording why. */
  row(sheet: SheetKey, r: RawRow) {
    const issuesBefore = this.issues.length;
    const cell = (k: string): CellValue => r.cells[k] ?? null;
    const fail = (k: string, code: IssueCode, params?: IssueParams) => {
      this.add(sheet, r.row, k, code, params);
      return null;
    };
    const missing = (k: string, required: boolean) => {
      if (!P.isBlank(cell(k))) return false;
      if (required) fail(k, 'cell.required');
      return true;
    };
    return {
      /** True when this row has recorded no problem so far. */
      ok: () => this.issues.length === issuesBefore,
      blank: (k: string) => P.isBlank(cell(k)),
      text: (k: string, required: boolean, min = 1, max = 255): string | null => {
        if (missing(k, required)) return null;
        const s = P.text(cell(k));
        if (s.length < min) return fail(k, 'cell.tooShort', { min });
        if (s.length > max) return fail(k, 'cell.tooLong', { max });
        return s;
      },
      int: (k: string, required: boolean, min: number, max: number): number | null => {
        if (missing(k, required)) return null;
        const n = P.integer(cell(k));
        if (n == null) return fail(k, 'cell.int');
        if (n < min) return fail(k, 'cell.intMin', { min });
        if (n > max) return fail(k, 'cell.intMax', { max });
        return n;
      },
      money: (k: string, required: boolean, positive: boolean, max = 9999999.99): number | null => {
        if (missing(k, required)) return null;
        const n = P.number(cell(k));
        if (n == null) return fail(k, 'cell.money');
        if (positive ? n <= 0 : n < 0) return fail(k, positive ? 'cell.moneyPositive' : 'cell.money');
        if (n > max) return fail(k, 'cell.intMax', { max });
        return Math.round(n * 100) / 100;
      },
      percent: (k: string, required: boolean): number | null => {
        if (missing(k, required)) return null;
        const n = P.number(cell(k));
        if (n == null || n < 0 || n > 100) return fail(k, 'cell.percent');
        return n;
      },
      phone: (k: string, required: boolean): string | null => {
        if (missing(k, required)) return null;
        return P.phone(cell(k)) ?? fail(k, 'cell.phone');
      },
      date: (k: string, required: boolean): string | null => {
        if (missing(k, required)) return null;
        return P.date(cell(k)) ?? fail(k, 'cell.date');
      },
      time: (k: string, required: boolean): string | null => {
        if (missing(k, required)) return null;
        return P.time(cell(k)) ?? fail(k, 'cell.time');
      },
      days: (k: string, required: boolean): Weekday[] | null => {
        if (missing(k, required)) return null;
        const d = P.days(cell(k));
        if (d.unknown.length) return fail(k, 'cell.days', { value: d.unknown[0] });
        if (d.repeated) return fail(k, 'cell.daysRepeated');
        if (!d.days.length) return fail(k, 'cell.required');
        return d.days;
      },
      period: (k: string) => (missing(k, true) ? null : P.period(cell(k)) ?? fail(k, 'cell.period')),
      payType: (k: string) => (missing(k, false) ? null : P.payType(cell(k)) ?? fail(k, 'cell.payType')),
      list: (k: string) => P.list(cell(k)),
      fail,
    };
  }
}

// ─── The whole workbook ───────────────────────────────────────

/**
 * @param today the branch's calendar date, YYYY-MM-DD: subscriptions are
 *   active or ended relative to it, and start dates can't be after it.
 */
export function validateImport(sheets: RawSheets, today: string): { plan: ImportPlan; issues: ImportIssue[] } {
  const c = new Checker();
  const key = P.nameKey;

  // Plans ──────────────────────────────────────────────────────
  const plans = new Map<string, PlanRow>();
  const planNames = new Set<string>(); // including plans with errors, so dependents don't cascade
  for (const r of sheets.plans) {
    const x = c.row('plans', r);
    const name = x.text('name', true);
    const minSessions = x.int('sessions', true, 1, 1000);
    const amount = x.money('price', true, true);
    const periodType = x.period('period');
    const periodDays = x.int('periodDays', false, 1, 3650);
    const freezeSessions = x.int('absences', true, 0, 1000);
    const freezeRetakeDays = x.int('retakeDays', true, 0, 365);
    if (periodType === 'FROM_SUBSCRIPTION_DATE' && periodDays == null && x.blank('periodDays')) x.fail('periodDays', 'plan.periodDaysRequired');
    if (periodType === 'FROM_MONTH_START' && !x.blank('periodDays')) x.fail('periodDays', 'plan.periodDaysNotUsed');

    const levels: string[] = [];
    if (x.blank('levels')) x.fail('levels', 'cell.required');
    for (const level of x.list('levels')) {
      if (level.length > 100) x.fail('levels', 'cell.tooLong', { max: 100 });
      else if (levels.some((l) => key(l) === key(level))) x.fail('levels', 'plan.levelDuplicate', { name: level });
      else levels.push(level);
    }

    if (name) {
      if (planNames.has(key(name))) {
        x.fail('name', 'plan.duplicate', { name });
        continue;
      }
      planNames.add(key(name));
    }
    if (x.ok() && name && minSessions && amount && periodType && freezeSessions != null && freezeRetakeDays != null) {
      plans.set(key(name), {
        row: r.row,
        name,
        minSessions,
        periodType,
        periodDays: periodType === 'FROM_SUBSCRIPTION_DATE' ? periodDays : null,
        freezeSessions,
        freezeRetakeDays,
        amount,
        levels,
      });
    }
  }

  // Captains ───────────────────────────────────────────────────
  const captains = new Map<string, CaptainRow>();
  const captainNames = new Set<string>();
  const captainPhoneRow = new Map<string, { row: number; name: string }>();
  for (const r of sheets.captains) {
    const x = c.row('captains', r);
    const name = x.text('name', true, 2);
    const phone = x.phone('phone', true);
    const attendingDays = x.days('days', true);
    const specialization = x.text('specialization', false);
    const payType = x.payType('payType');
    const hourlyRate = x.money('hourlyRate', false, true, 99999.99);
    const baseSalary = x.money('baseSalary', false, true);
    const percentage = x.percent('percentage', false);

    if (payType === 'HOURS' && hourlyRate == null && x.blank('hourlyRate')) x.fail('hourlyRate', 'captain.rateMissing');
    if (payType === 'SALARY_PERCENTAGE') {
      if (baseSalary == null && x.blank('baseSalary')) x.fail('baseSalary', 'captain.rateMissing');
      if (percentage == null && x.blank('percentage')) x.fail('percentage', 'captain.rateMissing');
    }
    if (!payType && x.blank('payType') && (!x.blank('hourlyRate') || !x.blank('baseSalary') || !x.blank('percentage'))) {
      x.fail('payType', 'cell.payType');
    }

    if (phone) {
      const other = captainPhoneRow.get(phone);
      if (other) x.fail('phone', 'phone.captainTwice', { row: other.row });
      else if (name) captainPhoneRow.set(phone, { row: r.row, name });
    }
    if (name) {
      if (captainNames.has(key(name))) {
        x.fail('name', 'captain.duplicate', { name });
        continue;
      }
      captainNames.add(key(name));
    }
    if (x.ok() && name && phone && attendingDays) {
      captains.set(key(name), {
        row: r.row,
        name,
        phone,
        attendingDays,
        specialization,
        payrollType: payType ?? 'HOURS',
        hourlyRate: payType === 'HOURS' ? hourlyRate : null,
        baseSalary: payType === 'SALARY_PERCENTAGE' ? baseSalary : null,
        percentage: payType === 'SALARY_PERCENTAGE' ? percentage : null,
        paySet: payType != null,
      });
    }
  }

  // Groups ─────────────────────────────────────────────────────
  const groups = new Map<string, GroupRow>();
  const groupNames = new Set<string>();
  for (const r of sheets.groups) {
    const x = c.row('groups', r);
    const name = x.text('name', true);
    const captainName = x.text('captain', true);
    const planName = x.text('plan', true);
    const scheduleDays = x.days('days', true);
    const startTime = x.time('startTime', true);
    const sessionDuration = x.int('duration', true, 15, 480);
    const minTrainees = x.int('minTrainees', true, 1, 1000);
    const maxTrainees = x.int('maxTrainees', true, 1, 1000);
    if (minTrainees && maxTrainees && maxTrainees < minTrainees) x.fail('maxTrainees', 'group.maxBelowMin');
    if (captainName && !captainNames.has(key(captainName))) x.fail('captain', 'group.unknownCaptain', { name: captainName });
    if (planName && !planNames.has(key(planName))) x.fail('plan', 'group.unknownPlan', { name: planName });

    if (name) {
      if (groupNames.has(key(name))) {
        x.fail('name', 'group.duplicate', { name });
        continue;
      }
      groupNames.add(key(name));
    }
    const captain = captainName ? captains.get(key(captainName)) : undefined;
    const plan = planName ? plans.get(key(planName)) : undefined;
    if (x.ok() && name && captain && plan && scheduleDays && startTime && sessionDuration && minTrainees && maxTrainees) {
      groups.set(key(name), {
        row: r.row,
        name,
        captainName: captain.name,
        planName: plan.name,
        scheduleDays,
        startTime,
        sessionDuration,
        minTrainees,
        maxTrainees,
      });
    }
  }

  // Trainees ───────────────────────────────────────────────────
  const trainees: TraineeRow[] = [];
  const accounts = new Map<string, AccountRow & { firstRow: number }>();
  const seen = new Map<string, number>(); // parent phone + trainee name → row
  const activeInGroup = new Map<string, number>();
  for (const r of sheets.trainees) {
    const x = c.row('trainees', r);
    const name = x.text('name', true, 2);
    const dateOfBirth = x.date('dateOfBirth', true);
    const parentName = x.text('parentName', true, 2);
    const parentPhone = x.phone('parentPhone', true);
    const whatsapp = x.phone('whatsapp', true);
    const parentIdCard = x.text('parentId', true, 5, 50);
    const medicalCondition = x.text('medical', true, 1, 2000);
    if (dateOfBirth && dateOfBirth >= today) x.fail('dateOfBirth', 'cell.datePast');

    if (parentPhone) {
      const captain = captainPhoneRow.get(parentPhone);
      if (captain) x.fail('parentPhone', 'phone.captainAndParent', { name: captain.name });
      const account = accounts.get(parentPhone);
      if (account && parentName && key(account.name) !== key(parentName)) {
        x.fail('parentName', 'trainee.parentNameMismatch', { row: account.firstRow, name: account.name });
      }
      if (name) {
        const dup = seen.get(`${parentPhone}|${key(name)}`);
        if (dup) x.fail('name', 'trainee.duplicate', { row: dup });
        else seen.set(`${parentPhone}|${key(name)}`, r.row);
      }
    }

    // The current subscription: all four columns, or none.
    let subscription: SubscriptionRow | null = null;
    const filled = SUBSCRIPTION_COLUMNS.filter((k) => !x.blank(k));
    if (filled.length && filled.length < SUBSCRIPTION_COLUMNS.length) {
      for (const k of SUBSCRIPTION_COLUMNS) if (x.blank(k)) x.fail(k, 'trainee.subscriptionIncomplete');
    } else if (!filled.length && !x.blank('amountPaid')) {
      x.fail('amountPaid', 'trainee.paidWithoutSubscription');
    } else if (filled.length) {
      const groupName = x.text('group', true)!;
      const levelName = x.text('level', true, 1, 100);
      const startDate = x.date('startDate', true);
      const sessionsLeft = x.int('sessionsLeft', true, 0, 1000);
      const amountPaid = x.money('amountPaid', false, false) ?? 0;
      if (startDate && startDate > today) x.fail('startDate', 'cell.dateNotFuture');

      const group = groups.get(key(groupName));
      const plan = group ? plans.get(key(group.planName)) : undefined;
      if (!groupNames.has(key(groupName))) x.fail('group', 'trainee.unknownGroup', { name: groupName });
      if (group && plan) {
        const level = levelName ? plan.levels.find((l) => key(l) === key(levelName)) : undefined;
        if (levelName && !level) {
          x.fail('level', 'trainee.unknownLevel', { level: levelName, plan: plan.name, levels: plan.levels.join('، ') });
        }
        if (sessionsLeft != null && sessionsLeft > plan.minSessions) x.fail('sessionsLeft', 'trainee.sessionsLeftTooMany', { max: plan.minSessions });
        if (amountPaid > plan.amount) x.fail('amountPaid', 'trainee.paidTooMuch', { price: plan.amount });

        if (x.ok() && level && startDate && sessionsLeft != null) {
          const endDate = subscriptionEnd(plan, startDate);
          const status = endDate >= today && sessionsLeft > 0 ? 'ACTIVE' : 'EXPIRED';
          const amountDue = Math.round((plan.amount - amountPaid) * 100) / 100;
          subscription = {
            groupName: group.name,
            planName: plan.name,
            levelName: level,
            startDate,
            endDate,
            totalSessions: plan.minSessions,
            attendedSessions: plan.minSessions - sessionsLeft,
            amountPaid,
            amountDue,
            paymentStatus: amountPaid <= 0 ? 'UNPAID' : amountDue <= 0 ? 'PAID' : 'PARTIAL',
            status,
          };
          if (status === 'ACTIVE') activeInGroup.set(key(group.name), (activeInGroup.get(key(group.name)) ?? 0) + 1);
        }
      }
    }

    if (x.ok() && name && dateOfBirth && parentName && parentPhone && whatsapp && parentIdCard && medicalCondition) {
      trainees.push({ row: r.row, name, dateOfBirth, parentName, parentPhone, whatsapp, parentIdCard, medicalCondition, subscription });
      const account = accounts.get(parentPhone);
      if (account) account.rows.push(r.row);
      else accounts.set(parentPhone, { phone: parentPhone, name: parentName, rows: [r.row], firstRow: r.row });
    } else if (parentPhone && parentName && !accounts.has(parentPhone)) {
      // Still the reference for siblings' name checks.
      accounts.set(parentPhone, { phone: parentPhone, name: parentName, rows: [], firstRow: r.row });
    }
  }

  for (const g of groups.values()) {
    const count = activeInGroup.get(key(g.name)) ?? 0;
    if (count > g.maxTrainees) c.add('groups', g.row, 'maxTrainees', 'group.overCapacity', { name: g.name, count, max: g.maxTrainees });
  }

  return {
    plan: {
      plans: [...plans.values()],
      captains: [...captains.values()],
      groups: [...groups.values()],
      accounts: [...accounts.values()].filter((a) => a.rows.length).map(({ phone, name, rows }) => ({ phone, name, rows })),
      trainees,
    },
    issues: c.issues,
  };
}
