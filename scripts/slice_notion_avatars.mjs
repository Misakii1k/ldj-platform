import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const sheets = [
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/e2453426-3843-45c5-925a-251c66731f32/notion_avatars_sheet1_notext_1787484074316.jpg',
    startIndex: 1,
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/e2453426-3843-45c5-925a-251c66731f32/notion_avatars_sheet2_1787484050756.jpg',
    startIndex: 17,
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/e2453426-3843-45c5-925a-251c66731f32/notion_avatars_sheet3_1787484099897.jpg',
    startIndex: 33,
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/e2453426-3843-45c5-925a-251c66731f32/notion_avatars_sheet4_1787484120677.jpg',
    startIndex: 49,
  },
];

const outDir = path.resolve('packages/client/public/assets/avatars/notion');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Flood fill helper to transparentize outer background
function floodFillTransparent(rgba, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  // Seed with all border pixels
  for (let x = 0; x < width; x++) {
    queue.push(x, 0);
    queue.push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(0, y);
    queue.push(width - 1, y);
  }

  function isBackground(r, g, b) {
    // Is grey background (neutral saturation, mid luminance) or near grid lines
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    const isGrey = maxDiff <= 20 && r >= 85 && r <= 165;
    return isGrey;
  }

  let head = 0;
  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];
    const idx = y * width + x;

    if (visited[idx]) continue;
    visited[idx] = 1;

    const r = rgba[idx * 4];
    const g = rgba[idx * 4 + 1];
    const b = rgba[idx * 4 + 2];

    if (isBackground(r, g, b)) {
      rgba[idx * 4 + 3] = 0; // make transparent

      // Check 4 neighbors
      if (x > 0 && !visited[idx - 1]) queue.push(x - 1, y);
      if (x < width - 1 && !visited[idx + 1]) queue.push(x + 1, y);
      if (y > 0 && !visited[idx - width]) queue.push(x, y - 1);
      if (y < height - 1 && !visited[idx + width]) queue.push(x, y + 1);
    }
  }

  // Also clean up any isolated border lines (1-2px outer ring)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x <= 2 || x >= width - 3 || y <= 2 || y >= height - 3) {
        const idx = (y * width + x) * 4;
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];
        if (r < 50 && g < 50 && b < 50) {
          // outer grid line remnant
          rgba[idx + 3] = 0;
        }
      }
    }
  }
}

async function processSheets() {
  let count = 0;
  for (const sheet of sheets) {
    const meta = await sharp(sheet.path).metadata();
    const width = meta.width || 1024;
    const height = meta.height || 1024;
    const cellW = Math.floor(width / 4);
    const cellH = Math.floor(height / 4);

    console.log(`Processing ${sheet.path} (${width}x${height}), cell: ${cellW}x${cellH}`);

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const index = sheet.startIndex + row * 4 + col;
        const left = col * cellW;
        const top = row * cellH;

        const rawCell = await sharp(sheet.path)
          .extract({ left, top, width: cellW, height: cellH })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const { data, info } = rawCell;
        const channels = info.channels;

        const rgba = Buffer.alloc(cellW * cellH * 4);
        for (let i = 0; i < cellW * cellH; i++) {
          rgba[i * 4] = data[i * channels];
          rgba[i * 4 + 1] = data[i * channels + 1];
          rgba[i * 4 + 2] = data[i * channels + 2];
          rgba[i * 4 + 3] = 255;
        }

        floodFillTransparent(rgba, cellW, cellH);

        const filename = `notion_${String(index).padStart(2, '0')}.png`;
        const outPath = path.join(outDir, filename);

        await sharp(rgba, {
          raw: {
            width: cellW,
            height: cellH,
            channels: 4,
          },
        })
          .png()
          .toFile(outPath);

        count++;
        console.log(`Saved avatar ${index}: ${filename}`);
      }
    }
  }
  console.log(`Total saved: ${count} avatars in ${outDir}`);
}

processSheets().catch(console.error);
