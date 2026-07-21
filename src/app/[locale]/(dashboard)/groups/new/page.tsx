'use client';

/**
 * ISSA — Group Creation Page
 *
 * Form fields: name, captain, plan, min/max trainees,
 * schedule days (chip selector), start time, session duration.
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { Users2, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface Captain { id: string; user: { name: string }; attendingDays: string[] }
interface Plan { id: string; name: string }

type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

const ALL_DAYS: { key: Day; label: string }[] = [
  { key: 'MONDAY', label: 'Mon' },
  { key: 'TUESDAY', label: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wed' },
  { key: 'THURSDAY', label: 'Thu' },
  { key: 'FRIDAY', label: 'Fri' },
  { key: 'SATURDAY', label: 'Sat' },
  { key: 'SUNDAY', label: 'Sun' },
];

const DAY_LABEL: Record<string, string> = Object.fromEntries(
  ALL_DAYS.map((d) => [d.key, d.label])
);

const inputClass =
  'w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/20 transition-all';

// ─── Component ────────────────────────────────────────────────

export default function NewGroupPage() {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [captains, setCaptains] = useState<Captain[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [name, setName] = useState('');
  const [captainId, setCaptainId] = useState('');
  const [planId, setPlanId] = useState('');
  const [minTrainees, setMinTrainees] = useState('');
  const [maxTrainees, setMaxTrainees] = useState('');
  const [scheduleDays, setScheduleDays] = useState<Day[]>([]);
  const [startTime, setStartTime] = useState('08:00');
  const [sessionDuration, setSessionDuration] = useState('60');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Fetch dropdown data ────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [captainsRes, plansRes] = await Promise.all([
        authFetch('/api/captains?limit=100'),
        authFetch('/api/subscriptions/plans?isActive=true&limit=100'),
      ]);
      if (captainsRes.ok) {
        const d = await captainsRes.json();
        setCaptains(d.data || []);
      }
      if (plansRes.ok) {
        const d = await plansRes.json();
        setPlans(d.data || []);
      }
    };
    load();
  }, [authFetch]);

  // ─── Day toggle ─────────────────────────────────────────
  const toggleDay = (day: Day) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    if (errors.scheduleDays) setErrors((e) => ({ ...e, scheduleDays: '' }));
  };

  // ─── Validation ──────────────────────────────────────────
  // These checks MUST mirror createGroupSchema exactly — any field the
  // frontend lets through but the schema rejects produces a confusing 422.
  const validate = () => {
    const errs: Record<string, string> = {};
    const min = Number(minTrainees);
    const max = Number(maxTrainees);
    const duration = Number(sessionDuration);

    if (!name.trim()) errs.name = 'Group name is required';
    if (!captainId) errs.captainId = 'Select a captain';
    if (!planId) errs.planId = 'Select a plan';

    if (!minTrainees || min < 1) errs.minTrainees = 'Min trainees required (at least 1)';
    else if (!Number.isInteger(min)) errs.minTrainees = 'Must be a whole number';

    if (!maxTrainees || max < 1) errs.maxTrainees = 'Max trainees required (at least 1)';
    else if (!Number.isInteger(max)) errs.maxTrainees = 'Must be a whole number';
    else if (max < min) errs.maxTrainees = 'Max must be ≥ Min';

    if (scheduleDays.length === 0) errs.scheduleDays = 'Select at least one day';
    if (!startTime.match(/^\d{2}:\d{2}$/)) errs.startTime = 'Invalid time format';

    if (!sessionDuration || duration < 15) errs.sessionDuration = 'Min 15 minutes';
    else if (!Number.isInteger(duration)) errs.sessionDuration = 'Must be a whole number';
    else if (duration > 480) errs.sessionDuration = 'Max 480 minutes (8 hours)';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        captainId,
        planId,
        minTrainees: Number(minTrainees),
        maxTrainees: Number(maxTrainees),
        scheduleDays,
        startTime,
        sessionDuration: Number(sessionDuration),
      };

      const res = await authFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // The API returns per-field detail on a 422 — surface it on the
        // matching inputs instead of swallowing it behind a generic message.
        const fieldErrors = data.error?.details?.fields as
          | Record<string, string[]>
          | undefined;
        if (fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [field, messages] of Object.entries(fieldErrors)) {
            mapped[field] = Array.isArray(messages) ? messages[0] : String(messages);
          }
          setErrors(mapped);
        }
        throw new Error(data.error?.message || 'Failed to create group');
      }

      toast.success('Group created successfully!');
      router.push(`/${locale}/groups`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Captain availability vs the group's schedule — a soft warning only.
  const selectedCaptain = captains.find((c) => c.id === captainId);
  const captainDays = selectedCaptain?.attendingDays ?? [];
  // Only flag conflicts when the captain actually has attending days set —
  // an empty list means "unspecified", not "attends no days".
  const conflictingDays =
    captainId && captainDays.length > 0
      ? scheduleDays.filter((d) => !captainDays.includes(d))
      : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500/20 to-accent/20 border border-teal-500/30">
          <Users2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('createGroup')}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Configure group schedule and capacity</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-teal-500 to-accent rounded-t-2xl" />
        <div className="p-6 md:p-8 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('groupName')} <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Beginner Group A" />
            {errors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>}
          </div>

          {/* Captain + Plan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('captain')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <select value={captainId} onChange={(e) => setCaptainId(e.target.value)} className={inputClass}>
                <option value="">Select captain</option>
                {captains.map((c) => (
                  <option key={c.id} value={c.id}>{c.user.name}</option>
                ))}
              </select>
              {selectedCaptain && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Attends:{' '}
                  {captainDays.length
                    ? captainDays.map((d) => DAY_LABEL[d] ?? d).join(', ')
                    : '—'}
                </p>
              )}
              {errors.captainId && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.captainId}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('plan')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
                <option value="">Select plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {errors.planId && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.planId}</p>}
            </div>
          </div>

          {/* Min / Max trainees */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('minTrainees')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={1} step={1} value={minTrainees} onChange={(e) => setMinTrainees(e.target.value)} className={inputClass} placeholder="3" />
              {errors.minTrainees && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.minTrainees}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('maxTrainees')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={1} step={1} value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} className={inputClass} placeholder="10" />
              {errors.maxTrainees && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.maxTrainees}</p>}
            </div>
          </div>

          {/* Schedule days */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t('scheduleDays')} <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map(({ key, label }) => {
                const selected = scheduleDays.includes(key);
                const conflict =
                  selected && captainDays.length > 0 && !captainDays.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      conflict
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-700 dark:text-amber-300'
                        : selected
                          ? 'bg-teal-500/20 border-teal-500/60 text-teal-700 dark:text-teal-300'
                          : 'bg-slate-200/60 dark:bg-slate-800/60 border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.scheduleDays && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.scheduleDays}</p>}
            {conflictingDays.length > 0 && (
              <div className="flex items-start gap-2.5 mt-2 p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-200 text-xs">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <span>
                  {selectedCaptain?.user.name} doesn&apos;t attend on{' '}
                  <span className="font-semibold">
                    {conflictingDays.map((d) => DAY_LABEL[d] ?? d).join(', ')}
                  </span>
                  . Sessions will still be scheduled on those days — pick different
                  days, or update the captain&apos;s attending days first.
                </span>
              </div>
            )}
          </div>

          {/* Start time + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('startTime')} <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
              {errors.startTime && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.startTime}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('sessionDuration')} (min) <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input type="number" min={15} max={480} step={1} value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} className={inputClass} placeholder="60" />
              {errors.sessionDuration && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.sessionDuration}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between gap-3">
        <button onClick={() => router.back()} className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          {tCommon('cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-accent text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-teal-500/25 transition-all hover:-translate-y-0.5"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {t('createGroup')}
        </button>
      </div>
    </div>
  );
}
