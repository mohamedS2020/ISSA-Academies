'use client';

/**
 * ISSA — Create Tenant Wizard (Super Admin)
 *
 * Multi-step form for provisioning a new academy:
 *   Step 1: Academy info (name, slug, contact)
 *   Step 2: Default admin account (name, phone)
 *   Step 3: Default branch (name, code, timezone)
 *   Step 4: Review & confirm → triggers provisioning
 *   Success: Shows admin credentials to copy
 */

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/feedback/toast-provider';
import { useAuth } from '@/lib/auth/auth-context';
import { generateSlug } from '@/schemas/tenant.schema';
import {
  SPORT_KEYS,
  DEFAULT_SPORT,
  sportLabel,
  type SportKey,
} from '@/lib/theme/sports';

// ─── Types ──────────────────────────────────────────────────

interface WizardData {
  // Step 1
  name: string;
  slug: string;
  themeKey: SportKey;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  // Step 2
  adminName: string;
  adminPhone: string;
  // Step 3
  branchName: string;
  branchCode: string;
  branchTimezone: string;
}

interface ProvisioningResult {
  tenant: { id: string; name: string; slug: string };
  adminCredentials: { name: string; phoneNumber: string; password: string };
  branch: { name: string; code: string; timezone: string };
}

const INITIAL_DATA: WizardData = {
  name: '',
  slug: '',
  themeKey: DEFAULT_SPORT,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  adminName: '',
  adminPhone: '',
  branchName: '',
  branchCode: '',
  branchTimezone: 'Africa/Cairo',
};

const COMMON_TIMEZONES = [
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Istanbul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

// Representative gradient swatch per sport for the picker preview only — the
// live theme is driven by the data-sport blocks in globals.css.
const SPORT_SWATCH: Record<SportKey, string> = {
  swimming: 'from-cyan-500 to-blue-600',
  football: 'from-green-500 to-emerald-700',
  padel: 'from-purple-500 to-violet-700',
};

// ─── API Helper ─────────────────────────────────────────────

// ─── Page Component ─────────────────────────────────────────

export default function CreateTenantPage() {
  const t = useTranslations('superAdmin');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const { authFetch } = useAuth();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Partial<Record<keyof WizardData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ProvisioningResult | null>(null);
  const [copied, setCopied] = useState(false);

  const totalSteps = 4;

  const updateField = <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-generate slug from name
      if (key === 'name') {
        next.slug = generateSlug(value);
      }
      return next;
    });
    // Clear error on edit
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  // ─── Validation ─────────────────────────────────────────

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Partial<Record<keyof WizardData, string>> = {};

    if (currentStep === 1) {
      if (!data.name.trim()) newErrors.name = 'Academy name is required';
      if (!data.slug.trim()) newErrors.slug = 'Slug is required';
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
        newErrors.slug = 'Only lowercase letters, numbers, and hyphens';
      }
    }

    if (currentStep === 2) {
      if (!data.adminName.trim()) newErrors.adminName = 'Admin name is required';
      if (!data.adminPhone.trim()) newErrors.adminPhone = 'Admin phone is required';
      else if (!/^\+?[0-9\s-]{7,20}$/.test(data.adminPhone)) {
        newErrors.adminPhone = 'Invalid phone number';
      }
    }

    if (currentStep === 3) {
      if (!data.branchName.trim()) newErrors.branchName = 'Branch name is required';
      if (!data.branchCode.trim()) newErrors.branchCode = 'Branch code is required';
      else if (!/^[A-Z0-9_]+$/.test(data.branchCode)) {
        newErrors.branchCode = 'Only uppercase letters, numbers, underscores';
      }
      if (!data.branchTimezone) newErrors.branchTimezone = 'Timezone is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, totalSteps));
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  // ─── Submit ─────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create academy');
      }

      setResult(json.data);
      setStep(5); // Success step
      toast.success(t('createSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('createError'));
    } finally {
      setIsSubmitting(false);
    }
  }, [data, toast, t, authFetch]);

  const handleCopyPassword = async () => {
    if (result?.adminCredentials.password) {
      await navigator.clipboard.writeText(result.adminCredentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ─── Step Indicator ─────────────────────────────────────

  const steps = [
    { num: 1, label: t('wizardStep1') },
    { num: 2, label: t('wizardStep2') },
    { num: 3, label: t('wizardStep3') },
    { num: 4, label: t('wizardStep4') },
  ];

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back link */}
      <button
        onClick={() => router.push('./admin' === './admin' ? '../admin' : './admin')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('backToList')}
      </button>

      {/* Title */}
      <h1 className="mb-8 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('wizardTitle')}
      </h1>

      {/* Step Indicator — hide on success */}
      {step <= totalSteps && (
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.num} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                      step > s.num
                        ? 'bg-emerald-500 text-white'
                        : step === s.num
                          ? 'bg-primary text-white shadow-lg shadow-primary/30'
                          : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {step > s.num ? '✓' : s.num}
                  </div>
                  <span className="mt-2 hidden text-xs font-medium text-gray-500 dark:text-gray-400 sm:block">
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 transition-colors ${
                      step > s.num ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
        {/* Step 1: Academy Info */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('wizardStep1')}
            </h2>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('tenantName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.name
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
                placeholder="e.g., Aqua Stars Academy"
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('slug')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => updateField('slug', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.slug
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
              />
              <p className="text-xs text-gray-400">{t('slugHint')}</p>
              {errors.slug && <p className="text-xs text-red-500">{errors.slug}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('sportTheme')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {SPORT_KEYS.map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => updateField('themeKey', key)}
                    aria-pressed={data.themeKey === key}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all ${
                      data.themeKey === key
                        ? 'border-primary bg-primary ring-2 ring-primary/20 dark:border-primary dark:bg-primary/10'
                        : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
                    }`}
                  >
                    <span
                      className={`h-8 w-8 rounded-full bg-gradient-to-tr shadow-inner ${SPORT_SWATCH[key]}`}
                    />
                    <span className="text-gray-800 dark:text-gray-200">
                      {sportLabel(key, locale)}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">{t('sportThemeHint')}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('contactName')}
                </label>
                <input
                  type="text"
                  value={data.contactName}
                  onChange={(e) => updateField('contactName', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('contactPhone')}
                </label>
                <input
                  type="tel"
                  value={data.contactPhone}
                  onChange={(e) => updateField('contactPhone', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="+20..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('contactEmail')}
              </label>
              <input
                type="email"
                value={data.contactEmail}
                onChange={(e) => updateField('contactEmail', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="admin@academy.com"
              />
            </div>
          </div>
        )}

        {/* Step 2: Admin Account */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('wizardStep2')}
            </h2>
            <div className="rounded-lg bg-primary p-4 text-sm text-primary dark:bg-primary/20 dark:text-primary">
              A default admin account will be created. The password will be auto-generated and shown once after creation.
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('adminName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.adminName}
                onChange={(e) => updateField('adminName', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.adminName
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
                placeholder="e.g., Ahmed Hassan"
              />
              {errors.adminName && <p className="text-xs text-red-500">{errors.adminName}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('adminPhone')} <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={data.adminPhone}
                onChange={(e) => updateField('adminPhone', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.adminPhone
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
                placeholder="+201111111111"
              />
              <p className="text-xs text-gray-400">{t('adminPhoneHint')}</p>
              {errors.adminPhone && <p className="text-xs text-red-500">{errors.adminPhone}</p>}
            </div>
          </div>
        )}

        {/* Step 3: Default Branch */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('wizardStep3')}
            </h2>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('branchName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.branchName}
                onChange={(e) => updateField('branchName', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.branchName
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
                placeholder="e.g., Heliopolis Branch"
              />
              {errors.branchName && <p className="text-xs text-red-500">{errors.branchName}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('branchCode')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.branchCode}
                onChange={(e) => updateField('branchCode', e.target.value.toUpperCase())}
                className={`w-full rounded-lg border px-3 py-2.5 font-mono text-sm uppercase focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.branchCode
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
                placeholder="HELIO"
              />
              <p className="text-xs text-gray-400">{t('branchCodeHint')}</p>
              {errors.branchCode && <p className="text-xs text-red-500">{errors.branchCode}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('branchTimezone')} <span className="text-red-500">*</span>
              </label>
              <select
                value={data.branchTimezone}
                onChange={(e) => updateField('branchTimezone', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.branchTimezone
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-primary focus:ring-primary/20 dark:border-gray-600'
                }`}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              {errors.branchTimezone && (
                <p className="text-xs text-red-500">{errors.branchTimezone}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('reviewTitle')}
            </h2>

            {/* Academy */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
              <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase dark:text-gray-400">
                {t('reviewAcademy')}
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('tenantName')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{data.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('slug')}</dt>
                  <dd className="font-mono text-gray-900 dark:text-gray-100">{data.slug}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('sportTheme')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {sportLabel(data.themeKey, locale)}
                  </dd>
                </div>
                {data.contactEmail && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('contactEmail')}</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{data.contactEmail}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Admin */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
              <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase dark:text-gray-400">
                {t('reviewAdmin')}
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('adminName')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{data.adminName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('adminPhone')}</dt>
                  <dd className="font-mono text-gray-900 dark:text-gray-100">{data.adminPhone}</dd>
                </div>
              </dl>
            </div>

            {/* Branch */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
              <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase dark:text-gray-400">
                {t('reviewBranch')}
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('branchName')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{data.branchName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('branchCode')}</dt>
                  <dd className="font-mono text-gray-900 dark:text-gray-100">{data.branchCode}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('branchTimezone')}</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.branchTimezone}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 5 && result && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('createSuccess')}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {result.tenant.name} has been created.
              </p>
            </div>

            {/* Admin Credentials */}
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-5 text-start dark:border-amber-600 dark:bg-amber-900/20">
              <h3 className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t('adminCredentials')}
              </h3>
              <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                {t('credentialsWarning')}
              </p>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    {t('adminName')}
                  </dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {result.adminCredentials.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    {t('adminPhone')}
                  </dt>
                  <dd className="font-mono text-gray-900 dark:text-gray-100">
                    {result.adminCredentials.phoneNumber}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Password
                  </dt>
                  <dd className="flex items-center gap-2">
                    <code className="rounded bg-white px-2 py-1 font-mono text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                      {result.adminCredentials.password}
                    </code>
                    <button
                      onClick={handleCopyPassword}
                      className="rounded-md bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-200"
                    >
                      {copied ? t('copied') : t('copyPassword')}
                    </button>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => router.push('../admin')}
                className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t('goToTenantList')}
              </button>
              <button
                onClick={() => {
                  setData(INITIAL_DATA);
                  setResult(null);
                  setStep(1);
                }}
                className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary"
              >
                {t('createAnother')}
              </button>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        {step <= totalSteps && (
          <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-5 dark:border-gray-700">
            <button
              onClick={step === 1 ? () => router.push('../admin') : handleBack}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < totalSteps ? (
              <button
                onClick={handleNext}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('creating')}
                  </>
                ) : (
                  t('createTenant')
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
