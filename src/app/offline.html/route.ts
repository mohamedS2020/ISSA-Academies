/**
 * GET /offline.html — what the installed app shows when a page can't load
 * because the phone is offline. public/sw.js stores it when it installs and
 * serves it in place of any page that fails to load.
 *
 * Self-contained like the root 404 (src/app/not-found.tsx): one HTML file
 * with its styles inline, so it renders with no network at all. The brand
 * colours go in as values from BRAND_COLORS; the symbol is the brand
 * package's file, which the service worker stores with the page. Both
 * languages, since the worker serves the same copy to every page.
 */
import { APP_NAME } from '@/lib/config/brand';
import { BRAND_COLORS as C, brandRgba } from '@/lib/config/brand-colors';

const STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center;
    padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    background: ${C.mist}; color: ${C.midnight};
    font-family: "Readex Pro", "Segoe UI", Tahoma, system-ui, sans-serif; line-height: 1.6;
  }
  .card {
    width: 100%; max-width: 480px; text-align: center; background: ${C.white};
    border: 1px solid ${C.line}; border-radius: 24px; padding: 32px 24px;
    box-shadow: 0 12px 32px -12px ${brandRgba('midnight', 0.18)};
  }
  .mark { width: 40px; height: 40px; margin: 0 auto 24px; display: block; }
  .copy { display: grid; gap: 20px; margin: 0 0 28px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  p { margin: 0; font-size: 15px; color: ${C.slate}; }
  button {
    min-height: 48px; padding: 0 28px; border: 0; border-radius: 10px; cursor: pointer;
    background: ${C['deep-sea']}; color: ${C.white}; font: inherit; font-weight: 500;
  }
  button:hover { background: ${C['deepsea-800']}; }
  button:focus-visible { outline: 3px solid ${C.lagoon}; outline-offset: 3px; }
  .dark-only { display: none; }
  @media (prefers-color-scheme: dark) {
    body { background: ${C.midnight}; color: ${C.white}; }
    .card { background: ${C['midnight-2']}; border-color: ${brandRgba('white', 0.1)}; }
    p { color: ${C['on-dark-muted']}; }
    .light-only { display: none; }
    .dark-only { display: block; }
  }
`;

const HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${APP_NAME}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="card">
  <img class="mark light-only" src="/assets/img/symbol-small.svg" alt="${APP_NAME}">
  <img class="mark dark-only" src="/assets/img/symbol-small-white.svg" alt="${APP_NAME}">
  <div class="copy">
    <div>
      <h1>أنت غير متصل بالإنترنت</h1>
      <p>هذه الصفحة تحتاج إلى الإنترنت. تحقّق من اتصالك ثم حاول مرة أخرى.</p>
    </div>
    <div dir="ltr" lang="en">
      <h1>You're offline</h1>
      <p>This page needs the internet. Check your connection, then try again.</p>
    </div>
  </div>
  <button type="button" id="retry">حاول مرة أخرى · <span lang="en">Try again</span></button>
</main>
<script>
  document.getElementById('retry').addEventListener('click', function () { location.reload(); });
  window.addEventListener('online', function () { location.reload(); });
</script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
