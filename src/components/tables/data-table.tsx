'use client';

/**
 * ISSA — Reusable Data Table Component
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
  searchPlaceholder = 'Search...',
  onSearchChange,
  isLoading = false,
  pagination,
  onPageChange,
  emptyMessage = 'No results found',
  emptyIcon,
  actions,
  headerActions,
}: DataTableProps<T>) {
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
              <div className="h-10 w-72 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
            )}
            {headerActions && (
              <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
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
                className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pe-4 ps-10 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          )}
          {headerActions && <div className="flex gap-2">{headerActions}</div>}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
                      col.sortable ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200' : ''
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
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (actions ? 1 : 0)}
                    className="px-4 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                      {emptyIcon ?? (
                        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      )}
                      <p className="text-sm font-medium">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedData.map((row, idx) => (
                  <tr
                    key={(row[keyField] as string) ?? idx}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 ${col.className ?? ''}`}
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{' '}
            of{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {pagination.total}
            </span>
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              ←
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
                        ? 'bg-primary text-white shadow-sm'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
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
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
