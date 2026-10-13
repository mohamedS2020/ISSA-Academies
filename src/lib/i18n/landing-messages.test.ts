/**
 * The two landing-page message files must have exactly the same shape: same
 * keys, same list lengths, same placeholders. A key missing in one language
 * would render an error string on the live page.
 */

import { describe, it, expect } from '@jest/globals';
import en from '@/messages/landing/en.json';
import ar from '@/messages/landing/ar.json';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Every leaf path, with list lengths and ICU placeholders made explicit. */
function shape(value: Json, path = ''): string[] {
  if (Array.isArray(value)) {
    return [`${path}[length=${value.length}]`, ...value.flatMap((item, index) => shape(item, `${path}[${index}]`))];
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape(value[key], path ? `${path}.${key}` : key));
  }
  const placeholders = typeof value === 'string' ? (value.match(/\{\w+\}/g) ?? []).sort().join(',') : '';
  return [`${path}${placeholders ? ` {${placeholders}}` : ''}`];
}

describe('landing messages', () => {
  it('have the same keys, list lengths and placeholders in English and Arabic', () => {
    expect(shape(ar as Json)).toEqual(shape(en as Json));
  });

  it('contain no empty strings', () => {
    const empty = (value: Json, path: string): string[] =>
      typeof value === 'string'
        ? value.trim() === ''
          ? [path]
          : []
        : Array.isArray(value)
          ? value.flatMap((item, index) => empty(item, `${path}[${index}]`))
          : value && typeof value === 'object'
            ? Object.entries(value).flatMap(([key, item]) => empty(item, `${path}.${key}`))
            : [];
    expect([...empty(en as Json, 'en'), ...empty(ar as Json, 'ar')]).toEqual([]);
  });
});
