# 纸牌三姐妹（斗地主 / UNO / Ding）视觉缺陷修复报告

**日期**：2026-09-27
**背景**：用户 2026-09-27 反馈「昨天定稿实现的这几款效果不好」。本报告记录用**实际读图 + DOM 取证**查出的缺陷与修复。
**原计划**：`docs/plans/2026-09-26-cards-trio-visual/`（已于 2026-09-26 定稿）
**原截图报告**：`docs/plans/2026-09-26-cards-trio-visual/reports/T7-screenshots.md`

---

## 0. 一句话结论

**UNO 与 Ding 的整块游戏画面此前是坏的**：一块巨大的黑色团块盖住桌面，圆盘、弃牌堆、对手席位全被遮住。原因是**共用样式表 `party-table.css` 从未被任何地方 import**，不是"不好看"，是**没渲染出来**。另外查出 4 处规则/契约偏差。

---

## 1. 机器门

| 项 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| TypeScript 类型检查 | `npm run typecheck` | 0 | 通过 |
| ESLint | `npm run lint` | 0 | 通过 |
| 单元测试（主套件） | `npm test`（packages/**） | 0 | **1598 pass / 0 fail** |
| 单元测试（scripts 套件） | `node --test scripts/tests/**` | 1 | **4 fail（存量，与本轮无关，见 §4）** |
| 平台合规门 | `npm run compliance:d1` | 0 | PASS |
| 客户端生产构建 | `npm run build` | 0 | 通过（`packages/client/dist` 已更新，无 CSS 语法告警） |
| 截图组重采集 | `npx playwright test e2e/cards-trio-capture.spec.ts` | 0 | 3/3 passed，39 张全部重拍 |

> 注：`npm test` 默认环境下有 1 项 `llmConnectionTest.test.ts` 失败（502≠200），原因是本机代理 `HTTP_PROXY=http://127.0.0.1:7897`（clash-verge）会拦截测试用的假域名 `upstream.test`。把该域名加进 `NO_PROXY` 后 20/20 通过 —— **环境问题，非代码缺陷**。

### 几何实测（不靠肉眼，用 DOM 量）

| 检查项 | 修复前 | 修复后 |
|---|---|---|
| `.pt-dir-ring` 尺寸（应 540×540） | **1280×1286**，`position: static`；SVG `fill` = 黑 | **540×540**，`position: absolute`；`fill: none` / `stroke: rgb(255,253,249)` |
| `.pt-disc` 尺寸（应 450×450） | **height: 0** | **450×450** |
| Ding 质疑 chip 文字折行 | chip1 `em` 高 **59px**（单行 20px），3 处名字折行 | **0 处** |
| Ding 质疑面板宽度 | 279px（挤） | 桌面 **367px** / 手机 **291px** |
| Ding 质疑 chip 头像越出圆形 | 左右各 **18px** | 视觉裁切（`overflow: hidden`） |
| Ding 质疑 chip / 面板越出视口 | 手机端面板顶部**出屏** | **0 处**，`panelOverflowsViewport: false` |

---

## 2. 修复清单

| # | 严重度 | 现象 | 根因 | 修复 | 文件 |
|---|---|---|---|---|---|
| 1 | **致命** | UNO / Ding 画面被一块**巨大黑色团块**盖住（占屏约 80%，带左右尖角）。UNO 截图里圆盘、弃牌堆、6 个对手贴纸全部不可见；Ding 同样 | **`party-table.css` 从未被 import**：`main.tsx` 没有它，`uno.css` / `bell-clash.css` 也没有 `@import`，组件也没 import。后果：① `--pt-cream` / `--pt-ink` 等令牌全部为空 → SVG `fill` 回落到默认**黑色**；② `.pt-dir-ring` 拿到 `position: static; width: 1280px; height: 1286px`（本该 540×540）、`.pt-disc` `height: 0`。"方向环的圆 + 4 个箭头三角"于是变成一块黑团 | 在 `main.tsx` 加 `import './game/party-table/party-table.css';`，位置在 `uno.css` / `bell-clash.css` **之前**（让各游戏专属覆盖规则如 `.pt-disc--result` 靠源顺序压过它） | `packages/client/src/main.tsx` |
| 2 | **高** | Ding 圆盘**整体偏到左上角并溢出屏幕**，金铃孤零零悬在屏幕中央、不在盘面上（契约要求「铃在圆盘正中」） | 修好 #1 后 `.pt-disc` 开始生效（`transform: translate(-50%,-50%)`），而 `.bc-disc` 又写了 `left:50%; top:44%; translate:-50% -50%`。`translate` 与 `transform` **会叠加**，于是位移了两次 | 删掉 `.bc-disc` 的定位声明，只留 Ding 专属观感微调；定位交给共用套件的 `.pt-disc` | `packages/client/src/game/bell-clash/bell-clash.css` |
| 3 | 中 | UNO / Ding 手牌横贯整屏、角标相对溢出 | `CardFanEngine` 未收到 `cardWidth`，回落到全局令牌 **76px**；方向稿 `_party.css` 规定**桌面 86 / 手机 60** | 给两处 `CardFanEngine` 传 `cardWidth={compact ? 60 : 86}`（`useCompactLayout`） | `uno/stage/UnoHouseStage.tsx`、`bell-clash/BellClashGamePage.tsx` |
| 4 | 中 | 建房/房间设置界面写着「**按铃窗口（秒）** 默认 **10**」——这是**旧规则的残留**（新规则是亮卡后约 3 秒质疑，且与"按铃窗口"无关）。同时契约要求留出的 `challengeSeconds` 反倒**没有任何 UI 入口** | 规则重写时只改了服务端与玩家可见文案，漏了 `GAME_CATALOG` 的 `setup.options` 与 `rulesets[].details` | 配置项改为 `challengeSeconds`（默认 3，范围 1–30，与服务端 schema 一致）；规则说明按新规则重写（含"不必与顶牌同色""质疑过半罚摸"） | `packages/shared/src/game/catalog.ts` |
| 5 | 中 | 截图与结算卷轴上出现「叫分 6 · 倍数 ×6」——**叫分 6 在规则上不可能**（叫分只有 1/2/3） | ① 截图 fixture 手工注入 `multiplier: 6`（`cards-trio-capture.spec.ts` 两处）；② `VictoryScroll` 把「叫分」和「倍数」**共用同一个变量**显示 | ① fixture 改为 `multiplier: 3`（与契约 §6「② 出牌…倍数 ×3」「②' 你出炸弹 8888 之后」一致，契约明确炸弹**倍数不变**）；② 卷轴新增 `topBid`，三家都不叫时显示「无人叫分」而非「叫分 1」 | `e2e/cards-trio-capture.spec.ts`、`landlord/teahouse/VictoryScroll.tsx`、`landlord/LandlordGamePage.tsx` |
| 6 | 低 | 注释里残留旧规则术语「抢铃」「按铃窗口」 | 同 #4，规则重写时的措辞遗漏 | 改为「质疑判定 / 质疑失败后的罚摸」；`module.ts` 开局换牌逻辑补注释说明理由（纯展示：短语卡无颜色） | `games/bell-clash/server/module.ts`、`client/.../bell-clash/stage/deriveStageEvents.ts` |
| 7 | 中 | Ding 质疑面板 5 条投票 chip 里，**名字与状态被挤成 2–3 行**（实测 `chip1 em 高 59px` vs 单行 20px，`糯米`/`没做过` 均折行） | `.bc-challenge__votes` 用 `repeat(3, auto)`，面板只有 279px 可用宽，容不下「头像 + 名字 + 没做过」的整条 chip | 投票区改 `repeat(3, max-content)` + chip `white-space: nowrap`，面板 `width: max-content; max-width: min(420px, 92vw)`。实测：桌面 367px/手机 291px，折行 0 处、溢出 0 处 | `bell-clash/bell-clash.css` |
| 8 | 中 | Ding 手机端质疑时**整个面板被顶出视口顶部**（5 条 chip 只剩下半截） | 手机断点把 `.bc-reveal` 锚在 `bottom: 330px` 且保持 `flex-direction: row`；面板一变高就向上溢出 | 手机改竖排 `flex-direction: column` + `top: 40%` + `translate: -50% -50%` + `max-height: 74vh` | `bell-clash/bell-clash.css` |
| 9 | 低 | Ding 投票 chip 里的头像**撑破圆形**（实测 `UserAvatar` 36×36 塞进 24×24 的圆，左右各溢出 18px；手机 20px 圆同样溢出 18px） | `.bc-vote__avatar` 未裁切，直接放了通用 `UserAvatar`（默认 36px 且自带描边） | 该圆加 `overflow: hidden; flex: 0 0 auto`，内部头像铺满并去掉自身描边/圆角 | `bell-clash/bell-clash.css` |
| 10 | 低 | 「糯米 没做过」的珊瑚红文字在浅红底上对比度 **4.49:1**，差 0.01 不到 AGENTS.md 要求的正文 4.5:1 | 用了 `--gp-coral` (#c23616) on `#fde3dd` | 改用项目已有的 `--gp-coral-dark` (#a12b11) → **6.00:1** | `bell-clash/bell-clash.css` |

---

## 3. 视觉判定

**按 `AGENTS.md`「视觉验收规范」，视觉合格只能由用户看图判定。本报告不写 PASS / 达标 / 已对齐。**

### 3.1 修复前后对照（同视口）

| 画面 | before（修复前） | after（修复后） | 对照物 |
|---|---|---|---|
| UNO 出牌 1280×800 | 一块巨大黑色团块盖住全屏；仅剩 7 张手牌、摸牌/UNO! 按钮、聊天可见 | 红色桌布 + UNO 暗纹；中央牛皮纸圆盘上有弃牌堆（UNO 牌背 + 红 7）与"剩 42 张"；上半圈 6 个对手贴纸（老王 5 / 可可 1 / 糯米 1 / Momo 3 / 阿杰 9 + UNO! 气泡）；白色虚线方向环含 4 个箭头；底部 7 张手牌成扇形；底栏 摸牌 / UNO! / 聊天 | `docs/ui-preview/cards-trio/r2/uno-1-play.html` |
| UNO 出牌 390×844 | 同上黑团块，且左侧文字被裁掉 | 竖屏同样结构，无黑块、无裁切 | 同上 |
| Ding 平时态 1280×800 | 黑团块盖住全屏；蓝底上只有金铃、6 张手牌、摸牌/拍铃! | 蓝色桌布 + 杯垫暗纹；中央圆盘**金铃在盘心**；左右为 UNO 牌背与蓝色 4 号牌；上半圈 6 个对手贴纸；白色虚线方向环；底部 6 张手牌 | `docs/ui-preview/cards-trio/r2/ding-1-play.html` |
| Ding 质疑态 1280×800 | 5 条投票 chip 挤成 3 列但**文字折行 2–3 行**（`糯米`/`没做过` 竖排），头像撑破圆形 | 圆盘左侧绿色短语卡「伸了一个懒腰」，右侧白色面板「真的有人这么做了吗？」，5 条 chip 排成 **3 列 2 行**（Momo 有 / 糯米 没做过 / 老王 有 / 可可 有 / 阿杰 有），头像在圆内、文字单行 | `docs/ui-preview/cards-trio/r2/ding-2-miss-result.html` |
| Ding 质疑态 390×844 | **整个面板被顶出视口顶部**，只剩 chip 下半截 | 竖排：上方绿色短语卡，下方白色面板完整可见，5 条 chip 三列两行，无裁切 | 同上 |
| 斗地主 春天 1280×800 | 卷轴写「叫分 6 · 倍数 ×6」（叫分 6 不可能） | 卷轴写「叫分 3 · 倍数 ×3」，与右下倍数牌一致 | `docs/ui-preview/cards-trio/r2/landlord-3-result.html` |

### 3.2 固定截图组（已重采集，绝对路径）

目录：`D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\`

**斗地主（14 张）**：`landlord-bid` `landlord-bid-decided` `landlord-play` `landlord-play-bomb`(原名由 `-1280x800`/`-844x390` 后缀区分) `landlord-result-win` `landlord-result-spring` `landlord-result-lose`（各 1280x800 + 844x390）、`landlord-rotate-hint-390x844`

**UNO（10 张）**：`uno-play` `uno-play-draw4` `uno-hand16` `uno-hand25` `uno-round-result`（各 1280x800 + 390x844）

**Ding（14 张）**：`bell-clash-idle` `bell-clash-picking` `bell-clash-challenge` `bell-clash-success` `bell-clash-miss` `bell-clash-result` `bell-clash-hand24`（各 1280x800 + 390x844）

> 全部 39 张已用修复后的构建产物重新采集。

---

## 4. 存量失败（与本轮修复无关，未修改）

`node --test scripts/tests/**` 有 4 项失败，涉及文件最后修改时间为 **2026-08-05 / 2026-09-22**（本会话开始之前），且不在本轮改动范围内：

| 失败用例 | 文件 | 说明 |
|---|---|---|
| `driver：werewolf 稳定基线模块完整局可收束` | `scripts/tests/d4/driver.test.mjs` | 对局超出最大步数 800，状态停在 `day_announcement` |
| `已知样例锁定：冻结源集合 9 文件全部哈希/行数/有效 LOC 与 baseline 一致` | `scripts/tests/d4/measure-loc.test.mjs` | 与 `compliance/d4/third-game-baseline.json` 不一致（该 json 在本会话前已被改动：werewolf `module.ts` sha256/行数变化） |
| `runMeasurement：target 为同一功能清单的削减实现时 reductionPercent 达标` | 同上 | 1777 !== 1514 |
| `runMeasurement：未提供目标实现时为 content-hash provisional` | 同上 | 输出为 FAIL 而非 provisional |

**未为转绿去改这些测试或放宽断言**（遵守计划「不许为了让测试转绿去删断言」）。

---

## 5. 尚未完成 / 待用户决定

1. **UNO 计分归属**（契约 README §4）：经典单局 `uno_legacy_platform_v1` 应**不计分**，只有欢乐房规 `uno_platform_house_v1` 有逐局计分。本轮截图用的是房规（有计分正确），**经典单局的结算画面本轮未核查**。
2. **紧凑模式交互**（README Q1，AI 自补、用户从未确认）：手机紧凑模式「第一次点抽出来看、第二次点出牌」。Ding/UNO 均按此实现，**仍需用户确认**。
3. **Ding 质疑窗口 3 秒 / 严格过半**（Q2）与**拍铃打断别人回合**（Q3）：按默认实现，仍需用户确认。
4. **斗地主「提示」按钮**（Q4）：未做。
5. **Ding 春天式冲屏演出缺失**：契约 §4.3 要求出炸弹时「冲屏"炸！"+ 4px 屏震 + 出牌区每张牌依次弹一下 + 对手半身像后缩 + 上家冒气泡」，审计发现 stage 层**没有春天印章的冲屏事件**（`deriveStageEvents.ts` 无 spring 事件）。未在本轮修复。
6. **令牌对齐（低优先）**：`party-table.css` 的 `--pt-out` 曲线与方向稿不同（`cubic-bezier(0.16,1,0.3,1)` vs `.22,1,.36,1`）；`--pt-cream` / `--pt-ink` 是自建字面量而非平台令牌 `--gp-paper` / `--gp-ink`。

---

## 6. 用户看图记录

- 2026-09-27 用户：「可能我改的不太好。你再去处理一」+ 选定「②斗地主/UNO/Ding 的已实现效果不好（我看过截图了）」
- 2026-09-27 用户准许开大量子 agent 并行处理。
- 2026-09-27 用户要求用看图能力检查。
- （修复后截图等待用户看图判定）
