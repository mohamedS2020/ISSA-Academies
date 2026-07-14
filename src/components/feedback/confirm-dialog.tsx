'use client';

/**
 * ISSA — Confirmation Dialog
 *
 * Reusable modal for destructive or important actions.
 * Supports a "type to confirm" mode for high-risk actions (e.g., delete).
 *
 * Usage:
 *   <ConfirmDialog
 *     isOpen={showDelete}
 *     title="Delete Academy"
 *     message="This action cannot be undone."
 *     confirmLabel="Delete"
 *     variant="danger"
 *     onConfirm={handleDelete}
 *     onCancel={() => setShowDelete(false)}
 *   />
 */

import { useState, useEffect, useRef, type ReactNode } from 'react';

// ─── Types ──────────────────────────────────────────────────

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  /** If set, user must type this exact string to enable the confirm button */
  typeToConfirm?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Variant Styles ─────────────────────────────────────────

const variantStyles = {
  danger: {
    icon: (
      <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    confirmClass:
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
  },
  warning: {
    icon: (
      <svg className="h-6 w-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    confirmClass:
      'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500 shadow-sm',
    bgClass: 'bg-amber-50 dark:bg-amber-900/20',
  },
  info: {
    icon: (
      <svg className="h-6 w-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    confirmClass:
      'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-sm',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
  },
};

// ─── Component ──────────────────────────────────────────────

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  typeToConfirm,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const styles = variantStyles[variant];
  const isConfirmEnabled = typeToConfirm
    ? typedValue === typeToConfirm
    : true;

  // Reset typed value when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setTypedValue('');
      // Focus the cancel button for accessibility
      setTimeout(() => cancelBtnRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current && !isLoading) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md transform rounded-2xl bg-white shadow-2xl transition-all dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 pb-2">
          <div className={`flex-shrink-0 rounded-full p-2 ${styles.bgClass}`}>
            {styles.icon}
          </div>
          <div className="flex-1">
            <h3
              id="confirm-dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {title}
            </h3>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {message}
            </div>
          </div>
        </div>

        {/* Type to Confirm */}
        {typeToConfirm && (
          <div className="px-6 pt-2">
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Type{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-red-600 dark:bg-gray-700 dark:text-red-400">
                {typeToConfirm}
              </code>{' '}
              to confirm:
            </p>
            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder={typeToConfirm}
              autoComplete="off"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 p-6 pt-4">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmEnabled || isLoading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${styles.confirmClass}`}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
