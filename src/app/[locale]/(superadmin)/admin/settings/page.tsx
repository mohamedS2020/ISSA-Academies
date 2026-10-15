'use client';

/**
 * Settings (Super Admin): where new-lead notification emails go.
 */

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/feedback/toast-provider';
import { platformSettingsSchema } from '@/schemas/lead.schema';
import {
  fetchSettings,
  saveSettings,
  settingsKey,
  type PlatformSettings,
} from '@/components/superadmin/leads-api';

export default function SettingsPage() {
  const t = useTranslations('superAdmin.settings');
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-foreground">{t('title')}</h2>
      {settings.isError ? (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
          {t('loadError')}
        </p>
      ) : settings.data ? (
        // Keyed by the saved value, so the field starts from it and resets to it after a save.
        <LeadEmailForm key={settings.data.leadNotificationEmail} saved={settings.data} />
      ) : (
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
      )}
    </div>
  );
}

function LeadEmailForm({ saved }: { saved: PlatformSettings }) {
  const t = useTranslations('superAdmin.settings');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(saved.leadNotificationEmail);
  const [invalid, setInvalid] = useState(false);

  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKey, data);
      toast.success(t('saved'));
    },
    onError: () => toast.error(t('saveError')),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = platformSettingsSchema.safeParse({ leadNotificationEmail: email });
    setInvalid(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6" noValidate>
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t('leadEmailTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('leadEmailDesc')}</p>
      </div>

      {!saved.emailConfigured && (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          {t('emailNotConfigured')}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="lead-email" className="text-sm font-medium text-foreground">
          {t('leadEmailLabel')}
        </label>
        <input
          id="lead-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setInvalid(false);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'lead-email-error' : undefined}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {invalid && (
          <p id="lead-email-error" className="text-sm text-destructive">
            {t('invalidEmail')}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={save.isPending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {save.isPending ? t('saving') : t('save')}
      </button>
    </form>
  );
}
