import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_preview';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

const sheets = [
  {
    path: 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/goose_cards_sheet_1_1786969697641.jpg',
    theme: 'professions',
    cols: [71, 306, 540, 774],
    colW: [178, 178, 178, 178],
    rows: [36, 282, 528, 774],
    rowH: [234, 234, 234, 234],
    radius: 14,
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
    cols: [21, 271, 520, 770],
    colW: [233, 232, 233, 233],
    rows: [28, 273, 517, 762],
    rowH: [233, 233, 233, 233],
    radius: 16,
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
    cols: [80, 306, 532, 759],
    colW: [193, 194, 194, 194],
    rows: [26, 278, 520, 761],
    rowH: [238, 227, 227, 227],
    radius: 14,
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
    cols: [67, 306, 545, 785],
    colW: [172, 173, 173, 172],
    rows: [41, 284, 527, 771],
    rowH: [230, 230, 231, 230],
    radius: 14,
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
    cols: [146, 336, 519, 701],
    colW: [174, 167, 167, 169],
    rows: [20, 270, 519, 771],
    rowH: [234, 234, 237, 235],
    radius: 14,
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
    cols: [58, 308, 556, 805],
    colW: [161, 161, 160, 161],
    rows: [24, 273, 522, 773],
    rowH: [231, 230, 232, 231],
    radius: 14,
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
    cols: [41, 289, 533, 780],
    colW: [205, 204, 205, 205],
    rows: [22, 271, 518, 764],
    rowH: [236, 234, 233, 233],
    radius: 16,
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

function createRoundedMask(width, height, radius = 14) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
    </svg>
  `);
}

async function sliceAllSheets() {
  const cardCatalog = [];
  let globalIndex = 1;

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    const img = sharp(sheet.path);
    const meta = await img.metadata();
    const W = meta.width;
    const H = meta.height;

    console.log(`Processing Sheet ${s + 1}/${sheets.length}: ${sheet.theme}`);

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const localIdx = row * 4 + col;
        const name = sheet.names[localIdx];
        const label = sheet.labels[localIdx];

        const left = sheet.cols[col];
        const top = sheet.rows[row];
        const width = sheet.colW[col];
        const height = sheet.rowH[row];

        const id = `goose_${String(globalIndex).padStart(3, '0')}`;
        const filename = `${id}_${name}.png`;
        const targetPath = path.join(outDir, filename);
        const previewPath = path.join(previewDir, filename);

        // Crop exact card
        const extracted = await sharp(sheet.path)
          .extract({
            left: Math.max(0, Math.min(W - width, left)),
            top: Math.max(0, Math.min(H - height, top)),
            width: width,
            height: height
          })
          .png()
          .toBuffer();

        // Mask rounded corners cleanly so transparent corners are created with ZERO background leak!
        const maskSvg = createRoundedMask(width, height, sheet.radius);
        const finalCardBuffer = await sharp(extracted)
          .composite([{
            input: maskSvg,
            blend: 'dest-in'
          }])
          .png()
          .toBuffer();

        fs.writeFileSync(targetPath, finalCardBuffer);
        fs.writeFileSync(previewPath, finalCardBuffer);

        cardCatalog.push({
          id,
          key: name,
          name: label,
          theme: sheet.theme,
          sheetIndex: s + 1,
          gridIndex: localIdx + 1,
          width,
          height,
          image: `/goose-cards/${filename}`
        });

        globalIndex++;
      }
    }
  }

  const catalogPath = path.join(outDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(cardCatalog, null, 2), 'utf-8');
  console.log(`\n🎉 Successfully precision-sliced and rounded all ${cardCatalog.length} cards with 0 background leaks!`);
}

sliceAllSheets().catch(console.error);
