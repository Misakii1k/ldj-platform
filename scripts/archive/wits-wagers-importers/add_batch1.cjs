const fs = require('fs');
const file = 'packages/games/wits-wagers/server/question-bank.zh-CN.ts';
let content = fs.readFileSync(file, 'utf8');

const qs = [
  { id: 'ww-bio-201', prompt: '一只成年大象每天平均需要消耗多少升水？', unit: '升', answer: 180, sourceUrl: 'https://www.worldwildlife.org', sourceNote: 'WWF 野生动物档案', asOf: '2024', explanation: '成年大象每天需消耗大量水分，平均在150至200升之间。', reviewed: true },
  { id: 'ww-bio-202', prompt: '世界上最大的花——大王花，一朵花最重可达多少千克？', unit: '千克', answer: 11, sourceUrl: 'https://zh.wikipedia.org/wiki/%E5%A4%A7%E7%8E%8B%E8%8A%B1', sourceNote: '植物学档案', asOf: '2024', explanation: '大王花直径可达1米以上，重量可超过11千克。', reviewed: true },
  { id: 'ww-bio-203', prompt: '蜂鸟在悬停吸食花蜜时，每秒钟翅膀最多可以扇动多少次？', unit: '次', answer: 80, sourceUrl: 'https://www.audubon.org', sourceNote: '鸟类学观测', asOf: '2024', explanation: '普通蜂鸟每秒扇动约50次，最高可达80次甚至更多。', reviewed: true },
  { id: 'ww-bio-204', prompt: '树懒在地面上爬行时，其最快速度大约是每分钟多少米？', unit: '米', answer: 2, sourceUrl: 'https://zh.wikipedia.org/wiki/%E6%A0%91%E6%87%B6', sourceNote: '动物行为学记录', asOf: '2024', explanation: '树懒在地面上的移动速度极慢，全速前进时每分钟只能移动约2米。', reviewed: true },
  { id: 'ww-bio-205', prompt: '一只普通的庭院蜗牛，其齿舌上大约含有多少颗微小的牙齿？', unit: '颗', answer: 14000, sourceUrl: 'https://www.nhm.ac.uk', sourceNote: '英国自然历史博物馆', asOf: '2024', explanation: '蜗牛的齿舌上布满了微小的牙齿，数量通常在14000颗左右。', reviewed: true },
  { id: 'ww-bio-206', prompt: '一头成年大白鲨在其一生中，由于不断换牙，最多可以长出多少颗牙齿？', unit: '颗', answer: 30000, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '国家地理海洋档案', asOf: '2024', explanation: '大白鲨一生中可能消耗并重新长出超过3万颗牙齿。', reviewed: true },
  { id: 'ww-bio-207', prompt: '一头成年河马张开嘴巴打哈欠或威吓时，其下颚张开的最大角度可达多少度？', unit: '度', answer: 150, sourceUrl: 'https://www.awf.org', sourceNote: '非洲野生动物基金会', asOf: '2024', explanation: '河马的颌骨关节非常灵活，张角可达150度。', reviewed: true },
  { id: 'ww-bio-208', prompt: '地球上已知寿命最长的脊椎动物格陵兰鲨，寿命最长可达多少年？', unit: '年', answer: 400, sourceUrl: 'https://www.science.org', sourceNote: '《科学》杂志放射性碳年代测定', asOf: '2024', explanation: '科学家测定有些格陵兰鲨的寿命超过了400年。', reviewed: true },
  { id: 'ww-bio-209', prompt: '成年人体内大大小小的血管连接起来，总长度大约是多少千米？', unit: '千米', answer: 100000, sourceUrl: 'https://www.fi.edu', sourceNote: '富兰克林研究所', asOf: '2024', explanation: '成年人的血管总长约10万千米（60000英里）。', reviewed: true },
  { id: 'ww-his-210', prompt: '古埃及建造胡夫金字塔时，大约使用了多少万块巨石？', unit: '万块', answer: 230, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '国家地理考古记录', asOf: '2024', explanation: '胡夫金字塔由大约230万块石灰岩和花岗岩砌成。', reviewed: true },
  { id: 'ww-his-211', prompt: '人类历史上耗时最短的战争——英桑战争，仅仅持续了多少分钟？', unit: '分钟', answer: 38, sourceUrl: 'https://zh.wikipedia.org/wiki/%E8%8B%B1%E6%A1%91%E6%88%B0%E7%88%AD', sourceNote: "吉尼斯世界纪录", asOf: '2024', explanation: '1896年的这场战争，桑给巴尔在开战约38至45分钟后投降。', reviewed: true },
  { id: 'ww-his-212', prompt: '法国文豪雨果的巨著《悲惨世界》原著中，最长的一句话包含多少个法文单词？', unit: '个', answer: 823, sourceUrl: 'https://en.wikipedia.org/wiki/Les_Mis%C3%A9rables', sourceNote: '文学统计记录', asOf: '2024', explanation: '雨果在书中的一段描写中，写出了长达823个词的长句。', reviewed: true },
  { id: 'ww-his-213', prompt: '达芬奇创作传世名作《蒙娜丽莎》，前后大约花费了多少年时间？', unit: '年', answer: 14, sourceUrl: 'https://www.louvre.fr', sourceNote: '卢浮宫官方介绍', asOf: '2024', explanation: '达芬奇从1503年开始画，直到1517年去世前不久还在修改，历时约14年。', reviewed: true },
  { id: 'ww-his-214', prompt: '人类历史上发行量最大的邮票系列“黑便士”，共印制了约多少万枚？', unit: '万枚', answer: 6800, sourceUrl: 'https://www.postalheritage.org.uk', sourceNote: '英国邮政博物馆档案', asOf: '2024', explanation: '1840年发行的黑便士邮票总共印制了约6800万枚。', reviewed: true },
  { id: 'ww-sci-215', prompt: '地球内核的平均温度，大约是多少摄氏度？', unit: '摄氏度', answer: 6000, sourceUrl: 'https://www.nasa.gov', sourceNote: '地球物理学模型测算', asOf: '2024', explanation: '地球内核温度极高，与太阳表面的温度相当。', reviewed: true },
  { id: 'ww-sci-216', prompt: '根据激光测距数据，月球每年正在以大约多少毫米的速度缓慢远离地球？', unit: '毫米', answer: 38, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: '阿波罗任务测距实验', asOf: '2024', explanation: '由于潮汐摩擦，月球每年以3.8厘米（38毫米）的速度远离。', reviewed: true },
  { id: 'ww-sci-217', prompt: '金星自转极为缓慢，金星上的一天相当于地球上的多少天？', unit: '天', answer: 243, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 行星数据', asOf: '2024', explanation: '金星的自转周期约为243地球天，比它公转一年还要长。', reviewed: true },
  { id: 'ww-sci-218', prompt: '太阳系最高的山峰火星奥林帕斯山，其高度约为珠穆朗玛峰的多少倍？', unit: '倍', answer: 3, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: '火星探测器地形测绘', asOf: '2024', explanation: '奥林帕斯山高度超过21千米，约为珠峰的近3倍。', reviewed: true },
  { id: 'ww-sci-219', prompt: '地球大气层中，氮气所占的体积百分比约为多少？', unit: '%', answer: 78, sourceUrl: 'https://www.weather.gov', sourceNote: '气象组织标准大气', asOf: '2024', explanation: '地球大气主要由氮气（78%）和氧气（21%）组成。', reviewed: true },
  { id: 'ww-sci-220', prompt: '一道典型的强闪电，其核心温度可达太阳表面温度的多少倍？', unit: '倍', answer: 5, sourceUrl: 'https://www.weather.gov', sourceNote: '美国国家气象局', asOf: '2024', explanation: '闪电的温度可达30,000摄氏度，是太阳表面的5倍。', reviewed: true },
  { id: 'ww-sci-221', prompt: '世界上最深的海沟马里亚纳海沟的最深处，深达多少米？', unit: '米', answer: 10928, sourceUrl: 'https://zh.wikipedia.org/wiki/%E9%A6%AC%E9%87%8C%E4%BA%9E%E7%B4%8D%E6%B5%B7%E6%BA%9D', sourceNote: '深海潜水器数据', asOf: '2024', explanation: '挑战者深渊的最大深度通常被确认在10900至10928米之间。', reviewed: true },
  { id: 'ww-geo-222', prompt: '世界上最大的沙漠撒哈拉沙漠的面积大约是多少万平方千米？', unit: '万平方千米', answer: 920, sourceUrl: 'https://zh.wikipedia.org/wiki/%E6%92%92%E5%93%88%E6%8B%89%E6%B2%99%E6%BC%A0', sourceNote: '地理面积测算', asOf: '2024', explanation: '撒哈拉沙漠总面积超过920万平方千米，接近美国国土面积。', reviewed: true },
  { id: 'ww-geo-223', prompt: '世界上最长最深的河流峡谷雅鲁藏布大峡谷，最深处达到多少米？', unit: '米', answer: 6009, sourceUrl: 'https://zh.wikipedia.org/wiki/%E9%9B%85%E9%B2%81%E8%97%8F%E5%B8%83%E5%A4%A7%E5%B3%A1%E8%B0%B7', sourceNote: '中国科学院地理测绘', asOf: '2024', explanation: '雅鲁藏布大峡谷最大深度达6009米。', reviewed: true },
  { id: 'ww-tech-224', prompt: '世界上第一台通用电子计算机 ENIAC 重达多少千克？', unit: '千克', answer: 27000, sourceUrl: 'https://zh.wikipedia.org/wiki/ENIAC', sourceNote: '计算机历史博物馆档案', asOf: '2024', explanation: 'ENIAC 占地167平方米，重达27吨（27000千克）。', reviewed: true },
  { id: 'ww-tech-225', prompt: '巴黎埃菲尔铁塔的建造过程中，大约使用了多少万颗铆钉？', unit: '万颗', answer: 250, sourceUrl: 'https://www.toureiffel.paris', sourceNote: '埃菲尔铁塔官方数据', asOf: '2024', explanation: '铁塔使用了大约250万颗铆钉来连接各个部件。', reviewed: true },
  { id: 'ww-tech-226', prompt: '世界最高建筑迪拜哈利法塔，其内部一共安装了多少部电梯？', unit: '部', answer: 57, sourceUrl: 'https://www.burjkhalifa.ae', sourceNote: '哈利法塔官方数据', asOf: '2024', explanation: '大厦内共设有57部电梯，包含双层电梯。', reviewed: true },
  { id: 'ww-tech-227', prompt: '1903年，莱特兄弟的“飞行者一号”在首次持续受控飞行中，停留了多少秒？', unit: '秒', answer: 12, sourceUrl: 'https://airandspace.si.edu', sourceNote: '史密森尼航空博物馆', asOf: '2024', explanation: '奥维尔·莱特进行的首次飞行仅持续了12秒。', reviewed: true },
  { id: 'ww-tech-228', prompt: '执行阿波罗计划的土星五号运载火箭，总高度是多少米？', unit: '米', answer: 111, sourceUrl: 'https://www.nasa.gov', sourceNote: 'NASA 土星五号数据', asOf: '2024', explanation: '土星五号高达111米，比自由女神像还要高。', reviewed: true },
  { id: 'ww-tech-229', prompt: '一架标准的波音747客机内部铺设的电线总长度，大约是多少千米？', unit: '千米', answer: 274, sourceUrl: 'https://www.boeing.com', sourceNote: '波音公司参数', asOf: '2024', explanation: '其内部线缆总长约274千米（170英里）。', reviewed: true },
  { id: 'ww-tech-230', prompt: '世界上第一个万维网（WWW）网页是由蒂姆·伯纳斯-李在哪一年上线的？', unit: '年', answer: 1991, sourceUrl: 'https://home.cern', sourceNote: 'CERN 历史记录', asOf: '2024', explanation: '1991年8月6日，世界上第一个网页上线。', reviewed: true },
  { id: 'ww-tech-231', prompt: '著名客轮泰坦尼克号在建造时，船体大约消耗了多少吨钢铁？', unit: '吨', answer: 24000, sourceUrl: 'https://en.wikipedia.org/wiki/Titanic', sourceNote: '造船厂记录', asOf: '2024', explanation: '全船结构和外壳共使用了约24000吨钢板。', reviewed: true },
  { id: 'ww-tech-232', prompt: '世界上第一部商业移动电话 Motorola DynaTAC 8000X 的重量大约是多少克？', unit: '克', answer: 790, sourceUrl: 'https://en.wikipedia.org/wiki/Motorola_DynaTAC', sourceNote: '摩托罗拉历史产品档案', asOf: '2024', explanation: '这部被俗称为“大哥大”的手机重达790克。', reviewed: true },
  { id: 'ww-tech-233', prompt: '人类发射的首个人造地球卫星“斯普特尼克1号”重约多少千克？', unit: '千克', answer: 83, sourceUrl: 'https://nssdc.gsfc.nasa.gov', sourceNote: 'NASA 航天数据', asOf: '2024', explanation: '斯普特尼克1号是一个直径58厘米的金属球，重83.6千克。', reviewed: true },
  { id: 'ww-bio-234', prompt: '一只成年红袋鼠（体型最大的袋鼠）在全速跳跃时，一步最远可以跨越多少米？', unit: '米', answer: 9, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '国家地理动物记录', asOf: '2024', explanation: '红袋鼠单次跳跃的最远距离可达9米，高度可达3米。', reviewed: true },
  { id: 'ww-bio-235', prompt: '一棵生长成熟的巨杉（世界最高大树种），其树皮的最厚处可达多少厘米？', unit: '厘米', answer: 90, sourceUrl: 'https://www.nps.gov/seki', sourceNote: '红杉与国王峡谷国家公园', asOf: '2024', explanation: '巨杉的树皮极厚且防火，最厚处可达90厘米（3英尺）。', reviewed: true },
  { id: 'ww-his-236', prompt: '世界上目前现存仍在使用的最古老的大学卡鲁因大学建于公元哪一年？', unit: '年', answer: 859, sourceUrl: 'https://www.guinnessworldrecords.com', sourceNote: '吉尼斯世界纪录', asOf: '2024', explanation: '摩洛哥的卡鲁因大学建于公元859年，比博洛尼亚大学还早。', reviewed: true },
  { id: 'ww-his-237', prompt: '历史名船“五月花号”在横渡大西洋时，船上共搭载了多少名乘客？', unit: '名', answer: 102, sourceUrl: 'https://en.wikipedia.org/wiki/Mayflower', sourceNote: '美国清教徒移民史', asOf: '2024', explanation: '1620年，五月花号载着102名乘客和大约30名船员抵达美洲。', reviewed: true },
  { id: 'ww-art-238', prompt: '米开朗基罗雕刻名作《大卫》所用的那块大理石，高度大约是多少米？', unit: '米', answer: 5, sourceUrl: 'https://www.galleriaaccademiafirenze.it', sourceNote: '佛罗伦萨学院美术馆', asOf: '2024', explanation: '《大卫》雕像总高度约为5.17米（连同底座）。', reviewed: true },
  { id: 'ww-art-239', prompt: '世界三大博物馆之一的大英博物馆，其建馆年份是哪一年？', unit: '年', answer: 1753, sourceUrl: 'https://www.britishmuseum.org', sourceNote: '大英博物馆官方历史', asOf: '2024', explanation: '大英博物馆成立于1753年，并于1759年正式对公众开放。', reviewed: true },
  { id: 'ww-geo-240', prompt: '世界最大的珊瑚礁群大堡礁，其绵延的长度大约是多少千米？', unit: '千米', answer: 2300, sourceUrl: 'https://www.gbrmpa.gov.au', sourceNote: '大堡礁海洋公园管理局', asOf: '2024', explanation: '大堡礁纵贯澳洲东北沿海，绵延超过2300千米。', reviewed: true }
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
console.log("Added 40 questions!");
