import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcDir = 'C:/Users/87850/Desktop/鸭子卡片裁切';
const outDir = 'd:/项目/packages/client/public/goose-cards';
const previewDir = 'C:/Users/87850/.gemini/antigravity/brain/000a5de9-3625-46f8-8228-425d7498996e/duck_preview';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

// 1. Delete all existing old cards in outDir
const oldFiles = fs.readdirSync(outDir);
for (const f of oldFiles) {
  fs.unlinkSync(path.join(outDir, f));
}
console.log(`Cleaned ${oldFiles.length} old files from ${outDir}`);

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

function createRoundedMask(width, height, radius = 18) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
    </svg>
  `);
}

async function importDuckCards() {
  const cardCatalog = [];
  const cardMap = {};
  const characterKeys = [];
  let globalIndex = 1;

  const targetW = 320;
  const targetH = 440;

  for (const sheet of sheetDefs) {
    const sNum = sheet.sheetIndex;
    console.log(`Importing Sheet ${sNum}: ${sheet.themeName}...`);

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

        // Standardize card size to 320x440 with smooth rounded corners
        const maskSvg = createRoundedMask(targetW, targetH, 20);

        const processed = await sharp(srcPath)
          .resize(targetW, targetH, {
            fit: 'fill'
          })
          .composite([{
            input: maskSvg,
            blend: 'dest-in'
          }])
          .png()
          .toBuffer();

        fs.writeFileSync(outPath, processed);
        fs.writeFileSync(previewPath, processed);

        const cardMeta = {
          id,
          key: name,
          name: label,
          theme: sheet.theme,
          sheetIndex: sNum,
          gridIndex: localIdx + 1,
          width: targetW,
          height: targetH,
          image: `/goose-cards/${outFileName}`
        };

        cardCatalog.push(cardMeta);
        cardMap[name] = cardMeta;
        characterKeys.push(name);

        globalIndex++;
      }
    }
  }

  // Save catalog.json
  const catalogPath = path.join(outDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(cardCatalog, null, 2), 'utf-8');

  // Update client cardCatalog.ts
  const cardCatalogTs = `/** 80 张桌面鸭子卡片高清图库与中文名称映射表 */
import type { CharacterId } from './types.ts';

export interface GooseCardMeta {
  id: string;
  key: CharacterId;
  name: string;
  theme: string;
  image: string;
}

export const GOOSE_CARD_MAP: Record<CharacterId, GooseCardMeta> = ${JSON.stringify(cardMap, null, 2)} as Record<CharacterId, GooseCardMeta>;

export function getGooseCard(key: CharacterId): GooseCardMeta {
  return GOOSE_CARD_MAP[key] ?? {
    id: key,
    key,
    name: key,
    theme: 'unknown',
    image: '/goose-cards/goose_001_detective.png',
  };
}
`;
  fs.writeFileSync('packages/client/src/game/goose-relay/cardCatalog.ts', cardCatalogTs, 'utf-8');

  console.log(`\n🎉 Successfully imported all ${cardCatalog.length} duck cards!`);
  console.log('Character keys count:', characterKeys.length);
}

importDuckCards().catch(console.error);
