'use client';

/**
 * `const [confirm, confirmDialog] = useConfirm();`
 * `if (!(await confirm({ title, message }))) return;`
 * and render `{confirmDialog}` once in the component.
 *
 * The app's own dialog in place of window.confirm(): that one is styled by the
 * browser, ignores the page language and direction, and on phones shows the
 * site's address as its title.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog';

type ConfirmOptions = Pick<ConfirmDialogProps, 'title' | 'message' | 'confirmLabel' | 'cancelLabel' | 'variant'>;

export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false); // a dialog left open counts as cancelled
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = (
    <ConfirmDialog
      isOpen={options !== null}
      title={options?.title ?? ''}
      message={options?.message ?? ''}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant ?? 'danger'}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return [confirm, dialog];
}
