/**
 * ISSA — Pagination Utilities
 *
 * Provides cursor-based and offset pagination helpers for list endpoints.
 * All list endpoints MUST support pagination per project conventions.
 *
 * Usage:
 *   // Offset pagination
 *   const { skip, take, page, limit } = parseOffsetPagination(request);
 *   const [items, total] = await Promise.all([
 *     tx.trainee.findMany({ skip, take, where }),
 *     tx.trainee.count({ where }),
 *   ]);
 *   return successResponse(items, buildPaginationMeta(total, page, limit));
 *
 *   // Cursor pagination
 *   const { cursor, limit } = parseCursorPagination(request);
 *   const items = await tx.trainee.findMany({
 *     take: limit + 1,  // fetch one extra to check hasMore
 *     ...(cursor && { cursor: { id: cursor }, skip: 1 }),
 *     where,
 *   });
 *   const meta = buildCursorMeta(items, limit);
 *   return cursorSuccessResponse(meta.data, meta.pagination);
 */

import type { NextRequest } from 'next/server';

// ─── Constants ──────────────────────────────────────────────

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// ─── Offset Pagination ─────────────────────────────────────

export interface OffsetPaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/**
 * Parse offset pagination params from the request URL.
 * Supports: ?page=1&limit=20
 */
export function parseOffsetPagination(request: NextRequest | Request): OffsetPaginationParams {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? String(DEFAULT_PAGE), 10));
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const skip = (page - 1) * limit;

  return { page, limit, skip, take: limit };
}

// ─── Cursor Pagination ─────────────────────────────────────

export interface CursorPaginationParams {
  cursor: string | null;
  limit: number;
}

/**
 * Parse cursor pagination params from the request URL.
 * Supports: ?cursor=<id>&limit=20
 */
export function parseCursorPagination(request: NextRequest | Request): CursorPaginationParams {
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? null;
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);

  return { cursor, limit };
}

/**
 * Build cursor pagination metadata from a query result.
 *
 * The query should fetch `limit + 1` items. If we get more items
 * than the limit, there are more pages. The cursor for the next
 * page is the ID of the last item returned.
 */
export function buildCursorMeta<T extends { id: string }>(
  items: T[],
  limit: number
): { data: T[]; pagination: { cursor: string | null; hasMore: boolean; limit: number } } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const cursor = data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    pagination: {
      cursor: hasMore ? cursor : null,
      hasMore,
      limit,
    },
  };
}

// ─── Sort Parsing ───────────────────────────────────────────

export interface SortParam {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Parse sort params from request URL.
 * Supports: ?sort=name:asc,createdAt:desc
 *
 * @param request - The incoming request
 * @param allowedFields - Whitelist of sortable field names
 */
export function parseSortParams(
  request: NextRequest | Request,
  allowedFields: string[]
): SortParam[] {
  const url = new URL(request.url);
  const sortParam = url.searchParams.get('sort');

  if (!sortParam) return [];

  return sortParam
    .split(',')
    .map((part) => {
      const [field, dir] = part.trim().split(':');
      if (!field || !allowedFields.includes(field)) return null;
      const direction = dir === 'desc' ? 'desc' : 'asc';
      return { field, direction } as SortParam;
    })
    .filter((s): s is SortParam => s !== null);
}
