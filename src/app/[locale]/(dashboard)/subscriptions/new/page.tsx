'use client';

/**
 * ISSA — Subscription Plan Builder Page
 *
 * Creates a new subscription plan with:
 * - Name, sessions, period type toggle, period days (conditional),
 *   freeze sessions, freeze retake days, amount
 * - Dynamic levels list — add / remove / reorder
 *
 * ⚠️  periodDays is shown & required ONLY when FROM_SUBSCRIPTION_DATE.
 *     Hidden and cleared when FROM_MONTH_START.
 * Full RTL support via logical CSS properties.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import {
  CreditCard, Plus, Trash2, ArrowUp, ArrowDown,
  Loader2, CheckCircle, Calendar, ToggleLeft, ToggleRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

type PeriodType = 'FROM_SUBSCRIPTION_DATE' | 'FROM_MONTH_START';

interface Level { id: string; name: string }

interface FormState {
  name: string;
  minSessions: string;
  periodType: PeriodType;
  periodDays: string;
  freezeSessions: string;
  freezeRetakeDays: string;
  amount: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  minSessions: '',
  periodType: 'FROM_SUBSCRIPTION_DATE',
  periodDays: '30',
  freezeSessions: '',
  freezeRetakeDays: '',
  amount: '',
};

const inputClass =
  'w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition-all';

// ─── Component ────────────────────────────────────────────────

export default function NewSubscriptionPage() {
  const t = useTranslations('subscriptions');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [levels, setLevels] = useState<Level[]>([{ id: crypto.randomUUID(), name: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const togglePeriodType = () => {
    setForm((prev) => ({
      ...prev,
      periodType: prev.periodType === 'FROM_SUBSCRIPTION_DATE' ? 'FROM_MONTH_START' : 'FROM_SUBSCRIPTION_DATE',
      periodDays: prev.periodType === 'FROM_SUBSCRIPTION_DATE' ? '' : '30',
    }));
  };

  // ─── Levels management ──────────────────────────────────
  const addLevel = () => setLevels((prev) => [...prev, { id: crypto.randomUUID(), name: '' }]);
  const removeLevel = (id: string) => setLevels((prev) => prev.filter((l) => l.id !== id));
  const setLevelName = (id: string, name: string) =>
    setLevels((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  const moveLevel = (idx: number, dir: -1 | 1) => {
    const next = [...levels];
    const swap = next[idx + dir];
    if (!swap) return;
    next[idx + dir] = next[idx];
    next[idx] = swap;
    setLevels(next);
  };

  // ─── Validation ──────────────────────────────────────────
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Plan name is required';
    if (!form.minSessions || Number(form.minSessions) < 1) errs.minSessions = 'At least 1 session';
    if (form.periodType === 'FROM_SUBSCRIPTION_DATE' && (!form.periodDays || Number(form.periodDays) < 1)) {
      errs.periodDays = 'Period days is required';
    }
    if (form.freezeSessions === '') errs.freezeSessions = 'Required (0 if no freeze)';
    if (form.freezeRetakeDays === '') errs.freezeRetakeDays = 'Required (0 if no retake)';
    if (!form.amount || Number(form.amount) <= 0) errs.amount = 'Amount must be positive';
    if (levels.some((l) => !l.name.trim())) errs.levels = 'All levels must have a name';
    if (levels.length === 0) errs.levels = 'At least one level required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        minSessions: Number(form.minSessions),
        periodType: form.periodType,
        periodDays: form.periodType === 'FROM_SUBSCRIPTION_DATE' ? Number(form.periodDays) : null,
        freezeSessions: Number(form.freezeSessions),
        freezeRetakeDays: Number(form.freezeRetakeDays),
        amount: Number(form.amount),
        levels: levels.map((l, i) => ({ name: l.name.trim(), sortOrder: i })),
      };

      const res = await authFetch('/api/subscriptions/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create plan');

      toast.success('Subscription plan created!');
      router.push(`/${locale}/subscriptions`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/30">
          <CreditCard className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('createPlan')}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Define the plan details and levels</p>
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
            <input value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. Beginner Monthly Plan" />
            {errors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>}
          </div>

          {/* Sessions + Amount row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('minSessions')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={1} value={form.minSessions} onChange={set('minSessions')} className={inputClass} placeholder="12" />
              {errors.minSessions && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.minSessions}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('amount')} (EGP) <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={0} step="0.01" value={form.amount} onChange={set('amount')} className={inputClass} placeholder="500" />
              {errors.amount && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.amount}</p>}
            </div>
          </div>

          {/* Period type toggle */}
          <div className="bg-slate-200/50 dark:bg-slate-800/40 border border-slate-300/60 dark:border-slate-700/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('periodType')}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {form.periodType === 'FROM_SUBSCRIPTION_DATE'
                    ? 'N days from enrollment date'
                    : '1st to last day of the current month'}
                </p>
              </div>
              <button
                type="button"
                onClick={togglePeriodType}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
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

            {/* period days — only when FROM_SUBSCRIPTION_DATE */}
            {form.periodType === 'FROM_SUBSCRIPTION_DATE' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('periodDays')} <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  type="number" min={1} max={365}
                  value={form.periodDays}
                  onChange={set('periodDays')}
                  className={inputClass}
                  placeholder="30"
                />
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
              <input type="number" min={0} value={form.freezeSessions} onChange={set('freezeSessions')} className={inputClass} placeholder="2" />
              {errors.freezeSessions && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.freezeSessions}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('freezeRetakeDays')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={0} value={form.freezeRetakeDays} onChange={set('freezeRetakeDays')} className={inputClass} placeholder="7" />
              {errors.freezeRetakeDays && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.freezeRetakeDays}</p>}
            </div>
          </div>

          {/* Levels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('levels')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <button
                type="button"
                onClick={addLevel}
                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Level
              </button>
            </div>
            <div className="space-y-2">
              {levels.map((level, idx) => (
                <div key={level.id} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveLevel(idx, -1)} disabled={idx === 0} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-20 transition-colors">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => moveLevel(idx, 1)} disabled={idx === levels.length - 1} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-20 transition-colors">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs text-slate-500 w-5 text-end">{idx + 1}.</span>
                  <input
                    type="text"
                    value={level.name}
                    onChange={(e) => setLevelName(level.id, e.target.value)}
                    className={inputClass + ' flex-1'}
                    placeholder={`Level name (e.g. Beginner)`}
                  />
                  <button
                    type="button"
                    onClick={() => removeLevel(level.id)}
                    disabled={levels.length === 1}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-20 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {errors.levels && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.levels}</p>}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-between gap-3">
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          {tCommon('cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-purple-500/25 transition-all hover:-translate-y-0.5"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {t('createPlan')}
        </button>
      </div>
    </div>
  );
}
