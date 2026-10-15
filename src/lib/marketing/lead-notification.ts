/**
 * What happens after a demo request is saved: an email to the address set in
 * Super Admin → Settings, and an optional forward to MARKETING.formEndpoint.
 *
 * Both run after the visitor already has their answer (see `after()` in the
 * server action), and neither can lose a lead: it is in the database first.
 */

import * as Sentry from '@sentry/nextjs';
import en from '@/messages/landing/en.json';
import { MARKETING, SITE_URL, isPlaceholder } from '@/lib/config/marketing';
import { escapeHtml, sendEmail, type EmailMessage } from '@/lib/email/send-email';
import { getPlatformSettings } from '@/services/lead.service';
import { LEAD_BRANCHES, type LEAD_SPORTS } from '@/schemas/lead.schema';
import { BRAND_COLORS } from '@/lib/config/brand-colors';

export interface LeadForNotification {
  id: string;
  name: string;
  academyName: string;
  phone: string;
  branches: string;
  sport: string;
  locale: string;
  createdAt: Date;
}

const BRANCH_LABELS: Record<(typeof LEAD_BRANCHES)[number], string> = {
  '1': en.cta.form.branchOptions.one,
  '2-5': en.cta.form.branchOptions.twoToFive,
  '6+': en.cta.form.branchOptions.sixPlus,
};

const SPORT_LABELS = en.cta.form.sportOptions as Record<(typeof LEAD_SPORTS)[number], string>;

export const LEADS_ADMIN_URL = `${SITE_URL}/en/admin/leads`;

/** The notification email. Every visitor-supplied value is escaped in the HTML part. */
export function buildLeadNotificationEmail(lead: LeadForNotification, to: string): EmailMessage {
  const received = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(lead.createdAt);
  const whatsapp = `https://wa.me/${lead.phone.replace(/^\+/, '')}`;

  const rows: [string, string][] = [
    ['Name', lead.name],
    ['Academy', lead.academyName],
    ['Phone / WhatsApp', lead.phone],
    ['Branches', BRANCH_LABELS[lead.branches as keyof typeof BRANCH_LABELS] ?? lead.branches],
    ['Main sport', SPORT_LABELS[lead.sport as keyof typeof SPORT_LABELS] ?? lead.sport],
    ['Page language', lead.locale === 'ar' ? 'Arabic' : 'English'],
    ['Received', `${received} (Cairo)`],
  ];

  const text = [
    'New demo request from the Yallacademy website.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Message on WhatsApp: ${whatsapp}`,
    `Manage leads: ${LEADS_ADMIN_URL}`,
  ].join('\n');

  // Mail clients ignore CSS variables, so the brand colours go in as values.
  const { midnight, slate, 'deep-sea': deepSea } = BRAND_COLORS;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:${midnight};line-height:1.5">
<p style="margin:0 0 16px">New demo request from the Yallacademy website.</p>
<table cellpadding="6" style="border-collapse:collapse">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="color:${slate};padding-right:16px">${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`
  )
  .join('\n')}
</table>
<p style="margin:20px 0 0"><a href="${escapeHtml(whatsapp)}" style="color:${deepSea}">Message on WhatsApp</a> · <a href="${escapeHtml(LEADS_ADMIN_URL)}" style="color:${deepSea}">Manage leads</a></p>
</body></html>`;

  return {
    to,
    subject: `New demo request: ${lead.academyName}`,
    text,
    html,
  };
}

/** Email the Super Admin's chosen address, if one is set. Logs, never throws. */
export async function notifyNewLead(lead: LeadForNotification): Promise<void> {
  try {
    const { leadNotificationEmail } = await getPlatformSettings();
    if (!leadNotificationEmail) return;
    const result = await sendEmail(buildLeadNotificationEmail(lead, leadNotificationEmail));
    if (!result.sent) {
      // No personal data in logs: the lead id is enough to find it.
      console.warn(`[leads] notification for lead ${lead.id} not sent: ${result.reason}`, result.detail ?? '');
      if (result.reason !== 'not-configured') {
        Sentry.captureMessage(`Lead notification email not sent: ${result.reason}`, 'warning');
      }
    }
  } catch (error) {
    console.error(`[leads] notification for lead ${lead.id} failed`);
    Sentry.captureException(error);
  }
}

/** Forward the lead to MARKETING.formEndpoint as JSON, if one is configured. */
export async function forwardLead(lead: LeadForNotification): Promise<void> {
  const endpoint = MARKETING.formEndpoint;
  if (isPlaceholder(endpoint)) return;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: lead.id,
        name: lead.name,
        academy: lead.academyName,
        phone: lead.phone,
        branches: lead.branches,
        sport: lead.sport,
        locale: lead.locale,
        createdAt: lead.createdAt.toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.warn(`[leads] forward of lead ${lead.id} failed: HTTP ${response.status}`);
  } catch (error) {
    console.warn(`[leads] forward of lead ${lead.id} failed`);
    Sentry.captureException(error);
  }
}
