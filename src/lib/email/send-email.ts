/**
 * Transactional email through Resend's HTTP API (https://resend.com).
 *
 * Plain fetch, no SDK: one endpoint is all this needs. Configured by two
 * environment variables (see .env.example):
 *   RESEND_API_KEY   the API key (a secret)
 *   EMAIL_FROM       the sender, e.g. "Yallacademy <notifications@yallacademy.com>",
 *                    on a domain verified in Resend
 *
 * Without them nothing is sent and the caller is told why. Sending email is
 * never allowed to break the operation that triggered it.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendEmailResult =
  | { sent: true; id: string | undefined }
  | { sent: false; reason: 'not-configured' | 'rejected' | 'unreachable'; detail?: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: 'not-configured' };

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        // Header values must be single-line; strip anything that could split them.
        subject: message.subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Resend's error body names the problem (e.g. an unverified domain) and
      // never echoes the message content back.
      return { sent: false, reason: 'rejected', detail: `${response.status} ${await response.text()}`.slice(0, 300) };
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id };
  } catch (error) {
    return { sent: false, reason: 'unreachable', detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Escape text for safe interpolation into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
