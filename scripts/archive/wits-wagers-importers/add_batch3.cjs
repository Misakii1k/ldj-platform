const fs = require('fs');
const file = 'packages/games/wits-wagers/server/question-bank.zh-CN.ts';
let content = fs.readFileSync(file, 'utf8');

const qs = [
  { id: 'ww-bio-271', prompt: '一个健康的成年人的肺脏内部展开后（计算肺泡表面积），总面积大约相当于多少平方米？', unit: '平方米', answer: 70, sourceUrl: 'https://www.lung.org', sourceNote: '美国肺脏协会', asOf: '2024', explanation: '肺脏内含有约3亿到5亿个肺泡，其总表面积约为70平方米，约等于半个网球场。', reviewed: true },
  { id: 'ww-his-272', prompt: '著名的古典音乐作曲家约瑟夫·海顿一生极其多产，他总共创作了多少部交响曲被公认传世？', unit: '部', answer: 104, sourceUrl: 'https://en.wikipedia.org/wiki/Symphonies_by_Joseph_Haydn', sourceNote: '音乐史数据', asOf: '2024', explanation: '海顿被誉为“交响曲之父”，他一生共创作了104部广为流传的交响曲。', reviewed: true },
  { id: 'ww-pop-273', prompt: '经典史诗奇幻电影《指环王》（魔戒）三部曲在历届奥斯卡金像奖中，总共获得了多少项提名？', unit: '项', answer: 30, sourceUrl: 'https://www.oscars.org', sourceNote: '奥斯卡金像奖历史数据', asOf: '2024', explanation: '三部曲共计获得30项奥斯卡提名，并最终赢得了其中的17项大奖。', reviewed: true },
  { id: 'ww-sci-274', prompt: '月球上也是有山脉的，其中月球最高的山峰“惠更斯山”，其高度大约是多少米？', unit: '米', answer: 5500, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 月球轨道探测器', asOf: '2024', explanation: '惠更斯山（Mons Huygens）的最高点高出月球平均地表约5500米（5.5公里）。', reviewed: true },
  { id: 'ww-his-275', prompt: '第一届现代奥林匹克运动会在希腊雅典举办，它是在公元哪一年开幕的？', unit: '年', answer: 1896, sourceUrl: 'https://olympics.com', sourceNote: '国际奥委会历史档案', asOf: '2024', explanation: '首届现代奥运会于1896年4月6日至15日在希腊雅典成功举行。', reviewed: true },
  { id: 'ww-sci-276', prompt: '天文学家估算，我们所处的银河系中大约包含多少亿颗恒星？', unit: '亿颗', answer: 1000, sourceUrl: 'https://solarsystem.nasa.gov', sourceNote: 'NASA 银河系估计', asOf: '2024', explanation: '银河系含有1000亿到4000亿颗恒星，最保守的估计也是1000亿颗。', reviewed: true },
  { id: 'ww-bio-277', prompt: '一毫升健康的成年男性血液中，大约含有多少万个红细胞？', unit: '万个', answer: 500, sourceUrl: 'https://www.redcrossblood.org', sourceNote: '血液学医学数据', asOf: '2024', explanation: '正常成年男性每毫升（立方厘米）血液中约有450万至550万个红细胞。', reviewed: true },
  { id: 'ww-bio-278', prompt: '正常人一生中新陈代谢不断脱落的皮肤死皮，如果全部收集起来，总重量大约可以达到多少千克？', unit: '千克', answer: 35, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '人体生物学估算', asOf: '2024', explanation: '人类每小时大约脱落60万个皮肤细胞，一生（按70岁计）脱落的死皮总重约35千克。', reviewed: true },
  { id: 'ww-spo-279', prompt: '为了增加摩擦力和控制力，一个标准的职业用篮球表面通常布满了大约多少个小颗粒凸起？', unit: '个', answer: 35000, sourceUrl: 'https://www.nba.com', sourceNote: '斯伯丁/威尔胜篮球制造规范', asOf: '2024', explanation: '标准尺寸的篮球表面通常有约35,000个称为“pebbles”的小颗粒。', reviewed: true },
  { id: 'ww-spo-280', prompt: '同样为了空气动力学设计，一个标准的高尔夫球表面通常有多少个凹洞（Dimples）？', unit: '个', answer: 336, sourceUrl: 'https://www.usga.org', sourceNote: '美国高尔夫球协会', asOf: '2024', explanation: '虽然没有严格限制，但大多数现代高尔夫球的表面凹洞数量在336个左右。', reviewed: true },
  { id: 'ww-sci-281', prompt: '在地球的最高点珠穆朗玛峰顶峰，那里的大气压力仅仅相当于海平面标准大气压的百分之几？', unit: '%', answer: 33, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '高海拔科学考察', asOf: '2024', explanation: '珠峰顶端的大气压大约只有海平面的三分之一（约33%），因此含氧量极低。', reviewed: true },
  { id: 'ww-art-282', prompt: '著名的纽约自由女神像极其巨大，仅仅是她的一根食指，其长度就有多少米？', unit: '米', answer: 2, sourceUrl: 'https://www.nps.gov/stli', sourceNote: '自由女神像国家纪念碑参数', asOf: '2024', explanation: '自由女神像的食指长达8英尺（约2.44米，可四舍五入为2米，或者严谨取整数部分2）。', reviewed: true },
  { id: 'ww-his-283', prompt: '被公认为世界现存最古老的完整印刷书籍《金刚经》（唐代雕版印刷），其印刷年份是公元哪一年？', unit: '年', answer: 868, sourceUrl: 'https://www.bl.uk', sourceNote: '大英图书馆馆藏档案', asOf: '2024', explanation: '该卷《金刚经》发现于敦煌，标明印制于唐懿宗咸通九年（公元868年）。', reviewed: true },
  { id: 'ww-bio-284', prompt: '自然界中跳跃能力极强的跳蚤，其一次垂直起跳最高可以达到多少厘米？', unit: '厘米', answer: 18, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '昆虫学记录', asOf: '2024', explanation: '跳蚤最高可跳18厘米（约7英寸），相当于其自身身长的上百倍。', reviewed: true },
  { id: 'ww-sci-285', prompt: '光在真空中的传播速度极为恒定，其精确数值是每秒多少万千米？（取整数万）', unit: '万千米', answer: 30, sourceUrl: 'https://www.bipm.org', sourceNote: '国际度量衡局', asOf: '2024', explanation: '光速精确值为299,792,458米/秒，通常近似为每秒30万千米。', reviewed: true },
  { id: 'ww-bio-286', prompt: '人类大脑虽然只占人体重量的2%，但在静息状态下，却消耗了人体总能量的百分之几？', unit: '%', answer: 20, sourceUrl: 'https://www.brainfacts.org', sourceNote: '神经科学数据', asOf: '2024', explanation: '大脑是极度耗能的器官，静息时其消耗的氧气和能量约占全身的20%。', reviewed: true },
  { id: 'ww-tech-287', prompt: '现代降落伞的雏形首次成功进行载人真人高空跳伞实验，是在公元哪一年？', unit: '年', answer: 1797, sourceUrl: 'https://en.wikipedia.org/wiki/Parachute', sourceNote: '航空史记录', asOf: '2024', explanation: '1797年，安德烈-雅克·加纳林在巴黎乘坐热气球升空后，用无骨架降落伞成功跳下。', reviewed: true },
  { id: 'ww-geo-288', prompt: '死海是世界上海拔最低的湖泊，其湖面海拔低于海平面多少米？', unit: '米', answer: 430, sourceUrl: 'https://earthobservatory.nasa.gov', sourceNote: 'NASA 地球观测站', asOf: '2024', explanation: '由于持续干旱和蒸发，死海水位不断下降，目前湖面约低于海平面430米。', reviewed: true },
  { id: 'ww-bio-289', prompt: '作为体型最大的陆生肉食动物之一，一只成年雄性北极熊的重量最重可达多少千克？', unit: '千克', answer: 800, sourceUrl: 'https://polarbearsinternational.org', sourceNote: '北极熊国际组织测量', asOf: '2024', explanation: '部分极大的雄性北极熊体重可以超过800千克（甚至有记录达到1000千克）。', reviewed: true },
  { id: 'ww-his-290', prompt: '人类有史以来记载的使用时间最长的冷兵器之一是长弓，英格兰长弓的有效杀伤射程可达多少米？', unit: '米', answer: 270, sourceUrl: 'https://www.historic-uk.com', sourceNote: '中世纪军事史', asOf: '2024', explanation: '熟练的长弓手可以命中并杀伤远在270米（约300码）外的目标。', reviewed: true },
  { id: 'ww-tech-291', prompt: '全球首条投入商业运营的高速铁路——日本东海道新干线，是在哪一年正式开通的？', unit: '年', answer: 1964, sourceUrl: 'https://global.jr-central.co.jp/en/', sourceNote: 'JR东海历史', asOf: '2024', explanation: '1964年10月1日，赶在东京奥运会前夕，东海道新干线（0系）正式通车。', reviewed: true },
  { id: 'ww-lit-292', prompt: '以篇幅宏大著称的俄国文学巨著《战争与和平》，其原版小说总计大约有多少万字（俄语单词）？', unit: '万词', answer: 56, sourceUrl: 'https://en.wikipedia.org/wiki/War_and_Peace', sourceNote: '托尔斯泰著作字数统计', asOf: '2024', explanation: '该书原著大约包含560,000个俄语单词（英文翻译版也约为58万词）。', reviewed: true },
  { id: 'ww-art-293', prompt: '达芬奇的名作《最后的晚餐》是一幅巨大的壁画，它的宽度是多少厘米？', unit: '厘米', answer: 880, sourceUrl: 'https://cenacolovinciano.org', sourceNote: '米兰恩宠圣母堂文物档案', asOf: '2024', explanation: '这幅画高460厘米，宽880厘米，占据了整面修道院食堂的墙壁。', reviewed: true },
  { id: 'ww-bio-294', prompt: '成年人的骨骼有206块，其中单单在两只脚（包含脚踝）里，就集中了多少块骨头？', unit: '块', answer: 52, sourceUrl: 'https://www.arthritis.org', sourceNote: '足部解剖学', asOf: '2024', explanation: '每只脚有26块骨头，两只脚共52块，占了人体骨骼总数的四分之一。', reviewed: true },
  { id: 'ww-his-295', prompt: '大航海时代开启者之一，葡萄牙航海家达·伽马首次到达印度是在公元哪一年？', unit: '年', answer: 1498, sourceUrl: 'https://en.wikipedia.org/wiki/Vasco_da_Gama', sourceNote: '航海史纪年', asOf: '2024', explanation: '达·伽马率领船队绕过好望角，于1498年5月20日抵达印度卡利卡特。', reviewed: true },
  { id: 'ww-geo-296', prompt: '被称为“世界屋脊”的青藏高原，其平均海拔高度大约是多少米？', unit: '米', answer: 4000, sourceUrl: 'https://www.xinhuanet.com', sourceNote: '中国地理白皮书', asOf: '2024', explanation: '青藏高原是世界上海拔最高的高原，平均海拔在4000米以上。', reviewed: true },
  { id: 'ww-sci-297', prompt: '在标准大气压下，声音在常温（约20℃）空气中的传播速度大约是每秒多少米？', unit: '米', answer: 343, sourceUrl: 'https://www.npl.co.uk', sourceNote: '物理声学常数', asOf: '2024', explanation: '20℃时声速约为343米/秒，温度每升高1℃，声速增加约0.6米/秒。', reviewed: true },
  { id: 'ww-bio-298', prompt: '一头成年的双峰骆驼在极度缺水后一次性狂饮，可以在15分钟内喝下多少升水？', unit: '升', answer: 114, sourceUrl: 'https://www.nationalgeographic.com', sourceNote: '动物生理学', asOf: '2024', explanation: '骆驼耐渴能力极强，一旦遇到水源，一次可饮水114升（约30加仑）来补充体内水分。', reviewed: true },
  { id: 'ww-tech-299', prompt: '被誉为“计算机科学之父”的阿兰·图灵在哪一年发表了提出“图灵机”概念的著名论文？', unit: '年', answer: 1936, sourceUrl: 'https://www.turing.org.uk', sourceNote: '图灵历史文献', asOf: '2024', explanation: '1936年图灵发表《论可计算数及其在判定性问题上的应用》，奠定了计算机理论基础。', reviewed: true },
  { id: 'ww-pop-300', prompt: '风靡全球的电子游戏《我的世界》（Minecraft）最初的公开Alpha版本发布于哪一年？', unit: '年', answer: 2009, sourceUrl: 'https://www.minecraft.net', sourceNote: 'Minecraft 官方历史', asOf: '2024', explanation: '马库斯·佩尔松（Notch）在2009年5月17日发布了游戏的最初公开版本。', reviewed: true }
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
console.log("Added another 30 questions!");
