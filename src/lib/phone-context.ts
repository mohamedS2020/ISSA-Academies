/**
 * Which country a local phone number is read in, per request (server-only).
 *
 * src/lib/phone.ts reads a number typed the local way ("0501234567") in "the
 * current country". On the server that is the academy of the request: withAuth
 * runs each tenant request inside withPhoneCountry(academy's country), so
 * every schema's phoneNumberField(), search and import reads numbers the way
 * that academy writes them, with no country argument threaded through. Outside
 * a request (jobs, scripts, the super admin), Egypt.
 *
 * The country comes from the academy's currency (fixed at creation), so it is
 * cached per process without expiry.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { setPhoneCountryResolver, type PhoneCountry } from './phone';
import { CURRENCIES } from './format/currency';
import { getAcademyCurrency } from '@/services/display-settings.service';

const store = new AsyncLocalStorage<PhoneCountry>();
setPhoneCountryResolver(() => store.getStore() ?? 'EG');

export function withPhoneCountry<T>(country: PhoneCountry, run: () => T): T {
  return store.run(country, run);
}

const countries = new Map<string, PhoneCountry>();

/** The academy's phone country, from its currency. */
export async function academyPhoneCountry(tenantId: string): Promise<PhoneCountry> {
  const known = countries.get(tenantId);
  if (known) return known;
  try {
    const country = CURRENCIES[await getAcademyCurrency(tenantId)].country;
    countries.set(tenantId, country);
    return country;
  } catch (err) {
    // Never fail a request over this: read numbers as Egyptian (as before Gulf
    // academies) and try again next time.
    console.error('[phone-context] academy country lookup failed', err);
    return 'EG';
  }
}
