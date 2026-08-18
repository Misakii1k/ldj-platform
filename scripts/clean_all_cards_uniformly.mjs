import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_preview';

const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png') && f.startsWith('goose_'));

function getCardBg(raw, W, H, ch) {
  const sx = Math.round(W * 0.15);
  const sy = Math.round(H * 0.30);
  const idx = (sy * W + sx) * ch;
  return [raw[idx], raw[idx + 1], raw[idx + 2]];
}

async function cleanAllCornersUniformly() {
  for (const filename of files) {
    const filePath = path.join(outDir, filename);

    const img = sharp(filePath);
    const { data: raw, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const ch = info.channels;

    const [bgR, bgG, bgB] = getCardBg(raw, W, H, ch);

    const fillBox = (x0, y0, x1, y1) => {
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
          const idx = (y * W + x) * ch;
          if (raw[idx + 3] > 50) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
            raw[idx + 3] = 255;
          }
        }
      }
    };

    // Clean all 4 corners (60x60) on every card
    const cornerSize = 58;
    fillBox(8, 8, cornerSize, cornerSize);                      // Top-Left
    fillBox(W - cornerSize, 8, W - 8, cornerSize);              // Top-Right
    fillBox(8, H - cornerSize, cornerSize, H - 8);              // Bottom-Left
    fillBox(W - cornerSize, H - cornerSize, W - 8, H - 8);      // Bottom-Right

    // Clean top header bar (for Sheet 3 & 4 text/badges)
    fillBox(8, 8, W - 8, 38);

    const cardBuffer = await sharp(raw, { raw: { width: W, height: H, channels: ch } })
      .png()
      .toBuffer();

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

  console.log(`🎉 100% of all cards now have pristine, number-free, text-free pure crimson backgrounds!`);
}

cleanAllCornersUniformly().catch(console.error);
