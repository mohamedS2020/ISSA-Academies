'use client';

/**
 * Renew Subscription dialog.
 *
 * Opens prefilled from GET /api/subscriptions/renew: the trainee's last plan,
 * level and group, the price, and when the new subscription would run. Staff
 * usually just confirm the amount paid; "Change plan, level or group" opens the
 * pickers (prices and dates follow the chosen plan).
 *
 * Renewing while the current subscription runs queues the new one: it starts
 * by itself the day after the current one ends (the server decides, and the
 * dialog says which will happen before staff confirm). Money paid now is
 * recorded at once; the rest can be paid later from the trainee page.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle, ChevronDown, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

// ─── Types ────────────────────────────────────────────────────

interface Preview {
  trainee: { id: string; name: string };
  current: {
    id: string;
    planName: string;
    levelName: string;
    endDate: string;
    attendedSessions: number;
    totalSessions: number;
    running: boolean;
  } | null;
  upcoming: { id: string; startDate: string } | null;
  defaults: { planId: string | null; levelId: string | null; groupId: string | null };
  plan: { id: string; name: string; amount: number; minSessions: number } | null;
  startDate: string | null;
  endDate: string | null;
  queued: boolean | null;
}

interface PlanOption {
  id: string;
  name: string;
  amount: string | number;
  levels: { id: string; name: string }[];
}

interface GroupOption {
  id: string;
  name: string;
  captain: { user: { name: string } };
  availableSlots: number;
  isFull: boolean;
}

type PaymentMethod = '' | 'INSTAPAY' | 'CASH' | 'EWALLET';

interface RenewResult {
  queued: boolean;
  startDate: string;
  receiptNumber: string | null;
}

/** Render it only while open: each opening starts fresh and loads the preview. */
export interface RenewDialogProps {
  traineeId: string;
  onClose: () => void;
  /** Called after a successful renewal, so the page can reload. */
  onRenewed: () => void;
}

const fieldClass =
  'w-full px-3 py-2.5 bg-muted/60 border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all';
const labelClass = 'block text-xs font-semibold text-foreground/80 mb-1.5';

// ─── Component ────────────────────────────────────────────────

export function RenewDialog({ traineeId, onClose, onRenewed }: RenewDialogProps) {
  const t = useTranslations('renewal');
  const tTrainees = useTranslations('trainees');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  const ids = useId();
  const titleId = `${ids}-title`;
  const closeRef = useRef<HTMLButtonElement>(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [form, setForm] = useState({
    planId: '',
    levelId: '',
    groupId: '',
    amountPaid: '',
    paymentMethod: '' as PaymentMethod,
  });
  const [result, setResult] = useState<RenewResult | null>(null);

  // Dates are calendar days stored at midnight UTC: show them in UTC, or a
  // viewer west of Greenwich sees the day before.
  const formatDate = useCallback(
    (iso: string | null | undefined) =>
      iso
        ? new Date(iso).toLocaleDateString(locale, {
            timeZone: 'UTC',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—',
    [locale]
  );
  const formatMoney = useCallback(
    (n: number) => `${n.toLocaleString(locale, { maximumFractionDigits: 2 })} ${t('currency')}`,
    [locale, t]
  );

  const loadPreview = useCallback(
    async (planId?: string) => {
      const qs = new URLSearchParams({ traineeId });
      if (planId) qs.set('planId', planId);
      const res = await authFetch(`/api/subscriptions/renew?${qs}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? t('loadFailed'));
      return body.data as Preview;
    },
    [authFetch, traineeId, t]
  );

  const loadGroups = useCallback(
    async (planId: string) => {
      setIsLoadingGroups(true);
      try {
        const res = await authFetch(`/api/groups?planId=${planId}&limit=100`);
        const body = res.ok ? await res.json() : null;
        setGroups(body?.data ?? []);
      } finally {
        setIsLoadingGroups(false);
      }
    },
    [authFetch]
  );

  // ── On open: load the preview (defaults, price, dates) and the plans ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, plansRes] = await Promise.all([
          loadPreview(),
          authFetch('/api/subscriptions/plans?isActive=true&limit=100'),
        ]);
        if (cancelled) return;
        const planList: PlanOption[] = plansRes.ok ? (await plansRes.json()).data ?? [] : [];
        setPlans(planList);
        setPreview(p);
        setForm({
          planId: p.defaults.planId ?? '',
          levelId: p.defaults.levelId ?? '',
          groupId: p.defaults.groupId ?? '',
          amountPaid: p.plan ? String(p.plan.amount) : '',
          paymentMethod: '',
        });
        // Nothing to prefill from (plan withdrawn, no group): open the pickers.
        setShowDetails(!p.defaults.planId || !p.defaults.levelId || !p.defaults.groupId);
        if (p.defaults.planId) await loadGroups(p.defaults.planId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPreview, loadGroups, authFetch, t]);

  // ── Focus and Escape ──
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [isSubmitting, onClose]);

  const changePlan = async (planId: string) => {
    setForm((f) => ({ ...f, planId, levelId: '', groupId: '' }));
    setGroups([]);
    if (!planId) return;
    setError(null);
    try {
      const [p] = await Promise.all([loadPreview(planId), loadGroups(planId)]);
      setPreview(p);
      // A new plan has a new price: offer it as the amount paid.
      setForm((f) => ({ ...f, amountPaid: p.plan ? String(p.plan.amount) : f.amountPaid }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    }
  };

  const submit = async () => {
    setError(null);
    const price = preview?.plan?.amount ?? 0;
    const paid = Number(form.amountPaid || 0);
    if (!form.planId || !form.levelId || !form.groupId) {
      setShowDetails(true);
      setError(t('choosePlanLevelGroup'));
      return;
    }
    if (!Number.isFinite(paid) || paid < 0) {
      setError(t('invalidAmount'));
      return;
    }
    if (paid > price) {
      setError(t('moreThanPrice', { price: formatMoney(price) }));
      return;
    }
    if (paid > 0 && !form.paymentMethod) {
      setError(t('chooseMethod'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/subscriptions/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traineeId,
          planId: form.planId,
          levelId: form.levelId,
          groupId: form.groupId,
          amountPaid: paid,
          ...(paid > 0 ? { paymentMethod: form.paymentMethod } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? t('renewFailed'));
      setResult({
        queued: body.data.queued,
        startDate: body.data.subscription.startDate,
        receiptNumber: body.data.receipt?.receiptNumber ?? null,
      });
      // The dashboard's "Expiring soon" list is cached: it now says "Renewed".
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onRenewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('renewFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === form.planId) ?? null;
  const levelName = selectedPlan?.levels.find((l) => l.id === form.levelId)?.name;
  const groupName = groups.find((g) => g.id === form.groupId)?.name;
  const price = preview?.plan?.amount ?? 0;
  const paid = Number(form.amountPaid || 0);
  const remaining = Math.max(0, price - (Number.isFinite(paid) ? paid : 0));
  const current = preview?.current ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/70 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="renew-dialog"
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-lg font-bold text-foreground flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" aria-hidden="true" />
              {t('title')}
            </h2>
            <button
              ref={closeRef}
              onClick={onClose}
              disabled={isSubmitting}
              aria-label={tCommon('close')}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {preview && <p className="text-sm text-muted-foreground -mt-2">{preview.trainee.name}</p>}

          {result ? (
            /* ── Done ── */
            <div className="text-center py-2 space-y-3" data-testid="renew-done">
              <div className="w-14 h-14 mx-auto rounded-full bg-success-soft border border-success/40 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-success" aria-hidden="true" />
              </div>
              <p className="font-semibold text-foreground">
                {result.queued ? t('doneQueuedTitle') : t('doneActiveTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.queued
                  ? t('doneQueued', { date: formatDate(result.startDate) })
                  : t('doneActive')}
              </p>
              {result.receiptNumber ? (
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">{t('receipt')}</p>
                  <p className="font-mono font-bold text-foreground" dir="ltr">{result.receiptNumber}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('noReceipt')}</p>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {t('done')}
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              {t('loading')}
            </div>
          ) : preview?.upcoming ? (
            <p className="text-sm text-foreground/80 bg-muted rounded-xl p-3">
              {t('alreadyQueued', { date: formatDate(preview.upcoming.startDate) })}
            </p>
          ) : preview ? (
            /* ── Form ── */
            <div className="space-y-4">
              {/* Current subscription */}
              {current && (
                <div className="rounded-xl border border-border p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{t('current')}</p>
                  <p className="font-semibold text-foreground">
                    {current.planName} · {current.levelName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {current.running
                      ? t('currentRunning', {
                          date: formatDate(current.endDate),
                          count: Math.max(0, current.totalSessions - current.attendedSessions),
                        })
                      : t('currentEnded')}
                  </p>
                </div>
              )}

              {/* New subscription: what, when */}
              <div className="rounded-xl bg-primary/10 p-3 text-sm space-y-1.5">
                <p className="text-xs font-semibold text-foreground/80">{t('newSubscription')}</p>
                <p className="font-semibold text-foreground" data-testid="renew-summary">
                  {[selectedPlan?.name ?? preview.plan?.name, levelName, groupName].filter(Boolean).join(' · ') || '—'}
                </p>
                {preview.startDate && (
                  <p className="text-xs text-foreground/80 flex items-start gap-1.5" data-testid="renew-when">
                    <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      {preview.queued
                        ? t('startsAfterCurrent', { date: formatDate(preview.startDate) })
                        : t('startsToday')}{' '}
                      {t('period', { start: formatDate(preview.startDate), end: formatDate(preview.endDate) })}
                      {preview.plan && <> · {t('sessions', { count: preview.plan.minSessions })}</>}
                    </span>
                  </p>
                )}
              </div>

              {/* Change details */}
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} aria-hidden="true" />
                {t('changeDetails')}
              </button>

              {showDetails && (
                <div className="space-y-3 border-s-2 border-border ps-3">
                  <div>
                    <label htmlFor={`${ids}-plan`} className={labelClass}>{t('plan')}</label>
                    <select
                      id={`${ids}-plan`}
                      className={fieldClass}
                      value={form.planId}
                      onChange={(e) => changePlan(e.target.value)}
                    >
                      <option value="">{t('selectPlan')}</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatMoney(Number(p.amount))}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedPlan && (
                    <div>
                      <label htmlFor={`${ids}-level`} className={labelClass}>{t('level')}</label>
                      <select
                        id={`${ids}-level`}
                        className={fieldClass}
                        value={form.levelId}
                        onChange={(e) => setForm((f) => ({ ...f, levelId: e.target.value }))}
                      >
                        <option value="">{t('selectLevel')}</option>
                        {selectedPlan.levels.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedPlan && (
                    <div>
                      <label htmlFor={`${ids}-group`} className={labelClass}>{t('group')}</label>
                      {isLoadingGroups ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          {t('loading')}
                        </div>
                      ) : (
                        <select
                          id={`${ids}-group`}
                          className={fieldClass}
                          value={form.groupId}
                          onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
                        >
                          <option value="">{t('selectGroup')}</option>
                          {groups.map((g) => {
                            // Their own group keeps their seat, full or not.
                            const own = g.id === preview.defaults.groupId;
                            return (
                              <option key={g.id} value={g.id} disabled={g.isFull && !own}>
                                {g.name} · {g.captain.user.name} ·{' '}
                                {own ? t('currentGroup') : g.isFull ? t('full') : t('placesLeft', { count: g.availableSlots })}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                  )}
                  {preview.queued && form.groupId && form.groupId !== preview.defaults.groupId && (
                    <p className="text-xs text-muted-foreground">{t('groupChangeLater')}</p>
                  )}
                </div>
              )}

              {/* Money */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={labelClass}>{t('price')}</p>
                  <p className="px-1 py-2.5 text-sm font-semibold text-foreground" dir="ltr" data-testid="renew-price">
                    <span className="block rtl:text-right">{formatMoney(price)}</span>
                  </p>
                </div>
                <div>
                  <label htmlFor={`${ids}-paid`} className={labelClass}>{t('paidNow')}</label>
                  <input
                    id={`${ids}-paid`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={price}
                    dir="ltr"
                    value={form.amountPaid}
                    onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                    className={`${fieldClass} rtl:text-right`}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {remaining > 0 ? t('remainingLater', { amount: formatMoney(remaining) }) : t('paidInFull')}
              </p>

              {paid > 0 && (
                <div>
                  <label htmlFor={`${ids}-method`} className={labelClass}>{tTrainees('paymentMethod')}</label>
                  <select
                    id={`${ids}-method`}
                    className={fieldClass}
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}
                  >
                    <option value="">—</option>
                    <option value="CASH">{tTrainees('paymentCash')}</option>
                    <option value="INSTAPAY">{tTrainees('paymentInstapay')}</option>
                    <option value="EWALLET">{tTrainees('paymentEwallet')}</option>
                  </select>
                </div>
              )}

              {error && (
                <div role="alert" className="p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={submit}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle className="w-4 h-4" aria-hidden="true" />}
                {paid > 0 ? t('confirmPaid', { amount: formatMoney(paid) }) : t('confirm')}
              </button>
            </div>
          ) : (
            error && (
              <div role="alert" className="p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs">
                {error}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
