import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const cardsDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_preview';

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.png') && f.startsWith('goose_'));

// Helper to check if pixel is background crimson red
function isCrimsonRed(r, g, b) {
  // Red background in cards: high red, lower green/blue
  return r >= 100 && r > g * 1.35 && r > b * 1.35;
}

// Sample a reliable background red color from a safe region of the card
function getCardBackgroundRed(raw, W, H, ch) {
  // Sample at (x = 22, y = 60)
  const idx = (60 * W + 22) * ch;
  return [raw[idx], raw[idx + 1], raw[idx + 2]];
}

async function cleanAllCards() {
  console.log(`Starting inpainting and number/text removal on ${files.length} cards...`);

  for (const filename of files) {
    const cardNum = parseInt(filename.split('_')[1], 10);
    const filePath = path.join(cardsDir, filename);

    const img = sharp(filePath);
    const { data: raw, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const ch = info.channels;

    const [bgR, bgG, bgB] = getCardBackgroundRed(raw, W, H, ch);

    // 1. Sheet 1 (001~016): Erase top-left number
    if (cardNum >= 1 && cardNum <= 16) {
      for (let y = 8; y <= 46; y++) {
        for (let x = 8; x <= 46; x++) {
          const idx = (y * W + x) * ch;
          // If not transparent (alpha > 0) and not crimson background
          if (raw[idx + 3] > 100 && !isCrimsonRed(raw[idx], raw[idx + 1], raw[idx + 2])) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
          }
        }
      }
    }

    // 2. Sheet 3 (033~048): Erase top "GOOSE RELAY" logo and text
    if (cardNum >= 33 && cardNum <= 48) {
      for (let y = 8; y <= 35; y++) {
        for (let x = 12; x <= W - 12; x++) {
          const idx = (y * W + x) * ch;
          if (raw[idx + 3] > 100 && !isCrimsonRed(raw[idx], raw[idx + 1], raw[idx + 2])) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
          }
        }
      }
    }

    // 3. Sheet 4 (049~064): Erase top title text ("Boxer", "Skater", etc.)
    if (cardNum >= 49 && cardNum <= 64) {
      for (let y = 8; y <= 35; y++) {
        for (let x = 12; x <= W - 12; x++) {
          const idx = (y * W + x) * ch;
          if (raw[idx + 3] > 100 && !isCrimsonRed(raw[idx], raw[idx + 1], raw[idx + 2])) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
          }
        }
      }
    }

    // 4. Sheet 5 (065~080): Erase top-left number AND bottom-right number
    if (cardNum >= 65 && cardNum <= 80) {
      // Top-left number
      for (let y = 8; y <= 45; y++) {
        for (let x = 8; x <= 45; x++) {
          const idx = (y * W + x) * ch;
          if (raw[idx + 3] > 100 && !isCrimsonRed(raw[idx], raw[idx + 1], raw[idx + 2])) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
          }
        }
      }
      // Bottom-right number
      for (let y = H - 45; y <= H - 8; y++) {
        for (let x = W - 45; x <= W - 8; x++) {
          const idx = (y * W + x) * ch;
          if (raw[idx + 3] > 100 && !isCrimsonRed(raw[idx], raw[idx + 1], raw[idx + 2])) {
            raw[idx] = bgR;
            raw[idx + 1] = bgG;
            raw[idx + 2] = bgB;
          }
        }
      }
    }

    // Save cleaned image
    const cleanedBuffer = await sharp(raw, { raw: { width: W, height: H, channels: ch } })
      .png()
      .toBuffer();

    fs.writeFileSync(filePath, cleanedBuffer);
    fs.writeFileSync(path.join(previewDir, filename), cleanedBuffer);
  }

  // Clean up any test files
  const testFile = path.join(cardsDir, 'test_clean_001.png');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

  console.log(`🎉 Successfully cleaned numbers and text badges from all cards!`);
}

cleanAllCards().catch(console.error);
