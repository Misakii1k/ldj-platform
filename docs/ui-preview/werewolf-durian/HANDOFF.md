# 狼人杀 / 榴莲 UI 接手说明

更新：2026-09-18。项目：`D:\项目`。先读本文件，再读 `DESIGN.md`；`NEXT-AGENT-PROMPT.md` 可作为接手提示词。

## 当前阶段与边界

当前交付是独立、固定数据、可直接打开的 HTML 原型；不是正式 React 实现，也没有接入真实对局。用户要求先看效果，再确认正式开发。不要擅自将候选设计系统全量替换到生产项目。

用户最新正式拍板（2026-09-18）：
- **狼人杀三主题同时搭载可切换**（取代旧记录“没有 B 方案”）：A 林中木刻（默认）、B 月蚀星轨、C 赤幕剧场三套主题全部保留搭载入生产，三主题切换入口置于顶栏，用户偏好持久化至 `localStorage`。
- **榴莲设计基准**：以 `durian.html` 为准，大数字为 Georgia 衬线字体，数量在水果下方，牌面数量允许显示数字（`showBadge` 开关）；紧凑模式全视口一屏，舒展模式在小屏（360×640）允许滚动 127px（不强行压缩以保 44px 触控）。
- **朝外展示端**：`display.html` 语义定为**「对外展示牌」**（在玩什么 / 进行到哪 / 怎么加入 + 房间号 + 二维码）。
- 正式接入按 `INTEGRATION-PLAN.md` 分批推进。

## 从哪里看当前效果

| 文件 | 地位 |
| --- | --- |
| `durian.html` | 最新榴莲个人操作端；默认回合弹窗，收起看桌面 |
| `art-directions.html` | 最新狼人杀左右席位候选；A 木刻 / B 月蚀 / C 赤幕；顶部可选优化版与上一版 |
| `design-v2.html` | 设计语言候选说明和浅色/深色组件示例，不是全项目已采用规范 |
| `index.html` | 原双游戏预览入口；其中狼人杀 iframe 仍是早期 `werewolf.html`，不要误当最新狼人杀定稿 |
| `moderator.html` | 第二批 · 狼人杀法官端（单屏全知控制台；出局/撤销/亮牌均二次确认） |
| `durian-table.html` | 第二批 · 榴莲公共桌面（房间共用大屏；只出公开字段） |
| `display.html` | 第二批 · 朝外展示端（对外展示牌；**语义未经用户确认**，见下文） |
| `integration-diff.html` | **接入差异清单**：5 个原型 vs 生产实现逐项对照、必须补的协议/权限/生命周期、不可直接迁移项、建议接入顺序。接入前必读 |
| `verified-report-r2.html` / `verified-report-b2.html` | 第一/第二批浏览器复核报告（含截图与逐条断言） |
| `werewolf.html` | 较早的完整白天/夜晚/投票交互参考 |
| `werewolf-art.*`、`screenshots/` | 目录现有资料；本次交接未核验其版本，不视为当前视觉基准 |

原型必须连同 CSS、JS、assets 一起复制，不能只传一个 HTML。纯本地资源，无需安装框架。已有 `docs/design-preview.html` 保留。

## CSS 加载顺序就是当前实现依据

- 榴莲：`shared.css → durian.css → fusion.css → durian-fit.css → durian-turn.css → durian-cards.css`。
- 狼人杀最新候选：`art-directions.css → art-seating.css → art-platform.css → design-v2.css`；`data-design=refined` 为默认优化版。
- 榴莲公共桌面（第二批）：`shared.css → durian.css → durian-cards.css → durian-table.css`。
- 法官端（第二批）：`art-directions.css → art-platform.css → design-v2.css → moderator.css`。
- **易踩的坑**：`art-platform.css` 把页面写成奶油纸底，但后加载的 `design-v2.css` 的 `body[data-design=refined]` 会把背景覆盖为**深色夜桌**（实测 body `#161e20`、座位卡 `#222d2e`、文字 `#f1eadc`）。所以狼人杀页默认是**深色**，别被小图误看成奶油底；法官端必须跟随深色才能和玩家端像同一个游戏。
- 覆盖层较多，这是迭代原型。正式实现前应归并为语义变量与组件样式，保持视觉和交互，不要继续无限叠补丁。

## 已有行为

榴莲：7 人固定示例，6 位他人牌公开，本人牌隐藏；需求统计；紧凑/舒展切换；自己的 draw/placement 阶段自动弹窗；收起不会提交或丢失选择；“继续我的回合”重新打开；确认出牌关闭弹窗；历史牌列；质疑结算；手动下一轮。预览工具默认收起到顶栏。两个密度选项都是真实的同一组 7 人示例，不是不同人数模式。

狼人杀最新艺术稿：左右各 6 人，中间发言者/倒计时/主题插画，底部操作；短横屏左右各两列。查看席位、私密身份、规则、票型、结束发言。艺术稿只演示发言场景；夜晚/投票完整交互仍在早期 `werewolf.html`。

## 必须诚实保留的验证边界

- **⚠️ 开工前工作区里 `npm run typecheck` 实际是失败的**（HANDOFF 早前写的"已通过"与事实不符）。两处报错：
  `packages/client/src/game/durian/DurianGamePage.tsx(986,10)` 与 `(1055,11)`：`Cannot find name 'DurianTurnSheet'`。
  原因是**未完成的重构**：工作区新增了 `DurianTurnSheet.tsx`（未跟踪新文件）并在 `DurianGamePage.tsx` 里使用了它，但**忘了加 import**（HEAD 版本里根本没有这个组件）。
  已补一行 `import { DurianTurnSheet } from './DurianTurnSheet.tsx';`（紧邻 `FruitGraphic` 的 import），此后 typecheck 通过。**这是纯增量的笔误修复，未删除或改写任何既有改动。** 如果你本意是要删掉这个组件，回退这一行即可。
- 最近 `npm run typecheck` 已通过；榴莲规则与视图 10 项相关测试通过；这些测试不能证明原型弹窗和 CSS 正确。
- 最近字体修改仅改 CSS，随后类型检查通过。
- 历史上构建通过，有大 chunk 警告；不能说最新版原型完成了截图或设备验收。

### 2026-09-18 基线自检（真实执行结果）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | **通过**（修复缺失 import 后） |
| Lint | `npm run lint` | **16 个错误**（原为 340，其中 324 个来自原型目录，已修） |
| 榴莲规则+视图 | `node --import tsx --test packages/games/durian/tests/{views,rules}.test.ts` | **10/10 通过** |
| 法官端契约 | `node --import tsx --test packages/games/werewolf/tests/moderator/contract.test.ts` | **7/7 通过** |
| 全站回归（原型） | `node docs/ui-preview/werewolf-durian/verify/sweep.mjs` | **12/12 通过** |
| 端到端 | `npm run test:e2e` | **28 失败 / 61 通过**（20.9 分钟） |
| 生产构建 | `cd packages/client && ..\..\node_modules\.bin\vite.cmd build` | **通过**（24.17s，2449 模块，仅仓库已知的大 chunk 警告） |

回归扫描覆盖：`index.html`（含 2 个 iframe）、`durian.html`、`art-directions.html`、`moderator.html`、`durian-table.html`、`display.html`。

**`npm run ci` 目前无法通过**（lint 16 + e2e 28）。以下三项都属生产代码范围，未擅自改动：

1. **e2e 根因 A（约 17 个用例）：应用落在「电脑主机大屏」入口页而非游戏首页**
   - **精确定位**：`packages/client/src/app/AppModeContext.tsx:58-65`，新增行为"电脑端作为主机时：初次访问默认先展示主机控制台大屏"：
     ```js
     const [showHostConsole, setShowHostConsole] = useState(() => {
       if (isNativeApp() || !isLocalhostOrigin()) return false;
       try { return sessionStorage.getItem('ldj_pc_host_entered') !== 'true'; } catch { return true; }
     });
     ```
     渲染入口 `AppModeContext.tsx:115`：`else if (isPcHost && showHostConsole)`。e2e 用 `127.0.0.1:3178`（localhost）+ 每个 spec 独立 context（sessionStorage 空）→ 必然命中。
   - **实测（探针已归档 `verify/probe-root-cause-A.mjs` 与 `verify/probe-B-detail.mjs`）**：
     - 探针 A（默认）：页面是「聚乐桌游 电脑主机大屏 / 游戏服务器运行中 · 端口 3178 / 进入大厅（桌面大屏模式）」，**不含**「谁是卧底」→ 根因 A 证实。
     - 探针 B（预置 `ldj_pc_host_entered=true`）：页面是「聚乐桌游 / 主机大屏 / 快乐小象 / 挑选游戏」，**含**「谁是卧底/狼人杀/UNO/斗地主」，且 `.game-home-page`×1、`.game-card`×11 —— **老测试期望的选择器全都在**。
   - **结论（更正上一轮的错误判断）**：上一轮我据"body 前 220 字不含谁是卧底"得出"方案 1 不解锁"，**那是探针断言太短导致的误判**。实际上**测试侧 `page.addInitScript(() => sessionStorage.setItem('ldj_pc_host_entered','true'))` 一次即可解锁全部 17 个用例，且零生产代码改动**。推荐这条。
   - 备选：`?noHost=1` URL 绕过（生产 5 行）；或把默认值改 `false`（影响真实用户，不建议）。
2. **e2e 根因 B（约 6 个用例）**：UI 重构后选择器失效。`werewolf-moderator` 找的 `.mod-console__ended` 不存在（但法官控制台本身渲染正常）；`werewolf-tabletop` 找的 `.ww-seat-rail .seat-chip` 匹配 0 个；`durian-tabletop` 的 `.durian-role-switch`、`visual-audit` 的 `.werewolf-wing` 同理。**接入时应把测试同步到新结构，而不是把 UI 改回去。** 另：`e2e/tmp-probe3.spec.ts` 是遗留的临时探针 spec，本不该留在套件里。
3. **lint 剩余 16 个错误**：`packages/client/tests/seatDriftRobustness.test.ts` 15 × `no-explicit-any`、`packages/client/src/game/cheese-thief/CheeseModel3DCanvas.tsx:379` 1 × `prefer-const`。

**已修（原型侧，不涉生产逻辑）**：`eslint.config.js` 为 `docs/ui-preview/**/*.js` 补浏览器全局、为 `docs/ui-preview/**/*.mjs` 补 Node + `page.evaluate` 所需浏览器全局（照 `scripts/audit-*.mjs` 的既有做法）；原型目录现在贡献 0 个 lint 错误。另修掉 `verify/*.mjs` 里的 3 个未使用变量。



### 2026-09-18 本轮已完成的浏览器复核（真实 Chromium 151）

本轮在允许的浏览器环境中完成了原型目录的视觉与交互复核，结论与证据如下：

- **视口**：360×640、390×844、844×390、1280×800。榴莲与狼人杀均为横向溢出 0、文字裁切 0、小于 44px 的触控目标 0。
- **回合流程**：榴莲 18 步 × 4 视口 = 72 项断言全部通过（自动弹窗、收起不提交、重开保留选择、选边、确认只提交一次、质疑、结算重开、下一轮自动打开摸牌、ESC 与遮罩关闭）。
- **弹层交互**：44 项断言全部通过（牌列、结算滚动后按钮可点中、狼人杀四类弹层、结束发言推进、私密身份失焦自动收起、主题切换）。
- **样式偏好**：Georgia 大数字仍作用于回合数/牌面数量/需求总数/抽牌数量/结算罚分；`.d-number`、`.d-player-penalty`、`.d-total-name` 仍为正文无衬线；数量保持在水果下方（四种视口实测 图片→名称→数量，无重叠）。
- **复现方式**：本轮使用一次性 Playwright 脚本驱动（未随目录交付），截图存于 `screenshots/verified-20260918/`，共 20 张，尺寸与视口一致且经像素多样性校验非空白页；文字汇总见 `verified-report.html`。

本轮修复的 4 个具体问题（均已复验）：

1. 榴莲横屏 844×390 牌面小卡：数量 `<b>` 嵌在 `<span>` 内而非网格子项，导致图片与水果名垂直重叠 → 改为网格单行两项 + 内部 flex 纵向排列（`durian-cards.css`）。
2. 狼人杀 360×640：65px 席位栏下 `.name` 的 `nowrap+ellipsis` 裁掉全部 12 个昵称 → ≤380px 允许换行、最多 2 行，并隐藏最低优先级的「存活/发言中」状态行让出高度（`art-seating.css`）。
3. 榴莲预览「预览」按钮宽 42px → `min-width:44px`（`durian-fit.css`）。
4. 榴莲确认出牌后 `waiting` 状态无出路，回合闭环走不通 → 补「看牌列」与可用的「开始下一轮 →」（`durian.js`）。

**仍然成立的不确定性**：未做 iOS/Android 真机触控与安全区实测，以上为 Chromium 模拟视口结论；Georgia 缺失设备会回退 serif，字宽有差异；狼人杀 `art-directions.html` 仍只演示白天发言，夜晚/投票未验收。

### 2026-09-18 第二轮独立复核（R2）

上一轮结论**不被采信直接沿用**，本轮由独立脚本重跑，并先对检测逻辑做注入式自检（注入 5000px 宽元素、`overflow:hidden` 裁字容器、20×20px 按钮，三类均被检出），确认"0 问题"不是检测器空转。

- **范围**：4 视口 × 2 页面 × 各状态 = 28 个审计单元格。横向溢出 0、文字裁切 0、小于 44px 的触控目标 0、控制台报错 0，与上一轮一致。
- **流程断言**：榴莲 36/36、狼人杀 25/25 全部通过。控制台零错误。
- **一屏容纳（实测）**：狼人杀左右各 6 人在四种视口均全在屏内；榴莲紧凑模式在 360×640、390×844、1280×800 全在屏内。
- **本轮修复 3 个焦点缺陷**：
  1. 模态弹层内 Tab 每循环有一站停在 `<body>`（榴莲 3 个弹层 + 狼人杀共用 `#dialog`）。已用不含任何自定义脚本的最小对照页证明这是 Chromium 原生行为，非测试假象。修复：`durian.js:142` 新增 `trapFocus()` 并在 `:176` 应用；`art-directions.js:22` 同法处理。
  2. 榴莲点「确认出牌」后按钮被重渲染销毁，焦点掉到 `<body>`。修复：`durian.js:112` `place()` 渲染后聚焦新阶段首个可用按钮。
  3. 狼人杀点「结束发言」后 `#finish` 变 `disabled`，焦点掉到 `<body>`。修复：`art-directions.js:43` 聚焦新发言人标题，`art-directions.html:14` 加 `tabindex="-1"`。
- **需更正的测试假象**：R2 批量脚本最初报告"狼人杀 4 个弹层关闭后焦点未回到触发元素"，实为脚本用程序化 `element.click()`（不移动焦点）所致。改用真实鼠标/键盘复测后四种触发场景均正确回焦；另用最小对照页确认 Chromium 原生已具备回焦能力。因此 `art-directions.js:19/45` 的显式回焦**不是修 Chromium 缺陷**，只是给 iOS Safari 等未验证环境留的保险，可按最小改动原则移除。
- **短横屏问题已解决（后续修复，非上一轮结论）**：原先 844×390 紧凑模式需向下滚动约 93px 才能看到「桌面累计需求」。根因是 `.d-layout` 在该断点被设为两列，但它的第二个子元素 `.d-play-area` 早已移进回合弹窗，**第二列完全是空的**，同时需求区被压在下方。修法见 `durian-fit.css` 新增的 `max-height:520px and min-width:640px` 块：把空列用于放置需求区，并恢复该断点原先被隐藏的水果名。结果 844×390 与 640×390 的紧凑与舒展模式**全部一屏放下（溢出 0）**，且没有缩小任何字号或触控目标。
- **更正一处此前的错误结论**：上一轮报告写"1280×800 舒展模式全部在屏内"，**这是错的**。实际 `main.d-game` 需滚动 76px，且「桌面累计需求」在初始滚动位置会被底部粘性操作条盖住大半。错误来源是只看元素可见性、且依赖被 `body{overflow:hidden}` 夹住的 `documentElement.scrollHeight`。现已改为逐元素测量 `overflowY` 容器的 `scrollHeight - clientHeight`，报告表由数据生成。**教训：判断"一屏放得下"必须逐元素测内部滚动量，不能只看整页高度或元素可见性。**
- **待用户裁决（剩余）**：榴莲舒展模式在 360×640 需滚动 127px、1280×800 需 76px（390×844 与 844×390 已为一屏）。这与 `DESIGN.md`「舒展模式可能需要少量滚动」的既有约定一致，默认的紧凑模式四种视口全部一屏。是否进一步压缩舒展模式待定。
- **产物**：`verified-report-r2.html`（含 33 张真实截图、逐条断言与诚实未验证项）、`screenshots/verified-20260918-r2/`。本轮 Playwright 脚本为一次性工具，未随目录交付。

### 2026-09-18 第二批：法官端 / 榴莲公共桌面 / 朝外展示端

新增三页，均为固定示例数据、不接真实对局。复核结论：4 视口 × 3 页 = 12 个单元格，横向溢出 0、文字裁切 0、<44px 触控目标 0、控制台报错 0；**27/27 交互与数据断言通过**；三页在四个视口均无需整页滚动（长列表改为内部滚动）。

- **法官端 `moderator.html`**：按生产 `packages/client/src/game/werewolf/moderator/` 的真实结构实现——真实法官端是**单屏全知控制台**，不是"夜晚→白天→投票"流程机，故本页刻意不做夜晚行动与投票操作。身份分配与玩家端同局同昵称：4 狼（01/04/07/10）、4 神（03 预言家/05 女巫/08 守卫/11 猎人）、4 民（02/06/09/12），03 与 09 已出局 → 存活 10，与玩家端「10 / 12 存活」吻合。
- **榴莲公共桌面 `durian-table.html`**：只承载 `DurianPublicView` 公开字段（累计需求、已出牌列含生效半边、罚分与淘汰、牌堆剩余、当前与上一手、轮次）。**绝不出现 `foreheadCards` 与 `drawnCard`**；除文案约束外另加结构性断言（内容区不得渲染 `.d-mini-card` / `.d-drawn-card` / `.d-half` 等手牌类节点）。数据与玩家端示例局逐项一致。
- **朝外展示端 `display.html`**：⚠️ **"朝外展示端"在整个仓库没有任何既有定义**（仅三处"待做"提及，生产侧无对应物）。本轮按"面向围观者的对外展示牌"实现（在玩什么 / 进行到哪 / 怎么加入 + 房间号 + 二维码占位），内置狼人杀进行中 / 等待开局 / 榴莲进行中三态。**语义待用户确认**，若本意是房间外引导海报或第二块围观大屏，改动量很小。
- **本轮修复**：① 公共桌面 `.dt-page` 缺高度约束导致整页撑高（360×640 溢出 760px）→ 补 `overflow:hidden` + `height:100%;min-height:0`；② 展示端 360×640 溢出 162px → 480px 断点改 3 列一行并压缩；③ 三页预览工具条链接宽 43px → 补 `min-width:44px`。
- **一次自查误报**：首轮"不泄露隐藏信息"断言命中的是页脚安全声明自身的"头顶/摸到"字样。已把扫描限定为内容区并追加结构性断言——只靠文案判断不够。
- **产物**：`verified-report-b2.html`、`screenshots/verified-20260918-b2/`、`verify/{b2-verify.mjs,b2-results.json,b2-report.mjs}`。



## 建议下一步，按顺序

1. 读当前仓库 AGENTS.md、git status，保护大量既有未提交改动。原型目录目前也未提交，必须保存完整目录。
2. ~~在允许的环境检查 360×640、390×844、844×390、1280×800~~ 已完成两轮（`verified-20260918` 与 R2），见上方复核结论。
3. ~~冒烟回合流程~~ 已完成（上一轮 72 + 44 项断言；R2 独立复跑 36 + 25 项全通过）。
4. ~~请用户确认第一批后才补第二批~~ 已完成：法官端、榴莲公共桌面、朝外展示端三页均已产出并复核，见 **`verified-report-b2.html`** 与 `screenshots/verified-20260918-b2/`。第一批报告见 `verified-report-r2.html`。
5. **用户已拍板确认**：① 榴莲舒展模式小屏滚动 127px 不压，保持 44px 触控与文字层级；② 朝外展示端定为「对外展示牌」；③ 狼人杀默认主题 A 林中木刻，三主题搭载并支持顶栏切换与持久化。
6. 正式接入计划见 **`INTEGRATION-PLAN.md`**，按批次推进：狼人杀玩家端 → 榴莲玩家端 → 法官端与榴莲公共桌面 → 朝外展示端。特别注意：法官端需对接 `WerewolfModeratorStatistics` 与 `suggestedOutcome`，公共桌面需接入 `buildDurianSpectatorView`，并保持隐藏信息隔离。

## 相关生产参考（只读理解，不自动覆盖）

- `packages/client/src/shared-ui/game-ui.css`：原平台 `--gp-*` 变量。
- `packages/client/src/game/werewolf/theatre.css`：现有暗夜主题。
- `packages/client/src/game/durian/DurianGamePage.tsx`、`durian.css`、`fruit-party.css`：现有榴莲业务/表现层。
- `packages/client/src/game/werewolf/`：狼人杀玩家/主持端。

## 检查命令

在 `D:\项目` 执行：

```powershell
node --check docs/ui-preview/werewolf-durian/durian.js
node --check docs/ui-preview/werewolf-durian/art-directions.js
npm run typecheck
node --import tsx --test packages/games/durian/tests/views.test.ts packages/games/durian/tests/rules.test.ts
```

正式接入按项目要求执行构建。直接 Vite 构建的正确工作目录为 `packages/client`，命令 `..\..\node_modules\.bin\vite.cmd build`；不要在根目录使用之前失败的 `npm exec vite build --prefix packages/client`。
