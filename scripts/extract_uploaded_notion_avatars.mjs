import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const imgPath = 'C:/Users/87850/.gemini/antigravity/brain/e2453426-3843-45c5-925a-251c66731f32/.user_uploaded/media_1787485163493.jpg';
const outDir = path.resolve('packages/client/public/assets/avatars/notion60');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function extractAll() {
  const rowTops = [70, 196, 322, 448, 574];
  const cardWidth = 58;
  const cardHeight = 86;

  let count = 0;

  for (let row = 0; row < 5; row++) {
    const top = rowTops[row];
    for (let col = 0; col < 14; col++) {
      count++;
      const centerX = 40 + col * 72;
      const left = Math.max(0, Math.min(1024 - cardWidth, Math.round(centerX - cardWidth / 2)));

      const filename = `avatar_${String(count).padStart(2, '0')}.png`;
      const outPath = path.join(outDir, filename);

      const cropped = await sharp(imgPath)
        .extract({ left, top, width: cardWidth, height: cardHeight })
        .toBuffer();

      // Expand to 256x256 high-resolution output with warm cream background
      await sharp(cropped)
        .resize(256, 256, {
          fit: 'contain',
          background: { r: 254, g: 250, b: 242, alpha: 1 },
        })
        .png()
        .toFile(outPath);

      console.log(`Extracted ${filename} (row ${row}, col ${col})`);
    }
  }

  console.log(`Successfully extracted all ${count} avatars into ${outDir}`);
}

extractAll().catch(console.error);
