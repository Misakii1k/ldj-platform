import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const srcDir = 'C:/Users/87850/Desktop/UNO卡片';
const destDir = path.resolve('packages/client/public/assets/uno');

const colorMap = {
  '红色': 'red',
  '黄色': 'yellow',
  '绿色': 'green',
  '蓝色': 'blue',
};

const cellMap = {
  '行1_列1': '0',
  '行1_列2': '1',
  '行1_列3': '2',
  '行1_列4': '3',
  '行2_列1': '4',
  '行2_列2': '5',
  '行2_列3': '6',
  '行2_列4': '7',
  '行3_列1': '8',
  '行3_列2': '9',
  '行3_列3': 'skip',
  '行3_列4': 'reverse',
  '行4_列1': 'draw2',
};

const specialMap = {
  '特殊牌_行1_列1.png': 'back.png',
  '特殊牌_行2_列1.png': 'wild.png',
  '特殊牌_行3_列1.png': 'wild4.png',
  '特殊牌_行4_列1.png': 'back_gold.png',
};

async function main() {
  await fs.mkdir(destDir, { recursive: true });
  let count = 0;

  // 1. Process 4 colored card sets
  for (const [cnColor, enColor] of Object.entries(colorMap)) {
    for (const [cellKey, cardName] of Object.entries(cellMap)) {
      const srcFile = path.join(srcDir, `${cnColor}_${cellKey}.png`);
      const destFile = path.join(destDir, `${enColor}_${cardName}.png`);
      try {
        await sharp(srcFile)
          .trim() // trim solid gray background boundary if any
          .png({ quality: 100, compressionLevel: 9 })
          .toFile(destFile);
        count++;
        console.log(`Processed: ${enColor}_${cardName}.png`);
      } catch (err) {
        console.warn(`Failed or missing: ${srcFile}`, err.message);
      }
    }
  }

  // 2. Process special cards
  for (const [srcName, destName] of Object.entries(specialMap)) {
    const srcFile = path.join(srcDir, srcName);
    const destFile = path.join(destDir, destName);
    try {
      await sharp(srcFile)
        .trim()
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(destFile);
      count++;
      console.log(`Processed: ${destName}`);
    } catch (err) {
      console.warn(`Failed or missing: ${srcFile}`, err.message);
    }
  }

  console.log(`\nSuccessfully imported ${count} cards to ${destDir}!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
