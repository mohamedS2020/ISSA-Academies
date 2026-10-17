import { describe, it, expect } from '@jest/globals';
import { Prisma } from '@/generated/tenant-client';
import { isMissingSchemaError } from './tenant.service';

/** A failed raw query exactly as Prisma reports it: P2010, the database code in meta. */
const rawQueryFailed = (pgCode: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`${pgCode}\`. Message: \`${message}\``, {
    code: 'P2010',
    clientVersion: Prisma.prismaVersion.client,
    meta: { code: pgCode, message },
  });

describe('isMissingSchemaError (hardening plan §37)', () => {
  it('recognises a missing table behind Prisma\'s P2010', () => {
    // The Sentry alert: `relation "users" does not exist` on the usage view.
    // Only err.code was checked, which is "P2010" here, so this returned false
    // and the request became a 500.
    expect(isMissingSchemaError(rawQueryFailed('42P01', 'relation "users" does not exist'))).toBe(true);
  });

  it('recognises a missing schema behind P2010', () => {
    expect(isMissingSchemaError(rawQueryFailed('3F000', 'schema "tenant_x" does not exist'))).toBe(true);
  });

  it('still accepts a bare Postgres code', () => {
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true);
  });

  it('does not mask any other failure', () => {
    expect(isMissingSchemaError(rawQueryFailed('57014', 'canceling statement due to statement timeout'))).toBe(false);
    expect(isMissingSchemaError(new Error('connection refused'))).toBe(false);
    expect(isMissingSchemaError({ code: 'P2010' })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});
