/**
 * ISSA — Privilege Groups (Client-Safe)
 *
 * This file contains ONLY the PRIVILEGE_GROUPS constant — no server-only imports.
 * It is safe to import in both Client Components and Server Components.
 *
 * ⚠️  DO NOT add imports from:
 *    - @/lib/db/* (Prisma, tenant-client, etc.)
 *    - @/lib/api/error-handler
 *    - @/lib/auth/middleware
 *    These are server-only modules and will break client-side rendering.
 *
 * For the full permissions module (requireRole, hasPrivilege, etc.),
 * import from '@/lib/auth/permissions' — server/API routes only.
 */

/**
 * Groups related moderator privileges together for rendering in the UI
 * (e.g., checkbox grids on the User Management page).
 *
 * Each group has a human-readable label and an array of privilege keys.
 */
export const PRIVILEGE_GROUPS = {
  trainees: {
    label: 'Trainee Management',
    privileges: ['can_manage_trainees', 'can_view_trainees'] as const,
  },
  captains: {
    label: 'Captain Management',
    privileges: ['can_manage_captains', 'can_view_captains'] as const,
  },
  users: {
    label: 'User Management',
    privileges: ['can_manage_users'] as const,
  },
  subscriptions: {
    label: 'Subscription Management',
    privileges: [
      'can_manage_subscriptions',
      'can_view_subscriptions',
      'can_create_subscriptions',
    ] as const,
  },
  groups: {
    label: 'Group Management',
    privileges: ['can_manage_groups', 'can_view_groups'] as const,
  },
  attendance: {
    label: 'Attendance',
    privileges: ['can_mark_attendance', 'can_view_attendance'] as const,
  },
  schedule: {
    label: 'Schedule',
    privileges: ['can_manage_schedule', 'can_view_schedule'] as const,
  },
  finance: {
    label: 'Finance',
    privileges: [
      'can_view_finances',
      'can_manage_expenses',
      'can_manage_payroll',
    ] as const,
  },
  reports: {
    label: 'Reports',
    privileges: ['can_view_reports'] as const,
  },
  branches: {
    label: 'Branch Management',
    privileges: ['can_manage_branches'] as const,
  },
} as const;
