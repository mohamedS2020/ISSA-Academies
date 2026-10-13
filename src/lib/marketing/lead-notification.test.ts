import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { buildLeadNotificationEmail } from './lead-notification';
import { sendEmail } from '@/lib/email/send-email';

const lead = {
  id: '6f1c1b1e-0000-4000-8000-000000000001',
  name: 'Mona <script>alert(1)</script>',
  academyName: 'Aqua "Stars" & Co',
  phone: '+201001234567',
  branches: '2-5',
  sport: 'swimming',
  locale: 'ar',
  createdAt: new Date('2026-10-13T18:30:00Z'),
};

describe('buildLeadNotificationEmail', () => {
  const email = buildLeadNotificationEmail(lead, 'owner@example.com');

  it('escapes everything the visitor typed in the HTML part', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Mona &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('Aqua &quot;Stars&quot; &amp; Co');
  });

  it('lists the lead in plain words, with labels instead of stored codes', () => {
    expect(email.text).toContain('Branches: 2 to 5 branches');
    expect(email.text).toContain('Main sport: Swimming');
    expect(email.text).toContain('Page language: Arabic');
    expect(email.text).toContain('Received: 13 Oct 2026, 21:30 (Cairo)');
  });

  it('links to WhatsApp without the plus sign, and to the leads page', () => {
    expect(email.text).toContain('https://wa.me/201001234567');
    expect(email.text).toContain('https://yallacademy.com/en/admin/leads');
  });

  it('is addressed to the configured recipient', () => {
    expect(email.to).toBe('owner@example.com');
  });
});

describe('sendEmail', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { key: env.RESEND_API_KEY, from: env.EMAIL_FROM };
  const realFetch = global.fetch;

  afterEach(() => {
    env.RESEND_API_KEY = saved.key;
    env.EMAIL_FROM = saved.from;
    global.fetch = realFetch;
  });

  it('sends nothing, and says so, when not configured', async () => {
    delete env.RESEND_API_KEY;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const result = await sendEmail({ to: 'a@example.com', subject: 's', text: 't', html: 'h' });
    expect(result).toEqual({ sent: false, reason: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the subject on one line', async () => {
    env.RESEND_API_KEY = 're_test';
    env.EMAIL_FROM = 'Test <t@example.com>';
    let body: { subject?: string } = {};
    global.fetch = (async (_url: unknown, init?: { body?: string }) => {
      body = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as typeof fetch;
    const result = await sendEmail({ to: 'a@example.com', subject: 'New\r\nBcc: evil@example.com', text: 't', html: 'h' });
    expect(result.sent).toBe(true);
    expect(body.subject).toBe('New Bcc: evil@example.com');
  });

  it('reports a rejection instead of throwing', async () => {
    env.RESEND_API_KEY = 're_test';
    env.EMAIL_FROM = 'Test <t@example.com>';
    global.fetch = (async () => new Response('domain not verified', { status: 403 })) as typeof fetch;
    const result = await sendEmail({ to: 'a@example.com', subject: 's', text: 't', html: 'h' });
    expect(result).toMatchObject({ sent: false, reason: 'rejected' });
  });
});
