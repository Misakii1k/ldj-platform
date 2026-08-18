import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e';
const OUTPUT_DIR = 'd:/项目/packages/client/public/home-scene';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 柔和白底抠图函数（带反走样羽化）
async function removeWhiteBackground(inputBuffer, threshold = 244, feather = 20) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const outData = Buffer.from(data);

  for (let i = 0; i < outData.length; i += channels) {
    const r = outData[i];
    const g = outData[i + 1];
    const b = outData[i + 2];

    // 判断亮度与白底接近度
    const minVal = Math.min(r, g, b);
    const maxVal = Math.max(r, g, b);
    const isNeutral = (maxVal - minVal) < 18;

    if (isNeutral && minVal >= threshold - feather) {
      if (minVal >= threshold) {
        outData[i + 3] = 0; // 完全透明
      } else {
        const factor = (threshold - minVal) / feather;
        outData[i + 3] = Math.round(255 * factor); // 边缘平滑过渡
      }
    }
  }

  return sharp(outData, { raw: { width, height, channels } }).png();
}

async function processAll() {
  console.log('Processing Home Scene Assets...');

  // 1. 桌台与地毯
  const tableImgPath = path.join(ARTIFACTS_DIR, 'home_party_table_1786960434493.jpg');
  if (fs.existsSync(tableImgPath)) {
    const transparentTable = await removeWhiteBackground(fs.readFileSync(tableImgPath), 242, 22);
    await transparentTable.trim().toFile(path.join(OUTPUT_DIR, 'table.png'));
    console.log('✓ Saved table.png');
  }

  // 2. 道具（落地灯与盆栽）
  const propsImgPath = path.join(ARTIFACTS_DIR, 'home_party_props_1786960469097.jpg');
  if (fs.existsSync(propsImgPath)) {
    const meta = await sharp(propsImgPath).metadata();
    const w = meta.width;
    const h = meta.height;

    // 左半边：落地灯
    const lampBuf = await sharp(propsImgPath)
      .extract({ left: 0, top: 0, width: Math.floor(w * 0.48), height: h })
      .toBuffer();
    const transparentLamp = await removeWhiteBackground(lampBuf, 240, 22);
    await transparentLamp.trim().toFile(path.join(OUTPUT_DIR, 'lamp.png'));
    console.log('✓ Saved lamp.png');

    // 右半边：绿植盆栽
    const plantBuf = await sharp(propsImgPath)
      .extract({ left: Math.floor(w * 0.48), top: 0, width: Math.ceil(w * 0.52), height: h })
      .toBuffer();
    const transparentPlant = await removeWhiteBackground(plantBuf, 240, 22);
    await transparentPlant.trim().toFile(path.join(OUTPUT_DIR, 'plant.png'));
    console.log('✓ Saved plant.png');
  }

  // 3. 12 位人物切片 (4 列 × 3 行，纯净无桌板立绘)
  const peopleImgPath = path.join(ARTIFACTS_DIR, 'home_party_people_pure_1786960977261.jpg');
  if (fs.existsSync(peopleImgPath)) {
    const meta = await sharp(peopleImgPath).metadata();
    const cols = 4;
    const rows = 3;
    const cellW = Math.floor(meta.width / cols);
    const cellH = Math.floor(meta.height / rows);

    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const extractOpts = {
          left: c * cellW,
          top: r * cellH,
          width: cellW,
          height: cellH,
        };

        const personCrop = await sharp(peopleImgPath)
          .extract(extractOpts)
          .toBuffer();

        const transparentPerson = await removeWhiteBackground(personCrop, 240, 22);
        const personOutPath = path.join(OUTPUT_DIR, `person_${idx}.png`);
        await transparentPerson.trim().toFile(personOutPath);
        console.log(`✓ Saved person_${idx}.png`);
        idx++;
      }
    }
  }

  console.log('All assets processed successfully!');
}

processAll().catch(console.error);
