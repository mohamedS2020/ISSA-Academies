/**
 * ISSA — Sentry scrubbing tests
 *
 * This is security-critical, not cosmetic. The platform holds children's names,
 * dates of birth, medical conditions and guardian phone numbers, and phone
 * numbers double as the login identifier. A regression here sends that to a
 * third party silently — there is no error, no alert, nothing to notice.
 *
 * So the scrubber gets real coverage, including the case that would tempt
 * someone to loosen it (UUIDs must survive).
 */

import type { ErrorEvent } from '@sentry/nextjs';
import { scrubEvent, scrubString } from './scrub';

const event = (partial: Partial<ErrorEvent>): ErrorEvent => partial as ErrorEvent;

describe('scrubString', () => {
  it('redacts international and local phone numbers', () => {
    expect(scrubString('login failed for +201285727056')).toBe(
      'login failed for [redacted-phone]'
    );
    expect(scrubString('user 01285727056 not found')).toBe(
      'user [redacted-phone] not found'
    );
  });

  it('redacts phone numbers written with separators', () => {
    expect(scrubString('+20 (128) 572-7056')).toBe('[redacted-phone]');
  });

  it('redacts JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYmMifQ.c2lnbmF0dXJl';
    expect(scrubString(`Bearer ${jwt}`)).toBe('Bearer [redacted-token]');
  });

  it('preserves UUIDs — over-redaction would destroy every useful trace', () => {
    const uuid = '95b1eb0c-8f51-42fe-a5ca-f027eb357f21';
    expect(scrubString(`tenant ${uuid} failed`)).toBe(`tenant ${uuid} failed`);
  });

  it('preserves ordinary short numbers', () => {
    expect(scrubString('failed after 3 retries in 250ms')).toBe(
      'failed after 3 retries in 250ms'
    );
  });
});

describe('scrubEvent — request containers', () => {
  it('drops cookies, body and query string outright', () => {
    const result = scrubEvent(
      event({
        request: {
          cookies: { issa_access: 'a-real-token' },
          data: { phoneNumber: '+201285727056', password: 'hunter2' },
          query_string: 'q=%2B201285727056',
          headers: { authorization: 'Bearer abc', 'user-agent': 'Chrome' },
          url: 'https://issa.example/api/trainees/search?q=%2B201285727056',
        },
      })
    );

    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();
  });

  it('strips sensitive headers but keeps harmless ones', () => {
    const result = scrubEvent(
      event({
        request: { headers: { authorization: 'Bearer abc', 'user-agent': 'Chrome' } },
      })
    );

    expect(result.request?.headers?.authorization).toBeUndefined();
    expect(result.request?.headers?.['user-agent']).toBe('Chrome');
  });

  it('strips the query string from the URL, since it carries identifiers', () => {
    const result = scrubEvent(
      event({
        request: { url: 'https://issa.example/api/trainees/search?q=%2B201285727056' },
      })
    );

    expect(result.request?.url).toBe('https://issa.example/api/trainees/search');
  });

  it('removes the user object entirely', () => {
    const result = scrubEvent(
      event({ user: { id: 'abc', username: '+201285727056' } })
    );
    expect(result.user).toBeUndefined();
  });
});

describe('scrubEvent — nested values', () => {
  it('redacts sensitive keys at depth, whatever their spelling', () => {
    const result = scrubEvent(
      event({
        extra: {
          input: {
            phoneNumber: '+201285727056',
            phone_number: '+201285727056',
            password: 'hunter2',
            parentIdCard: '29901011234567',
            medicalCondition: 'asthma',
            branchName: 'Main Branch',
          },
        },
      })
    );

    const input = (result.extra as Record<string, Record<string, unknown>>).input;
    expect(input.phoneNumber).toBe('[redacted]');
    expect(input.phone_number).toBe('[redacted]');
    expect(input.password).toBe('[redacted]');
    expect(input.parentIdCard).toBe('[redacted]');
    expect(input.medicalCondition).toBe('[redacted]');
    // Non-sensitive fields survive, or the reports become useless.
    expect(input.branchName).toBe('Main Branch');
  });

  it('scrubs values inside arrays', () => {
    const result = scrubEvent(
      event({ extra: { numbers: ['+201285727056', 'fine'] } })
    );
    expect((result.extra as { numbers: string[] }).numbers).toEqual([
      '[redacted-phone]',
      'fine',
    ]);
  });

  it('scrubs exception values and breadcrumbs', () => {
    const result = scrubEvent(
      event({
        exception: {
          values: [{ type: 'Error', value: 'no user for +201285727056' }],
        },
        breadcrumbs: [
          { message: 'POST /api/auth/login for +201285727056' },
          { message: 'ok', data: { password: 'hunter2' } },
        ],
      })
    );

    expect(result.exception?.values?.[0].value).toBe('no user for [redacted-phone]');
    expect(result.breadcrumbs?.[0].message).toBe(
      'POST /api/auth/login for [redacted-phone]'
    );
    expect(
      (result.breadcrumbs?.[1].data as Record<string, unknown>).password
    ).toBe('[redacted]');
  });

  it('survives deeply nested and cyclic-looking payloads', () => {
    let deep: Record<string, unknown> = { phoneNumber: '+201285727056' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };

    expect(() => scrubEvent(event({ extra: deep }))).not.toThrow();
  });

  it('leaves an event with nothing sensitive untouched', () => {
    const result = scrubEvent(
      event({ message: 'Transaction already closed', tags: { tenantId: 'acme' } })
    );
    expect(result.message).toBe('Transaction already closed');
    expect(result.tags?.tenantId).toBe('acme');
  });
});
