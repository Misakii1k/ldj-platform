export interface NotionAvatarItem {
  id: string;
  name: string;
  category: 'notion60' | 'mystery' | 'cards' | 'party' | 'fantasy';
  categoryName: string;
  src: string;
}

export const NOTION_CATEGORIES = [
  { id: 'all', name: '全部 (130+)' },
  { id: 'notion60', name: '✨ 经典 60 款' },
  { id: 'mystery', name: '🕵️ 智谋推理' },
  { id: 'cards', name: '🃏 牌桌圣手' },
  { id: 'party', name: '☕ 聚会日常' },
  { id: 'fantasy', name: '🤖 奇幻潮酷' },
] as const;

// 经典 60+ 款 Notion 专属头像（对应原图 70 个独立人设）
const NOTION_60_NAMES: string[] = [
  // 第一排 01-15
  '卷发阳光男', '温婉齐肩女', '短发干练男', '丸子头甜妹', '圆镜学者', '微卷知性女', '蓬松卷发男', '法式贝雷帽',
  '侧分清爽男', '黑框眼镜妹', '短卷发少年', '棒球帽潮人', '空气刘海妹', '圆框文静男',
  // 第二排 16-30
  '黑长直御姐', '邻家暖心男', '双丸子头妹', '微笑少年', '毛线帽胡茬大叔', '利落马尾妹', '细框斯文男', '齐刘海波波头',
  '蓬松碎发男', '高丸子头女', '大耳麦电竞女', '休闲渔夫帽', '蝴蝶结发带妹', '胡茬型男',
  // 第三排 31-45
  '清爽少年', '微卷发气质女', '反戴棒球帽男', '黑框长发女', '微卷刘海男', '度假草帽女', '络腮胡暖男', '微卷波浪女',
  '格子衬衫男', '丸子头圆镜妹', '卷发少年', '海滩遮阳帽女', '中分长发女', '连帽衫黑框男',
  // 第四排 46-60
  '复古发箍女', '清爽寸头胡茬男', '大波浪卷发女', '黑框乖巧男', '齐肩内扣妹', '微卷短发男', '脏辫编发潮人', '酷感卫衣男',
  '头顶墨镜潮妹', '中分少年', '长发圆框女', '绅士礼帽男', '双麻花辫妹', '连帽衫帅哥',
  // 第五排 奇幻角色篇 61-70
  '呆萌恐龙睡衣', '独眼海盗船长', '圣殿铁头盔骑士', '群星大法师', '德古拉吸血鬼', '软萌猫耳兜帽', '恶魔角眼镜男',
  '华丽王冠国王', '暗部眼罩刺客', '太空宇航员', '异域行者头巾', '大礼帽绅士', '长发飘逸贤者', '灵动猫耳少女'
];

export const NOTION_60_AVATARS: NotionAvatarItem[] = Array.from({ length: 70 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  return {
    id: `notion60_${num}`,
    name: NOTION_60_NAMES[i] || `Notion #${num}`,
    category: 'notion60',
    categoryName: '经典 60 款',
    src: `/assets/avatars/notion60/avatar_${num}.png`,
  };
});

// 手绘黑白高保真 Notion 风格头像（64款）
export const NOTION_EXPANDED_AVATARS: NotionAvatarItem[] = [
  // Sheet 1: 智谋推理与狼人 (01-16)
  { id: 'notion_01', name: '侦探福尔', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_01.png' },
  { id: 'notion_02', name: '墨镜卧底', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_02.png' },
  { id: 'notion_03', name: '单镜名媛', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_03.png' },
  { id: 'notion_04', name: '烟斗学者', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_04.png' },
  { id: 'notion_05', name: '正义法官', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_05.png' },
  { id: 'notion_06', name: '暗影怪盗', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_06.png' },
  { id: 'notion_07', name: '萌狼少年', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_07.png' },
  { id: 'notion_08', name: '红月女巫', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_08.png' },
  { id: 'notion_09', name: '神射游侠', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_09.png' },
  { id: 'notion_10', name: '圣殿骑士', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_10.png' },
  { id: 'notion_11', name: '丘比特', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_11.png' },
  { id: 'notion_12', name: '呆萌村民', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_12.png' },
  { id: 'notion_13', name: '鸟嘴疫医', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_13.png' },
  { id: 'notion_14', name: '水晶占卜', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_14.png' },
  { id: 'notion_15', name: '暗部刺客', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_15.png' },
  { id: 'notion_16', name: '飘飘幽灵', category: 'mystery', categoryName: '智谋推理', src: '/assets/avatars/notion/notion_16.png' },

  // Sheet 2: 牌桌高手与卡牌 (17-32)
  { id: 'notion_17', name: '黑桃赌神', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_17.png' },
  { id: 'notion_18', name: '幸运骰子', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_18.png' },
  { id: 'notion_19', name: 'UNO战神', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_19.png' },
  { id: 'notion_20', name: '地主财爷', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_20.png' },
  { id: 'notion_21', name: '草帽农夫', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_21.png' },
  { id: 'notion_22', name: '牌桌荷官', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_22.png' },
  { id: 'notion_23', name: '魔术大师', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_23.png' },
  { id: 'notion_24', name: '爆炸头', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_24.png' },
  { id: 'notion_25', name: '垄断大亨', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_25.png' },
  { id: 'notion_26', name: '听骰盲打', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_26.png' },
  { id: 'notion_27', name: '冠军金牌', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_27.png' },
  { id: 'notion_28', name: '电竞少女', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_28.png' },
  { id: 'notion_29', name: '灵感灯泡', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_29.png' },
  { id: 'notion_30', name: '暗夜吸血鬼', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_30.png' },
  { id: 'notion_31', name: '科学怪人', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_31.png' },
  { id: 'notion_32', name: '狐仙面具', category: 'cards', categoryName: '牌桌圣手', src: '/assets/avatars/notion/notion_32.png' },

  // Sheet 3: 聚会日常与萌趣 (33-48)
  { id: 'notion_33', name: '珍珠奶茶', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_33.png' },
  { id: 'notion_34', name: '爆米花桶', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_34.png' },
  { id: 'notion_35', name: '耳机摸鱼', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_35.png' },
  { id: 'notion_36', name: '顶猫达人', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_36.png' },
  { id: 'notion_37', name: '柴犬憨憨', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_37.png' },
  { id: 'notion_38', name: '恐龙睡衣', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_38.png' },
  { id: 'notion_39', name: '咖啡重度', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_39.png' },
  { id: 'notion_40', name: '披萨吃货', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_40.png' },
  { id: 'notion_41', name: '复古拍立得', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_41.png' },
  { id: 'notion_42', name: '派对吹龙', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_42.png' },
  { id: 'notion_43', name: '手柄狂热', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_43.png' },
  { id: 'notion_44', name: '修仙熊猫', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_44.png' },
  { id: 'notion_45', name: '毛线帽文青', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_45.png' },
  { id: 'notion_46', name: '爱心气球', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_46.png' },
  { id: 'notion_47', name: '头顶书卷', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_47.png' },
  { id: 'notion_48', name: '文艺画师', category: 'party', categoryName: '聚会日常', src: '/assets/avatars/notion/notion_48.png' },

  // Sheet 4: 奇幻潮酷与街机 (49-64)
  { id: 'notion_49', name: '复古街机', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_49.png' },
  { id: 'notion_50', name: '赛博护目', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_50.png' },
  { id: 'notion_51', name: '太空漫游', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_51.png' },
  { id: 'notion_52', name: '8-bit墨镜', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_52.png' },
  { id: 'notion_53', name: '发条齿轮', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_53.png' },
  { id: 'notion_54', name: '绿皮外星人', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_54.png' },
  { id: 'notion_55', name: '中世纪国王', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_55.png' },
  { id: 'notion_56', name: '优雅王后', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_56.png' },
  { id: 'notion_57', name: '吟游诗人', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_57.png' },
  { id: 'notion_58', name: '呆萌小龙', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_58.png' },
  { id: 'notion_59', name: '魔法学徒', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_59.png' },
  { id: 'notion_60', name: '王牌小丑', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_60.png' },
  { id: 'notion_61', name: '独眼海盗船长', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_61.png' },
  { id: 'notion_62', name: '木叶忍者', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_62.png' },
  { id: 'notion_63', name: '埃及法老', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_63.png' },
  { id: 'notion_64', name: '维京战神', category: 'fantasy', categoryName: '奇幻潮酷', src: '/assets/avatars/notion/notion_64.png' },
];

export const NOTION_AVATARS: NotionAvatarItem[] = [
  ...NOTION_60_AVATARS,
  ...NOTION_EXPANDED_AVATARS,
];
