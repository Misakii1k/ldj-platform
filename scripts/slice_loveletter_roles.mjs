import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const RAW_SRC = 'C:/Users/87850/.gemini/antigravity/brain/5ee9d6d8-55ed-4fb7-a516-7e20645eb8cf/loveletter_fox_roles_1788941909650.jpg';
const TARGET_DIR = path.resolve('d:/项目/packages/client/public/assets/loveletter');
const QA_OUT = path.resolve('d:/项目/packages/client/public/assets/loveletter/qa_loveletter_magenta.png');

const ROLES_GRID = [
  ['guard', 'priest', 'baron'],
  ['handmaid', 'prince', 'king'],
  ['countess', 'princess', 'card_back']
];

async function run() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // 1. Copy raw sheet to target dir
  fs.copyFileSync(RAW_SRC, path.join(TARGET_DIR, 'loveletter_fox_roles_sheet_raw.jpg'));
  console.log('Saved raw sheet to assets/loveletter/loveletter_fox_roles_sheet_raw.jpg');

  const image = sharp(RAW_SRC);
  const meta = await image.metadata();
  const W = meta.width;
  const H = meta.height;
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });

  const getPixel = (x, y) => {
    const idx = (y * W + x) * 3;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  // Sample background color near corners
  const bgSamples = [
    getPixel(5, 5),
    getPixel(W - 6, 5),
    getPixel(5, H - 6),
    getPixel(W - 6, H - 6)
  ];
  const bgR = Math.round(bgSamples.reduce((s, p) => s + p[0], 0) / 4);
  const bgG = Math.round(bgSamples.reduce((s, p) => s + p[1], 0) / 4);
  const bgB = Math.round(bgSamples.reduce((s, p) => s + p[2], 0) / 4);
  console.log(`Detected background color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // We have 3x3 grid. Let's find generous bounding boxes per cell with padding to catch tall hats/spears
  const cw = W / 3;
  const ch = H / 3;

  const slicedPngs = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const roleName = ROLES_GRID[r][c];
      
      // Calculate crop box with generous padding
      const padX = 8;
      const padY = 8;
      const x0 = Math.max(0, Math.floor(c * cw - padX));
      const y0 = Math.max(0, Math.floor(r * ch - padY));
      const x1 = Math.min(W, Math.ceil((c + 1) * cw + padX));
      const y1 = Math.min(H, Math.ceil((r + 1) * ch + padY));
      const cellW = x1 - x0;
      const cellH = y1 - y0;

      // Extract raw cell RGB
      const cellRaw = await sharp(RAW_SRC)
        .extract({ left: x0, top: y0, width: cellW, height: cellH })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const cellData = cellRaw.data;
      const alpha = new Uint8Array(cellW * cellH);
      const isVisited = new Uint8Array(cellW * cellH);

      // BFS Floodfill from outer border of cell
      // Background criteria: color is within diff threshold of bg
      const colorDiff = (x, y) => {
        const idx = (y * cellW + x) * 3;
        const cr = cellData[idx];
        const cg = cellData[idx + 1];
        const cb = cellData[idx + 2];
        return Math.max(Math.abs(cr - bgR), Math.abs(cg - bgG), Math.abs(cb - bgB));
      };

      const queue = [];
      // Push all 4 border pixels
      for (let x = 0; x < cellW; x++) {
        queue.push((0 * cellW + x));
        isVisited[0 * cellW + x] = 1;
        queue.push(((cellH - 1) * cellW + x));
        isVisited[(cellH - 1) * cellW + x] = 1;
      }
      for (let y = 1; y < cellH - 1; y++) {
        queue.push((y * cellW + 0));
        isVisited[y * cellW + 0] = 1;
        queue.push((y * cellW + (cellW - 1)));
        isVisited[y * cellW + (cellW - 1)] = 1;
      }

      let head = 0;
      const THRESH = 20;

      while (head < queue.length) {
        const curr = queue[head++];
        const cx = curr % cellW;
        const cy = Math.floor(curr / cellW);
        alpha[curr] = 0; // It's background

        // Check 4 neighbors
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < cellW && ny >= 0 && ny < cellH) {
            const nIdx = ny * cellW + nx;
            if (!isVisited[nIdx]) {
              const diff = colorDiff(nx, ny);
              if (diff <= THRESH) {
                isVisited[nIdx] = 1;
                queue.push(nIdx);
              }
            }
          }
        }
      }

      // Any pixel not visited by background floodfill is foreground
      for (let i = 0; i < cellW * cellH; i++) {
        if (!isVisited[i]) {
          alpha[i] = 255;
        }
      }

      // Connected component labeling to keep ONLY the main central character and drop neighbor fragments
      const labels = new Int32Array(cellW * cellH).fill(-1);
      let currentLabel = 0;
      const componentSizes = [];

      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const idx = y * cellW + x;
          if (alpha[idx] > 0 && labels[idx] === -1) {
            // BFS for this component
            let compSize = 0;
            const compQueue = [idx];
            labels[idx] = currentLabel;

            let cHead = 0;
            while (cHead < compQueue.length) {
              const cPos = compQueue[cHead++];
              compSize++;
              const px = cPos % cellW;
              const py = Math.floor(cPos / cellW);

              const nbs = [
                [px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1],
                [px - 1, py - 1], [px + 1, py - 1], [px - 1, py + 1], [px + 1, py + 1]
              ];
              for (const [nbx, nby] of nbs) {
                if (nbx >= 0 && nbx < cellW && nby >= 0 && nby < cellH) {
                  const nbIdx = nby * cellW + nbx;
                  if (alpha[nbIdx] > 0 && labels[nbIdx] === -1) {
                    labels[nbIdx] = currentLabel;
                    compQueue.push(nbIdx);
                  }
                }
              }
            }

            componentSizes.push({ label: currentLabel, size: compSize });
            currentLabel++;
          }
        }
      }

      if (componentSizes.length > 0) {
        componentSizes.sort((a, b) => b.size - a.size);
        const mainSize = componentSizes[0].size;

        // Discard any component that is smaller than 2% of the main character
        for (let i = 0; i < cellW * cellH; i++) {
          const l = labels[i];
          if (l !== -1) {
            const comp = componentSizes.find(c => c.label === l);
            if (!comp || comp.size < mainSize * 0.05) {
              alpha[i] = 0;
            }
          }
        }
      }

      // Find bounding box of filtered foreground
      let minX = cellW, maxX = 0, minY = cellH, maxY = 0;
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const idx = y * cellW + x;
          if (alpha[idx] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Smooth anti-aliased edge: for any foreground pixel touching background, feather smoothly
      const smoothedAlpha = new Uint8Array(alpha);
      for (let y = 1; y < cellH - 1; y++) {
        for (let x = 1; x < cellW - 1; x++) {
          const idx = y * cellW + x;
          if (alpha[idx] === 0) {
            let fgNeighbors = 0;
            if (alpha[idx - 1] > 0) fgNeighbors++;
            if (alpha[idx + 1] > 0) fgNeighbors++;
            if (alpha[idx - cellW] > 0) fgNeighbors++;
            if (alpha[idx + cellW] > 0) fgNeighbors++;
            if (fgNeighbors >= 2) {
              const diff = colorDiff(x, y);
              if (diff > 8) {
                smoothedAlpha[idx] = Math.min(255, Math.round((diff / THRESH) * 200));
              }
            }
          }
        }
      }

      // Build RGBA buffer for the extracted foreground
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const rgbaBuf = Buffer.alloc(cropW * cropH * 4);

      let p = 0;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cIdx = (y * cellW + x) * 3;
          const aIdx = y * cellW + x;
          rgbaBuf[p++] = cellData[cIdx];
          rgbaBuf[p++] = cellData[cIdx + 1];
          rgbaBuf[p++] = cellData[cIdx + 2];
          rgbaBuf[p++] = smoothedAlpha[aIdx];
        }
      }

      // Place centered in a clean square canvas (512x512) with ~10% margin
      const OUT_SIZE = 512;
      const maxDim = Math.max(cropW, cropH);
      const targetDim = Math.round(OUT_SIZE * 0.86);
      const scale = targetDim / maxDim;
      const scaledW = Math.round(cropW * scale);
      const scaledH = Math.round(cropH * scale);

      console.log(`Cell (${r}, ${c}) ${roleName}: cropW=${cropW}, cropH=${cropH}, minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}, bufLen=${rgbaBuf.length}`);
      const resizedCharacter = await sharp(rgbaBuf, {
        raw: { width: cropW, height: cropH, channels: 4 }
      })
        .png()
        .resize(scaledW, scaledH, { kernel: 'lanczos3' })
        .toBuffer();

      const offsetX = Math.floor((OUT_SIZE - scaledW) / 2);
      const offsetY = Math.floor((OUT_SIZE - scaledH) / 2);

      const finalPngBuffer = await sharp({
        create: {
          width: OUT_SIZE,
          height: OUT_SIZE,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([{ input: resizedCharacter, left: offsetX, top: offsetY }])
        .png()
        .toBuffer();

      const outPath = path.join(TARGET_DIR, `${roleName}.png`);
      fs.writeFileSync(outPath, finalPngBuffer);
      console.log(`Exported [${roleName}.png]: size ${OUT_SIZE}x${OUT_SIZE}, cropped ${cropW}x${cropH}`);

      // Also generate matching high-res JPG card (896x1200) with royal velvet background
      const bgSvg = Buffer.from(`
        <svg width="896" height="1200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="cardGrad" cx="50%" cy="48%" r="62%">
              <stop offset="0%" stop-color="#441a20" />
              <stop offset="65%" stop-color="#240d12" />
              <stop offset="100%" stop-color="#120507" />
            </radialGradient>
          </defs>
          <rect width="896" height="1200" fill="url(#cardGrad)" />
        </svg>
      `);

      const cardChar = await sharp(finalPngBuffer)
        .resize(760, 760, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

      const jpgOutPath = path.join(TARGET_DIR, `${roleName}.jpg`);
      await sharp(bgSvg)
        .composite([{
          input: cardChar,
          left: Math.round((896 - 760) / 2),
          top: Math.round((1200 - 760) / 2)
        }])
        .jpeg({ quality: 92 })
        .toFile(jpgOutPath);
      console.log(`Exported [${roleName}.jpg] (896x1200)`);

      slicedPngs.push({ role: roleName, buffer: finalPngBuffer, r, c });
    }
  }

  // QA: Composite onto a magenta canvas (3x3 grid) to verify clean cutouts
  const QA_CELL = 256;
  const QA_SIZE = QA_CELL * 3;
  const qaComposites = [];

  for (const item of slicedPngs) {
    const resized = await sharp(item.buffer)
      .resize(QA_CELL, QA_CELL)
      .toBuffer();

    qaComposites.push({
      input: resized,
      left: item.c * QA_CELL,
      top: item.r * QA_CELL
    });
  }

  await sharp({
    create: {
      width: QA_SIZE,
      height: QA_SIZE,
      channels: 4,
      background: { r: 255, g: 0, b: 255, alpha: 1 } // Magenta #ff00ff
    }
  })
    .composite(qaComposites)
    .png()
    .toFile(QA_OUT);

  console.log(`QA composite saved to: ${QA_OUT}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
