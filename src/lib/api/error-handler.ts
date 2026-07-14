/**
 * ISSA — Global Error Handler
 *
 * Catches errors in API routes and returns standardized responses.
 * Wraps route handler functions to provide consistent error handling.
 *
 * Usage:
 *   export const GET = withErrorHandler(async (request) => {
 *     // your logic
 *     return successResponse(data);
 *   });
 */

import { ZodError } from 'zod';
import { TenantResolutionError } from '@/lib/db/tenant-resolver';
import {
  errorResponse,
  internalErrorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  tooManyRequestsResponse,
} from './response';

// ─── Application Error Classes ──────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 400,
    code = 'APP_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 422, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS');
    this.name = 'TooManyRequestsError';
  }
}

// ─── Error Handler Wrapper ──────────────────────────────────

type RouteHandler = (
  request: Request,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/**
 * Wraps a route handler with centralized error handling.
 * Catches known error types and returns appropriate responses.
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * Convert an error to a standardized API response.
 */
function handleError(error: unknown): Response {
  // Zod validation errors
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.');
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return validationErrorResponse('Validation failed', { fields: fieldErrors });
  }

  // Application errors
  if (error instanceof AppError) {
    return errorResponse(error.code, error.message, error.statusCode, error.details);
  }

  // Tenant resolution errors
  if (error instanceof TenantResolutionError) {
    if (error.statusCode === 403) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse(error.message);
  }

  // Prisma known errors
  if (isPrismaError(error)) {
    return handlePrismaError(error);
  }

  // Unknown errors — log and return generic 500
  console.error('[ISSA] Unhandled error:', error);
  return internalErrorResponse();
}

// ─── Prisma Error Handling ──────────────────────────────────

interface PrismaError {
  code: string;
  meta?: Record<string, unknown>;
  message: string;
}

function isPrismaError(error: unknown): error is PrismaError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as PrismaError).code === 'string' &&
    (error as PrismaError).code.startsWith('P')
  );
}

function handlePrismaError(error: PrismaError): Response {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      return errorResponse(
        'DUPLICATE_ENTRY',
        'A record with this value already exists',
        409,
        { fields: error.meta?.target }
      );
    case 'P2025': // Record not found
      return notFoundResponse('Record not found');
    case 'P2003': // Foreign key constraint
      return errorResponse(
        'REFERENCE_ERROR',
        'Referenced record does not exist',
        400
      );
    default:
      console.error('[ISSA] Prisma error:', error.code, error.message);
      return internalErrorResponse();
  }
}
