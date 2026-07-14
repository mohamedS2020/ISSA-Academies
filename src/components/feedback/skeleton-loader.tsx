'use client';

/**
 * ISSA — Reusable Skeleton Loading States
 *
 * Provides skeleton placeholders for data loading states.
 * Uses CSS animations — no external dependencies.
 *
 * Usage:
 *   <Skeleton className="h-8 w-48" />
 *   <SkeletonCard />
 *   <SkeletonTable rows={5} cols={4} />
 */

import { type ReactNode } from 'react';

// ─── Base Skeleton ──────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  children?: ReactNode;
}

export function Skeleton({ className = '', children }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700 ${className}`}
      role="status"
      aria-label="Loading..."
    >
      {children}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ─── Skeleton Card ──────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-700">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

// ─── Skeleton Table ─────────────────────────────────────────

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 4 }: SkeletonTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex gap-4 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={`row-${rowIdx}`}
          className="flex gap-4 border-b border-gray-100 px-6 py-4 last:border-0 dark:border-gray-800"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton
              key={`cell-${rowIdx}-${colIdx}`}
              className="h-4 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton KPI Card ──────────────────────────────────────

export function SkeletonKPICard() {
  return (
    <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-700">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-1 h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// ─── Skeleton Dashboard ─────────────────────────────────────

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonKPICard key={`kpi-${i}`} />
        ))}
      </div>
      {/* Table */}
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}

// ─── Skeleton Form ──────────────────────────────────────────

export function SkeletonForm({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={`field-${i}`} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}
