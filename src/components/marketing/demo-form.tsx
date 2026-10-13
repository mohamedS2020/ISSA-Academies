'use client';

/**
 * The demo-request form. Markup and labels are the design's; on top of that it
 * submits to a server action and shows success and error states in the page's
 * language. Without JavaScript it still submits (progressive enhancement).
 */

import { useActionState } from 'react';
import { submitDemoRequest } from '@/app/marketing/[locale]/actions';
import { INITIAL_DEMO_REQUEST_STATE, type DemoRequestField } from '@/lib/marketing/demo-request-state';
import { LEAD_BRANCHES, LEAD_SPORTS } from '@/schemas/lead.schema';
import { IconArrow, IconCheck } from './icons';

export interface DemoFormLabels {
  title: string;
  name: string;
  academy: string;
  phone: string;
  branches: string;
  branchOptions: Record<(typeof LEAD_BRANCHES)[number], string>;
  sport: string;
  sportOptions: Record<(typeof LEAD_SPORTS)[number], string>;
  submit: string;
  note: string;
  honeypot: string;
  sending: string;
  successTitle: string;
  successText: string;
  errors: Record<'generic' | 'rateLimited' | 'fields' | DemoRequestField, string>;
}

export function DemoForm({ locale, labels }: { locale: string; labels: DemoFormLabels }) {
  const [state, formAction, pending] = useActionState(submitDemoRequest, INITIAL_DEMO_REQUEST_STATE);

  if (state.status === 'success') {
    return (
      <div className="demo-form" role="status">
        <div className="form-success">
          <span className="check">
            <IconCheck />
          </span>
          <h3>{labels.successTitle.replace('{name}', state.name ?? '')}</h3>
          <p>{labels.successText}</p>
        </div>
      </div>
    );
  }

  const invalid = (field: DemoRequestField) => Boolean(state.fieldErrors?.[field]);
  const errorId = (field: DemoRequestField) => (invalid(field) ? `f-${field}-error` : undefined);
  const values = state.values ?? {};

  return (
    <form className="demo-form" action={formAction}>
      <h3>{labels.title}</h3>
      <input type="hidden" name="locale" value={locale} />

      {state.status === 'error' && state.error && (
        <p className="form-alert" role="alert">
          {labels.errors[state.error]}
        </p>
      )}

      <div className="field">
        <label htmlFor="f-name">{labels.name}</label>
        <input
          id="f-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          defaultValue={values.name}
          aria-invalid={invalid('name') || undefined}
          aria-describedby={errorId('name')}
        />
        {invalid('name') && (
          <p className="field-error" id="f-name-error">
            {labels.errors.name}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="f-academy">{labels.academy}</label>
        <input
          id="f-academy"
          name="academy"
          type="text"
          autoComplete="organization"
          required
          maxLength={160}
          defaultValue={values.academy}
          aria-invalid={invalid('academy') || undefined}
          aria-describedby={errorId('academy')}
        />
        {invalid('academy') && (
          <p className="field-error" id="f-academy-error">
            {labels.errors.academy}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="f-phone">{labels.phone}</label>
        <input
          id="f-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          maxLength={32}
          defaultValue={values.phone}
          aria-invalid={invalid('phone') || undefined}
          aria-describedby={errorId('phone')}
        />
        {invalid('phone') && (
          <p className="field-error" id="f-phone-error">
            {labels.errors.phone}
          </p>
        )}
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="f-branches">{labels.branches}</label>
          <select
            id="f-branches"
            name="branches"
            defaultValue={values.branches ?? LEAD_BRANCHES[0]}
            aria-invalid={invalid('branches') || undefined}
          >
            {LEAD_BRANCHES.map((value) => (
              <option key={value} value={value}>
                {labels.branchOptions[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-sport">{labels.sport}</label>
          <select
            id="f-sport"
            name="sport"
            defaultValue={values.sport ?? LEAD_SPORTS[0]}
            aria-invalid={invalid('sport') || undefined}
          >
            {LEAD_SPORTS.map((value) => (
              <option key={value} value={value}>
                {labels.sportOptions[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Spam trap: invisible and unreachable for people, filled in by bots. */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="f-website">{labels.honeypot}</label>
        <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="btn btn-lagoon btn-lg" type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? labels.sending : labels.submit} <IconArrow />
      </button>
      <p className="form-note">{labels.note}</p>
    </form>
  );
}
