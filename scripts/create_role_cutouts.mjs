import sharp from 'sharp';
import path from 'node:path';

const ROLES_DIR = path.resolve('packages/client/public/assets/roles');

const ROLE_SPECS = [
  {
    name: 'werewolf',
    src: 'werewolf.jpg',
    out: 'werewolf.png',
    crop: { left: 160, top: 135, width: 680, height: 645 },
  },
  {
    name: 'guard',
    src: 'guard.jpg',
    out: 'guard.png',
    crop: { left: 160, top: 90, width: 700, height: 820 },
  },
  {
    name: 'seer',
    src: 'seer.jpg',
    out: 'seer.png',
    crop: { left: 180, top: 120, width: 660, height: 780 },
  },
  {
    name: 'witch',
    src: 'witch.jpg',
    out: 'witch.png',
    crop: { left: 180, top: 110, width: 660, height: 780 },
  },
  {
    name: 'hunter',
    src: 'hunter.jpg',
    out: 'hunter.png',
    crop: { left: 160, top: 90, width: 700, height: 820 },
  },
  {
    name: 'villager',
    src: 'villager.jpg',
    out: 'villager.png',
    crop: { left: 240, top: 80, width: 560, height: 850 },
  },
  {
    name: 'idiot',
    src: 'idiot.jpg',
    out: 'idiot.png',
    crop: { left: 200, top: 40, width: 620, height: 890 },
  },
];

async function createCutout(spec) {
  const inputPath = path.join(ROLES_DIR, spec.src);
  const outputPath = path.join(ROLES_DIR, spec.out);

  const cropped = await sharp(inputPath)
    .extract(spec.crop)
    .resize(480, 480, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const { data, info } = await sharp(cropped)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const outBuf = Buffer.from(data);

  // Soft gothic arch cutout mask: transparent background, clear character, subtle grounded pedestal
  for (let y = 0; y < height; y++) {
    const ny = y / height; // 0 to 1
    for (let x = 0; x < width; x++) {
      const nx = x / width; // 0 to 1
      const idx = (y * width + x) * 4;

      const dx = Math.abs(nx - 0.5) * 2; // 0 in center, 1 at edge
      
      // Gothic arch curve: wider at bottom, arched at top
      const allowedWidth = ny < 0.35 
        ? 0.55 + 0.35 * Math.sin((ny / 0.35) * (Math.PI / 2))
        : 0.90;

      let alphaX = 1.0;
      if (dx > allowedWidth * 0.7) {
        alphaX = Math.max(0, 1 - (dx - allowedWidth * 0.7) / (allowedWidth * 0.3));
      }

      let alphaY = 1.0;
      if (ny < 0.12) {
        alphaY = Math.max(0, ny / 0.12);
      } else if (ny > 0.92) {
        alphaY = Math.max(0, (1 - ny) / 0.08);
      }

      // Smoothstep curve for soft natural fade
      const combined = alphaX * alphaY;
      const smooth = combined * combined * (3 - 2 * combined);
      
      outBuf[idx + 3] = Math.round(255 * smooth);
    }
  }

  await sharp(outBuf, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);

  console.log(`Updated ${spec.out}`);
}

async function run() {
  for (const spec of ROLE_SPECS) {
    await createCutout(spec);
  }
}

run();
