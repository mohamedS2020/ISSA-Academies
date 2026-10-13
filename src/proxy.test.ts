/**
 * proxy.ts routing: the marketing site on the platform host, and academy
 * subdomains untouched.
 *
 * The academy header is safety-relevant (it scopes login to an academy), so
 * these tests pin exactly when it is set, cleared and never forwarded.
 */

import { describe, it, expect, afterAll, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

type ProxyModule = typeof import('./proxy');

const originalRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
afterAll(() => {
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = originalRootDomain;
});

/** ROOT_DOMAIN is read at module load, so load a fresh copy per domain. */
function loadProxy(rootDomain: string): ProxyModule['proxy'] {
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = rootDomain;
  let mod: ProxyModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./proxy') as ProxyModule;
  });
  return mod!.proxy;
}

function request(url: string, headers: Record<string, string> = {}) {
  const { host } = new URL(url);
  return new NextRequest(url, { headers: { host, ...headers } });
}

const rewriteOf = (response: Response) => response.headers.get('x-middleware-rewrite');
const forwardedSlug = (response: Response) => response.headers.get('x-middleware-request-x-academy-slug');
const overriddenHeaders = (response: Response) =>
  (response.headers.get('x-middleware-override-headers') ?? '').split(',');

describe('production domain', () => {
  const proxy = loadProxy('yallacademy.com');

  it('serves the English landing page at /', () => {
    const response = proxy(request('https://yallacademy.com/'));
    expect(rewriteOf(response)).toBe('https://yallacademy.com/marketing/en');
  });

  it('serves the Arabic landing page at /ar', () => {
    const response = proxy(request('https://yallacademy.com/ar'));
    expect(rewriteOf(response)).toBe('https://yallacademy.com/marketing/ar');
  });

  it('redirects /en to / permanently, keeping the query', () => {
    const response = proxy(request('https://yallacademy.com/en?utm_source=x'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://yallacademy.com/?utm_source=x');
  });

  it('redirects www to the bare domain, keeping path and query', () => {
    const response = proxy(request('https://www.yallacademy.com/en/login?next=1'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://yallacademy.com/en/login?next=1');
  });

  it('leaves app routes on the platform host alone', () => {
    const response = proxy(request('https://yallacademy.com/en/login'));
    expect(rewriteOf(response)).toBeNull();
    expect(response.headers.get('location')).toBeNull();
  });

  it('never forwards a client-supplied academy header on the platform host', () => {
    for (const path of ['/', '/en/login']) {
      const response = proxy(request(`https://yallacademy.com${path}`, { 'x-academy-slug': 'evil' }));
      expect(forwardedSlug(response)).toBeNull();
    }
  });

  it('keeps sending academy subdomains to the app, not the landing page', () => {
    const response = proxy(request('https://aqua.yallacademy.com/', { 'accept-language': 'ar' }));
    expect(rewriteOf(response)).toBeNull();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://aqua.yallacademy.com/ar');
  });

  it('serves the academy app at /en and /ar on a subdomain, with the trusted header', () => {
    for (const path of ['/en', '/ar']) {
      const response = proxy(request(`https://aqua.yallacademy.com${path}`, { 'x-academy-slug': 'evil' }));
      expect(rewriteOf(response)).toBeNull();
      expect(forwardedSlug(response)).toBe('aqua');
      expect(overriddenHeaders(response)).toContain('x-academy-slug');
    }
  });

  it('does not show the landing page on reserved subdomains', () => {
    const response = proxy(request('https://admin.yallacademy.com/', { 'accept-language': 'en' }));
    expect(rewriteOf(response)).toBeNull();
  });

  it('lets API routes and static files through', () => {
    for (const path of ['/api/health', '/llms.txt', '/assets/img/og-en.png']) {
      const response = proxy(request(`https://yallacademy.com${path}`));
      expect(rewriteOf(response)).toBeNull();
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it('serves the landing page on a host outside the domain (the Railway URL)', () => {
    const response = proxy(request('https://academy-platform.up.railway.app/'));
    expect(rewriteOf(response)).toBe('https://academy-platform.up.railway.app/marketing/en');
  });
});

describe('development (localhost)', () => {
  const proxy = loadProxy('localhost');

  it('serves the landing page on localhost', () => {
    const response = proxy(request('http://localhost:3000/'));
    expect(rewriteOf(response)).toBe('http://localhost:3000/marketing/en');
  });

  it('does not redirect www in development', () => {
    const response = proxy(request('http://www.localhost:3000/'));
    expect(response.status).not.toBe(308);
  });

  it('routes academy subdomains of localhost to the app', () => {
    const response = proxy(request('http://aqua.localhost:3000/en'));
    expect(rewriteOf(response)).toBeNull();
    expect(forwardedSlug(response)).toBe('aqua');
  });
});
