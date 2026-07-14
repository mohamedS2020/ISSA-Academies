/**
 * ISSA — API Module Barrel Export
 *
 * Single import point for all API utilities:
 *   import { withErrorHandler, successResponse, parseOffsetPagination } from '@/lib/api';
 */

export {
  successResponse,
  cursorSuccessResponse,
  createdResponse,
  noContentResponse,
  errorResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  validationErrorResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
  buildPaginationMeta,
} from './response';

export {
  withErrorHandler,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  TooManyRequestsError,
} from './error-handler';

export {
  parseOffsetPagination,
  parseCursorPagination,
  buildCursorMeta,
  parseSortParams,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from './pagination';

export { createAuditContext } from './audit';
