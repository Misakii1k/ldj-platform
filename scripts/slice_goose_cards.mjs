import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = 'd:/项目/packages/client/public/goose-cards';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

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

async function sliceAllCards() {
  const cardCatalog = [];
  let globalIndex = 1;

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    const img = sharp(sheet.path);
    const meta = await img.metadata();
    const W = meta.width;
    const H = meta.height;

    console.log(`Processing Sheet ${s + 1}/${sheets.length}: ${W}x${H}`);

    // In a 4x4 grid:
    // Let's compute cell coordinates.
    const colStep = W / 4;
    const rowStep = H / 4;
    
    // Card relative dimensions:
    // Card is ~88% of cell width and ~92% of cell height, centered in cell
    const cardWidthRatio = 0.88;
    const cardHeightRatio = 0.92;
    const cardW = Math.round(colStep * cardWidthRatio);
    const cardH = Math.round(rowStep * cardHeightRatio);

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const localIdx = row * 4 + col;
        const name = sheet.names[localIdx];
        const label = sheet.labels[localIdx];

        // Center within cell
        const cellCenterX = Math.round((col + 0.5) * colStep);
        const cellCenterY = Math.round((row + 0.5) * rowStep);

        const cropLeft = Math.max(0, Math.min(W - cardW, Math.round(cellCenterX - cardW / 2)));
        const cropTop = Math.max(0, Math.min(H - cardH, Math.round(cellCenterY - cardH / 2)));

        const id = `goose_${String(globalIndex).padStart(3, '0')}`;
        const filename = `${id}_${name}.png`;
        const targetPath = path.join(outDir, filename);

        // Crop card
        await sharp(sheet.path)
          .extract({ left: cropLeft, top: cropTop, width: cardW, height: cardH })
          .resize(320, 440, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(targetPath);

        cardCatalog.push({
          id,
          key: name,
          name: label,
          theme: sheet.theme,
          sheetIndex: s + 1,
          gridIndex: localIdx + 1,
          image: `/goose-cards/${filename}`
        });

        globalIndex++;
      }
    }
  }

  // Save full catalog JSON
  const catalogPath = path.join(outDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(cardCatalog, null, 2), 'utf-8');
  console.log(`Successfully sliced ${cardCatalog.length} goose cards into ${outDir}`);
}

sliceAllCards().catch(console.error);
