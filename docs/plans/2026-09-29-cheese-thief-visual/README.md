# 奶酪大盗 · 视觉落地交接计划（B2 阁楼长桌定稿）

日期：2026-09-29　编写：强模型（定稿）　执行：便宜 / 快速模型　验收：用户看图

> 分工（DESIGN-DIRECTION §6.7）：本计划写到**执行模型不需要做任何新的视觉决定**的程度。遇到计划没写到的视觉问题，**停下来，把问题列给用户**，不要自己发挥（C14）。
> 代码里游戏 id 是 `cheese-thief`，ruleset `cheese_thief_classic_v1`。
> 方向稿已于 2026-09-26 全部定稿（用户原话「都很好的」），本计划是把四个定稿画面搬进生产。

---

## 0. 开工前必读（按顺序，只读这些）

1. `D:\项目\AGENTS.md` 中「视觉对比度与可读性强制规范」与「视觉验收规范」两节。
2. `D:\项目\docs\DESIGN-DIRECTION.md` 的 §2（已确认 / 否定过）、§5（打击感）、§9 第 1 条「奶酪大盗」（第 123–151 行，含全部用户原话）。
3. 本文件全文。
4. 像素参照稿（浏览器直接双击打开，顶部工具条可切 桌面 1280×800 / 手机 390×844、4 / 6 / 8 人）：

| 画面 | 参照稿 | 状态 |
|---|---|---|
| ① 夜里醒来 | `docs/ui-preview/cheese-thief/directions/B2-attic-final.html` | **用户已确认（2026-09-26，含复看「没问题」）** |
| ② 掷骰 | `docs/ui-preview/cheese-thief/directions/S2-roll.html` | **用户已确认（2026-09-26）** |
| ③ 天亮指认 | `docs/ui-preview/cheese-thief/directions/S3-vote.html` | **用户已确认（2026-09-26）** |
| ④ 揭晓结算 | `docs/ui-preview/cheese-thief/directions/S4-reveal.html` | **用户已确认（2026-09-26）** |

公用：`_shared.css`（物件：老鼠 / 席位卡 / 骰子骰盅 / 按钮 / 坞 / 时刻条 / 扫屏）、`_attic.css`（阁楼世界：房间 / 拱窗 / 告示牌 / 砧板奶酪 / 两列席位 / 手机版式）。**所有颜色、尺寸、圆角、阴影以这两个文件为准。** `_shared.js` 与各页内联脚本是演示逻辑（假数据、重播按钮、演示用「偷走奶酪」按钮），**不要照搬进生产**，只看效果和时长。

不要删、不要实现：备选方向稿 `A-round-table.html`、`C-cheese-clock.html`、`B-attic-rows.html`（第 1 轮旧稿，留作 before/after）；`../cheese-options.html`（奶酪选型稿，已定稿为「整轮奶酪切一角」）。

---

## 1. 视觉契约（design-spec §11.2 六节）

### 1.1 设计方向

- 世界：**月光阁楼**（DESIGN-DIRECTION C1 已确认）。斜屋顶木梁、拱窗、木地板、老鼠洞；夜 = 淡蓝紫绘本夜空（深浅取 B 与 C 之间，已定稿），天亮整屏切暖黄日间；**昼夜切换本身是关键演出**（扫屏 + 月亮/太阳升降）。
- 表皮：**浅色派对粗墨边**（3px 墨线 `#292722` + 硬切下沉投影），席位、告示牌、坞、计时盘都是奶油卡纸。
- **平面，无 3D**（G0-3 决议：cheese-thief 保持平面）。现役 three.js 奶酪（`CheeseModel3DCanvas`）与 3D 骰盅（`CheeseDiceCup3D`）**整体退役**，奶酪换成定稿 SVG「整轮奶酪切一角」（深红外皮蜡边 + 孔洞剖面，见参照稿内联 SVG，逐像素照抄），骰子换成 CSS 九点骰。
- 对标：狼人杀 / 榴莲的舞台完成度（`docs/ui-preview/werewolf-durian/durian.html`）+ Balatro 的打击感（飞行、翻面、盖章、屏震）。
- 旧场景（V04 的「全宽三区老鼠半圆席位环 + 六小时钟面 + three.js 奶酪」、天亮卷轴覆盖层、手机投票弹窗、「终局真相大揭秘」全屏遮罩）**整体作废**。本游戏此前无视觉契约（design-spec §11.6 欠账），本节即补上的契约，方向已由用户通过方向稿确认。

### 1.2 状态模型（驱动画面的服务端字段）

来源：`packages/games/cheese-thief/server/views.ts`、`rules.ts`、`schemas.ts`。客户端类型 `packages/client/src/game/cheese-thief/types.ts`（`CheeseThiefPlayerView`）。**服务端一律不改。**

阶段流转：`hour_choice`（仅 4 人局）→ `night`（currentHour 0 = 开局准备窗口 `roleRevealSeconds` 默认 17s；1–6 = 六个时刻，每刻 `nightHourSeconds` 默认 20s）→ `accomplice_select`（`accompliceSelectSeconds` 17s，超时服务端自动选）→ `dawn`（讨论 `discussionSeconds` 120s）→ `vote`（`voteSeconds` 30s）→ `game_over`。5–8 人局没有 `hour_choice`，开局直接进 `night`、currentHour 0。

| 字段 | 画面 |
|---|---|
| `phase` | 决定显示哪张画面（见上）与昼夜：hour_choice / night / accomplice_select = 夜，dawn / vote / game_over = 昼 |
| `currentHour` | 时刻条 1–6 的 `now`（黄底放大）与 `done`（半透明）；告示牌小字「夜晚 · 第 N 点」 |
| `deadlineAt` | ② 坞旁倒计时胶囊；③ 中央倒计时圆盘（SVG 环）；其余阶段照现有胶囊。null 时隐藏 |
| `cheeseStolen` | 公共字段。玩家端夜间**不直接用它实时渲染**（见下「奶酪可见性口径」）；天亮后（dawn 起）按它决定砧板空 / 奶酪在 |
| `me.wakeHour` | 「你」的醒来时刻：hours 条 `mine` 高亮、席位卡上的骰子点数 |
| `me.hourChoices`（4 人局，[n,n]） | ② 掀开盅后并排两颗大骰，点选一颗发 `choose_hour` |
| `me.coWakers` | 轮到你且非空 = 同醒：那些席位卡也睁眼 + 黄圈，无事发生 |
| `me.cheeseWasMissing` | 你醒来时奶酪已不在（醒来的画面里砧板是空的） |
| `me.isThief` / `isAccomplice` / `knownAccomplices` | 私密区身份与共犯名单；④ 翻面身份章 |
| `me.canPeek` | 夜、轮到你、独醒、未看过 → 坞里出现「偷看骰子」次按钮 |
| `me.peekedHour` / `me.catPeekedHour` | 私密情报小字（谁 是第 N 点） |
| `me.hasVoted` + `votes` 的**键集合** | ③ 各席位「已投」小标 |
| `votes` 的值 | **仅 `game_over` 后使用**（④ 席位「得 N 票」与出局划线） |
| `reveal`（仅 game_over）：`thiefId` `stealHour` `wakeHours` `accomplices` `peeks` | ④ 翻面的骰子与身份、时间线小条 |
| `thiefCaught` / `winners` | ④ 三结局文案与胜方高光（见 §1.4 画面④）；变体结局（白老鼠独胜等 `winners` 不在三结局常规形态时）不新设计，高光按 `winners`、sub 写清结算事实即可（§6 确认记录 3） |
| `roleCardsEnabled` / `me.roleCard` / `revealedCat` / `revealedDog` / `dogFirstVoter` | 角色卡变体（默认关）。**不在定稿画面内**：功能原样保留，信息以坞内卡纸小 chip 呈现，不做新设计（§6 确认记录 3） |

**奶酪可见性口径（玩家端 · 夜间，重要，照抄执行）：**
- `me.wakeHour > currentHour`（还没轮到你）：睡眠态。奶酪按「在砧板上」渲染——你还不知道。
- `me.wakeHour === currentHour`（正在醒来）：醒来态，显示真实状态（此刻 `cheeseStolen` = 空砧板，否则奶酪在）。
- `me.wakeHour < currentHour`（醒过了）：回到睡眠态。奶酪**冻结在你醒来时所见**：`cheeseWasMissing || isThief` → 空砧板，否则 → 奶酪在。
- 你是大盗时，奶酪在「你」的席位卡左下角（seat-loot），不在砧板上。
- 观战者（`me === null`）与公共大屏：实时按 `cheeseStolen` 渲染（现有「桌台可见」语义保留，§6 确认记录 2）。

**隐私红线（C18）：**
- ③ 投票阶段服务端已下发 `votes` 全量（views.ts 第 112 行），但**揭晓前只允许显示「谁已投」（`Object.keys(votes)` / `me.hasVoted`），任何人的投向与票数一律不渲染**（S3 定稿原话：投票过程只显示「已投」）。服务端另有独立任务收紧下发（§6 确认记录 1），不在本计划内。
- 夜间别人的骰点、`coWakers` 只在你自己的时刻渲染；`knownAccomplices`、`peekedHour` 只出现在你的私密区。
- `accomplice_select` 阶段：只有 `me.isThief` 的屏幕进入挑人交互；其他人看到睡眠夜场景 + 告示牌「夜更深了……」（不显示谁是大盗）。

### 1.3 色值

`--game-ink #292722`、`--game-muted #575147`、`--game-surface #fffdf7`、`--game-paper #fff4df`、`--game-yellow #f7c84b`、`--game-coral #c23616` 全局已存在，直接用。本游戏 accent：`--game-accent: #6f7fc4`（阁楼夜蓝紫，只作描边 / ≥24px 大字，纸底正文禁用）。其余场景色在 `cheese-thief.css` 的 `:root`/页面根上声明 `--ct-*` 局部变量，值与参照稿**逐像素一致**，不新增别的色：

| 参照稿值 | 用途 | 生产写法 |
|---|---|---|
| 夜 `#9fa3e2 / #8a86d3 / #7b72c4`，墙 `#8f89cf`；昼 墙 `#ffe3a3`、窗顶 `#fff1c8` | 夜空 / 墙（`data-time="day"` 整体切换） | `--ct-night-*` / `--ct-wall` |
| 地板 `#c98f55 / #b97d45`（夜）、`#e4b079 / #d69e63`（昼）；梁 `#8a5a32`（夜）/ `#b07a45`（昼） | 木地板 / 斜梁 / 窗框 / 窗台 | `--ct-floor-a/-b` / `--ct-beam` |
| 窗内夜空 `#4f4fa6→#7f82d4→#a9a6e6`；昼空 `#7cc4ff→#bfe6ff→#e6f6ff` | 拱窗天空渐变 | `--ct-sky-*` |
| 月亮 `radial(#fffbe6,#f4e7b0)`、太阳 `#ffd23f`、星 `#fff7d6`、云 `rgba(255,255,255,.35/.9)` | 天体 | `--ct-moon-*` 等 |
| 窗帘 `#d9656a / #c9545a`；鼠洞 `#3b3355`（夜）/ `#6b4a2c`（昼） | 房间点缀 | `--ct-curtain-*` / `--ct-mousehole` |
| 月光束 `rgba(255,251,225,.42)`（夜）/ `rgba(255,255,255,.4)`（昼） | 窗口斜射光束 | `--ct-beam-light` |
| 奶酪 SVG：外皮 `#b8431f`、主体 `--game-yellow`、切面 `#ffe08a`、切块 `#f2b937 / #e8a92a / #fff0b8`、孔 `#e0a92a / #c98a1c / #b87c16` | 整轮奶酪切一角（照抄参照稿内联 SVG） | SVG 内联色 |
| 木头 `#d9a86c / #c48b52 / #b98246 / #a8733d` | 砧板 / 大小骰盅 | `--ct-wood-*` |
| 老鼠八色 `#f7c84b #f29a7a #8fd3b6 #b9a4e6 #9cc7f0 #f6b7cf #c9e27a #f0b35c` | 席位老鼠剪影（按 `view.players` 座次循环取色） | `--ct-m1..m8` |
| 计时环 `#8fd3b6`（`--ct-m3`），≤10s 变 `--game-coral`；出局卡 `#efe9dc`；共犯章 `#f29a7a`（`--ct-m2`）；时间线「偷走」格墨底奶油字 | ③ / ④ | 复用上述变量 |

**黄色只用于**：唯一主按钮、醒来席位黄圈、hours 的 `now`/`mine`、「就是你！」小卡、醒来态座位号章、4 人局选中骰 outline、④ 胜方高光。其余一律不用黄（C8）。

### 1.4 关键画面（四张）

**公共骨架（四张共用，照 `_attic.css`）**：房间（墙板竖线 `repeating-linear-gradient`、两根斜梁 + 横梁、木地板、左下鼠洞）→ 拱窗（夜：月亮 + 闪烁星星 + 云；昼：太阳 + 云；红条纹窗帘、中梃、窗台）→ 窗口月光束（梯形渐变，`pointer-events:none`）→ 左上卡纸告示牌（奶油卡 + 3px 墨边 + 硬投影，`rotate(-2.5deg)`，顶部两段黄色胶带；小字 when 15px/800 + 衬线标题 44px）→ 右上时刻条（1–6 圆片，奶油卡 + 墨边；`done` 半透明、`now` 黄底放大 1.18、昼全部淡化）→ 左右两列席位卡 → 中央区 → 底部操作坞（奶油卡，左信息 strong/span 右按钮）→ 昼夜扫屏层（`.sweep`，径向渐变 circle 扩散 780ms，夜→昼暖黄、昼→夜蓝紫）。手机（≤640px 容器）版式照 `_attic.css` 尾部：拱窗缩到右上 150×104、鼠洞与光束隐藏、时刻条通栏、席位两列各 116px、中央 130px 宽、坞纵向换行。

**席位卡（定稿 B2，所有画面一致）**：奶油卡 + 3px 墨边 + 硬投影，桌面宽 236px（7–8 人压矮）、手机 116px；左上角圆形座位号章（30px，奶油底墨边，醒来时黄底）；卡内横排 = 老鼠剪影（统一形状 SVG，`currentColor` 取 `--ct-m1..m8`，睁眼/闭眼两组 opacity 切换）+ 名字（18px/900，可折行，「你」= 墨底奶油小圆牌）+ 骰盅（木盅带「?」，扣着）或骰子（你 / 已偷看翻开 / ④ 翻面的席位显示点数）。夜里睡着：闭眼 + 右上「Zz」小章；醒来（你的时刻、含同醒者）：黄圈 outline 4px + 上浮 4px + 睁眼 + 去掉 Zz。排序：左列 = `view.players` 前 `ceil(n/2)` 个，右列 = 其余。每张卡带 `data-player-id`（演出层测量要用）。手机 8 人：沿用两行卡（老鼠+名字 / 骰盅），每边 4 张统一高 84px——这是用户专门复看过的版式，不许改回单行横排。

**① 夜里醒来**（`B2-attic-final.html`，夜）
- 中央：木砧板（330×46 圆角长条 + 右侧把手）+ 整轮奶酪（250px 宽，`breathe` 2.8s 呼吸）+ 说明胶囊（奶油胶囊墨边）。
- 告示牌：when =「夜晚 · 第 N 点」；title 按状态：轮到你且独醒 =「你独自醒来了」；同醒 =「你们同时醒来了」（`coWakers` 非空，caption 列出同醒名字）；你偷到后 =「奶酪到手，别出声」；轮到你且奶酪已不在 =「奶酪不见了！」；没轮到你 / 醒过 =「夜深了……」。
- 偷奶酪（用户定稿：**自动偷，没有「偷走奶酪」按钮**）：客户端在 `night && me.wakeHour === currentHour && !cheeseStolen && coWakers.length === 0` 成立 **600ms 后自动发送 `steal_cheese`**（带防重发锁）；服务端 `cheeseStolen` 翻转为真后播飞行：整轮奶酪从砧板连续缩小飞到「你」的席位卡左下角（580ms 抛物线，中途 1.35 倍 / −14°，落点缩到 48px 宽的小奶酪，落地 `land` 回弹 260ms + 轻屏震）。**砧板直接空着，不显示碎屑或「只剩碎屑」之类任何文案**（用户原话）。其他人屏幕：睡眠者按 §1.2 口径冻结；恰好同醒的人看着奶酪消失（opacity/scale 200ms 淡出即可）。
- 偷看（`me.canPeek`，即奶酪已被偷后你独醒）：坞里出现次按钮「偷看骰子」（`aria-pressed` 切换）；按下后其他席位虚线墨框 + `wobble` 摇摆（900ms 循环），点目标发 `peek_die`，目标席位的盅翻成骰子（`flip` 420ms，**只有你自己屏幕可见**），私密区加一条「独醒偷看：X 是第 N 点」。不做「跳过」按钮（方向稿没有；时刻倒计时自然收尾）。
- 坞：左 strong/span 私密文案（如「只有你醒着 / 奶酪到手，别出声」），右侧主按钮区域本画面通常为空；`deadlineAt` 倒计时胶囊。
- 私密卡保留类名 `.cheese-secret-card`（e2e 依赖），作为坞左侧或告示牌旁的奶油小卡：你的骰子点数 + 身份/情报小字；样式并入阁楼卡纸语言。

**② 掷骰**（`S2-roll.html`，夜；4 人局 = `hour_choice`，5–8 人局 = `night` 且 `currentHour === 0` 的开局窗口）
- 中央：砧板上立大骰盅（170×150 木盅，「?」56px 衬线，盅身一条箍线）。点主按钮「摇骰子」→ 盅 `shake-cup` 560ms → 向右上掀起淡出（`lifted` 320ms）→ 大骰子弹出（104px 奶油骰，`scale(.4)→1` 回弹 380ms，延迟 120ms）。
- 4 人局：两颗大骰并排，点选一颗（黄圈 5px `chosen`，另一颗 `dropped` 变淡 0.35），发送 `choose_hour`；30s 不选服务端兜底取第一颗（rules.ts 已有，不用做）。5–8 人局：只有一颗（服务器已定的 `me.wakeHour`），「摇骰子」只是揭开演出，**不发任何动作**（§6 确认记录 5）。
- 揭开后：hours 条你的点数 `mine` 高亮（黄底 + 放大 + 光晕）；告示牌「你会在 N 点醒来」；caption「记住：**N** 点」（N 用衬线加粗）；次按钮「盖回骰盅」/「再看一眼」纯本地切换。
- 其他席位：骰盅保持扣着即可。**不做**参照稿里「别人陆续摇好出 ✓」的假状态（服务端不下发谁已选，伪状态零容忍，design-spec §6.2）。
- `roleCardsEnabled` 且 `me.roleCard !== 'none'` 时，开局窗口在私密卡上用现有 `IdentityFlipCard` 翻身份卡（猫/狗/白老鼠），不新设计。

**③ 天亮指认**（`S3-vote.html`，昼；dawn = 讨论，vote = 投票）
- 夜→昼切换：扫屏 780ms + 月亮落下 / 太阳升起（700ms 缓动）+ 星星消失。
- 中央：倒计时圆盘（190px 奶油圆盘 + 墨边硬投影，SVG 进度环 r44、环粗 12、`--ct-m3` 绿；剩 ≤10s 环变 `--game-coral` + 圆盘 `pulse` 1s 循环；中间衬线数字 58px `tabular-nums`，底部小字「讨论」/「投票」）+ 空砧板 + caption「砧板空了，谁拿的？」；`cheeseStolen === false` 的局：砧板上奶酪还在，caption「奶酪还在砧板上」。
- dawn：坞 strong「说出你几点醒来、看到了什么」，span 提示你的时刻（「你是 3 点醒的。可以说真话，也可以不说。」），次按钮「提前去投票」发 `skip_discussion`。
- vote：其他席位可点（hover 上浮 −4px / −1.5°，选中黄圈 `target`），不能投自己；坞主按钮「确认指认」→ 选中后变「指认 X」，次按钮「弃票」（发 `cast_abstention`）。确认发 `cast_vote` 后：黄色「就是你！」小卡从主按钮飞到目标席位贴上（飞行 580ms + `stamp` 260ms + 轻屏震），「你」的卡出现「已投」小标；其他人随 `votes` 键集合陆续出现「已投」。**任何人的投向、票数都不显示。** 已投后坞文案「已指认，等其他人投完」/「你弃票了」。
- 现役「手机弹出式投票窗口」「天亮卷轴覆盖层」整体下线，不再有弹窗；投票就是点席位。
- 角色卡变体的猫/狗信息（`revealedCat` / `revealedDog` / `dogFirstVoter`）以坞内奶油 chip 小字呈现，不新设计。

**④ 揭晓结算**（`S4-reveal.html`，昼）
- 触发：`thiefCaught` 从 null 变为有值（开票）→ 既有 `voteResolved` 票据飞行（`useCheeseThiefStage`，保留）→ `game_over`。
- 序列：席位卡逐张翻面（`flip-out` 160ms 收 → `flip-in` 220ms 放，每张间隔 140ms，reduced 档直接终态）露出：骰子点数（`reveal.wakeHours`）+ 身份章（大盗 = 墨底奶油字「大盗」/ 共犯 = `--ct-m2` 橙底「共犯」/ 村民 = 奶油底「村民」，右上小圆牌）+ 「得 N 票」小字；被投出者（**视图没有 eliminated 字段**，客户端在 game_over 后从 `votes` 推导：最高票 >0 时，并列最高票的所有人都出局——照 rules.ts 第 197–200 行口径；全弃票则无人出局）卡变 `#efe9dc`、名字 `--game-coral` 3px 删除线。
- 翻完 → 告示牌盖章（`stamp` 360ms + 轻屏震 ≤4px）：title 60px 衬线三结局——`thiefCaught === true` =「村民胜！」（when「大盗被投出」）；`thiefCaught === false && reveal.thiefId` =「大盗胜！」（when「投错了人」）；`thiefCaught === false && !reveal.thiefId` =「平安夜！」（when「没人偷走奶酪」）。sub 一行小字：「大盗是 X，3 点偷走了奶酪」/「X 被冤枉出局，大盗是 Y」/「奶酪还在砧板上」。胜方席位（`winners`）黄圈高光上浮，其余 72% 透明。
- 村民胜（含平安夜）：奶酪从大盗卡（或场外）飞回砧板（580ms 抛物线）；大盗胜：大盗卡上的小奶酪放大弹跳一下（420ms）。
- 坞换成**时间线小条**：6 列（1–6 点，衬线点数 + 醒来者名字 + 结果小字），数据全部来自 `reveal`：该点 >1 人 =「同醒·互相看见」；恰好 1 人且 `=== reveal.stealHour` =「独醒·偷走奶酪」（墨底反白格）；恰好 1 人且在 `reveal.peeks` 有记录 =「独醒·偷看骰子」；恰好 1 人其余 =「独醒」；0 人 =「没人醒」。时间线 `opacity` 淡入 300ms。
- 「再来一局」不做自定义按钮：既有结算坞（TabletopShell/结算坞）照常接管。旧 `CheeseGameOverReveal` 全屏遮罩（`.cheese-reveal-overlay`）**整体下线删除**。

### 1.5 动效与音效（四档门控，`html[data-motion-level]`，design-spec §3.2）

| 演出 | default | reduced | minimal | off |
|---|---|---|---|---|
| 昼夜扫屏 + 月亮/太阳升降 | 780ms + 700ms | 直接切换，无扫屏 | 直接切换 | 直接切换 |
| 奶酪偷走飞行 / 飞回砧板 | 580ms 抛物线 + 落点回弹 260ms + 屏震 | 瞬移 + 落点弹一下，无屏震 | 瞬移 | 瞬移 |
| 大骰盅晃动 + 掀开 + 骰子弹出 | 560 + 320 + 380ms | 保留掀开、去晃动 | 直接终态 | 直接终态 |
| 「就是你！」小卡飞行 + 盖章 + 屏震 | 580 + 260ms | 瞬移 + 盖章，无屏震 | 直接贴上 | 直接贴上 |
| ④ 席位逐张翻面（间隔 140ms） | 160 + 220ms/张 | 保留顺序、去位移 | 一次全显 | 一次全显 |
| 告示牌盖章 | 360ms | 保留 | 直接终态 | 直接终态 |
| 投票票据飞行（既有 voteResolved） | 520ms + 70ms 错峰 | 瞬移 | 瞬移 | 关 |
| 循环装饰（奶酪呼吸 2.8s / 星星闪烁 2.4s / 席位 wobble 900ms / 计时 pulse 1s） | 开 | 关（pulse 保留，它是状态传达） | 关 | 关 |

门控与预算：演出只动 `transform`/`opacity`；单次 ≤600ms（④ 翻面序列属逐行累计豁免）；飞行走共享 `FlightLayer`；编排沿用 `useStageMachine`（`useCheeseThiefStage`，终局防重播已有）。新增 keyframes 照抄参照稿（上限 12 个）：`sweep`、`breathe`、`twinkle`、`shake-cup`、`wobble-cup`、`flip`、`flip-out`、`flip-in`、`stamp`、`land`、`pulse`、`pop`。音效：沿用 `stage/audioCues.ts` 既有 cue，新增事件（见 T4/T5）在 `audioCues.ts` 内映射到**既有**音效，不新增音频文件。TTS（`useCheeseTTS`）原样保留。

### 1.6 验收矩阵

截图目录：`docs/superpowers/reports/2026-08-15-game-ui-refresh/cheese-thief-attic/`（新建）
文件名：`cheese-thief-<画面>-<宽x高>.png`。
采集方式：新建 `scripts/capture-cheese-attic-shots.mjs`，照 `scripts/capture-settlement-dock-real.mjs` 的 `routeMockServer` 做法注入合成视角（能精确摆出「3 点你独醒」这类局面，不靠真局掷骰运气）。fixture 昵称用方向稿假数据：阿杰 / 小鱼干（你）/ 可可 / 老王 / 糯米 / Momo / 大橘 / 一只很长昵称的鼠；点数排成同一局（1 点多人同醒、3 点你独醒偷走奶酪）。

| 画面 | 视口 |  fixture | 对照物 |
|---|---|---|---|
| wake-solo（① 你 3 点独醒，奶酪在） | 1280×800 / 390×844 | 5 人 | `B2-attic-final.html` |
| wake-missing（① 你 5 点醒，奶酪已不在） | 1280×800 / 390×844 | 5 人 | 同上（点「偷走」后的状态） |
| roll-single（② 5–8 人揭开一颗） | 1280×800 / 390×844 | 6 人 | `S2-roll.html` |
| roll-pick（② 4 人两颗待选） | 1280×800 / 390×844 | 4 人 | `S2-roll.html?n=4` |
| dawn（③ 讨论，倒计时圆盘） | 1280×800 / 390×844 | 5 人 | `S3-vote.html` |
| vote-marked（③ 已指认，目标贴「就是你！」，两席「已投」） | 1280×800 / 390×844 | 5 人 | `S3-vote.html`（投完状态） |
| reveal-village（④ 村民胜，翻牌完成 + 时间线） | 1280×800 / 390×844 | 6 人 | `S4-reveal.html` |
| reveal-thief（④ 大盗胜） | 1280×800 / 390×844 | 6 人 | `S4-reveal.html?o=thief` |
| wake-8p-mobile（① 手机 8 人两行卡） | 390×844 | 8 人 | `B2-attic-final.html?n=8` 手机档 |

每张截图在报告里注明对照物（上表方向稿路径），AI 只做事实性描述，用户结论列留空（design-spec §11.4）。

---

## 2. 文件白名单（只许改这些）

| 文件 | 改什么 |
|---|---|
| `packages/client/src/game/cheese-thief/CheeseThiefGamePage.tsx` | 玩家端整体重排：`TabletopShell` 恒 `hideSeats`，children 里挂阁楼场景；四个画面各自的中央区与坞；自动偷触发；删掉旧 ArenaBoard 面板、dawn 卷轴覆盖层、手机投票弹窗、`CheeseGameOverReveal` 引用 |
| `packages/client/src/game/cheese-thief/cheese-thief.css` | 新增「阁楼世界」段（建议类名前缀 `.ct-`，`data-time` 昼夜变量切换）；旧场景样式段（3D 骰盅、Arena 中央、天亮倒计时/卷轴、计票大屏、手机投票弹窗、终局遮罩、V04 房间）在新页面不再引用后**整段删除**，删除前贴 grep 零引用证据到 PROGRESS.md。e2e 依赖的 `.cheese-secret-card` 与脚本依赖的 `.cheese-vote-candidate-card` **类名保留**（挂在新的私密卡 / 可投席位卡上） |
| 新建 `packages/client/src/game/cheese-thief/stage/AtticRoom.tsx` | 房间 + 拱窗（日/月/星/云/窗帘）+ 月光束 + 鼠洞 + 告示牌 + 时刻条 + 扫屏层；`data-time` 切换 |
| 新建 `packages/client/src/game/cheese-thief/stage/AtticSeats.tsx` | 两列圆章席位卡（老鼠 SVG / 座位号章 / 名字 / 骰盅骰子 / Zz / 已投 / vote-tag / seat-loot 落点），`data-player-id` |
| 新建 `packages/client/src/game/cheese-thief/stage/AtticCenter.tsx` | 中央区：砧板 + 整轮奶酪 SVG / 大骰盅 + 大骰子 / 倒计时圆盘 / 空砧板，按 phase 切换 |
| 新建 `packages/client/src/game/cheese-thief/stage/atticModel.ts` | 纯函数：奶酪可见性口径（§1.2）、席位分列、三结局文案、时间线聚合、自动偷条件——全部可单测 |
| `packages/client/src/game/cheese-thief/stage/deriveStageEvents.ts` | 新增事件：`cheeseStolen`（飞行触发）、`dawnBroke` 已有（扫屏触发）、`hourAdvanced`（时刻推进，仅音效）；不改现有事件语义 |
| `packages/client/src/game/cheese-thief/stage/useCheeseThiefStage.tsx` | 新事件的 FlightLayer 编排（奶酪偷走 / 飞回、「就是你！」小卡）；`voteResolved` 保留 |
| `packages/client/src/game/cheese-thief/stage/audioCues.ts` | 新事件映射到既有 cue |
| `packages/client/src/game/cheese-thief/CheeseTabletopArena.tsx` | 公共大屏复用 AtticRoom/AtticSeats/AtticCenter 公共口径（无私密卡、无坞按钮；夜间奶酪实时；vote 只显示「已投」；game_over 同画面④）；删除 three.js 奶酪与 `RoomProps` 的席位环/钟面 |
| 删除 `CheeseGameOverReveal.tsx`、`CheeseDiceCup3D.tsx`、`CheeseModel3DCanvas.tsx`、`cheeseModelGeometry.ts`、`stage/RoomProps.tsx` | T6 确认零引用后删除；`three` 依赖先 grep 全仓，若无其他引用再从 client `package.json` 移除（有则不动 package.json） |
| 新建 `packages/client/tests/cheeseThiefAttic.test.ts` | `atticModel.ts` 与 `deriveStageEvents.ts` 新事件的纯函数单测 |
| `scripts/verify-ingame-motion.mjs` | 仅当 `.cheese-vote-candidate-card` 类名无法保留时更新选择器 |
| 新建 `scripts/capture-cheese-attic-shots.mjs` | §1.6 截图组 |
| `docs/plans/2026-09-29-cheese-thief-visual/PROGRESS.md` | 进度与证据 |

**不许动**：`packages/games/cheese-thief/**`（服务端）；`packages/client/src/game/tabletop/`、`shared-ui/`、`styles.css`；其他游戏目录；`CheeseThiefSimStage.tsx` 与 `simTypes.ts`（桌面模拟模式不在本计划）；`GamePage.tsx` 路由；备选方向稿与 `_shared.js`；`useCheeseTTS.ts` / `cheeseVoice.ts` / `cheeseVoice` 相关；`IdentityFlipCard` 组件本身。

---

## 3. 逐步任务

每步：先写 / 更新测试 → 实现 → 跑验证 → 在 PROGRESS.md 记一行（做了什么、命令、退出码）。**一次只做一步，按 T1→T7 顺序。**

### T1 阁楼骨架
- 做：`atticModel.ts`（席位分列、奶酪可见性口径、三结局文案、时间线聚合、自动偷条件）+ 单测；`AtticRoom`（房间/拱窗/光束/鼠洞/告示牌/时刻条/扫屏层，`data-time` 昼夜）；`AtticSeats`（席位卡全状态：睡/醒/你/已投/vote-tag/seat-loot）；`CheeseThiefGamePage` 恒 `hideSeats`，挂骨架 + 各 phase 占位中央区；坞沿用 `ActionDock` 换皮。昼夜切换扫屏接 `dawnBroke` 事件。
- 判据：单测绿；1280×800 与 390×844、4/5/6/8 人下席位/中央/坞无重叠无溢出（把 DOM 几何检查结果贴进 PROGRESS）；`npm run typecheck` 绿；手机 8 人 = 每边 4 张统一高 84px 的两行卡。

### T2 ② 掷骰
- 做：`AtticCenter` 大骰盅模式：摇盅 → 掀开 → 大骰子弹出；4 人两骰点选发 `choose_hour`（选中/弃选态）；5–8 人一颗纯演出；「盖回骰盅/再看一眼」本地切换；hours `mine` 高亮；倒计时胶囊；其他席位不做假状态。
- 判据：与 `S2-roll.html`（含 `?n=4`）两视口对照；单测：`hourChoices` 分支与自动偷条件互不触发。

### T3 ① 夜里醒来
- 做：`AtticCenter` 砧板奶酪模式 + 奶酪可见性口径接入；醒来/同醒/睡着的席位态；自动偷（条件成立 600ms 自动发 `steal_cheese`，防重发）；`cheeseStolen` 事件 → 奶酪整轮缩小飞行 → seat-loot 落点 + 屏震；偷看交互（虚线框 + wobble + `peek_die` + 目标翻骰，仅自己屏幕）；告示牌/caption/坞文案状态机；私密卡（`.cheese-secret-card`）。
- 判据：与 `B2-attic-final.html` 两视口对照（含「偷到后」与「奶酪已不在」两状态）；单测：可见性口径六种组合；**界面上不存在「偷走奶酪」按钮**（grep 证明）。

### T4 ③ 天亮指认
- 做：`AtticCenter` 倒计时圆盘模式（SVG 环 + hurry 态）；dawn 坞 + `skip_discussion`；vote 席位点选（`.cheese-vote-candidate-card`）+ 「确认指认/指认 X」+ 弃票 + 「就是你！」飞行盖章 + 「已投」；已投后坞态；删除 dawn 卷轴覆盖层与手机投票弹窗代码。
- 判据：与 `S3-vote.html` 两视口两阶段对照；单测：**vote 阶段渲染数据里没有任何人的投向/票数**（只有已投布尔集合）；`cheeseStolen === false` 局砧板有奶酪。

### T5 ④ 揭晓结算
- 做：翻面序列 + 身份章 + 得票数 + 出局划线；告示牌三结局盖章 + 胜方高光 + 屏震；奶酪飞回 / 小奶酪弹跳；时间线小条；`CheeseGameOverReveal` 下线（组件与引用删除，`.cheese-reveal-overlay` 随之消失——`scripts/capture-settlement-dock-real.mjs` 对它是 try/catch 容忍，不用改）。
- 判据：与 `S4-reveal.html`（含 `?o=thief`）两视口两结局对照；单测：三结局文案 + 时间线聚合 + 票数统计；`useStageMachine` 刷新不重播（既有测试不红）。

### T6 公共大屏与清场
- 做：`CheeseTabletopArena` 复用阁楼场景（公共口径）；删除 three.js 组件、`RoomProps`、失效 CSS 段（逐段 grep 零引用后删，证据贴 PROGRESS）；`three` 依赖按 §2 规则处理；跑 `e2e/cheese-thief-tabletop.spec.ts` 完整局。
- 判据：`npm run typecheck && npm test && npm run build` 全绿；`npx playwright test e2e/cheese-thief-tabletop.spec.ts` 绿；`npx playwright test e2e/game-viewport-contract.spec.ts e2e/motion-contract.spec.ts` 绿。

### T7 验收
- 跑 §4 全部命令；按 §1.6 出截图组；写报告（design-spec §11.4 模板，机器门与视觉判定分两张表，「用户结论」列留空，状态只写「待用户看图」）。

---

## 4. 验证命令（每步结束都跑前三条）

```bash
npm run typecheck
```
```bash
npm test
```
```bash
npm run build
```
```bash
npx playwright test e2e/cheese-thief-tabletop.spec.ts
```
```bash
npx playwright test e2e/game-viewport-contract.spec.ts e2e/motion-contract.spec.ts
```
```bash
node scripts/capture-cheese-attic-shots.mjs
```

E2E 用 `packages/client/dist`，改完先 build。端口起不来先查孤儿服务进程。

---

## 5. 不许做

- 不许自评「视觉通过 / 已对齐 / 精致」；视觉结论只能是「待用户看图」（C11）。
- 不许新增 §1.3 之外的色值；黄色只用于 §1.3 列出的位置（C8）；浅色物件必须 3px 墨边 + 硬投影（C2）；大数字与标题用衬线 `--gp-font-display`（C7）。
- 不许做「偷走奶酪」按钮（用户定稿：自动偷）；不许在奶酪被偷后显示碎屑或「只剩碎屑」类文案（用户原话）；手机 8 人不许改回单行横排（用户复看过的版式）。
- 不许在 vote 阶段渲染任何人的投向/票数；夜间不许越过 §1.2 的奶酪可见性口径（比如直接按实时 `cheeseStolen` 翻玩家屏幕）。
- 不许改服务端规则、计时、视图字段；不许改共享 `tabletop/` / `shared-ui/` / `styles.css`；不许动桌面模拟模式（`CheeseThiefSimStage` / `cheese_thief_sim_v1`）。
- 不许照搬 `_shared.js` 的演示逻辑（重播按钮、演示工具条、假的「别人陆续摇好」）；参照稿顶部工具条不是产品。
- 响应式只用白名单断点（宽 380/480/640/768/1024/1280，高 520/620；容器查询同理，参照稿的 `@container (max-width: 600px)` 落到 640）。
- 不许删或实现备选方向稿 A / C / B1 / 奶酪选型稿。
- 不许 `git stash`、`git add -A`、`--update-snapshots`；只提交白名单内自己改的文件；开工前 `git status` 看有没有并行会话的改动。

---

## 6. 用户确认记录（2026-09-29 已全部确认）

1. **vote 阶段票数保密 → 服务端另开任务收紧**。本计划只改画面（vote 阶段只显示「谁已投」）；后续独立任务：服务端 vote 阶段只下发已投名单，`game_over` 才下发全量票面（动 `views.ts` + 类型 + 测试，与本计划解耦，不阻塞执行）。
2. **公共大屏夜间继续实时显示奶酪在/不在**（「桌台可见」语义保留）。
3. **角色卡变体（猫 / 狗 / 白老鼠）不补方向稿**：功能保留，坞内卡纸 chip 最小呈现。
4. **共犯选择画面按计划做**：夜场景 + 席位点选（同偷看交互），告示牌「你是大盗！」，坞主按钮「选定共犯（N/M）」，其他人看到「夜更深了……」。
5. **5–8 人局「摇骰子」为纯演出**：揭开服务器已定好的点数，不发送动作；4 人局点选才发 `choose_hour`。

---

## 7. 交给执行模型的提示词

```text
你接手 D:/项目 的「奶酪大盗（cheese-thief）」视觉落地。先只读：
1. D:/项目/docs/plans/2026-09-29-cheese-thief-visual/README.md（本计划，全文）
2. 其中 §0 列出的 AGENTS.md 与 DESIGN-DIRECTION.md 指定章节
3. 当前任务对应的参照稿 HTML（docs/ui-preview/cheese-thief/directions/）
然后只做 PROGRESS.md 里下一个未完成的任务（T1→T7 顺序）。先测试、再实现、再跑 §4 命令，把命令和退出码写进 PROGRESS.md。
只改 §2 白名单内的文件。遇到计划没写的视觉选择，停下列问题，不要自己决定。
不得自评视觉通过；每轮回复 ≤ 250 字：做了什么、验证结果、下一步。
```
