/**
 * GET /app.webmanifest?locale=ar — the installable app's manifest for this
 * host (see src/lib/pwa/manifest.ts). Dynamic: it depends on the academy
 * subdomain the request came in on.
 */
import type { NextRequest } from 'next/server';
import { getAcademyHostContext } from '@/lib/tenant/host-context';
import { buildManifest } from '@/lib/pwa/manifest';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const academy = await getAcademyHostContext();
  const manifest = buildManifest(request.nextUrl.searchParams.get('locale'), academy);
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Short: an academy can rename itself or change its sport.
      'Cache-Control': 'public, max-age=3600',
      Vary: 'Host',
    },
  });
}
