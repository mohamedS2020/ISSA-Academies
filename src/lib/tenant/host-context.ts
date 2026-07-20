/**
 * ISSA — Academy host context (subdomain → tenant).
 *
 * Server-only (uses next/headers + platformPrisma). Do not import from Client
 * Components.
 *
 * proxy.ts resolves the request's subdomain to an academy slug and forwards it
 * as the trusted `x-academy-slug` header. This helper turns that into the
 * academy's public branding (name + sport theme) for server-side rendering of
 * public/login pages. Wrapped in React `cache()` so the layout and
 * generateMetadata share a single DB lookup per request.
 *
 * NOTE: this is for THEMING/branding of public pages only. It never grants data
 * access — tenant authorization is always the JWT (see proxy.ts).
 */

import { cache } from 'react';
import { headers } from 'next/headers';
import { platformPrisma } from '@/lib/db/platform-client';
import { resolveSport, type SportKey } from '@/lib/theme/sports';

export interface AcademyHostContext {
  tenantId: string;
  slug: string;
  name: string;
  sport: SportKey;
}

export const getAcademyHostContext = cache(
  async (): Promise<AcademyHostContext | null> => {
    const slug = (await headers()).get('x-academy-slug');
    if (!slug) return null;

    const tenant = await platformPrisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        config: { select: { themeKey: true } },
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') return null;

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      sport: resolveSport(tenant.config?.themeKey),
    };
  }
);
