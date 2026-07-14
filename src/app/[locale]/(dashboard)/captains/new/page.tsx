'use client';

/**
 * ISSA — Captain Registration Page
 *
 * Single-page form:
 * - Name, phone, specialization
 * - Attending days (checkbox grid Mon–Sun)
 * - Payroll type toggle: HOURS → hourly rate; SALARY_PERCENTAGE → base salary + percentage
 * - On submit → shows one-time portal password modal
 * Full RTL support via logical CSS properties.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import {
  Award,
  ArrowLeft,
  Loader2,
  KeyRound,
  UserCheck,
  Clock,
  Percent,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { key: 'MONDAY', label: 'Monday' },
  { key: 'TUESDAY', label: 'Tuesday' },
  { key: 'WEDNESDAY', label: 'Wednesday' },
  { key: 'THURSDAY', label: 'Thursday' },
  { key: 'FRIDAY', label: 'Friday' },
  { key: 'SATURDAY', label: 'Saturday' },
  { key: 'SUNDAY', label: 'Sunday' },
] as const;

const inputClass =
  'w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all';

interface FieldProps { label: string; required?: boolean; children: React.ReactNode; error?: string; }
function Field({ label, required, children, error }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function NewCaptainPage() {
  const t = useTranslations('captains');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [attendingDays, setAttendingDays] = useState<string[]>([]);
  const [payrollType, setPayrollType] = useState<'HOURS' | 'SALARY_PERCENTAGE'>('HOURS');
  const [hourlyRate, setHourlyRate] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [percentage, setPercentage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const toggleDay = (day: string) => {
    setAttendingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // ─── Validation ─────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!phoneNumber.trim()) newErrors.phoneNumber = 'Phone number is required';
    if (attendingDays.length === 0) newErrors.attendingDays = 'Select at least one attending day';
    if (payrollType === 'HOURS' && !hourlyRate) newErrors.hourlyRate = 'Hourly rate is required';
    if (payrollType === 'SALARY_PERCENTAGE') {
      if (!baseSalary) newErrors.baseSalary = 'Base salary is required';
      if (!percentage) newErrors.percentage = 'Percentage is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Submit ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name, phoneNumber,
        specialization: specialization || null,
        attendingDays,
        payrollType,
        hourlyRate: payrollType === 'HOURS' ? Number(hourlyRate) : null,
        baseSalary: payrollType === 'SALARY_PERCENTAGE' ? Number(baseSalary) : null,
        percentage: payrollType === 'SALARY_PERCENTAGE' ? Number(percentage) : null,
      };
      const res = await authFetch('/api/captains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Registration failed');
      setSuccess(data.data.portalPassword);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Success Modal ────────────────────────────────────────────

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 border border-emerald-500/40 rounded-2xl w-full max-w-md p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <UserCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Captain Registered!</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Share the portal password below. It will not be shown again.</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-400">Portal Password</p>
            </div>
            <p className="font-mono text-xl font-bold text-amber-600 dark:text-amber-400 tracking-wider select-all">
              {success}
            </p>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(success); toast.success('Copied!'); }}
            className="w-full py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Copy to Clipboard
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setSuccess(null);
                setName(''); setPhoneNumber(''); setSpecialization('');
                setAttendingDays([]); setPayrollType('HOURS');
                setHourlyRate(''); setBaseSalary(''); setPercentage('');
              }}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Register Another
            </button>
            <button
              onClick={() => router.push(`/${locale}/captains`)}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold"
            >
              Go to Captains
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/${locale}/captains`)}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30">
          <Award className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('register')}</h1>
      </div>

      {/* ─── Form Card ─── */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-6 md:p-8 backdrop-blur-xl space-y-6">
        {/* Basic Info */}
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={tCommon('active') === 'Active' ? 'Full Name' : 'Name'} required error={errors.name}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Captain's full name" />
            </Field>
            <Field label="Phone Number" required error={errors.phoneNumber}>
              <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={inputClass} placeholder="+201234567890" />
            </Field>
            <div className="md:col-span-2">
              <Field label={t('specialization')}>
                <input type="text" value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputClass} placeholder="e.g., Butterfly, Freestyle, Diving..." />
              </Field>
            </div>
          </div>
        </div>

        {/* Attending Days */}
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">{t('attendingDays')}</h2>
          {errors.attendingDays && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{errors.attendingDays}</p>}
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                  attendingDays.includes(key)
                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-700 dark:text-cyan-300'
                    : 'bg-slate-200/60 dark:bg-slate-800/60 border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Payroll System */}
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">{t('payrollType')}</h2>
          <div className="flex gap-3 mb-4">
            {(['HOURS', 'SALARY_PERCENTAGE'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPayrollType(type)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  payrollType === type
                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-700 dark:text-cyan-300'
                    : 'bg-slate-200/60 dark:bg-slate-800/60 border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                {type === 'HOURS' ? <Clock className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
                {type === 'HOURS' ? t('hours') : t('salaryPercentage')}
              </button>
            ))}
          </div>

          {payrollType === 'HOURS' && (
            <Field label={t('hourlyRate')} required error={errors.hourlyRate}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
          )}

          {payrollType === 'SALARY_PERCENTAGE' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('baseSalary')} required error={errors.baseSalary}>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </Field>
              <Field label={t('percentage')} required error={errors.percentage}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  className={inputClass}
                  placeholder="0–100"
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* ─── Submit ─── */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => router.push(`/${locale}/captains`)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {tCommon('cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-cyan-500/25 transition-all hover:-translate-y-0.5"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('register')}
        </button>
      </div>
    </div>
  );
}
