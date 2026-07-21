'use client';

/**
 * ISSA — Subscription Plan Detail / Edit Page
 *
 * Loads an existing plan, shows how many groups & subscriptions use it, and
 * lets an ADMIN edit the plan's scalar fields. Moderators get a read-only view.
 *
 * ⚠️  Levels are shown READ-ONLY on purpose. `updatePlan` replaces levels via
 *     delete-then-insert, which mints NEW level IDs and would break the
 *     TraineeProfile.levelId / TraineeSubscription.levelId references of every
 *     enrolled trainee. So this page never sends `levels` in the PATCH. Editing
 *     levels safely needs a non-destructive (upsert-by-id) service change first.
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { UserRole } from '@/types';
import {
  CreditCard, Loader2, CheckCircle, ArrowLeft, ToggleLeft, ToggleRight,
  Users2, Layers, Lock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

type PeriodType = 'FROM_SUBSCRIPTION_DATE' | 'FROM_MONTH_START';

interface PlanDetail {
  id: string;
  name: string;
  minSessions: number;
  periodType: PeriodType;
  periodDays: number | null;
  freezeSessions: number;
  freezeRetakeDays: number;
  amount: string;
  isActive: boolean;
  levels: { id: string; name: string; sortOrder: number }[];
  _count: { groups: number; subscriptions: number };
}

interface FormState {
  name: string;
  minSessions: string;
  periodType: PeriodType;
  periodDays: string;
  freezeSessions: string;
  freezeRetakeDays: string;
  amount: string;
}

const inputClass =
  'w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed';

// ─── Component ────────────────────────────────────────────────

export default function EditSubscriptionPlanPage() {
  const t = useTranslations('subscriptions');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;
  const planId = routeParams.id as string;

  const isAdmin = user?.role === UserRole.ADMIN;

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPlan = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/subscriptions/plans/${planId}`);
      if (!res.ok) throw new Error('Failed to load plan');
      const data = await res.json();
      const p: PlanDetail = data.data;
      setPlan(p);
      setForm({
        name: p.name,
        minSessions: String(p.minSessions),
        periodType: p.periodType,
        periodDays: p.periodDays != null ? String(p.periodDays) : '',
        freezeSessions: String(p.freezeSessions),
        freezeRetakeDays: String(p.freezeRetakeDays),
        amount: String(p.amount),
      });
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, planId, toast, tCommon]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const togglePeriodType = () => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            periodType: prev.periodType === 'FROM_SUBSCRIPTION_DATE' ? 'FROM_MONTH_START' : 'FROM_SUBSCRIPTION_DATE',
            periodDays: prev.periodType === 'FROM_SUBSCRIPTION_DATE' ? '' : '30',
          }
        : prev
    );
  };

  const validate = () => {
    if (!form) return false;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Plan name is required';
    if (!form.minSessions || Number(form.minSessions) < 1) errs.minSessions = 'At least 1 session';
    if (form.periodType === 'FROM_SUBSCRIPTION_DATE' && (!form.periodDays || Number(form.periodDays) < 1)) {
      errs.periodDays = 'Period days is required';
    }
    if (form.freezeSessions === '') errs.freezeSessions = 'Required (0 if no freeze)';
    if (form.freezeRetakeDays === '') errs.freezeRetakeDays = 'Required (0 if no retake)';
    if (!form.amount || Number(form.amount) <= 0) errs.amount = 'Amount must be positive';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!form || !validate()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        minSessions: Number(form.minSessions),
        periodType: form.periodType,
        periodDays: form.periodType === 'FROM_SUBSCRIPTION_DATE' ? Number(form.periodDays) : null,
        freezeSessions: Number(form.freezeSessions),
        freezeRetakeDays: Number(form.freezeRetakeDays),
        amount: Number(form.amount),
        // levels intentionally omitted — see file header.
      };
      const res = await authFetch(`/api/subscriptions/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update plan');
      toast.success(tCommon('success'));
      router.push(`/${locale}/subscriptions`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400" />
      </div>
    );
  }

  if (!plan || !form) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-slate-600 dark:text-slate-400">{tCommon('noResults')}</p>
        <button
          onClick={() => router.push(`/${locale}/subscriptions`)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
        >
          <ArrowLeft className="w-4 h-4" /> {t('title')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}/subscriptions`)}
            className="p-2 rounded-lg border border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/30">
            <CreditCard className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isAdmin ? t('editPlan') : plan.name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{plan.name}</p>
          </div>
        </div>
        {!plan.isActive && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30">
            {t('expired')}
          </span>
        )}
      </div>

      {/* Usage banner */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60">
          <Users2 className="w-4 h-4 text-primary dark:text-primary" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">{plan._count.groups}</span> {plan._count.groups === 1 ? 'group' : 'groups'}
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60">
          <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">{plan._count.subscriptions}</span> {plan._count.subscriptions === 1 ? 'subscription' : 'subscriptions'}
          </span>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-t-2xl" />
        <div className="p-6 md:p-8 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('planName')} <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input value={form.name} onChange={set('name')} disabled={!isAdmin} className={inputClass} placeholder="e.g. Beginner Monthly Plan" />
            {errors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>}
          </div>

          {/* Sessions + Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('minSessions')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={1} value={form.minSessions} onChange={set('minSessions')} disabled={!isAdmin} className={inputClass} placeholder="12" />
              {errors.minSessions && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.minSessions}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('amount')} (EGP) <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={0} step="0.01" value={form.amount} onChange={set('amount')} disabled={!isAdmin} className={inputClass} placeholder="500" />
              {errors.amount && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.amount}</p>}
            </div>
          </div>

          {/* Period type */}
          <div className="bg-slate-200/50 dark:bg-slate-800/40 border border-slate-300/60 dark:border-slate-700/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('periodType')}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {form.periodType === 'FROM_SUBSCRIPTION_DATE' ? 'N days from enrollment date' : '1st to last day of the current month'}
                </p>
              </div>
              <button
                type="button"
                onClick={togglePeriodType}
                disabled={!isAdmin}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  form.periodType === 'FROM_SUBSCRIPTION_DATE'
                    ? 'bg-purple-500/20 border-purple-500/60 text-purple-700 dark:text-purple-300'
                    : 'bg-slate-200 dark:bg-slate-700/60 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                }`}
              >
                {form.periodType === 'FROM_SUBSCRIPTION_DATE'
                  ? <><ToggleRight className="w-4 h-4" /> N days</>
                  : <><ToggleLeft className="w-4 h-4" /> Monthly</>}
              </button>
            </div>

            {form.periodType === 'FROM_SUBSCRIPTION_DATE' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('periodDays')} <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input type="number" min={1} max={365} value={form.periodDays} onChange={set('periodDays')} disabled={!isAdmin} className={inputClass} placeholder="30" />
                {errors.periodDays && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.periodDays}</p>}
              </div>
            )}
          </div>

          {/* Freeze settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('freezeSessions')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={0} value={form.freezeSessions} onChange={set('freezeSessions')} disabled={!isAdmin} className={inputClass} placeholder="2" />
              {errors.freezeSessions && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.freezeSessions}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('freezeRetakeDays')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={0} value={form.freezeRetakeDays} onChange={set('freezeRetakeDays')} disabled={!isAdmin} className={inputClass} placeholder="7" />
              {errors.freezeRetakeDays && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.freezeRetakeDays}</p>}
            </div>
          </div>

          {/* Levels — read-only */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> {t('levels')}
              </label>
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Lock className="w-3 h-3" /> read-only
              </span>
            </div>
            <div className="space-y-2">
              {plan.levels.map((level, idx) => (
                <div key={level.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-200/50 dark:bg-slate-800/40 border border-slate-300/50 dark:border-slate-700/50">
                  <span className="text-xs text-slate-500 w-5 text-end">{idx + 1}.</span>
                  <span className="text-sm text-slate-800 dark:text-slate-200 flex-1">{level.name}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Levels are locked here because trainees are linked to them. Ask to enable safe level editing if you need it.
            </p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-between gap-3">
        <button
          onClick={() => router.push(`/${locale}/subscriptions`)}
          className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          {tCommon('back')}
        </button>
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-purple-500/25 transition-all hover:-translate-y-0.5"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {tCommon('save')}
          </button>
        )}
      </div>
    </div>
  );
}
