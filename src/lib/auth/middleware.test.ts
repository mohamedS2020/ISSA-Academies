/**
 * ISSA — Auth Middleware Unit Tests
 *
 * Tests for:
 *   - Token extraction from Authorization header
 *   - JWT verification (valid, expired, invalid)
 *   - SUPER_ADMIN rejection on tenant routes
 *   - Role-based access control
 *   - Moderator privilege enforcement
 *   - Tenant context resolution
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mocks ──────────────────────────────────────────────────

// Mock JWT module
const mockVerifyAccessToken = jest.fn();
jest.mock('@/lib/auth/jwt', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

// Mock tenant resolver
const mockResolveTenantContext = jest.fn();
const mockBuildRequestContext = jest.fn();
jest.mock('@/lib/db/tenant-resolver', () => ({
  resolveTenantContext: (...args: unknown[]) =>
    mockResolveTenantContext(...args),
  buildRequestContext: (...args: unknown[]) =>
    mockBuildRequestContext(...args),
}));

// Mock tenant client
const mockWithTenantContext = jest.fn<any>();
jest.mock('@/lib/db/tenant-client', () => ({
  withTenantContext: (...args: any[]) => mockWithTenantContext(...args),
}));

// Mock error classes
jest.mock('@/lib/api/error-handler', () => {
  class UnauthorizedError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  }
  class ForbiddenError extends Error {
    statusCode = 403;
    code = 'FORBIDDEN';
    constructor(message = 'Forbidden') {
      super(message);
      this.name = 'ForbiddenError';
    }
  }
  return {
    UnauthorizedError,
    ForbiddenError,
    AppError: class extends Error {},
  };
});

// Import after mocks
import { withAuth } from './middleware';
import { UserRole } from '@/types';

// ─── Helpers ────────────────────────────────────────────────

function createMockRequest(token?: string): Request {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request('http://localhost/api/test', {
    method: 'GET',
    headers,
  });
}

const mockHandler = jest.fn<any>().mockImplementation(async () => {
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}) as unknown as jest.MockedFunction<
  (req: Request, ctx: unknown, routeCtx?: unknown) => Promise<Response>
>;

// ─── Tests ──────────────────────────────────────────────────

describe('withAuth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Extraction', () => {
    it('rejects requests without Authorization header', async () => {
      const wrapped = withAuth(mockHandler);
      const request = createMockRequest();

      await expect(wrapped(request)).rejects.toThrow('Missing Authorization header');
    });

    it('rejects requests with malformed Authorization header', async () => {
      const request = new Request('http://localhost/api/test', {
        headers: { Authorization: 'Basic abc123' },
      });
      const wrapped = withAuth(mockHandler);

      await expect(wrapped(request)).rejects.toThrow('Invalid Authorization header format');
    });

    it('rejects requests with empty Bearer token', async () => {
      const request = new Request('http://localhost/api/test', {
        headers: { Authorization: 'Bearer ' },
      });
      const wrapped = withAuth(mockHandler);

      // The split will give us ['Bearer', ''] — empty token
      await expect(wrapped(request)).rejects.toThrow();
    });
  });

  describe('JWT Verification', () => {
    it('rejects expired tokens', async () => {
      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const wrapped = withAuth(mockHandler);
      const request = createMockRequest('expired-token');

      await expect(wrapped(request)).rejects.toThrow('Token expired');
    });

    it('rejects invalid tokens', async () => {
      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const wrapped = withAuth(mockHandler);
      const request = createMockRequest('invalid-token');

      await expect(wrapped(request)).rejects.toThrow('Invalid token');
    });

    it('accepts valid tokens', async () => {
      const decoded = {
        userId: 'user-1',
        role: UserRole.ADMIN,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        type: 'access',
      };
      mockVerifyAccessToken.mockReturnValue(decoded);
      mockResolveTenantContext.mockReturnValue({
        tenantId: 'tenant-1',
        schemaName: 'tenant_tenant1',
        branchId: 'branch-1',
        userId: 'user-1',
        role: UserRole.ADMIN,
      });
      mockBuildRequestContext.mockReturnValue({
        userId: 'user-1',
        role: UserRole.ADMIN,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      });

      const wrapped = withAuth(mockHandler);
      const request = createMockRequest('valid-token');

      await wrapped(request);
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('SUPER_ADMIN Handling', () => {
    it('rejects SUPER_ADMIN tokens on tenant routes (no allowSuperAdmin)', async () => {
      mockVerifyAccessToken.mockReturnValue({
        userId: 'superadmin-1',
        role: UserRole.SUPER_ADMIN,
        type: 'access',
      });

      const wrapped = withAuth(mockHandler);
      const request = createMockRequest('superadmin-token');

      await expect(wrapped(request)).rejects.toThrow(
        'Super admin tokens cannot access tenant routes'
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('allows SUPER_ADMIN tokens when allowSuperAdmin is true', async () => {
      mockVerifyAccessToken.mockReturnValue({
        userId: 'superadmin-1',
        role: UserRole.SUPER_ADMIN,
        type: 'access',
      });

      const wrapped = withAuth(mockHandler, {
        allowSuperAdmin: true,
        roles: [UserRole.SUPER_ADMIN],
      });
      const request = createMockRequest('superadmin-token');

      await wrapped(request);

      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          userId: 'superadmin-1',
          role: UserRole.SUPER_ADMIN,
          tenantId: '',
          branchId: '',
        }),
        undefined
      );
    });
  });

  describe('Role-Based Access Control', () => {
    const setupTokenForRole = (role: UserRole) => {
      mockVerifyAccessToken.mockReturnValue({
        userId: 'user-1',
        role,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        type: 'access',
      });
      mockResolveTenantContext.mockReturnValue({
        tenantId: 'tenant-1',
        schemaName: 'tenant_tenant1',
        branchId: 'branch-1',
        userId: 'user-1',
        role,
      });
      mockBuildRequestContext.mockReturnValue({
        userId: 'user-1',
        role,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      });
    };

    it('allows ADMIN when ADMIN role is required', async () => {
      setupTokenForRole(UserRole.ADMIN);

      const wrapped = withAuth(mockHandler, {
        roles: [UserRole.ADMIN],
      });
      const request = createMockRequest('admin-token');

      await wrapped(request);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('rejects TRAINEE when ADMIN role is required', async () => {
      setupTokenForRole(UserRole.TRAINEE);

      const wrapped = withAuth(mockHandler, {
        roles: [UserRole.ADMIN],
      });
      const request = createMockRequest('trainee-token');

      await expect(wrapped(request)).rejects.toThrow('Access denied');
    });

    it('allows MODERATOR when ADMIN or MODERATOR is required', async () => {
      setupTokenForRole(UserRole.MODERATOR);

      // Mock privilege loading
      mockWithTenantContext.mockImplementation(
        async (_tenantId: any, callback: any) => {
          const mockTx = {
            userPrivilege: {
              findMany: jest.fn<any>().mockResolvedValue([]),
            },
          };
          return callback(mockTx);
        }
      );

      const wrapped = withAuth(mockHandler, {
        roles: [UserRole.ADMIN, UserRole.MODERATOR],
      });
      const request = createMockRequest('moderator-token');

      await wrapped(request);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('allows any authenticated user when no roles are specified', async () => {
      setupTokenForRole(UserRole.CAPTAIN);

      const wrapped = withAuth(mockHandler);
      const request = createMockRequest('captain-token');

      await wrapped(request);
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('Moderator Privilege Enforcement', () => {
    it('loads and checks moderator privileges from tenant DB', async () => {
      mockVerifyAccessToken.mockReturnValue({
        userId: 'mod-1',
        role: UserRole.MODERATOR,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        type: 'access',
      });
      mockResolveTenantContext.mockReturnValue({
        tenantId: 'tenant-1',
        schemaName: 'tenant_tenant1',
        branchId: 'branch-1',
        userId: 'mod-1',
        role: UserRole.MODERATOR,
      });

      // Mock: moderator has can_view_trainees but NOT can_manage_trainees
      mockWithTenantContext.mockImplementation(
        async (_tenantId: any, callback: any) => {
          const mockTx = {
            userPrivilege: {
              findMany: jest.fn<any>().mockResolvedValue([
                { privilege: 'can_view_trainees' },
              ]),
            },
          };
          return callback(mockTx);
        }
      );

      mockBuildRequestContext.mockReturnValue({
        userId: 'mod-1',
        role: UserRole.MODERATOR,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        privileges: ['can_view_trainees'],
      });

      // Should pass — has the required privilege
      const wrappedAllowed = withAuth(mockHandler, {
        roles: [UserRole.ADMIN, UserRole.MODERATOR],
        privileges: ['can_view_trainees'],
      });
      const request1 = createMockRequest('mod-token');
      await wrappedAllowed(request1);
      expect(mockHandler).toHaveBeenCalled();

      // Should fail — missing can_manage_trainees
      mockHandler.mockClear();
      mockBuildRequestContext.mockReturnValue({
        userId: 'mod-1',
        role: UserRole.MODERATOR,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        privileges: ['can_view_trainees'],
      });

      const wrappedDenied = withAuth(mockHandler, {
        roles: [UserRole.ADMIN, UserRole.MODERATOR],
        privileges: ['can_manage_trainees'],
      });
      const request2 = createMockRequest('mod-token');
      await expect(wrappedDenied(request2)).rejects.toThrow(
        'Missing privileges: can_manage_trainees'
      );
    });
  });
});
