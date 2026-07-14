/**
 * ISSA Swimming Academy — Shared Type Definitions
 *
 * Central type definitions used across the application.
 * These types mirror the Prisma schema enums and provide
 * additional application-level typing.
 */

// ─── User Roles ─────────────────────────────────────────────
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  CAPTAIN = 'CAPTAIN',
  TRAINEE = 'TRAINEE',
}

// ─── Subscription ───────────────────────────────────────────
export enum PeriodType {
  FROM_SUBSCRIPTION_DATE = 'FROM_SUBSCRIPTION_DATE',
  FROM_MONTH_START = 'FROM_MONTH_START',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  FROZEN = 'FROZEN',
}

// ─── Attendance ─────────────────────────────────────────────
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  EXCUSED = 'EXCUSED',
}

// ─── Sessions ───────────────────────────────────────────────
export enum SessionStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ─── Captain Payroll ────────────────────────────────────────
export enum PayrollType {
  HOURS = 'HOURS',
  SALARY_PERCENTAGE = 'SALARY_PERCENTAGE',
}

export enum PayrollFrequency {
  WEEKLY = 'WEEKLY',
  BI_WEEKLY = 'BI_WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

// ─── Financial ──────────────────────────────────────────────
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
}

export enum PaymentMethod {
  INSTAPAY = 'INSTAPAY',
  CASH = 'CASH',
  EWALLET = 'EWALLET',
}

export enum ReferralType {
  NEW = 'NEW',
  NETWORK = 'NETWORK',
  OLD = 'OLD',
  CONTINUOUS = 'CONTINUOUS',
}

// ─── Tenant ─────────────────────────────────────────────────
export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

// ─── Days of Week ───────────────────────────────────────────
export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

// ─── Audit Log ──────────────────────────────────────────────
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ARCHIVE = 'ARCHIVE',
  LOGIN = 'LOGIN',
  PASSWORD_RESET = 'PASSWORD_RESET',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

// ─── Moderator Privileges ───────────────────────────────────
export const MODERATOR_PRIVILEGES = [
  'can_manage_trainees',
  'can_view_trainees',
  'can_manage_captains',
  'can_view_captains',
  'can_manage_users',
  'can_manage_subscriptions',
  'can_view_subscriptions',
  'can_create_subscriptions',
  'can_manage_groups',
  'can_view_groups',
  'can_mark_attendance',
  'can_view_attendance',
  'can_manage_schedule',
  'can_view_schedule',
  'can_view_finances',
  'can_manage_expenses',
  'can_view_reports',
  'can_manage_branches',
  'can_manage_payroll',
] as const;

export type ModeratorPrivilege = (typeof MODERATOR_PRIVILEGES)[number];

// ─── JWT Claims ─────────────────────────────────────────────
export interface JWTPayload {
  userId: string;
  role: UserRole;
  tenantId?: string;   // absent for SUPER_ADMIN
  tenantSlug?: string; // absent for SUPER_ADMIN
  branchId?: string;   // absent for SUPER_ADMIN and tenant-level ADMIN
  iat?: number;
  exp?: number;
}

// ─── API Response Envelope ──────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CursorPaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  limit: number;
}

// ─── Request Context ────────────────────────────────────────
export interface RequestContext {
  userId: string;
  role: UserRole;
  tenantId: string;
  branchId: string;
  privileges?: ModeratorPrivilege[];
}
