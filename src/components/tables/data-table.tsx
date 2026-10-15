'use client';

/**
 * Reusable Data Table Component
 *
 * A generic, sortable, searchable data table with pagination.
 * Supports column definitions, row actions, loading states,
 * and empty states. Uses i18n for all strings.
 *
 * Usage:
 *   <DataTable
 *     columns={columns}
 *     data={trainees}
 *     searchPlaceholder="Search trainees..."
 *     isLoading={isLoading}
 *     pagination={pagination}
 *     onPageChange={setPage}
 *   />
 */

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SkeletonTable } from '@/components/feedback/skeleton-loader';

// ─── Types ──────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => ReactNode;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  isLoading?: boolean;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  actions?: (row: T) => ReactNode;
  headerActions?: ReactNode;
}

// ─── Component ──────────────────────────────────────────────

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id',
  searchValue,
  searchPlaceholder,
  onSearchChange,
  isLoading = false,
  pagination,
  onPageChange,
  emptyMessage,
  emptyIcon,
  actions,
  headerActions,
}: DataTableProps<T>) {
  // Built-in labels come from the `common` messages, so tables read correctly
  // in Arabic too; they used to be hardcoded English.
  const t = useTranslations('common');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Client-side sort (for small datasets; large datasets sort server-side)
  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {(onSearchChange || headerActions) && (
          <div className="flex items-center justify-between gap-4">
            {onSearchChange && (
              <div className="h-10 w-72 animate-pulse rounded-lg bg-muted" />
            )}
            {headerActions && (
              <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
            )}
          </div>
        )}
        <SkeletonTable rows={6} cols={columns.length + (actions ? 1 : 0)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — Search + Actions */}
      {(onSearchChange || headerActions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {onSearchChange && (
            <div className="relative max-w-sm flex-1">
              <svg
                className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? t('search')}
                className="w-full rounded-lg border border-input bg-card py-2.5 pe-4 ps-10 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          {headerActions && <div className="flex gap-2">{headerActions}</div>}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                      col.sortable ? 'cursor-pointer select-none hover:text-foreground/80' : ''
                    } ${col.className ?? ''}`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && sortKey === col.key && (
                        <span className="text-primary">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                {actions && (
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (actions ? 1 : 0)}
                    className="px-4 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      {emptyIcon ?? (
                        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      )}
                      <p className="text-sm font-medium">{emptyMessage ?? t('noResults')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedData.map((row, idx) => (
                  <tr
                    key={(row[keyField] as string) ?? idx}
                    className="transition-colors hover:bg-muted"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3.5 text-sm text-foreground/80 ${col.className ?? ''}`}
                      >
                        {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3.5 text-end">
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            {t('showing', {
              from: (pagination.page - 1) * pagination.limit + 1,
              to: Math.min(pagination.page * pagination.limit, pagination.total),
              total: pagination.total,
            })}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              aria-label={t('previous')}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              {/* Points back along the reading direction: flipped in Arabic. */}
              <span aria-hidden="true" className="inline-block rtl:-scale-x-100">←</span>
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }).map(
              (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange?.(pageNum)}
                    className={`min-w-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      pageNum === pagination.page
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'border border-input text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              }
            )}
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              aria-label={t('next')}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true" className="inline-block rtl:-scale-x-100">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
