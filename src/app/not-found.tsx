import Link from 'next/link';
import { APP_NAME } from '@/lib/config/brand';

/**
 * The 404 for URLs no route matches (the app's own pages use
 * [locale]/not-found.tsx).
 *
 * Deliberately a server component with its styles inline: as the root
 * layout's not-found boundary, anything it imported (a stylesheet, client
 * code) would be loaded on every page of the site, the landing page included.
 * Colours are the brand palette (src/styles/brand-tokens.css).
 */

const STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: #EEF4F4; color: #001219;
    font-family: "Readex Pro", "Segoe UI", Tahoma, system-ui, sans-serif; line-height: 1.6;
  }
  .card {
    width: 100%; max-width: 560px; text-align: center; background: #FFFFFF;
    border: 1px solid #D6E2E3; border-radius: 24px; padding: 40px 32px;
    box-shadow: 0 12px 32px -12px rgba(0, 18, 25, .18);
  }
  .code { margin: 0; font-size: 72px; font-weight: 700; line-height: 1; color: #005F73; }
  .eyebrow { margin: 12px 0 0; font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #005F73; }
  .copy { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0; padding: 24px 0; border-block: 1px solid #D6E2E3; text-align: start; }
  .copy h2 { margin: 0 0 6px; font-size: 17px; }
  .copy p { margin: 0; font-size: 14px; color: #4F6268; }
  .home {
    display: inline-flex; align-items: center; min-height: 48px; padding: 0 28px; border-radius: 10px;
    background: #005F73; color: #FFFFFF; font-weight: 500; text-decoration: none;
  }
  .home:hover { background: #00313D; }
  .home:focus-visible { outline: 3px solid #0A9396; outline-offset: 3px; }
  @media (max-width: 560px) { .copy { grid-template-columns: 1fr; } }
  @media (prefers-color-scheme: dark) {
    body { background: #001219; color: #FFFFFF; }
    .card { background: #04222C; border-color: rgba(255, 255, 255, .1); }
    .code, .eyebrow { color: #84C9CA; }
    .copy { border-color: rgba(255, 255, 255, .1); }
    .copy p { color: #A9BFC4; }
  }
`;

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <head>
        <title>{`404 - Page Not Found | ${APP_NAME}`}</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <main className="card">
          <h1 className="code">404</h1>
          <p className="eyebrow">Out of Bounds / خارج الحدود</p>
          <div className="copy">
            <div>
              <h2>Page Not Found</h2>
              <p>
                The page you are looking for might have been removed, had its name changed, or is temporarily
                unavailable.
              </p>
            </div>
            <div dir="rtl" lang="ar">
              <h2>الصفحة غير موجودة</h2>
              <p>قد تكون الصفحة التي تبحث عنها قد تمت إزالتها أو تم تغيير اسمها أو أنها غير متاحة مؤقتاً.</p>
            </div>
          </div>
          <Link className="home" href="/">
            Back to Safety / العودة للرئيسية
          </Link>
        </main>
      </body>
    </html>
  );
}
