import { writeFileSync, readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

// Load the original logo SVG (which already has correct internal transform + viewBox)
const rawLogo = readFileSync('src/assets/logo.svg', 'utf8');

// --- Strategy ---
// The SVG has a viewBox of "0 0 1800 1800" (in pt units from potrace).
// We embed the FULL original SVG as a nested <image> or via <svg> element.
// This is the simplest and most correct approach — no manual transform math needed.

// For the app icon: wrap it in a 256x256 canvas with a dark rounded background,
// sized and padded so the logo fills about 55% of the canvas.
const appIconSvg = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2a2a2e"/>
      <stop offset="100%" stop-color="#0f0f11"/>
    </linearGradient>
    <linearGradient id="border-grad" x1="0" y1="0" x2="0" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"/>
    </linearGradient>
    <clipPath id="round-clip">
      <rect x="0" y="0" width="256" height="256" rx="56"/>
    </clipPath>
  </defs>
  <!-- Rounded dark background card - filling the full size for a larger app icon footprint -->
  <rect x="0" y="0" width="256" height="256" rx="56" fill="url(#bg-grad)"/>
  <rect x="2" y="2" width="252" height="252" rx="54" fill="none" stroke="url(#border-grad)" stroke-width="1.5"/>

  <!-- Embed the full original SVG, scaled to fill the padded area (much larger now) -->
  <svg x="32" y="32" width="192" height="192" viewBox="378 387 1072 1072" preserveAspectRatio="xMidYMid meet">
    ${rawLogo.replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </svg>
</svg>`;

console.log('Rendering App Icon (with background)...');
const appResvg = new Resvg(appIconSvg, { fitTo: { mode: 'width', value: 256 } });
const appPngBuffer = appResvg.render().asPng();
writeFileSync('resources/icon.png', appPngBuffer);

console.log('Generating resources/icon.ico...');
const header = Buffer.from([ 0x00, 0x00, 0x01, 0x00, 0x01, 0x00 ]);
const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0);
dirEntry.writeUInt8(0, 1);
dirEntry.writeUInt8(0, 2);
dirEntry.writeUInt8(0, 3);
dirEntry.writeUInt16LE(1, 4);
dirEntry.writeUInt16LE(32, 6);
dirEntry.writeUInt32LE(appPngBuffer.length, 8);
dirEntry.writeUInt32LE(22, 12);
const icoBuffer = Buffer.concat([header, dirEntry, appPngBuffer]);
writeFileSync('resources/icon.ico', icoBuffer);

// 2. Tray Icon — pure white logo, no background, fills the 256x256 canvas
// Removed internal padding to make it as large as possible in the system tray
const trayIconSvg = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <svg x="0" y="0" width="256" height="256" viewBox="378 387 1072 1072" preserveAspectRatio="xMidYMid meet">
    ${rawLogo.replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </svg>
</svg>`;

console.log('Rendering Tray Icon (pure white, large)...');
const trayResvg = new Resvg(trayIconSvg, { fitTo: { mode: 'width', value: 256 } });
const trayPngBuffer = trayResvg.render().asPng();
writeFileSync('resources/tray.png', trayPngBuffer);

console.log('Icons successfully generated!');
