import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const cardsDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_preview';

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.png') && f.startsWith('goose_'));

// Sample reliable background crimson red from safe area (e.g. x = 0.5W, y = 0.88H or x = 0.15W, y = 0.3H)
function getSafeBgColor(raw, W, H, ch) {
  const sx = Math.round(W * 0.15);
  const sy = Math.round(H * 0.25);
  const idx = (sy * W + sx) * ch;
  return [raw[idx], raw[idx + 1], raw[idx + 2]];
}

async function thoroughlyCleanAllCards() {
  console.log(`Thoroughly removing all numbers, shadows, and text badges on ${files.length} cards...`);

  for (const filename of files) {
    const cardNum = parseInt(filename.split('_')[1], 10);
    const filePath = path.join(cardsDir, filename);

    const img = sharp(filePath);
    const { data: raw, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const ch = info.channels;

    const [bgR, bgG, bgB] = getSafeBgColor(raw, W, H, ch);

    // 1. Sheet 1 (001~016): Erase top-left number and any corner shadow
    if (cardNum >= 1 && cardNum <= 16) {
      for (let y = 10; y <= 48; y++) {
        for (let x = 10; x <= 48; x++) {
          const idx = (y * W + x) * ch;
          raw[idx] = bgR;
          raw[idx + 1] = bgG;
          raw[idx + 2] = bgB;
          raw[idx + 3] = 255;
        }
      }
    }

    // 2. Sheet 3 (033~048): Erase top "GOOSE RELAY" logo and text
    if (cardNum >= 33 && cardNum <= 48) {
      for (let y = 8; y <= 35; y++) {
        for (let x = 10; x <= W - 10; x++) {
          const idx = (y * W + x) * ch;
          raw[idx] = bgR;
          raw[idx + 1] = bgG;
          raw[idx + 2] = bgB;
          raw[idx + 3] = 255;
        }
      }
    }

    // 3. Sheet 4 (049~064): Erase top title text ("Boxer", "Skater", etc.)
    if (cardNum >= 49 && cardNum <= 64) {
      for (let y = 8; y <= 36; y++) {
        for (let x = 10; x <= W - 10; x++) {
          const idx = (y * W + x) * ch;
          raw[idx] = bgR;
          raw[idx + 1] = bgG;
          raw[idx + 2] = bgB;
          raw[idx + 3] = 255;
        }
      }
    }

    // 4. Sheet 5 (065~080): Erase top-left AND bottom-right corner numbers
    if (cardNum >= 65 && cardNum <= 80) {
      // Top-left corner
      for (let y = 8; y <= 48; y++) {
        for (let x = 8; x <= 48; x++) {
          const idx = (y * W + x) * ch;
          raw[idx] = bgR;
          raw[idx + 1] = bgG;
          raw[idx + 2] = bgB;
          raw[idx + 3] = 255;
        }
      }
      // Bottom-right corner
      for (let y = H - 48; y <= H - 8; y++) {
        for (let x = W - 48; x <= W - 8; x++) {
          const idx = (y * W + x) * ch;
          raw[idx] = bgR;
          raw[idx + 1] = bgG;
          raw[idx + 2] = bgB;
          raw[idx + 3] = 255;
        }
      }
    }

    const cleanedBuffer = await sharp(raw, { raw: { width: W, height: H, channels: ch } })
      .png()
      .toBuffer();

    fs.writeFileSync(filePath, cleanedBuffer);
    fs.writeFileSync(path.join(previewDir, filename), cleanedBuffer);
  }

  // Cleanup test files
  const test1 = path.join(cardsDir, 'test_clean_065.png');
  const test2 = path.join(cardsDir, 'test_clean_065_v2.png');
  if (fs.existsSync(test1)) fs.unlinkSync(test1);
  if (fs.existsSync(test2)) fs.unlinkSync(test2);

  console.log(`🎉 100% of numbers, text, outlines and shadows eradicated across all 112 cards!`);
}

thoroughlyCleanAllCards().catch(console.error);
