// Regenerates the favicon/PWA icon set from the header "route" mark.
// Run from the project root: `node scripts/generate-icons.mjs`
// sharp isn't a direct dependency (Astro pulls it in), so resolve it from the pnpm store.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const pnpmDir = path.join(root, 'node_modules/.pnpm');
const sharpPkg = fs.readdirSync(pnpmDir).find((d) => d.startsWith('sharp@'));
if (!sharpPkg) throw new Error('sharp not found in node_modules/.pnpm — run `pnpm install` first.');
const sharp = require(path.join(pnpmDir, sharpPkg, 'node_modules/sharp'));

const SURFACE = '#121413';
const ORANGE = '#fa5c1c';
const pub = path.join(root, 'public');

// The Lucide "route" glyph, drawn in a 24-unit box, centered into `size`.
// `scale` controls padding: smaller = more padding (maskable needs a safe zone).
const glyph = (size, scale, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" ${rounded ? 'rx="7"' : ''} fill="${SURFACE}" />
  <g transform="translate(16 16) scale(${scale}) translate(-12 -12)" fill="none" stroke="${ORANGE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="19" r="3" />
    <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
    <circle cx="18" cy="5" r="3" />
  </g>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// Maskable PWA / Google / Apple icons: full-bleed square bg, content in the safe zone.
const maskable = (size) => png(glyph(size, 0.78, false), size);
// Tab favicon renders: rounded, less padding.
const tab = (size) => png(glyph(size, 0.9, true), size);

function buildIco(pngs) {
  // ICONDIR + one ICONDIRENTRY per image, each wrapping a PNG (valid for modern consumers).
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  const images = [];
  let offset = 6 + count * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
    images.push(data);
  }
  return Buffer.concat([header, ...entries, ...images]);
}

const out = (name, buf) => {
  fs.writeFileSync(path.join(pub, name), buf);
  console.log('wrote', name, buf.length, 'bytes');
};

const [m192, m512, apple, i16, i32, i48] = await Promise.all([
  maskable(192),
  maskable(512),
  maskable(180),
  tab(16),
  tab(32),
  tab(48),
]);

out('favicon-192.png', m192);
out('favicon-512.png', m512);
out('apple-touch-icon.png', apple);
out('favicon.ico', buildIco([
  { size: 16, data: i16 },
  { size: 32, data: i32 },
  { size: 48, data: i48 },
]));
