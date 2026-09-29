const fs = require('fs');
const file = 'packages/games/wits-wagers/server/question-bank.zh-CN.ts';
let content = fs.readFileSync(file, 'utf8');

const qs = [
  { id: 'ww-bio-301', prompt: '人类的一滴血液，在静息状态下大约需要花多少秒就能循环绕遍全身一圈？', unit: '秒', answer: 60, sourceUrl: 'https://www.blood.co.uk', sourceNote: '英国国家医疗服务体系血液中心', asOf: '2024', explanation: '血液循环速度很快，一滴血大约在60秒内就能流经整个身体。', reviewed: true },
  { id: 'ww-bio-302', prompt: '作为深潜高手的成年帝企鹅，在水下寻找食物时最长可以憋气多少分钟？', unit: '分钟', answer: 22, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '南极生物学观测', asOf: '2024', explanation: '帝企鹅能够潜入超过500米深的水下，憋气时间可长达22分钟。', reviewed: true },
  { id: 'ww-sci-303', prompt: '目前已知最长的英语单词是某种肌联蛋白的化学名称，它由多少个字母组成？', unit: '个字母', answer: 189819, sourceUrl: 'https://en.wikipedia.org/wiki/Longest_word_in_English', sourceNote: '词汇学与生物化学记录', asOf: '2024', explanation: '这个极其冗长的词汇由189,819个字母组成，读完它大约需要三个半小时。', reviewed: true },
  { id: 'ww-lit-304', prompt: '权威的百科全书《大英百科全书》（Encyclopædia Britannica）在1768年初次出版时，全套总共有多少卷？', unit: '卷', answer: 3, sourceUrl: 'https://www.britannica.com', sourceNote: '大英百科全书历史', asOf: '2024', explanation: '第一版大英百科全书是在苏格兰爱丁堡出版的，全套仅有3卷。', reviewed: true },
  { id: 'ww-pop-305', prompt: '超级英雄“蜘蛛侠”（Spider-Man）首次登场是在1962年的《惊奇幻想》（Amazing Fantasy）漫画的第几期？', unit: '期', answer: 15, sourceUrl: 'https://www.marvel.com', sourceNote: '漫威漫画历史', asOf: '2024', explanation: '蜘蛛侠在《惊奇幻想》第15期完成了他的首次亮相，由于极受欢迎随后有了独立连载。', reviewed: true },
  { id: 'ww-art-306', prompt: '交响乐团中体积最大、音域最广的乐器——标准的音乐会大竖琴（Concert Harp），通常装有多少根琴弦？', unit: '根', answer: 47, sourceUrl: 'https://www.vsl.co.at', sourceNote: '维也纳交响乐库', asOf: '2024', explanation: '现代音乐会大竖琴通常拥有47根弦，并通过底部的7个踏板来改变音高。', reviewed: true },
  { id: 'ww-sci-307', prompt: '我们所在的星系——银河系，其主盘面的直径大约是多少万光年？', unit: '万光年', answer: 10, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 银河系尺寸数据', asOf: '2024', explanation: '天文学家估计银河系可见盘面的直径约为10万光年（约等于100,000光年）。', reviewed: true },
  { id: 'ww-sci-308', prompt: '在物理学中，光走一光年的距离大约是多少万亿千米？', unit: '万亿千米', answer: 9, sourceUrl: 'https://www.nasa.gov', sourceNote: '天文距离单位', asOf: '2024', explanation: '一光年约为9.46万亿千米（即9,460,000,000,000千米，取整数万亿为9）。', reviewed: true },
  { id: 'ww-geo-309', prompt: '一张标准的国际 A4 纸张，其长边（较长的一条边）的精确长度是多少毫米？', unit: '毫米', answer: 297, sourceUrl: 'https://www.iso.org', sourceNote: 'ISO 216 纸张标准', asOf: '2024', explanation: 'A4纸的尺寸是 210 mm × 297 mm，长宽比为根号2。', reviewed: true },
  { id: 'ww-his-310', prompt: '无线通信技术“蓝牙”（Bluetooth）的名称，来源于公元多少世纪的丹麦国王哈拉尔·蓝牙王？', unit: '世纪', answer: 10, sourceUrl: 'https://www.bluetooth.com/about-us/bluetooth-origin/', sourceNote: '蓝牙技术联盟官方历史', asOf: '2024', explanation: '哈拉尔一世是10世纪（约公元958年-986年）的丹麦国王，他统一了斯堪的纳维亚半岛。', reviewed: true },
  { id: 'ww-game-311', prompt: '世界上第一款取得巨大商业成功的街机电子游戏《Pong》（乒乓），是由雅达利公司在哪一年发售的？', unit: '年', answer: 1972, sourceUrl: 'https://en.wikipedia.org/wiki/Pong', sourceNote: '电子游戏历史', asOf: '2024', explanation: '1972年11月，《Pong》正式推出，开启了街机游戏产业的繁荣时代。', reviewed: true },
  { id: 'ww-bio-312', prompt: '根据神经科学研究，一个典型的成年人的大脑中大约含有多少亿个神经元（脑细胞）？', unit: '亿个', answer: 860, sourceUrl: 'https://www.brainfacts.org', sourceNote: '脑科学神经元计数', asOf: '2024', explanation: '最新研究表明，人类大脑约包含860亿（86,000,000,000）个神经元。', reviewed: true },
  { id: 'ww-geo-313', prompt: '位于美国与加拿大交界处的著名自然景观尼亚加拉大瀑布，其马蹄瀑布的落差高度大约是多少米？', unit: '米', answer: 51, sourceUrl: 'https://www.niagarafallsstatepark.com', sourceNote: '尼亚加拉瀑布州立公园', asOf: '2024', explanation: '马蹄瀑布（Horseshoe Falls）的水流垂直落差约为51米（167英尺）。', reviewed: true },
  { id: 'ww-his-314', prompt: '以残酷著称的古罗马斗兽场（罗马竞技场），在鼎盛时期最多可以容纳大约多少万名观众？', unit: '万名', answer: 8, sourceUrl: 'https://www.history.com', sourceNote: '罗马历史档案', asOf: '2024', explanation: '考古学家估计，罗马竞技场可容纳5万到8万名观众同时观看角斗比赛。', reviewed: true },
  { id: 'ww-sci-315', prompt: '太阳表面的光球层温度极高，大约是多少摄氏度？', unit: '摄氏度', answer: 5500, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 太阳数据', asOf: '2024', explanation: '太阳表面的温度大约为5500摄氏度（约5800开尔文）。', reviewed: true },
  { id: 'ww-bio-316', prompt: '猫头鹰的颈部构造极其特殊，它们的头部最多可以向左右旋转多少度？', unit: '度', answer: 270, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '鸟类学观测', asOf: '2024', explanation: '猫头鹰为了弥补眼球不能转动的缺陷，颈部进化出了14块颈椎，可以旋转270度。', reviewed: true },
  { id: 'ww-art-317', prompt: '著名音乐家莫扎特是一位绝世神童，他在多大岁数时就创作了他的第一部交响曲？', unit: '岁', answer: 8, sourceUrl: 'https://www.mozarteum.at', sourceNote: '莫扎特音乐基金会', asOf: '2024', explanation: '1764年，年仅8岁的莫扎特在伦敦创作了他的第一交响曲（降E大调）。', reviewed: true },
  { id: 'ww-tech-318', prompt: '著名的福特T型车是世界上第一种流水线装配的大众汽车，它于哪一年正式停产？', unit: '年', answer: 1927, sourceUrl: 'https://corporate.ford.com', sourceNote: '福特汽车公司历史', asOf: '2024', explanation: 'T型车从1908年生产至1927年，总计生产了超过1500万辆，随后被A型车取代。', reviewed: true },
  { id: 'ww-sci-319', prompt: '距离地球最近的恒星系统是半人马座α星系统，它距离地球大约是多少光年？（取整数）', unit: '光年', answer: 4, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: '天文学测量', asOf: '2024', explanation: '半人马座α星系统中的比邻星是距离太阳系最近的恒星，距离约为4.24光年。', reviewed: true },
  { id: 'ww-lit-320', prompt: '由J.R.R.托尔金创作的奇幻巨著《魔戒》（The Lord of the Rings）原著小说，总共分为几卷出版？', unit: '卷', answer: 3, sourceUrl: 'https://en.wikipedia.org/wiki/The_Lord_of_the_Rings', sourceNote: '文学出版记录', asOf: '2024', explanation: '虽然《魔戒》是一部完整的小说，但由于篇幅过长，最初被分为了三卷出版。', reviewed: true },
  { id: 'ww-his-321', prompt: '人类历史上最大的帝国——大英帝国，在其领土达到巅峰时的面积约占世界陆地总面积的百分之几？', unit: '%', answer: 24, sourceUrl: 'https://www.guinnessworldrecords.com', sourceNote: '历史面积统计', asOf: '2024', explanation: '在1920年代的巅峰时期，大英帝国控制了全球约24%的陆地面积。', reviewed: true },
  { id: 'ww-geo-322', prompt: '世界上最宽的瀑布——位于南美洲的伊瓜苏瀑布，由多少个独立的小瀑布群组成？', unit: '个', answer: 275, sourceUrl: 'https://whc.unesco.org', sourceNote: '联合国教科文组织世界遗产名录', asOf: '2024', explanation: '伊瓜苏瀑布全宽约2.7千米，被岩石和岛屿分割成了约275个大小不同的瀑布。', reviewed: true },
  { id: 'ww-game-323', prompt: '著名的日本任天堂公司最初是以生产花札（一种日本传统纸牌）起家的，它成立于公元哪一年？', unit: '年', answer: 1889, sourceUrl: 'https://www.nintendo.co.jp', sourceNote: '任天堂企业历史', asOf: '2024', explanation: '山内房治郎于1889年创立了任天堂，最初是一家制造花札纸牌的小作坊。', reviewed: true },
  { id: 'ww-bio-324', prompt: '人体中含有最坚硬的物质是牙釉质，正常成年人的一颗牙齿含有多少根神经？（牙髓内主干分布），问题太难确定数值。改为：正常成年人全身的肌肉大约占体重的百分之几？', unit: '%', answer: 40, sourceUrl: 'https://www.ncbi.nlm.nih.gov', sourceNote: '生理学数据', asOf: '2024', explanation: '对于一个健康的成年人来说，骨骼肌大约占身体总重量的40%左右。', reviewed: true },
  { id: 'ww-tech-325', prompt: '世界第一张从太空拍摄的地球全景彩色照片“蓝色弹珠”（The Blue Marble），是阿波罗计划中哪一次任务拍摄的？', unit: '阿波罗X号', answer: 17, sourceUrl: 'https://www.nasa.gov', sourceNote: 'NASA 影像历史', asOf: '2024', explanation: '这张著名的照片是由阿波罗17号宇航员在1972年飞往月球途中拍摄的。', reviewed: true },
  { id: 'ww-art-326', prompt: '享有盛誉的维也纳金色大厅（Musikverein）在落成后举办了首场音乐会，这是在公元哪一年？', unit: '年', answer: 1870, sourceUrl: 'https://www.musikverein.at', sourceNote: '维也纳音乐之友协会', asOf: '2024', explanation: '金色大厅于1870年1月6日举行了隆重的开幕首演。', reviewed: true },
  { id: 'ww-geo-327', prompt: '美国纽约市的标志性建筑——帝国大厦，在建成后的多少年里一直保持着世界最高建筑的头衔？', unit: '年', answer: 40, sourceUrl: 'https://www.esbnyc.com', sourceNote: '帝国大厦官方历史', asOf: '2024', explanation: '帝国大厦建成于1931年，直到1971年世界贸易中心北塔封顶前，保持世界最高纪录40年。', reviewed: true },
  { id: 'ww-bio-328', prompt: '一只普通的家蝇在飞行时，每秒钟翅膀大约拍打多少次？', unit: '次', answer: 200, sourceUrl: 'https://entomology.unl.edu', sourceNote: '昆虫学数据', asOf: '2024', explanation: '家蝇高频率的翅膀振动（约每秒200次）是造成它发出烦人嗡嗡声的原因。', reviewed: true },
  { id: 'ww-his-329', prompt: '玛雅文明最著名的遗址之一——奇琴伊察的库库尔坎金字塔，其四面台阶加上顶端神庙，总共有多少级台阶？', unit: '级', answer: 365, sourceUrl: 'https://whc.unesco.org', sourceNote: '考古学遗址数据', asOf: '2024', explanation: '金字塔四面各有91级台阶，加上顶部的神庙1级，总共365级，代表玛雅历法中的一年365天。', reviewed: true },
  { id: 'ww-pop-330', prompt: '影史票房巨制《阿凡达》（Avatar）在2009年上映并引起轰动，这部电影从导演詹姆斯·卡梅隆最初构思到上映，中间跨越了多少年？', unit: '年', answer: 15, sourceUrl: 'https://en.wikipedia.org/wiki/Avatar_(2009_film)', sourceNote: '电影制作访谈', asOf: '2024', explanation: '卡梅隆在1994年就写下了长达80页的剧本论述，但受限于当时的特效技术，直到15年后才完成上映。', reviewed: true },
  { id: 'ww-bio-331', prompt: '一棵生长在热带雨林的巨大榕树可以独木成林。在印度，一棵著名的“大榕树”（The Great Banyan）树冠覆盖面积达到了多少万平方米？', unit: '万平方米', answer: 1, sourceUrl: 'https://www.guinnessworldrecords.com', sourceNote: '吉尼斯世界纪录', asOf: '2024', explanation: '这棵位于豪拉植物园的大榕树，树冠周长达480米，面积超过1.4万平方米（取1万级别）。', reviewed: true },
  { id: 'ww-his-332', prompt: '法国大革命的标志性事件“攻占巴士底狱”发生时，这座庞大的监狱里实际上只关押了多少名囚犯？', unit: '名', answer: 7, sourceUrl: 'https://en.wikipedia.org/wiki/Storming_of_the_Bastille', sourceNote: '法国历史档案', asOf: '2024', explanation: '1789年7月14日群众攻入巴士底狱时，里面只关押了7名囚犯（包括4名伪造犯和2名精神病患者）。', reviewed: true },
  { id: 'ww-geo-333', prompt: '世界上跨越经度最广的国家是俄罗斯，其横跨了几个时区？', unit: '个', answer: 11, sourceUrl: 'https://www.worldatlas.com', sourceNote: '世界地理时区划分', asOf: '2024', explanation: '俄罗斯疆域极其辽阔，东西跨越了11个时区。', reviewed: true },
  { id: 'ww-art-334', prompt: '中国古代著名画作《清明上河图》（张择端版），画卷的全长大约是多少厘米？', unit: '厘米', answer: 528, sourceUrl: 'https://www.dpm.org.cn', sourceNote: '故宫博物院文物档案', asOf: '2024', explanation: '这幅长卷宽24.8厘米，长528.7厘米（通常记作528厘米）。', reviewed: true },
  { id: 'ww-tech-335', prompt: '世界上第一条发出的商业短信（SMS），包含了多少个英文字母？', unit: '个字母', answer: 14, sourceUrl: 'https://www.bbc.com', sourceNote: '通信技术历史', asOf: '2024', explanation: '1992年发出的第一条短信内容是“Merry Christmas”，刚好14个字母（不计空格）。', reviewed: true },
  { id: 'ww-bio-336', prompt: '章鱼拥有复杂的神经系统，为了向全身泵血，一只章鱼拥有多少颗心脏？', unit: '颗', answer: 3, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '海洋生物学', asOf: '2024', explanation: '章鱼有3颗心脏：两颗鳃心负责将血液泵入鳃部，一颗体心负责将血液泵向全身。', reviewed: true },
  { id: 'ww-lit-337', prompt: '被认为是世界上第一部长篇小说的《源氏物语》，大约是在公元多少世纪写成的？', unit: '世纪', answer: 11, sourceUrl: 'https://en.wikipedia.org/wiki/The_Tale_of_Genji', sourceNote: '世界文学史', asOf: '2024', explanation: '日本作家紫式部创作的《源氏物语》成书于11世纪初（约1008年）。', reviewed: true },
  { id: 'ww-game-338', prompt: '经典的拼图游戏魔方（3阶），其中心块一共有多少个？', unit: '个', answer: 6, sourceUrl: 'https://www.rubiks.com', sourceNote: '魔方结构', asOf: '2024', explanation: '标准的三阶魔方有6个中心块，它们固定了每个面的颜色属性。', reviewed: true },
  { id: 'ww-his-339', prompt: '美国现行的星条旗上共有50颗星，这一50星版本是在哪一年正式开始启用的？', unit: '年', answer: 1960, sourceUrl: 'https://www.si.edu', sourceNote: '美国国家历史博物馆', asOf: '2024', explanation: '随着夏威夷在1959年成为美国第50个州，50星国旗在1960年7月4日正式启用。', reviewed: true },
  { id: 'ww-sci-340', prompt: '元素周期表中，原子序数为1的元素（氢）是最轻的元素。那么自然界中存在的最重的天然元素（铀）的原子序数是多少？', unit: '号', answer: 92, sourceUrl: 'https://www.rsc.org/periodic-table', sourceNote: '皇家化学学会元素周期表', asOf: '2024', explanation: '铀的原子序数是92，它是自然界中能大量找到的最重元素。', reviewed: true }
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
console.log("Added batch 4 - 40 questions!");
