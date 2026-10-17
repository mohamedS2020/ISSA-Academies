/**
 * The migrations' SQL copy of the phone rule must agree with the app's.
 *
 * Two migrations rewrite stored phone numbers with `pg_temp.normalize_phone`
 * (hardening plan §26). Login compares what the user types, normalized by
 * src/lib/phone.ts, against those stored values as plain strings, so any case
 * where the SQL and the TypeScript disagree is a person who cannot sign in.
 *
 * Runs each migration's function in a throwaway transaction and compares it
 * with normalizePhone over the awkward cases: invisible marks, Arabic and
 * Persian digits, every spelling of an Egyptian mobile, and numbers that must
 * be left alone.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect, afterAll } from '@jest/globals';
import { platformPrisma } from '@/lib/db/platform-client';
import { normalizePhone } from '@/lib/phone';

const MIGRATIONS = [
  'prisma/platform/migrations/20261017000000_normalize_phone_numbers/migration.sql',
  'prisma/tenant/migrations/20261017000000_login_identity/migration.sql',
];

const SAMPLES = [
  '+20 100 123 4567',
  '+20-100-(123)-4567',
  '+20.100.123.4567',
  '‪+201001234567‬',
  '‏+20 100 123 4567',
  '+20 100 123 4567',
  '​0100‍1234567﻿',
  '⁦010⁩ 1234 5678　',
  '0100\t123\n4567',
  '＋201001234567',
  '٠١٠٠١٢٣٤٥٦٧',
  '۰۱۰۰۱۲۳۴۵۶۷',
  '+٢٠ ١٠٠ ١٢٣ ٤٥٦٧',
  '01001234567',
  '01112345678',
  '01212345678',
  '01512345678',
  '201001234567',
  '00201001234567',
  '+2001001234567',
  '(010) 1234-5678',
  '0501234567',
  '+966501234567',
  '0021234567890',
  '01312345678',
  '0100123456',
  '0223456789',
  '01OO1234567',
  '',
];

/** The CREATE FUNCTION statement, exactly as the migration runs it. */
function functionFrom(file: string): string {
  const sql = readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const match = sql.match(/CREATE OR REPLACE FUNCTION pg_temp\.normalize_phone[\s\S]*?\$fn\$;/);
  if (!match) throw new Error(`no pg_temp.normalize_phone in ${file}`);
  return match[0];
}

afterAll(async () => {
  await platformPrisma.$disconnect();
});

describe('pg_temp.normalize_phone matches normalizePhone', () => {
  test.each(MIGRATIONS)('%s', async (file) => {
    const createFunction = functionFrom(file);

    const fromSql = await platformPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(createFunction);
      const rows: string[] = [];
      for (const sample of SAMPLES) {
        const [row] = await tx.$queryRaw<{ phone: string }[]>`
          SELECT pg_temp.normalize_phone(${sample}) AS phone
        `;
        rows.push(row.phone);
      }
      // A pooled backend outlives this transaction; leave nothing behind on it.
      await tx.$executeRawUnsafe('DROP FUNCTION pg_temp.normalize_phone(text)');
      return rows;
    });

    expect(fromSql).toEqual(SAMPLES.map(normalizePhone));
  }, 60_000);

  test('both migrations carry the same function', () => {
    const [platform, tenant] = MIGRATIONS.map(functionFrom);
    expect(tenant).toBe(platform);
  });
});
