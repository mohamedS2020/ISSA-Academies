'use client';

/**
 * Renders a page only for users allowed to open it, from the same access
 * table every API route checks (src/lib/auth/access.ts); everyone else gets
 * <NoAccess />.
 *
 * Wrap the page's content component rather than checking inside it, so the
 * content (and the requests it makes on mount) never runs for someone the API
 * would refuse: no flash of a page, no burst of 403 errors.
 *
 *   export default function TraineesPage() {
 *     return <RequireAccess access="viewTrainees"><TraineesContent /></RequireAccess>;
 *   }
 */

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useAccess } from '@/lib/auth/use-access';
import type { AccessKey } from '@/lib/auth/access';
import { NoAccess } from '@/components/feedback/no-access';
import type { UserRole } from '@/types';

export function RequireAccess({
  access = [],
  allowRoles = [],
  children,
}: {
  /** Any one of these opens the page (an ADMIN always passes). */
  access?: AccessKey | AccessKey[];
  /** Roles that may open it regardless, e.g. captains, whose pages scope themselves. */
  allowRoles?: UserRole[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  const can = useAccess();

  // The dashboard layout handles signed-out users; render nothing until known.
  if (!user) return null;

  const keys = Array.isArray(access) ? access : [access];
  const allowed =
    (allowRoles as string[]).includes(user.role) || keys.some((key) => can(key));
  return allowed ? <>{children}</> : <NoAccess />;
}
