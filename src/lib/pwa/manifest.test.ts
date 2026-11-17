import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildManifest } from './manifest';
import { SPORT_KEYS } from '@/lib/theme/sports';

const publicFile = (src: string) => join(__dirname, '..', '..', '..', 'public', src);

describe('the installable app manifest', () => {
  it('is the platform app on the main domain, in the page language', () => {
    const m = buildManifest('ar', null);
    expect(m).toMatchObject({ name: 'يلّا أكاديمي', lang: 'ar', dir: 'rtl', start_url: '/ar/login', scope: '/', display: 'standalone' });
    expect(buildManifest('en', null)).toMatchObject({ name: 'Yallacademy', dir: 'ltr', start_url: '/en/login' });
  });

  it('falls back to English for an unknown locale', () => {
    expect(buildManifest('fr', null).start_url).toBe('/en/login');
    expect(buildManifest(null, null).lang).toBe('en');
  });

  it("is the academy's app on its subdomain, with its sport's icons", () => {
    const m = buildManifest('en', { name: 'Aqua Stars', sport: 'swimming' });
    expect(m.name).toBe('Aqua Stars');
    expect(m.icons?.map((i) => i.src)).toEqual([
      '/sports/swimming/icon-192.png',
      '/sports/swimming/icon-512.png',
      '/sports/swimming/icon-maskable-512.png',
    ]);
  });

  it('points only at icons that exist, with a maskable one, for every sport', () => {
    for (const academy of [null, ...SPORT_KEYS.map((sport) => ({ name: 'A', sport }))]) {
      const icons = buildManifest('en', academy).icons ?? [];
      expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
      for (const icon of icons) expect(existsSync(publicFile(icon.src))).toBe(true);
    }
    for (const sport of SPORT_KEYS) expect(existsSync(publicFile(`/sports/${sport}/apple-touch-icon.png`))).toBe(true);
  });
});
