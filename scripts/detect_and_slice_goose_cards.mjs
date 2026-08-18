import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_preview';

const sheets = [
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_1_1786969697641.jpg',
    theme: 'professions',
    names: [
      'detective', 'astronaut', 'pirate', 'chef',
      'doctor', 'firefighter', 'miner', 'wizard',
      'samurai', 'king', 'diver', 'painter',
      'rockstar', 'ninja', 'racer', 'ballerina'
    ],
    labels: [
      '侦探鹅', '宇航员鹅', '海盗鹅', '厨师鹅',
      '医生鹅', '消防员鹅', '矿工鹅', '魔法师鹅',
      '武士鹅', '国王鹅', '潜水员鹅', '画家鹅',
      '摇滚鹅', '忍者鹅', '赛车手鹅', '芭蕾舞鹅'
    ]
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_2_1786969711402.jpg',
    theme: 'food_objects',
    names: [
      'fried_chicken', 'fried_egg', 'boba_tea', 'burger',
      'cactus', 'ice_cream', 'toast', 'puddle',
      'watermelon', 'popcorn', 'sushi', 'balloon',
      'chili', 'coffee', 'durian', 'potted_plant'
    ],
    labels: [
      '炸鸡腿鹅', '荷包蛋鹅', '珍珠奶茶鹅', '汉堡鹅',
      '仙人掌鹅', '冰淇淋鹅', '烤吐司鹅', '融化水洼鹅',
      '西瓜鹅', '爆米花鹅', '寿司鹅', '气球鹅',
      '辣椒鹅', '咖啡杯鹅', '榴莲鹅', '盆栽小树鹅'
    ]
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_3_1786969725149.jpg',
    theme: 'heroes_fantasy',
    names: [
      'cthulhu', 'bodybuilder', 'magic_student', 'batman',
      'sailor_moon', 'wukong', 'mummy', 'dracula',
      'angel', 'devil', 'cyborg', 'zombie',
      'mermaid', 'spartan', 'god_of_wealth', 'ghost'
    ],
    labels: [
      '克苏鲁触手鹅', '健美肌肉鹅', '魔法学徒鹅', '蝙蝠侠暗夜鹅',
      '水手月亮鹅', '齐天大圣鹅', '木乃伊鹅', '吸血鬼伯爵鹅',
      '天使光环鹅', '小恶魔鹅', '赛博机械鹅', '末日丧尸鹅',
      '美人鱼海妖鹅', '斯巴达勇士鹅', '财神金宝鹅', '床单幽灵鹅'
    ]
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_4_1786969740788.jpg',
    theme: 'sports_lifestyle',
    names: [
      'boxer', 'weightlifter', 'skater', 'fisherman',
      'onsen', 'skier', 'yoga', 'spy',
      'tennis', 'birthday', 'pajama', 'hiker',
      'soccer', 'cyclist', 'graffiti', 'gardener'
    ],
    labels: [
      '拳击手鹅', '举重达人鹅', '滑板少年鹅', '钓鱼老翁鹅',
      '温泉泡汤鹅', '滑雪高手鹅', '瑜伽冥想鹅', '特工间谍鹅',
      '网球健将鹅', '派对寿星鹅', '睡衣宅男鹅', '登山驴友鹅',
      '足球前锋鹅', '骑行骑士鹅', '街头涂鸦鹅', '园丁小匠鹅'
    ]
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_5_1786969755631.jpg',
    theme: 'wacky_fashion',
    names: [
      'blue_hood', 'floral_coat', 'rapper', 'box_head',
      'dinosaur', 'noble_lady', 'bag_head', 'monocle',
      'sumo', 'raincoat', 'white_beard', 'mao_suit',
      'maid', 'viking', 'bee', 'gamer_headset'
    ],
    labels: [
      '小蓝斗篷鹅', '东北大花袄鹅', '金链说唱鹅', '纸箱头套鹅',
      '恐龙睡衣鹅', '羽毛贵妇鹅', '纸袋潜行鹅', '单片眼镜鹅',
      '相扑胖子鹅', '黄雨衣鹅', '圣诞大胡子鹅', '老干部保温杯鹅',
      '女仆咖啡鹅', '维京狂战鹅', '小蜜蜂鹅', '猫耳电竞鹅'
    ]
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_6_1786969771459.jpg',
    theme: 'surreal_art',
    names: [
      'unicorn', 'pharaoh', 'lego_bricks', 'origami_plane',
      'neon_wireframe', 'marble_david', 'bonsai', 'pixel_snake',
      'chameleon', 'paper_lantern', 'windup_toy', 'snow_globe',
      'jellyfish', 'paper_crane', 'tanghulu', 'galaxy_nebula'
    ],
    labels: [
      '彩虹独角兽鹅', '法老面具鹅', '乐高积木鹅', '纸飞机折纸鹅',
      '霓虹线框鹅', '大卫石膏雕塑鹅', '盆景松树鹅', '像素贪吃蛇鹅',
      '渐变变色龙鹅', '红色灯笼鹅', '发条玩具鹅', '雪花水晶球鹅',
      '荧光水母鹅', '千纸鹤折纸鹅', '冰糖葫芦鹅', '星系银河鹅'
    ]
  },
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_7_1786969786989.jpg',
    theme: 'social_expressions',
    names: [
      'office_worker', 'eye_roll', 'star_eyes', 'shocked_soul',
      'burglar', 'tipsy', 'vr_headset', 'megaphone',
      'music_headphones', 'zen_monk', 'watermelon_eater', 'slacker',
      'photographer', 'top_hat_gentleman', 'disco_queen', 'spa_cucumber'
    ],
    labels: [
      '疯狂加班社畜鹅', '傲娇翻白眼鹅', '星星眼迷弟鹅', '吓出灵魂鹅',
      '黑眼罩飞贼鹅', '微醺醉鬼鹅', 'VR元宇宙鹅', '大喇叭宣传鹅',
      '沉醉耳机音乐鹅', '敲木鱼高僧鹅', '吃瓜群众鹅', '摸鱼瘫软鹅',
      '三单反摄影师鹅', '高礼帽绅士鹅', '爆炸头迪斯科鹅', '黄瓜敷脸养生鹅'
    ]
  }
];

function isBrightWhite(r, g, b) {
  return r >= 232 && g >= 232 && b >= 232;
}

// Center-Outwards ray scanner
function findCardBoundsCenterOutwards(rawBuffer, W, H, channels, cellRow, cellCol) {
  const getPixel = (x, y) => {
    const idx = (y * W + x) * channels;
    return [rawBuffer[idx], rawBuffer[idx + 1], rawBuffer[idx + 2]];
  };

  const cx = Math.round((cellCol + 0.5) * (W / 4));
  const cy = Math.round((cellRow + 0.5) * (H / 4));

  // Find Top: Scan UP from cy along cx (-30, 0, +30)
  const findTopForX = (x) => {
    let seenWhite = false;
    let lastWhiteY = cy - 80;
    for (let y = cy; y >= Math.max(0, cy - 140); y--) {
      const [r, g, b] = getPixel(x, y);
      if (isBrightWhite(r, g, b)) {
        seenWhite = true;
        lastWhiteY = y;
      } else if (seenWhite) {
        // We just stepped off the white border onto background!
        return y + 1;
      }
    }
    return lastWhiteY;
  };

  // Find Bottom: Scan DOWN from cy along cx (-30, 0, +30)
  const findBottomForX = (x) => {
    let seenWhite = false;
    let lastWhiteY = cy + 80;
    for (let y = cy; y <= Math.min(H - 1, cy + 140); y++) {
      const [r, g, b] = getPixel(x, y);
      if (isBrightWhite(r, g, b)) {
        seenWhite = true;
        lastWhiteY = y;
      } else if (seenWhite) {
        return y - 1;
      }
    }
    return lastWhiteY;
  };

  // Find Left: Scan LEFT from cx along cy (-30, 0, +30)
  const findLeftForY = (y) => {
    let seenWhite = false;
    let lastWhiteX = cx - 80;
    for (let x = cx; x >= Math.max(0, cx - 140); x--) {
      const [r, g, b] = getPixel(x, y);
      if (isBrightWhite(r, g, b)) {
        seenWhite = true;
        lastWhiteX = x;
      } else if (seenWhite) {
        return x + 1;
      }
    }
    return lastWhiteX;
  };

  // Find Right: Scan RIGHT from cx along cy (-30, 0, +30)
  const findRightForY = (y) => {
    let seenWhite = false;
    let lastWhiteX = cx + 80;
    for (let x = cx; x <= Math.min(W - 1, cx + 140); x++) {
      const [r, g, b] = getPixel(x, y);
      if (isBrightWhite(r, g, b)) {
        seenWhite = true;
        lastWhiteX = x;
      } else if (seenWhite) {
        return x - 1;
      }
    }
    return lastWhiteX;
  };

  const top = Math.min(findTopForX(cx - 30), findTopForX(cx), findTopForX(cx + 30));
  const bottom = Math.max(findBottomForX(cx - 30), findBottomForX(cx), findBottomForX(cx + 30));
  const left = Math.min(findLeftForY(cy - 30), findLeftForY(cy), findLeftForY(cy + 30));
  const right = Math.max(findRightForY(cy - 30), findRightForY(cy), findRightForY(cy + 30));

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1
  };
}

// Generate SVG rounded corner mask for sharp composite
function createRoundedCornerMaskSvg(width, height, radius = 16) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
    </svg>
  `);
}

async function runPrecisionCenterOutCrop() {
  const cardCatalog = [];
  let globalIndex = 1;

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    const img = sharp(sheet.path);
    const meta = await img.metadata();
    const W = meta.width;
    const H = meta.height;

    const { data: rawBuffer, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;

    console.log(`\nScanning Sheet ${s + 1}/${sheets.length}: ${W}x${H}`);

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const localIdx = row * 4 + col;
        const name = sheet.names[localIdx];
        const label = sheet.labels[localIdx];

        const bbox = findCardBoundsCenterOutwards(rawBuffer, W, H, channels, row, col);

        console.log(`  [${s + 1}-${localIdx + 1}] ${label}: left=${bbox.left}, top=${bbox.top}, w=${bbox.width}, h=${bbox.height}`);

        const id = `goose_${String(globalIndex).padStart(3, '0')}`;
        const filename = `${id}_${name}.png`;
        const targetPath = path.join(outDir, filename);
        const previewPath = path.join(previewDir, filename);

        const cardW = bbox.width;
        const cardH = bbox.height;

        // Extract exact card rectangle
        const extracted = await sharp(sheet.path)
          .extract({
            left: Math.max(0, Math.min(W - cardW, bbox.left)),
            top: Math.max(0, Math.min(H - cardH, bbox.top)),
            width: cardW,
            height: cardH
          })
          .png()
          .toBuffer();

        // Apply smooth rounded corner mask (18px corner radius) to eliminate all 4 background corner triangles
        const maskSvg = createRoundedCornerMaskSvg(cardW, cardH, 18);
        const maskedCardBuffer = await sharp(extracted)
          .composite([{
            input: maskSvg,
            blend: 'dest-in'
          }])
          .png()
          .toBuffer();

        fs.writeFileSync(targetPath, maskedCardBuffer);
        fs.writeFileSync(previewPath, maskedCardBuffer);

        cardCatalog.push({
          id,
          key: name,
          name: label,
          theme: sheet.theme,
          sheetIndex: s + 1,
          gridIndex: localIdx + 1,
          width: cardW,
          height: cardH,
          image: `/goose-cards/${filename}`
        });

        globalIndex++;
      }
    }
  }

  const catalogPath = path.join(outDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(cardCatalog, null, 2), 'utf-8');
  console.log(`\n🎉 All 112 cards precision cropped and rounded with transparent corners!`);
}

runPrecisionCenterOutCrop().catch(console.error);
