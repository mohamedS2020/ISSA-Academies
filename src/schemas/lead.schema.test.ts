import { describe, it, expect } from '@jest/globals';
import { demoRequestSchema, platformSettingsSchema } from './lead.schema';

const valid = {
  name: 'Mona Adel',
  academy: 'Aqua Stars',
  phone: '+20 100 123 4567',
  branches: '2-5',
  sport: 'swimming',
  locale: 'ar',
};

describe('demoRequestSchema', () => {
  it('accepts a normal request and stores the normalized phone', () => {
    const result = demoRequestSchema.parse(valid);
    expect(result.phone).toBe('+201001234567');
    expect(result.branches).toBe('2-5');
  });

  it('stores a national-format Egyptian mobile with its country code', () => {
    // Otherwise the Super Admin's WhatsApp link (wa.me/<number>) has no country code.
    expect(demoRequestSchema.parse({ ...valid, phone: '0100 123 4567' }).phone).toBe('+201001234567');
  });

  it('trims names', () => {
    expect(demoRequestSchema.parse({ ...valid, name: '  Mona  ' }).name).toBe('Mona');
  });

  it.each([
    ['name', { name: 'M' }],
    ['academy', { academy: ' ' }],
    ['phone', { phone: 'call me' }],
    ['phone', { phone: '12345' }],
    ['phone', { phone: '+2010012345678901' }], // longer than E.164 allows
    ['branches', { branches: '3' }],
    ['sport', { sport: 'chess' }],
    ['locale', { locale: 'fr' }],
  ])('rejects a bad %s', (field, override) => {
    const result = demoRequestSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });
});

describe('platformSettingsSchema', () => {
  it('accepts an email, trimmed', () => {
    expect(platformSettingsSchema.parse({ leadNotificationEmail: '  me@example.com ' }).leadNotificationEmail).toBe(
      'me@example.com'
    );
  });

  it('accepts an empty value, which turns notifications off', () => {
    expect(platformSettingsSchema.parse({ leadNotificationEmail: '' }).leadNotificationEmail).toBe('');
  });

  it('rejects something that is not an email', () => {
    expect(platformSettingsSchema.safeParse({ leadNotificationEmail: 'not-an-email' }).success).toBe(false);
  });
});
