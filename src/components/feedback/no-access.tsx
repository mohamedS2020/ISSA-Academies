'use client';

/**
 * Shown in place of a page the signed-in user's role or permissions do not
 * cover. Pages decide with useAccess (src/lib/auth/use-access.ts), from the
 * same table the API checks, so this appears exactly where the API would
 * refuse.
 */

import { ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function NoAccess() {
  const t = useTranslations('common');
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 h-64 px-4 text-center text-muted-foreground"
    >
      <ShieldOff className="w-8 h-8" aria-hidden="true" />
      <p className="font-medium text-foreground">{t('noAccessTitle')}</p>
      <p className="text-sm max-w-sm">{t('noAccessHint')}</p>
    </div>
  );
}
