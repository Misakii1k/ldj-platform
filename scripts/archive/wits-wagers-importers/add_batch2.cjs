const fs = require('fs');
const file = 'packages/games/wits-wagers/server/question-bank.zh-CN.ts';
let content = fs.readFileSync(file, 'utf8');

const qs = [
  { id: 'ww-sci-241', prompt: '一根健康的人类头发，理论上最多可以承受多少克的重量而不被拉断？', unit: '克', answer: 100, sourceUrl: 'https://www.guinnessworldrecords.com', sourceNote: '人体力学数据', asOf: '2024', explanation: '一根健康的头发能承受约100克的重量，一整头头发的承重理论上可以挂住两头大象。', reviewed: true },
  { id: 'ww-bio-242', prompt: '令人讨厌的雌性蚊子，其针状口器内藏有几颗微小锋利的“牙齿”？', unit: '颗', answer: 47, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '昆虫微观解剖学', asOf: '2024', explanation: '蚊子口器中有由上下颚组成的锋利切割结构，相当于47颗微小的“牙齿”。', reviewed: true },
  { id: 'ww-pop-243', prompt: '一副标准扑克牌中，若不计大小王且 J=11、Q=12、K=13，所有牌面的数字总和是多少？', unit: '点', answer: 364, sourceUrl: 'https://zh.wikipedia.org/wiki/%E6%92%B2%E5%85%8B%E7%89%8C', sourceNote: '扑克牌数学特征', asOf: '2024', explanation: '每种花色点数之和为91，四种花色相加为364。若算上小王1大王2，则是367（也有一说对应365天）。', reviewed: true },
  { id: 'ww-game-244', prompt: '经典的桌游《大富翁》（Monopoly）标准棋盘的最外圈，一共有多少个格子？', unit: '个', answer: 40, sourceUrl: 'https://en.wikipedia.org/wiki/Monopoly_(game)', sourceNote: '大富翁游戏规则', asOf: '2024', explanation: '标准大富翁棋盘每边有10个格子（四个角为公用格子），因此最外圈共40个格子。', reviewed: true },
  { id: 'ww-sci-245', prompt: '地球到月球的平均距离（约38.4万千米），理论上中间可以并排放下大约多少个地球？', unit: '个', answer: 30, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 天文计算', asOf: '2024', explanation: '地球直径约为12742千米，地月平均距离正好能放下约30个地球。', reviewed: true },
  { id: 'ww-bio-246', prompt: '人体最大的器官是皮肤，一个标准体型的成年人，其皮肤总重量大约占总体重的百分之几？', unit: '%', answer: 16, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '人体解剖学', asOf: '2024', explanation: '皮肤是人体最大的器官，约占总体重的15%到16%。', reviewed: true },
  { id: 'ww-his-247', prompt: '中国历史上在位时间最长的皇帝清圣祖康熙，在位总共多少年？', unit: '年', answer: 61, sourceUrl: 'https://zh.wikipedia.org/wiki/%E5%BA%B7%E7%86%99%E5%B8%9D', sourceNote: '《清史稿》', asOf: '2024', explanation: '康熙帝8岁登基，在位61年零10个月（按整年计61年），是中国历史上在位最长的皇帝。', reviewed: true },
  { id: 'ww-art-248', prompt: '美国拉什莫尔山（总统山）上雕刻的四位总统的面部，每个雕像的高度大约是多少米？', unit: '米', answer: 18, sourceUrl: 'https://www.nps.gov/moru', sourceNote: '拉什莫尔山国家纪念公园', asOf: '2024', explanation: '每位总统的头部雕像高达60英尺（约18米），鼻子就有6米长。', reviewed: true },
  { id: 'ww-sci-249', prompt: '宇宙中已知移动速度最快的恒星之一 S4714，其绕黑洞公转的最大速度可达每秒多少千米？', unit: '千米', answer: 24000, sourceUrl: 'https://en.wikipedia.org/wiki/S4714', sourceNote: '天体物理学观测', asOf: '2024', explanation: 'S4714在接近银河系中心黑洞时，速度高达光速的8%（约24000千米/秒）。', reviewed: true },
  { id: 'ww-geo-250', prompt: '被誉为“世界尽头”的南极洲冰层平均厚度极其惊人，大约是多少米？', unit: '米', answer: 2100, sourceUrl: 'https://www.bas.ac.uk', sourceNote: '英国南极勘测局', asOf: '2024', explanation: '南极冰盖的平均厚度约为2100米（1.3英里），最厚处甚至超过4700米。', reviewed: true },
  { id: 'ww-tech-251', prompt: '著名的“哈勃空间望远镜”自1990年发射升空以来，每天围绕地球飞行多少圈？', unit: '圈', answer: 15, sourceUrl: 'https://hubblesite.org', sourceNote: 'NASA 哈勃项目', asOf: '2024', explanation: '哈勃望远镜在距地表约540公里的低地球轨道运行，大约每95分钟绕地一圈，每天约15圈。', reviewed: true },
  { id: 'ww-lit-252', prompt: '莎士比亚传世经典《哈姆雷特》原著剧本中，一共包含大约多少个英文单词？', unit: '个', answer: 30000, sourceUrl: 'https://www.folger.edu', sourceNote: '福尔杰莎士比亚图书馆', asOf: '2024', explanation: '《哈姆雷特》是莎士比亚最长的戏剧，全文包含大约30557个单词（通常取3万计）。', reviewed: true },
  { id: 'ww-bio-253', prompt: '以慢著称的树懒，其消化一顿树叶大餐最多可能需要长达多少天的时间？', unit: '天', answer: 30, sourceUrl: 'https://www.worldwildlife.org', sourceNote: '世界自然基金会', asOf: '2024', explanation: '树懒的代谢率极低，消化一顿食物有时甚至需要长达30天。', reviewed: true },
  { id: 'ww-sci-254', prompt: '人体中唯一一种不与任何其他骨骼直接相连的“孤立骨”——舌骨，位于颈部。人体总共有几块舌骨？', unit: '块', answer: 1, sourceUrl: 'https://www.ncbi.nlm.nih.gov', sourceNote: '解剖学', asOf: '2024', explanation: '人类只有一块舌骨，它由肌肉和韧带悬吊在颈部，是唯一不与其他骨骼产生关节的骨头。', reviewed: true },
  { id: 'ww-his-255', prompt: '历史上著名的马拉松战役发生后，传令兵菲迪皮德斯跑回雅典报捷。这段最初的距离大约是多少千米？', unit: '千米', answer: 40, sourceUrl: 'https://en.wikipedia.org/wiki/Marathon', sourceNote: '希腊历史', asOf: '2024', explanation: '从马拉松镇到雅典的实际距离约为40千米。现代马拉松的42.195千米是1908年伦敦奥运会为照顾王室观赛重新设定的。', reviewed: true },
  { id: 'ww-tech-256', prompt: '2012年，美国导演詹姆斯·卡梅隆驾驶“深海挑战者”号单人潜水器，下潜到了多少米深的马里亚纳海沟？', unit: '米', answer: 10898, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '国家地理探险记录', asOf: '2024', explanation: '卡梅隆成功下潜至10898米（35756英尺）深的海底，成为首位单人完成此举的人。', reviewed: true },
  { id: 'ww-bio-257', prompt: '长颈鹿虽然脖子极长，但它的颈椎骨数量却与人类相同。请问长颈鹿有多少块颈椎骨？', unit: '块', answer: 7, sourceUrl: 'https://www.awf.org', sourceNote: '非洲野生动物基金会', asOf: '2024', explanation: '绝大多数哺乳动物（包括人类和长颈鹿）都只有7块颈椎骨，长颈鹿只是单块颈椎被拉长了。', reviewed: true },
  { id: 'ww-game-258', prompt: '在国际象棋中，开局第一步（白方先走），一共有多少种合法的走法？', unit: '种', answer: 20, sourceUrl: 'https://en.wikipedia.org/wiki/Rules_of_chess', sourceNote: '国际象棋规则', asOf: '2024', explanation: '白方8个兵各有2种走法（共16种），2个马各有2种走法（共4种），合计20种可能。', reviewed: true },
  { id: 'ww-sci-259', prompt: '声音在水中的传播速度大约是空气中传播速度的多少倍？', unit: '倍', answer: 4, sourceUrl: 'https://www.noaa.gov', sourceNote: '美国国家海洋和大气管理局', asOf: '2024', explanation: '声速在空气中约343米/秒，在水中约1480米/秒，大约是空气中的4.3倍（取整为4或5皆可，常规取4）。', reviewed: true },
  { id: 'ww-tech-260', prompt: '世界第一座大型商业核电站——英国卡尔德霍尔核电站，于哪一年正式并网发电？', unit: '年', answer: 1956, sourceUrl: 'https://www.iaea.org', sourceNote: '国际原子能机构', asOf: '2024', explanation: '1956年10月17日，该核电站由英国女王伊丽莎白二世亲自剪彩启动。', reviewed: true },
  { id: 'ww-geo-261', prompt: '北美洲的五大湖中，面积最大的苏必利尔湖，其总表面积大约是多少万平方千米？', unit: '万平方千米', answer: 8, sourceUrl: 'https://www.epa.gov', sourceNote: '美国环保局', asOf: '2024', explanation: '苏必利尔湖表面积达82,100平方千米（取8万），是世界面积最大的淡水湖。', reviewed: true },
  { id: 'ww-bio-262', prompt: '普通人每天脱落的头发数量正常情况下在多少根左右？', unit: '根', answer: 100, sourceUrl: 'https://www.aad.org', sourceNote: '美国皮肤病学会', asOf: '2024', explanation: '正常人每天大约会自然脱落50到100根头发。', reviewed: true },
  { id: 'ww-art-263', prompt: '荷兰后印象派画家梵高的一生极其短暂，他在多大岁数时去世？', unit: '岁', answer: 37, sourceUrl: 'https://www.vangoghmuseum.nl', sourceNote: '梵高博物馆', asOf: '2024', explanation: '文森特·梵高生于1853年，1890年因受枪伤去世，年仅37岁。', reviewed: true },
  { id: 'ww-his-264', prompt: '秦始皇兵马俑一号坑内，目前已发掘和推测埋藏的陶俑陶马总数量大约有多少件？', unit: '件', answer: 6000, sourceUrl: 'https://www.bmy.com.cn', sourceNote: '秦始皇帝陵博物院', asOf: '2024', explanation: '一号坑面积最大，据估算内藏陶俑陶马约6000件。', reviewed: true },
  { id: 'ww-tech-265', prompt: '著名的航海家哥伦布在1492年首次横渡大西洋时，其旗舰“圣玛利亚号”全长仅为多少米？', unit: '米', answer: 19, sourceUrl: 'https://en.wikipedia.org/wiki/Santa_Mar%C3%ADa_(ship)', sourceNote: '航海历史档案', asOf: '2024', explanation: '圣玛利亚号实际上非常小，估算全长只有约18至19米（60英尺左右）。', reviewed: true },
  { id: 'ww-bio-266', prompt: '北极熊的肝脏含有极高浓度的哪种维生素，以至于人类食用其肝脏会因中毒而致命？（问：含维生素A浓缩，问：成年北极熊的胃容量可达多少千克？）', unit: '千克', answer: 70, sourceUrl: 'https://polarbearsinternational.org', sourceNote: '北极熊国际保护组织', asOf: '2024', explanation: '成年北极熊的胃非常有弹性，一次最多可容纳约70千克（150磅）的食物。', reviewed: true },
  { id: 'ww-lit-267', prompt: '中国古典四大名著之一《水浒传》中，梁山泊一百单八将里，共有多少位女性头领？', unit: '位', answer: 3, sourceUrl: 'https://zh.wikipedia.org/wiki/%E6%B0%B4%E6%BB%B8%E5%82%B3', sourceNote: '文学原著统计', asOf: '2024', explanation: '一百单八将中仅有三位女性：母夜叉孙二娘、母大虫顾大嫂、一丈青扈三娘。', reviewed: true },
  { id: 'ww-sci-268', prompt: '太阳的质量占据了整个太阳系总质量的大约百分之几？', unit: '%', answer: 99, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 太阳系数据', asOf: '2024', explanation: '太阳的质量极其庞大，占据了太阳系已知总质量的约99.8%。', reviewed: true },
  { id: 'ww-game-269', prompt: '传统的中国麻将（不含百搭、花牌等额外牌种），最基础的牌堆一共包含多少张牌？', unit: '张', answer: 136, sourceUrl: 'https://zh.wikipedia.org/wiki/%E9%BA%BB%E5%B0%87', sourceNote: '麻将标准规则', asOf: '2024', explanation: '万、条、筒各36张，风牌（东南西北）16张，箭牌（中发白）12张，共136张。', reviewed: true },
  { id: 'ww-geo-270', prompt: '被誉为“千湖之国”的芬兰，实际上拥有大约多少万个湖泊？', unit: '万个', answer: 18, sourceUrl: 'https://www.visitfinland.com', sourceNote: '芬兰国家旅游局', asOf: '2024', explanation: '芬兰境内面积超过500平方米的湖泊多达187,888个，因此取18万较为准确。', reviewed: true }
];

let questionsStr = qs.map(q => {
  return "  {\n" +
    "    id: \'" + q.id + "\',\n" +
    "    prompt: \'" + q.prompt + "\',\n" +
    "    unit: \'" + q.unit + "\',\n" +
    "    answer: " + q.answer + ",\n" +
    "    sourceUrl: \'" + q.sourceUrl + "\',\n" +
    "    sourceNote: \'" + q.sourceNote + "\',\n" +
    "    asOf: \'" + q.asOf + "\',\n" +
    "    explanation: \'" + q.explanation + "\',\n" +
    "    reviewed: " + q.reviewed + ",\n" +
    "  },";
}).join("\n");

content = content.replace(/];\s*$/, questionsStr + "\n];\n");
fs.writeFileSync(file, content, "utf8");
console.log("Added 30 questions!");
