/**
 * Who may do what — one table for the API routes AND the browser.
 *
 * The server checks it in every tenant route (requireAccess, permissions.ts);
 * the sidebar and the pages check the same keys (useAccess), so a moderator is
 * shown exactly what the server will let them do. They used to be checked in
 * different ways in different places, and disagreed (hardening plan §35):
 * attendance, enrollment, receipts, groups and the schedule checked no
 * privilege at all, while the browser never received a moderator's privileges,
 * so the pages that did check them showed "Access denied" to every moderator.
 *
 * Rules:
 *   - An ADMIN may do everything here; a MODERATOR needs at least ONE of the
 *     listed privileges; any other role, nothing (captains and trainees have
 *     their own, fixed routes).
 *   - "At least one" because a stronger privilege includes the weaker: whoever
 *     may mark attendance may see it, whoever may manage groups may see them.
 *   - Where one screen needs another area's data, the read is granted to both:
 *     the attendance page lists today's sessions, enrolling picks a plan and a
 *     group, the group pages show plans.
 *
 * Client-safe: types only. Do not import server modules here.
 */

import type { ModeratorPrivilege } from '@/types';

export const ACCESS = {
  // Trainees
  viewTrainees: ['can_view_trainees', 'can_manage_trainees'],
  manageTrainees: ['can_manage_trainees'],

  // Coaches. Running payroll means picking a coach and reading their rates.
  viewCaptains: ['can_view_captains', 'can_manage_captains', 'can_manage_payroll'],
  manageCaptains: ['can_manage_captains'],

  // Attendance
  viewAttendance: ['can_view_attendance', 'can_mark_attendance'],
  markAttendance: ['can_mark_attendance'],

  // Schedule: the attendance page lists today's sessions.
  viewSchedule: [
    'can_view_schedule',
    'can_manage_schedule',
    'can_view_attendance',
    'can_mark_attendance',
  ],
  manageSchedule: ['can_manage_schedule'],

  // Groups: the list also feeds the group picker when enrolling.
  listGroups: [
    'can_view_groups',
    'can_manage_groups',
    'can_create_subscriptions',
    'can_manage_subscriptions',
  ],
  viewGroups: ['can_view_groups', 'can_manage_groups'],
  manageGroups: ['can_manage_groups'],

  // Subscriptions. Plans are read when enrolling and on the group pages;
  // creating and editing plans (prices) stays admin-only.
  viewPlans: [
    'can_view_subscriptions',
    'can_create_subscriptions',
    'can_manage_subscriptions',
    'can_view_groups',
    'can_manage_groups',
  ],
  // The Subscriptions (plans) page itself: subscription permissions only.
  viewSubscriptions: [
    'can_view_subscriptions',
    'can_create_subscriptions',
    'can_manage_subscriptions',
  ],
  enroll: ['can_create_subscriptions', 'can_manage_subscriptions'],
  recordPayments: ['can_manage_subscriptions'],
  viewReceipts: [
    'can_view_finances',
    'can_view_subscriptions',
    'can_create_subscriptions',
    'can_manage_subscriptions',
  ],
  // The dashboard's renewal reminders carry names and phone numbers.
  viewRenewals: [
    'can_view_subscriptions',
    'can_create_subscriptions',
    'can_manage_subscriptions',
    'can_view_trainees',
    'can_manage_trainees',
  ],

  // Finance. Whoever records expenses and income may see those lists; the P&L,
  // income totals and revenue figures need "View finances".
  viewFinances: ['can_view_finances'],
  viewExpenses: ['can_view_finances', 'can_manage_expenses'],
  manageExpenses: ['can_manage_expenses'],
  managePayroll: ['can_manage_payroll'],

  // Reports
  viewReports: ['can_view_reports'],
} as const satisfies Record<string, readonly ModeratorPrivilege[]>;

export type AccessKey = keyof typeof ACCESS;

/** The fields of a user (or request context) that decide access. */
export interface AccessSubject {
  role: string;
  privileges?: readonly string[] | null;
}

/** True when `subject` may do `access`. */
export function canAccess(
  subject: AccessSubject | null | undefined,
  access: AccessKey
): boolean {
  if (!subject) return false;
  if (subject.role === 'ADMIN') return true;
  if (subject.role !== 'MODERATOR') return false;
  const held = subject.privileges ?? [];
  return ACCESS[access].some((privilege) => held.includes(privilege));
}
