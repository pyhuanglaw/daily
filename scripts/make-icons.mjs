// Renders the PNG app icons from SVG with Playwright's Chromium.
// Usage: npm run icons   (icons are committed, so this is only needed after design changes)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

// Full-bleed square (iOS and Android apply their own rounded mask).
const svg = (scale = 1) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" fill="#fbf5df"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="178" fill="none" stroke="#d9cdf5" stroke-width="26" stroke-linecap="round"
      stroke-dasharray="930 190" transform="rotate(-18 256 256)"/>
    <circle cx="256" cy="256" r="128" fill="#7f63c9"/>
    <path d="M196 260l42 42 82-90" fill="none" stroke="#fff" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const targets = [
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Maskable: keep everything inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.86 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;width:${t.size}px;height:${t.size}px;overflow:hidden">${svg(t.scale)}</body></html>`,
  );
  await page.screenshot({ path: `${OUT}/${t.file}`, omitBackground: false });
  console.log('wrote', `${OUT}/${t.file}`);
}
await browser.close();
