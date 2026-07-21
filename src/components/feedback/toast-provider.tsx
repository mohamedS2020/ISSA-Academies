'use client';

/**
 * ISSA — Toast Notification Provider
 *
 * Lightweight toast notification system built without external dependencies.
 * Provides success, error, warning, and info toasts with auto-dismiss.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success('Trainee registered successfully');
 *   toast.error('Failed to save changes');
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

// ─── Types ──────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
}

interface ToastActions {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: ToastActions;
}

// ─── Context ────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// ─── Provider ───────────────────────────────────────────────

const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (variant: ToastVariant, message: string, duration = DEFAULT_DURATION) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newToast: Toast = { id, variant, message, duration };

      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), newToast]);

      // Auto-dismiss
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ⚠️ `toast` MUST be a stable reference. Consumers put it in useEffect /
  // useCallback dependency arrays (e.g. fetch-on-mount handlers). If this
  // object were recreated every render, any component that fires a toast
  // during its initial fetch would recreate its fetch callback → re-run its
  // effect → fire another toast → infinite re-render/refetch loop.
  const toast: ToastActions = useMemo(
    () => ({
      success: (msg, dur) => addToast('success', msg, dur),
      error: (msg, dur) => addToast('error', msg, dur),
      warning: (msg, dur) => addToast('warning', msg, dur),
      info: (msg, dur) => addToast('info', msg, dur),
      dismiss,
    }),
    [addToast, dismiss]
  );

  const value: ToastContextValue = useMemo(
    () => ({ toasts, toast }),
    [toasts, toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Toast Container ────────────────────────────────────────

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-primary text-white',
};

const variantIcons: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 end-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg transition-all duration-300 animate-in slide-in-from-end ${variantStyles[t.variant]}`}
          role="alert"
        >
          <span className="text-lg font-bold">{variantIcons[t.variant]}</span>
          <p className="text-sm font-medium">{t.message}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="ms-4 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
