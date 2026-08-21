import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = path.resolve('packages/client/public/assets/icons');

const ICONS = {
  uno_wild: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <radialGradient id="rimGrad" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#FFF9C4" />
          <stop offset="40%" stop-color="#FFD54F" />
          <stop offset="100%" stop-color="#FF8F00" />
        </radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <circle cx="64" cy="64" r="54" fill="url(#rimGrad)" filter="url(#shadow)" />
      <circle cx="64" cy="64" r="46" fill="#18181B" stroke="#FFFFFF" stroke-width="4" />
      <path d="M 64,64 L 64,22 A 42 42 0 0 1 106,64 Z" fill="#EF4444" />
      <path d="M 64,64 L 106,64 A 42 42 0 0 1 64,106 Z" fill="#3B82F6" />
      <path d="M 64,64 L 64,106 A 42 42 0 0 1 22,64 Z" fill="#EAB308" />
      <path d="M 64,64 L 22,64 A 42 42 0 0 1 64,22 Z" fill="#22C55E" />
      <circle cx="64" cy="64" r="14" fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.4))" />
      <polygon points="64,54 67,61 74,64 67,67 64,74 61,67 54,64 61,61" fill="#FF8F00" />
    </svg>
  `,

  uno_skip: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <linearGradient id="skipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF5252" />
          <stop offset="100%" stop-color="#B71C1C" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <circle cx="64" cy="64" r="52" fill="url(#skipGrad)" stroke="#FFFFFF" stroke-width="8" filter="url(#shadow)" />
      <circle cx="64" cy="64" r="44" fill="none" stroke="#7F1D1D" stroke-width="4" />
      <line x1="32" y1="32" x2="96" y2="96" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" />
      <line x1="32" y1="32" x2="96" y2="96" stroke="#7F1D1D" stroke-width="6" stroke-linecap="round" />
    </svg>
  `,

  uno_reverse: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <linearGradient id="revGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#0369A1" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <circle cx="64" cy="64" r="52" fill="url(#revGrad)" stroke="#FFFFFF" stroke-width="8" filter="url(#shadow)" />
      <g fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))">
        <!-- Top Arrow (left) -->
        <path d="M 32,46 L 56,26 L 56,38 L 86,38 C 96,38 100,44 100,54 L 88,54 C 88,48 86,48 80,48 L 56,48 L 56,60 Z" />
        <!-- Bottom Arrow (right) -->
        <path d="M 96,82 L 72,102 L 72,90 L 42,90 C 32,90 28,84 28,74 L 40,74 C 40,80 42,80 48,80 L 72,80 L 72,68 Z" />
      </g>
    </svg>
  `,

  uno_draw2: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <linearGradient id="cardGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4ADE80" />
          <stop offset="100%" stop-color="#15803D" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <rect x="22" y="24" width="46" height="70" rx="8" fill="#FFFFFF" stroke="#0F172A" stroke-width="4" transform="rotate(-15 45 59)" />
        <rect x="52" y="30" width="46" height="70" rx="8" fill="url(#cardGrad1)" stroke="#FFFFFF" stroke-width="5" transform="rotate(10 75 65)" />
      </g>
      <text x="64" y="82" font-family="'Impact', 'Arial Black', sans-serif" font-weight="900" font-size="44" font-style="italic" fill="#FFFFFF" text-anchor="middle" stroke="#0F172A" stroke-width="8" paint-order="stroke fill" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.6))">+2</text>
    </svg>
  `,

  uno_draw4: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.5" />
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <rect x="24" y="26" width="36" height="54" rx="6" fill="#EF4444" stroke="#FFFFFF" stroke-width="3" transform="rotate(-24 42 53)" />
        <rect x="42" y="20" width="36" height="54" rx="6" fill="#3B82F6" stroke="#FFFFFF" stroke-width="3" transform="rotate(-8 60 47)" />
        <rect x="62" y="22" width="36" height="54" rx="6" fill="#EAB308" stroke="#FFFFFF" stroke-width="3" transform="rotate(10 80 49)" />
        <rect x="78" y="28" width="36" height="54" rx="6" fill="#22C55E" stroke="#FFFFFF" stroke-width="3" transform="rotate(26 96 55)" />
      </g>
      <text x="64" y="88" font-family="'Impact', 'Arial Black', sans-serif" font-weight="900" font-size="52" font-style="italic" fill="#FFFFFF" text-anchor="middle" stroke="#0F172A" stroke-width="10" paint-order="stroke fill" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.8))">+4</text>
    </svg>
  `,

  uno_alert: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <radialGradient id="alertGrad" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#FDE047" />
          <stop offset="60%" stop-color="#EAB308" />
          <stop offset="100%" stop-color="#CA8A04" />
        </radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <polygon points="64,8 78,42 116,36 94,66 118,98 82,96 64,124 46,96 10,98 34,66 12,36 50,42" fill="url(#alertGrad)" stroke="#FFFFFF" stroke-width="4" />
      </g>
      <text x="64" y="74" font-family="'Impact', 'Arial Black', sans-serif" font-weight="900" font-size="34" font-style="italic" fill="#DC2626" text-anchor="middle" stroke="#FFFFFF" stroke-width="6" paint-order="stroke fill">UNO!</text>
    </svg>
  `,

  uno_challenge: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <linearGradient id="chalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#A855F7" />
          <stop offset="100%" stop-color="#6B21A8" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <circle cx="64" cy="64" r="52" fill="url(#chalGrad)" stroke="#FFFFFF" stroke-width="8" filter="url(#shadow)" />
      <!-- Magnifying Glass / Scale -->
      <g stroke="#FFFFFF" stroke-width="6" fill="none" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))">
        <circle cx="56" cy="54" r="24" stroke-width="8" fill="#F3E8FF" fill-opacity="0.2" />
        <line x1="74" y1="72" x2="98" y2="96" stroke-width="12" stroke-linecap="round" />
        <text x="56" y="63" font-family="'Impact', 'Arial Black', sans-serif" font-weight="900" font-size="28" fill="#FFFFFF" text-anchor="middle" stroke="none">?</text>
      </g>
    </svg>
  `
};

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const [name, svg] of Object.entries(ICONS)) {
    const dest = path.join(OUT_DIR, `${name}.png`);
    const buf = Buffer.from(svg.trim(), 'utf8');
    await sharp(buf)
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(dest);
    console.log(`Generated icon: ${name}.png`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
