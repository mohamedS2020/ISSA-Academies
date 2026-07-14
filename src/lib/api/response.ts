/**
 * ISSA — Standardized API Response Envelope
 *
 * All API endpoints return responses in this format:
 * {
 *   success: boolean,
 *   data?: T,
 *   error?: { code: string, message: string, details?: object },
 *   pagination?: { page, limit, total, totalPages }
 * }
 *
 * Usage in route handlers:
 *   return successResponse(data)
 *   return successResponse(data, { page: 1, limit: 20, total: 100 })
 *   return errorResponse('VALIDATION_ERROR', 'Invalid input', 400)
 */

import type { ApiResponse, PaginationMeta, CursorPaginationMeta } from '@/types';

// ─── Success Responses ──────────────────────────────────────

/**
 * Create a success response with optional pagination.
 */
export function successResponse<T>(
  data: T,
  pagination?: PaginationMeta,
  status = 200
): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(pagination && { pagination }),
  };

  return Response.json(body, { status });
}

/**
 * Create a success response with cursor-based pagination.
 */
export function cursorSuccessResponse<T>(
  data: T,
  pagination: CursorPaginationMeta,
  status = 200
): Response {
  return Response.json(
    {
      success: true,
      data,
      pagination,
    },
    { status }
  );
}

/**
 * Create a 201 Created response.
 */
export function createdResponse<T>(data: T): Response {
  return successResponse(data, undefined, 201);
}

/**
 * Create a 204 No Content response.
 */
export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

// ─── Error Responses ────────────────────────────────────────

/**
 * Create an error response.
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>
): Response {
  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };

  return Response.json(body, { status });
}

// ─── Common Error Shortcuts ─────────────────────────────────

export function badRequestResponse(message: string, details?: Record<string, unknown>): Response {
  return errorResponse('BAD_REQUEST', message, 400, details);
}

export function unauthorizedResponse(message = 'Unauthorized'): Response {
  return errorResponse('UNAUTHORIZED', message, 401);
}

export function forbiddenResponse(message = 'Forbidden'): Response {
  return errorResponse('FORBIDDEN', message, 403);
}

export function notFoundResponse(message = 'Resource not found'): Response {
  return errorResponse('NOT_FOUND', message, 404);
}

export function conflictResponse(message: string): Response {
  return errorResponse('CONFLICT', message, 409);
}

export function validationErrorResponse(
  message: string,
  details?: Record<string, unknown>
): Response {
  return errorResponse('VALIDATION_ERROR', message, 422, details);
}

export function internalErrorResponse(message = 'Internal server error'): Response {
  return errorResponse('INTERNAL_ERROR', message, 500);
}

export function tooManyRequestsResponse(message = 'Too many requests'): Response {
  return errorResponse('TOO_MANY_REQUESTS', message, 429);
}

// ─── Pagination Helpers ─────────────────────────────────────

/**
 * Build pagination metadata from query params.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
