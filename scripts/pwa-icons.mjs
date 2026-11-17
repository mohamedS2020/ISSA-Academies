/**
 * Render the installed-app icons (PNG) from the brand and sport marks.
 *
 *     node scripts/pwa-icons.mjs
 *
 * Run it after changing a mark (scripts/sport-marks.py) and commit the PNGs:
 * phones and browsers want PNG for home-screen icons, not SVG.
 *
 * Platform (public/):
 *   icon-maskable-512.png   Yallacademy symbol on Midnight, inside the safe zone
 * Each sport (public/sports/<key>/):
 *   icon-192.png, icon-512.png  the logo tile, rounded ("any")
 *   icon-maskable-512.png       app-icon.svg, full bleed ("maskable")
 *   apple-touch-icon.png        180 px, full bleed (iOS rounds it itself)
 *
 * The platform's icon-192/512 and apple-touch-icon.png come from the brand
 * package and are left alone.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const render = (svg, size, out) =>
  sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out);

// Platform maskable: the brand favicon's drawing at 85%, its tile colour to the edges.
const brand = readFileSync(join(root, 'favicon.svg'), 'utf8');
const tile = /<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(brand)[1];
const drawing = brand.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect[^>]*\/>/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${tile}"/><g transform="translate(76.8 76.8) scale(0.85)">${drawing}</g></svg>`;
await render(maskable, 512, join(root, 'icon-maskable-512.png'));

for (const key of readdirSync(join(root, 'sports'))) {
  const dir = join(root, 'sports', key);
  const logo = readFileSync(join(dir, 'logo.svg'), 'utf8');
  const app = readFileSync(join(dir, 'app-icon.svg'), 'utf8');
  await render(logo, 192, join(dir, 'icon-192.png'));
  await render(logo, 512, join(dir, 'icon-512.png'));
  await render(app, 512, join(dir, 'icon-maskable-512.png'));
  await render(app, 180, join(dir, 'apple-touch-icon.png'));
}
console.log('PWA icons written');
