/**
 * Moderator privilege cache tests
 *
 * The risky direction here is one-way: serving privileges a moderator no longer
 * has. A stale GRANT is a permissions bug. So the invalidation and expiry paths
 * get real coverage, and so does tenant separation.
 */

import {
  getCachedPrivileges,
  setCachedPrivileges,
  invalidatePrivileges,
  clearPrivilegeCache,
} from './privilege-cache';
import type { ModeratorPrivilege } from '@/types';

const PRIVS = ['MANAGE_TRAINEES', 'VIEW_FINANCE'] as unknown as ModeratorPrivilege[];
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USER = 'user-1';

beforeEach(() => {
  clearPrivilegeCache();
  jest.useRealTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('privilege cache', () => {
  it('returns null on a miss', () => {
    expect(getCachedPrivileges(TENANT_A, USER)).toBeNull();
  });

  it('returns what was stored', () => {
    setCachedPrivileges(TENANT_A, USER, PRIVS);
    expect(getCachedPrivileges(TENANT_A, USER)).toEqual(PRIVS);
  });

  it('caches an empty privilege list rather than treating it as a miss', () => {
    // A moderator with no privileges must not re-query on every request.
    setCachedPrivileges(TENANT_A, USER, []);
    expect(getCachedPrivileges(TENANT_A, USER)).toEqual([]);
  });

  it('never returns one tenant\'s entry for another tenant', () => {
    setCachedPrivileges(TENANT_A, USER, PRIVS);
    expect(getCachedPrivileges(TENANT_B, USER)).toBeNull();
  });

  it('invalidation takes effect immediately — a revoked privilege must not survive', () => {
    setCachedPrivileges(TENANT_A, USER, PRIVS);
    expect(getCachedPrivileges(TENANT_A, USER)).toEqual(PRIVS);

    invalidatePrivileges(TENANT_A, USER);

    expect(getCachedPrivileges(TENANT_A, USER)).toBeNull();
  });

  it('invalidation is scoped to one tenant', () => {
    setCachedPrivileges(TENANT_A, USER, PRIVS);
    setCachedPrivileges(TENANT_B, USER, PRIVS);

    invalidatePrivileges(TENANT_A, USER);

    expect(getCachedPrivileges(TENANT_A, USER)).toBeNull();
    expect(getCachedPrivileges(TENANT_B, USER)).toEqual(PRIVS);
  });

  it('invalidating something uncached is harmless', () => {
    expect(() => invalidatePrivileges(TENANT_A, 'never-seen')).not.toThrow();
  });

  it('expires entries once the TTL passes', () => {
    setCachedPrivileges(TENANT_A, USER, PRIVS);
    expect(getCachedPrivileges(TENANT_A, USER)).toEqual(PRIVS);

    // Default TTL is 30s; jump well past it.
    const realNow = Date.now;
    Date.now = () => realNow() + 60_000;
    try {
      expect(getCachedPrivileges(TENANT_A, USER)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
