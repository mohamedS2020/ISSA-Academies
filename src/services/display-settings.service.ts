/**
 * How an academy shows money and time: its currency (fixed when the academy
 * is created) and each branch's time format (12- or 24-hour, the branch
 * admin's choice). Both live in the platform's tenant_configs row.
 */
import { platformPrisma } from '@/lib/db/platform-client';
import type { PhoneCountry } from '@/lib/phone';
import {
  CURRENCIES,
  DEFAULT_TIME_FORMAT,
  isTimeFormat,
  resolveCurrency,
  type CurrencyCode,
  type TimeFormat,
} from '@/lib/format/currency';

export interface DisplaySettings {
  currency: CurrencyCode;
  timeFormat: TimeFormat;
  /** From the currency: how local phone numbers are read and shown. */
  country: PhoneCountry;
}

type FormatMap = Record<string, unknown>;

async function readConfig(tenantId: string) {
  return platformPrisma.tenantConfig.findUnique({
    where: { tenantId },
    select: { currency: true, branchTimeFormats: true },
  });
}

/** The branch's time format from the stored map; 12-hour when unset. */
function timeFormatOf(map: unknown, branchId: string): TimeFormat {
  const value = (map as FormatMap | null)?.[branchId];
  return isTimeFormat(value) ? value : DEFAULT_TIME_FORMAT;
}

export async function getDisplaySettings(tenantId: string, branchId: string | null): Promise<DisplaySettings> {
  const config = tenantId ? await readConfig(tenantId) : null;
  const currency = resolveCurrency(config?.currency);
  return {
    currency: currency.code,
    country: CURRENCIES[currency.code].country,
    timeFormat: branchId ? timeFormatOf(config?.branchTimeFormats, branchId) : DEFAULT_TIME_FORMAT,
  };
}

/** The academy's currency, for server-side output (receipt PDFs, exports). */
export async function getAcademyCurrency(tenantId: string): Promise<CurrencyCode> {
  return resolveCurrency((await readConfig(tenantId))?.currency).code;
}

/** Each branch's time format, for the branch list. */
export async function getBranchTimeFormats(tenantId: string): Promise<(branchId: string) => TimeFormat> {
  const map = (await readConfig(tenantId))?.branchTimeFormats;
  return (branchId) => timeFormatOf(map, branchId);
}

/**
 * Set one branch's time format. One atomic statement merging the key into the
 * map, so two admins changing two branches at once can't overwrite each other
 * (a read-modify-write of the JSON would).
 */
export async function setBranchTimeFormat(tenantId: string, branchId: string, timeFormat: TimeFormat): Promise<void> {
  await platformPrisma.$executeRaw`
    UPDATE "tenant_configs"
    SET "branch_time_formats" = "branch_time_formats" || jsonb_build_object(${branchId}::text, ${timeFormat}::text),
        "updated_at" = NOW()
    WHERE "tenant_id" = ${tenantId}::uuid
  `;
}
