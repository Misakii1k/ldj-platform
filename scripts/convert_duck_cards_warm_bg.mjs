import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcDir = 'C:/Users/87850/Desktop/鸭子卡片裁切';
const outDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/duck_preview';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

const sheetDefs = [
  {
    sheetIndex: 1,
    theme: 'professions',
    themeName: '经典职业与身份',
    names: [
      'detective', 'astronaut', 'pirate', 'chef',
      'doctor', 'firefighter', 'miner', 'wizard',
      'samurai', 'king', 'diver', 'painter',
      'rockstar', 'ninja', 'racer', 'ballerina'
    ],
    labels: [
      '侦探鸭', '宇航员鸭', '海盗鸭', '厨师鸭',
      '医生鸭', '消防员鸭', '矿工鸭', '魔法师鸭',
      '武士鸭', '国王鸭', '潜水员鸭', '画家鸭',
      '摇滚鸭', '忍者鸭', '赛车手鸭', '芭蕾舞鸭'
    ]
  },
  {
    sheetIndex: 2,
    theme: 'food_objects',
    themeName: '搞笑食物与拟物变身',
    names: [
      'fried_chicken', 'fried_egg', 'boba_tea', 'burger',
      'cactus', 'ice_cream', 'toast', 'puddle',
      'watermelon', 'popcorn', 'sushi', 'balloon',
      'chili', 'coffee', 'durian', 'potted_plant'
    ],
    labels: [
      '炸鸡腿鸭', '荷包蛋鸭', '珍珠奶茶鸭', '汉堡鸭',
      '仙人掌鸭', '冰淇淋鸭', '烤吐司鸭', '融化水洼鸭',
      '西瓜鸭', '爆米花鸭', '寿司鸭', '气球鸭',
      '辣椒鸭', '咖啡杯鸭', '榴莲鸭', '盆栽小树鸭'
    ]
  },
  {
    sheetIndex: 3,
    theme: 'heroes_fantasy',
    themeName: '英雄魔物与二次元恶搞',
    names: [
      'cthulhu', 'bodybuilder', 'magic_student', 'batman',
      'sailor_moon', 'wukong', 'mummy', 'dracula',
      'angel', 'devil', 'cyborg', 'zombie',
      'mermaid', 'spartan', 'god_of_wealth', 'ghost'
    ],
    labels: [
      '克苏鲁触手鸭', '健美肌肉鸭', '魔法学徒鸭', '蝙蝠侠暗夜鸭',
      '水手月亮鸭', '齐天大圣鸭', '木乃伊鸭', '吸血鬼伯爵鸭',
      '天使光环鸭', '小恶魔鸭', '赛博机械鸭', '末日丧尸鸭',
      '美人鱼海妖鸭', '斯巴达勇士鸭', '财神金宝鸭', '床单幽灵鸭'
    ]
  },
  {
    sheetIndex: 4,
    theme: 'sports_lifestyle',
    themeName: '趣味运动与生活闲情',
    names: [
      'boxer', 'weightlifter', 'skater', 'fisherman',
      'onsen', 'skier', 'yoga', 'spy',
      'tennis', 'birthday', 'pajama', 'hiker',
      'soccer', 'cyclist', 'graffiti', 'gardener'
    ],
    labels: [
      '拳击手鸭', '举重达人鸭', '滑板少年鸭', '钓鱼老翁鸭',
      '温泉泡汤鸭', '滑雪高手鸭', '瑜伽冥想鸭', '特工间谍鸭',
      '网球健将鸭', '派对寿星鸭', '睡衣宅男鸭', '登山驴友鸭',
      '足球前锋鸭', '骑行骑士鸭', '街头涂鸦鸭', '园丁小匠鸭'
    ]
  },
  {
    sheetIndex: 5,
    theme: 'wacky_fashion',
    themeName: '奇装异服与搞怪穿搭',
    names: [
      'blue_hood', 'floral_coat', 'rapper', 'box_head',
      'dinosaur', 'noble_lady', 'bag_head', 'monocle',
      'sumo', 'raincoat', 'white_beard', 'mao_suit',
      'maid', 'viking', 'bee', 'gamer_headset'
    ],
    labels: [
      '小蓝斗篷鸭', '东北大花袄鸭', '金链说唱鸭', '纸箱头套鸭',
      '恐龙睡衣鸭', '羽毛贵妇鸭', '纸袋潜行鸭', '单片眼镜鸭',
      '相扑胖子鸭', '黄雨衣鸭', '圣诞大胡子鸭', '老干部保温杯鸭',
      '女仆咖啡鸭', '维京狂战鸭', '小蜜蜂鸭', '猫耳电竞鸭'
    ]
  }
];

function isRedBgPixel(r, g, b, a) {
  if (a < 120) return true; // transparent border
  // White/off-white outer border
  if (r > 230 && g > 230 && b > 230) return true;
  // Red background: R in [60, 210], G in [0, 75], B in [0, 75], R > (G + B) * 1.18
  if (r > 60 && g < 80 && b < 80 && r > (g + b) * 1.15) return true;
  // Dark vignette edges of the red background
  if (r > 35 && r < 120 && g < 45 && b < 45 && r > (g + b) * 1.08) return true;
  return false;
}

async function convertCard(srcPath, outPath, previewPath) {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const visited = new Uint8Array(w * h);
  const isBg = new Uint8Array(w * h);

  // Flood fill queue from edges and corners
  const queue = [];
  for (let x = 0; x < w; x++) {
    queue.push([x, 0], [x, h - 1], [x, 8], [x, h - 9]);
  }
  for (let y = 0; y < h; y++) {
    queue.push([0, y], [w - 1, y], [8, y], [w - 9, y]);
  }
  queue.push([15, 15], [w - 16, 15], [15, h - 16], [w - 16, h - 16]);

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const pos = y * w + x;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const idx = pos * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    if (isRedBgPixel(r, g, b, a)) {
      isBg[pos] = 1;
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  // Soft warm cream / ivory white background:
  // Base: #fffef8 to warm creamy amber #faf2e4 around the edges
  const outBuf = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      const idx = pos * 4;
      if (isBg[pos]) {
        const dx = (x - w / 2) / (w / 2);
        const dy = (y - h / 2) / (h / 2);
        const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 0.75);

        // Center: #fffdf8 [255, 253, 248], Edge: #faf3e6 [250, 243, 230]
        outBuf[idx] = Math.round(255 - dist * 5);
        outBuf[idx + 1] = Math.round(253 - dist * 10);
        outBuf[idx + 2] = Math.round(248 - dist * 18);
        outBuf[idx + 3] = 255;
      }
    }
  }

  const targetW = 320;
  const targetH = 440;

  // Clean vector rounded card frame
  const maskSvg = Buffer.from(`
    <svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${targetW}" height="${targetH}" rx="18" ry="18" fill="#ffffff"/>
    </svg>
  `);

  const borderSvg = Buffer.from(`
    <svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="${targetW - 4}" height="${targetH - 4}" rx="16" ry="16" fill="none" stroke="#312d28" stroke-width="4"/>
      <rect x="7" y="7" width="${targetW - 14}" height="${targetH - 14}" rx="12" ry="12" fill="none" stroke="#e8dcce" stroke-width="1.5" stroke-dasharray="4,3"/>
    </svg>
  `);

  const processed = await sharp(outBuf, { raw: { width: w, height: h, channels: 4 } })
    .resize(targetW, targetH, { fit: 'fill' })
    .composite([
      { input: maskSvg, blend: 'dest-in' },
      { input: borderSvg, blend: 'over' }
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(outPath, processed);
  fs.writeFileSync(previewPath, processed);
}

async function convertAll() {
  const cardCatalog = [];
  const cardMap = {};
  let globalIndex = 1;

  for (const sheet of sheetDefs) {
    const sNum = sheet.sheetIndex;
    console.log(`Processing Sheet ${sNum}: ${sheet.themeName}...`);

    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= 4; c++) {
        const localIdx = (r - 1) * 4 + (c - 1);
        const name = sheet.names[localIdx];
        const label = sheet.labels[localIdx];

        const srcFile = `sheet${sNum}_r${r}_c${c}.png`;
        const srcPath = path.join(srcDir, srcFile);

        if (!fs.existsSync(srcPath)) {
          console.warn(`Missing source file: ${srcPath}`);
          continue;
        }

        const id = `goose_${String(globalIndex).padStart(3, '0')}`;
        const outFileName = `${id}_${name}.png`;
        const outPath = path.join(outDir, outFileName);
        const previewPath = path.join(previewDir, outFileName);

        await convertCard(srcPath, outPath, previewPath);

        const cardMeta = {
          id,
          key: name,
          name: label,
          theme: sheet.theme,
          sheetIndex: sNum,
          gridIndex: localIdx + 1,
          width: 320,
          height: 440,
          image: `/goose-cards/${outFileName}`
        };

        cardCatalog.push(cardMeta);
        cardMap[name] = cardMeta;
        globalIndex++;
      }
    }
  }

  // Update catalog.json
  const catalogPath = path.join(outDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(cardCatalog, null, 2), 'utf-8');

  console.log(`\n🎉 Successfully converted all ${cardCatalog.length} duck cards to warm white/cream background!`);
}

convertAll().catch(console.error);
