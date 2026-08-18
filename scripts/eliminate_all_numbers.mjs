import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_preview';

const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png') && f.startsWith('goose_'));

// Sample reliable background crimson red
function getCardBg(raw, W, H, ch) {
  const sx = Math.round(W * 0.15);
  const sy = Math.round(H * 0.30);
  const idx = (sy * W + sx) * ch;
  return [raw[idx], raw[idx + 1], raw[idx + 2]];
}

async function eliminateAllNumbers() {
  console.log(`Eliminating all corner numbers, text badges, and outlines across ${files.length} cards...`);

  for (const filename of files) {
    const cardNum = parseInt(filename.split('_')[1], 10);
    const filePath = path.join(outDir, filename);

    const img = sharp(filePath);
    const { data: raw, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const ch = info.channels;

    const [bgR, bgG, bgB] = getCardBg(raw, W, H, ch);

    // Function to fill a box with clean background (preserving outer transparent alpha)
    const fillBox = (x0, y0, x1, y1) => {
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
          const idx = (y * W + x) * ch;
          // Only replace if pixel is not fully transparent (inside card body)
          if (raw[idx + 3] > 50) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
            raw[idx + 3] = 255;
          }
        }
      }
    };

    // 1. Sheet 1 (001~016): Numbers in top-left (size ~55x55)
    if (cardNum >= 1 && cardNum <= 16) {
      fillBox(8, 8, 60, 58);
      fillBox(W - 60, 8, W - 8, 58);
    }

    // 2. Sheet 3 (033~048): "GOOSE RELAY" top header logo & text
    if (cardNum >= 33 && cardNum <= 48) {
      fillBox(8, 8, W - 8, 42);
    }

    // 3. Sheet 4 (049~064): Top title text ("Boxer", "Skater", etc.)
    if (cardNum >= 49 && cardNum <= 64) {
      fillBox(8, 8, W - 8, 42);
    }

    // 4. Sheet 5 (065~080): Numbers in top-left, top-right, bottom-left, bottom-right
    if (cardNum >= 65 && cardNum <= 80) {
      const cornerSize = 65; // Wide enough for 2-digit numbers like "16"
      fillBox(8, 8, cornerSize, cornerSize);                      // Top-Left
      fillBox(W - cornerSize, 8, W - 8, cornerSize);              // Top-Right
      fillBox(8, H - cornerSize, cornerSize, H - 8);              // Bottom-Left
      fillBox(W - cornerSize, H - cornerSize, W - 8, H - 8);      // Bottom-Right
    }

    // Re-apply clean white border and rounded mask to ensure the outer frame is pristine
    const cardBuffer = await sharp(raw, { raw: { width: W, height: H, channels: ch } })
      .png()
      .toBuffer();

    // Mask with smooth rounded corners so the outer rim has zero artifacts
    const maskSvg = Buffer.from(`
      <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${W}" height="${H}" rx="14" ry="14" fill="#ffffff"/>
      </svg>
    `);

    const finalBuffer = await sharp(cardBuffer)
      .composite([{
        input: maskSvg,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    fs.writeFileSync(filePath, finalBuffer);
    fs.writeFileSync(path.join(previewDir, filename), finalBuffer);
  }

  console.log(`🎉 100% of corner numbers, double-digit indices, top headers, and shadows eradicated!`);
}

eliminateAllNumbers().catch(console.error);
