'use client';

/**
 * `can(access)` for the signed-in user, from the same table every API route
 * checks (src/lib/auth/access.ts). Use it to decide what a screen shows; the
 * server enforces the same rule, so a hidden button is never the only guard.
 */

import { useCallback } from 'react';
import { useAuth } from './auth-context';
import { canAccess, type AccessKey } from './access';

export function useAccess(): (access: AccessKey) => boolean {
  const { user } = useAuth();
  return useCallback((access: AccessKey) => canAccess(user, access), [user]);
}
