-- Store every phone number in the one form the app now writes and looks up
-- (src/lib/phone.ts; hardening plan §26).
--
-- Login normalizes what the user types (Arabic digits, spaces, the national and
-- international spellings of an Egyptian mobile) and compares it as a plain
-- string, so numbers already stored the old way, exactly as typed, would no
-- longer match. That includes the Super Admin's. This rewrites them once.
--
-- The tenant side is prisma/tenant/migrations/20261017000000_login_identity,
-- applied per academy (npm run migrate:tenants). Apply this one first: login
-- looks numbers up in user_phone_index, which lives here.

-- Keep this function identical to normalizePhone in src/lib/phone.ts, and to its
-- copy in the tenant migration of the same date.
-- tests/integration/phone-normalization-sql.test.ts runs both copies against the
-- TypeScript version. pg_temp: it lasts only as long as this migration's session.
CREATE OR REPLACE FUNCTION pg_temp.normalize_phone(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  p text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  -- Arabic-Indic and Persian digits to ASCII, full-width plus to "+".
  p := translate(raw,
    U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9\FF0B',
    '01234567890123456789+');
  -- Invisible marks, spaces of every kind, dashes, dots and brackets.
  p := regexp_replace(p,
    '[\u0009-\u000D    -‏ -  ⁦-⁩　﻿().-]',
    '', 'g');
  -- 00 is the international call prefix.
  IF left(p, 2) = '00' THEN
    p := '+' || substr(p, 3);
  END IF;
  -- Egyptian mobiles, in every spelling, become +201x...
  IF p ~ '^01[0125][0-9]{8}$' THEN
    RETURN '+20' || substr(p, 2);
  ELSIF p ~ '^201[0125][0-9]{8}$' THEN
    RETURN '+' || p;
  ELSIF p ~ '^\+2001[0125][0-9]{8}$' THEN
    RETURN '+20' || substr(p, 5);
  END IF;
  RETURN p;
END;
$fn$;

-- Refuse if two Super Admins, or two login entries in one academy, would end up
-- with the same number. Merging them is a decision about real accounts.
DO $$
DECLARE
  admins integer;
  entries integer;
BEGIN
  SELECT COUNT(*) INTO admins
  FROM (
    SELECT pg_temp.normalize_phone("phone_number")
    FROM "super_admins"
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) duplicated;

  SELECT COUNT(*) INTO entries
  FROM (
    SELECT pg_temp.normalize_phone("phone_number"), "tenant_id"
    FROM "user_phone_index"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) duplicated;

  IF admins > 0 OR entries > 0 THEN
    RAISE EXCEPTION
      'Normalizing phone numbers would merge % Super Admin number(s) and % login entr(ies). '
      'Give each account its own number, then re-run.',
      admins, entries;
  END IF;
END $$;

UPDATE "super_admins"
SET "phone_number" = pg_temp.normalize_phone("phone_number")
WHERE "phone_number" IS DISTINCT FROM pg_temp.normalize_phone("phone_number");

UPDATE "user_phone_index"
SET "phone_number" = pg_temp.normalize_phone("phone_number")
WHERE "phone_number" IS DISTINCT FROM pg_temp.normalize_phone("phone_number");

UPDATE "tenants"
SET "contact_phone" = pg_temp.normalize_phone("contact_phone")
WHERE "contact_phone" IS DISTINCT FROM pg_temp.normalize_phone("contact_phone");

UPDATE "marketing_leads"
SET "phone" = pg_temp.normalize_phone("phone")
WHERE "phone" IS DISTINCT FROM pg_temp.normalize_phone("phone");
