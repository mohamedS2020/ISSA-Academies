'use client';

/**
 * Reusable Data Table Component
 *
 * A generic, sortable, searchable data table with pagination.
 * Supports column definitions, row actions, loading states,
 * and empty states. Uses i18n for all strings.
 *
 * On phones (below md) each row is a card instead of a table row: a wide
 * table in a sideways-scrolling box hid most columns and every action button
 * on a phone. The card shows the title column on top, the other columns as
 * labelled fields, and the actions as a full-width row of 44 px buttons.
 * `Column.mobile` tunes a column's place in the card (see below).
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
  /**
   * Its place in the phone card:
   *   - 'title'   the card's heading (default: the first column);
   *   - 'full'    a field across the card's whole width (long text);
   *   - 'hidden'  left out on phones (detail that the record's page shows);
   *   - 'actions' the card's button row, without a label (default for an
   *               `id` column, which pages use for their action buttons).
   */
  mobile?: 'title' | 'full' | 'hidden' | 'actions';
}

/** How a column shows in the phone card. */
function mobileRole<T>(col: Column<T>): Column<T>['mobile'] | 'field' {
  if (col.mobile) return col.mobile;
  return col.key === 'id' ? 'actions' : 'field';
}

/**
 * Buttons and links in a card's action row get a fingertip-sized target
 * (44 px) without each page restyling its buttons.
 */
const CARD_ACTIONS =
  'flex flex-wrap items-center gap-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:justify-center [&_a]:min-h-11 [&_a]:inline-flex [&_a]:items-center [&_a]:justify-center';

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

      {/* Phones: one card per row */}
      <ul className="space-y-3 md:hidden" data-testid="data-cards">
        {sortedData.length === 0 ? (
          <li className="flex flex-col items-center gap-2 rounded-xl border border-border px-4 py-10 text-center text-muted-foreground">
            {emptyIcon}
            <p className="text-sm font-medium">{emptyMessage ?? t('noResults')}</p>
          </li>
        ) : (
          sortedData.map((row, idx) => {
            const cell = (col: Column<T>) => (col.render ? col.render(row) : (row[col.key] as ReactNode));
            const visible = columns.filter((col) => mobileRole(col) !== 'hidden');
            const titleCol =
              visible.find((col) => mobileRole(col) === 'title') ??
              visible.find((col) => mobileRole(col) === 'field' || mobileRole(col) === 'full');
            const fields = visible.filter(
              (col) => col !== titleCol && (mobileRole(col) === 'field' || mobileRole(col) === 'full')
            );
            const actionCols = visible.filter((col) => mobileRole(col) === 'actions');
            return (
              <li
                key={(row[keyField] as string) ?? idx}
                className="min-w-0 rounded-xl border border-border bg-card p-4"
              >
                {titleCol && (
                  <div className={`min-w-0 break-words text-base font-semibold text-foreground ${titleCol.className ?? ''}`}>
                    {cell(titleCol)}
                  </div>
                )}
                {fields.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    {fields.map((col) => (
                      <div key={col.key} className={`min-w-0 ${mobileRole(col) === 'full' ? 'col-span-2' : ''}`}>
                        <dt className="text-xs text-muted-foreground">{col.header}</dt>
                        <dd className={`mt-0.5 min-w-0 break-words text-foreground/80 ${col.className ?? ''}`}>{cell(col)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {(actionCols.length > 0 || actions) && (
                  <div className={`mt-4 border-t border-border pt-3 ${CARD_ACTIONS}`}>
                    {actionCols.map((col) => (
                      <div key={col.key} className={CARD_ACTIONS}>{cell(col)}</div>
                    ))}
                    {actions?.(row)}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* Tablet and desktop: the table */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
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
        <div className="flex flex-col items-center gap-3 px-1 sm:flex-row sm:justify-between">
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
              className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
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
                    aria-current={pageNum === pagination.page ? 'page' : undefined}
                    className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
              className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true" className="inline-block rtl:-scale-x-100">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
