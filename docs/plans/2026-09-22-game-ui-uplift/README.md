# 其余游戏前端提升计划（v0.1）

**日期**：2026-09-22。工作区 `D:\项目`，分支 `feat/wits-wagers-tabletop-stage`。
**状态**：G0 已确认（§6）；U00、U01 已完成（`reports/`）；P1 三款视觉契约已产出（`contracts/`），进入 U02。

## 1. 背景与目标

狼人杀、榴莲、一智千金经过多轮打磨，各自拥有专属舞台、演出层与道具组件；其余 9 款游戏仍是通用层（`TabletopOvalShell` + `ArenaBoard/ArenaRail` + `ActionDock` + `GameDrawer`）的填空，彼此差异只剩毛毡主题名与一张背景图。目标是让这 9 款达到「有自己的桌面、有自己的道具、有自己的关键时刻演出」的档位，同时不再各自跳出平台体系（避免重蹈榴莲自建 `--d-*` 令牌的覆水难收）。

## 2. 现状分层（探索结论摘要）

| 档位 | 游戏 | 依据 |
|---|---|---|
| 打磨 | wits-wagers / werewolf / durian | 独立 stage 演出层、专属道具、3D/主题/语音 |
| 中等偏上 | cheese-thief | three.js 奶酪 + 骰盅 + 专属结算揭晓 + TTS，但布局仍是通用模板 |
| 中等 | uno / loveletter | uno 有 CardFanEngine + ringLayout；loveletter 884 行单文件、143 行 CSS 埋在 styles.css |
| 中等偏下 | goose-relay / undercover | 内容量在（cardCatalog 903 行、BlankStageArena 817 行），CSS ≤ 53 行，零动效 |
| 简陋 | night-testimony / echo-judge / bell-clash | 51–86 行 CSS 或零自有 CSS，纯 ArenaBoard 填空 |
| 最简陋 | landlord | 前端目录只有 `types.ts` + 5 行 CSS，页面寄生在 `NewGamePages.tsx` |

代码量与动效统计见探索报告（tsx / ts / 自有 css；keyframes / 3D）：其余 9 款自有 keyframes 与 3D 属性全为 0，动效全部来自 `styles.css`（23373 行）的 102 个全局 keyframes。

## 3. 统一范式：复制一智千金的 `stage/` 分层，而不是复制榴莲

**每款游戏新增 `packages/client/src/game/<id>/stage/` 目录**，结构对齐 `wits-wagers/stage/`：

```
stage/
  deriveStageEvents.ts   服务端 view diff → 演出事件（不含任何 UI）
  use<Game>Stage.ts       演出状态机（roundToken/phaseEpoch 防刷新重播，参考 stageMemory.ts）
  <Game>TableStage.tsx    桌面主舞台，内部用 TabletopOvalShell 席位
  <Game>Countdown.tsx     直接复用 WitsCountdown 抽成 shared-ui 后的通用版（见 §4）
  props/                  专属道具组件（牌、令牌、铃、奶酪等）
  audioCues.ts            音效表，走 WebAudioManager
```

**硬约束（沿用 03-visual-contract 的规矩）**：
- 只能用 `--gp-*` / `--game-*` 令牌；局部 `--<prefix>-*` 变量只允许布局量，不允许颜色。
- 每款一个 accent（catalog 已有 `visualTheme.accent`），accent 只作描边 / ≥24px 大字，纸底正文禁用 accent。
- 动效只动 transform/opacity，尊重 `html[data-motion-level]` 四档；reduced 档停装饰循环但保留回合光晕 / 倒计时脉冲。
- 断点白名单：宽 380/480/640/768/1024/1280，高 520/620。
- 每款自有 CSS 文件（`<id>.css`），并把 `styles.css` 里对应的 `.xx-*` 段迁出，逐步瘦身 styles.css。
- 每视口单一黄色 CTA；不引入全屏遮罩忙碌态。

## 4. 前置：把一智千金里的通用能力上提到 shared-ui（P0）

这是让 9 款「省钱」的关键，先做：

| 上提项 | 来源 | 目标 | 说明 |
|---|---|---|---|
| 大号 SVG 进度环倒计时 | `wits-wagers/stage/WitsCountdown.tsx` | `shared-ui/StageCountdownRing.tsx` | 首次见到 deadlineAt 测一次为满格；10s 紧张态、5s 滴答；供所有游戏替换 `TabletopCountdownText` |
| 演出状态机骨架 | `useWitsWagersStage.ts` + `stageMemory.ts` | `shared-ui/stage/useStageMachine.ts` + `stageMemory.ts` | 抽出 roundToken/phaseEpoch 防重播与事件队列，业务 diff 留在各游戏 `deriveStageEvents.ts` |
| 飞行层 | `noteFlight.ts` + `WitsFlightLayer.tsx` | `shared-ui/stage/FlightLayer.tsx` + `flightPresets.ts` | 通用「元素从 A 席飞到 B 处」，保留五种性格与 translateZ 景深；挂在 preserve-3d 子树之外 |
| FLIP 编排 | `flip.ts` | `shared-ui/stage/flip.ts` | 唯一 framer-motion 引用点，集中管理 |
| 3D 毡面 | `.ww-felt` 配方 | `game-ui.css` 新增 `.stage-felt-3d` | perspective 900px / rotateX 16deg 参数化为变量 |

完成标准：wits-wagers 切到上提后的版本，其 e2e（`e2e/wits-wagers*.spec.ts`）与 T07 视觉样张零回归。

## 5. 逐游戏提升方案与优先级

排序原则：按 G0-2 确认的「简陋优先」。每款标注 3D 档位（G0-3）：**3D** = 启用 `.stage-felt-3d` 透视毡面 + translateZ 景深；**平面** = 只用 FLIP 与平面飞行层。

### P1 — 简陋档（三款同构，可一次成型）

**night-testimony 囚徒之夜**（theme mystery，**平面**，夜间局部暗角）
- 桌面：审讯室长桌，中央「证词板」替代 ArenaBoard，证词以便签卡钉在板上（钉子用 accent 描边）。
- 关键演出：夜晚降临的暗角渐变（沿用狼人杀 `EyeBlinkTransition` 思路但只做暗角，不做眼睑）；证词公布时便签逐张翻转飞入（FlightLayer）。
- 道具：`TestimonyNote`（便签）、`SuspectTag`（嫌疑标签）。

**echo-judge 伪人测试**（theme court，**平面**，判定阶段局部暗角）
- 桌面：法庭布局，席位马蹄形；中央「判词台」。
- 关键演出：判定阶段的木槌敲击（音效 + 中央板 4px 下沉回弹）；真人/伪人揭晓用 `IdentityFlipCard` 但加 accent 扫光。
- 道具：`VerdictCard`、`GavelBadge`。

**bell-clash Ding**（theme party，**3D**）
- 桌面：中央一枚可按的铃（3D 半球，硬投影 `0 7px 0`，按压 `0 1px 0`），席位环绕。
- 关键演出：抢拍时铃震动（已有 `bellRingShake`，迁入自有 CSS）+ 全屏 `TabletopEventOverlay` 保留；出牌用 CardFanEngine 飞到中央牌堆（FlightLayer）。
- 道具：`BellButton`、`CenterPile`。

### P2 — 中等偏下（素材已有，缺舞台）

**goose-relay 以鹅传鹅**（**3D**）
- 素材：`public/goose-cards/` 卡面 + `cardCatalog.ts` 903 行已齐。
- 桌面：草地牧场毡面（theme meadow），中央「传递轨道」，鹅卡沿席位环顺序传递（FlightLayer 沿圆弧飞）。
- 关键演出：传递到位时接收席位光晕；结算时鹅群列队。

**undercover 谁是卧底**（**平面**）
- classic 模式目前复用通用 `WordRevealView/SpeakingView/VotingView`；把这四视图收编为 `stage/UndercoverTableStage.tsx`，发言用席位波纹，投票用 `SeatTargetPicker` + 票数飞到目标席位。
- BlankStageArena 保留，仅换令牌与 CSS 迁出。

### P3 — 中等（补舞台，不推翻已有引擎）

**uno**（**3D**）
- 已有 UnoHouseStage + ringLayout，缺自有 CSS 与演出：出牌沿 FlightLayer 飞到中央牌堆并翻面；换色时中央牌堆按新色扫光；UNO 喊叫全屏事件浮层。
- 把 `styles.css` 154 行 `.uno-*` 迁到 `uno.css`；删除 `NewGamePages.tsx` 中 legacy UNO 页。

**loveletter 情书**（**3D**）
- 884 行单文件拆为 `stage/` + `panels/`（技能预览、记牌器、查验记录、轮次横幅）；143 行 `.ll-*` 迁到 `loveletter.css`。
- 桌面：书信桌（theme letter），中央信封牌堆；出牌飞向目标席位并翻开（FlightLayer + IdentityFlipCard）。

**cheese-thief 奶酪大盗**（**平面**，three.js 奶酪与骰盅保留）
- 保留 three.js 奶酪与骰盅；补 stage 结构与专属 accent；夜间偷奶酪阶段暗角 + 老鼠脚印路径动效；结算揭晓已好，接入 useStageMachine 防重播。

### P4 — 结构性欠债

**landlord 斗地主**（**3D**）
- 从 `NewGamePages.tsx` 抽出为 `game/landlord/LandlordGamePage.tsx` + `stage/`，CardFanEngine 手牌、叫地主阶段底牌翻开演出、出牌飞到中央（FlightLayer）、炸弹/王炸事件浮层。
- 这是唯一一款要「先补齐结构再谈设计」的，工作量最大，放最后但独立成任务卡。

## 6. G0 决策（2026-09-22 用户已确认）

| 编号 | 议题 | 决策 | 影响 |
|---|---|---|---|
| G0-1 | 视觉方向 | **浅色纸感 + 局部暗角**。9 款全部复用平台 `--gp-*` / `--game-*` 令牌与每款一个 accent；囚徒之夜、伪人测试仅在夜间/判定阶段加局部暗角，**不做整局深色主题** | 不新建主题系统，不需要逐款对比度表；暗角按装饰循环处理，reduced 档降级 |
| G0-2 | 优先顺序 | **简陋优先**：night-testimony → echo-judge → bell-clash → goose-relay → undercover → uno → loveletter → cheese-thief → landlord | §7 任务卡 U02–U10 即按此顺序 |
| G0-3 | 3D 预算 | **只给有飞行道具的游戏**：bell-clash / goose-relay / uno / landlord / loveletter 开 `.stage-felt-3d` 透视毡面 + translateZ 景深；night-testimony / echo-judge / undercover / cheese-thief 保持平面，只用 FLIP 与平面飞行 | §4 的 `.stage-felt-3d` 仍要做，但只在 5 款启用 |
| G0-4 | 榴莲 | **本轮不动**。`--d-*` 平行令牌与全屏自建外壳保留，Georgia 数字等已拍板偏好不受影响 | 令牌回迁不列入本计划 |
| G0-5 | 截图基线 | **git checkout 还原**当前 38 张被覆写的 PNG 与 `viewport-baseline.json`；U00 重新截一套供用户审阅 | 这些 PNG 是视口合约测试的覆盖式存档，非像素断言 |

原始待确认项已全部关闭，无遗留。

## 7. 任务卡拆分（每卡一个可验证产出）

| 卡 | 内容 | 验收 |
|---|---|---|
| U00 | 基线：跑 `typecheck / lint / test / test:e2e`，记录存量失败；截 9 款 390×844 + 1280×800 人工审阅样张 | `reports/U00-baseline.md` |
| U01 | §4 shared-ui 上提（Countdown ring / useStageMachine / FlightLayer / flip / felt-3d），wits-wagers 切换 | wits-wagers e2e 零回归，T07 样张对比 |
| U02 | night-testimony stage | 视口合约 7 档无溢出；motion 三档契约通过；样张用户审核 |
| U03 | echo-judge stage | 同上 |
| U04 | bell-clash stage + CSS 迁出 | 同上 |
| U05 | goose-relay stage | 同上 |
| U06 | undercover classic 收编 | 同上 + `e2e/undercover*.spec.ts` |
| U07 | uno stage + legacy 删除 | 同上 + `e2e/uno*.spec.ts` |
| U08 | loveletter 拆分 + stage | 同上 |
| U09 | cheese-thief stage 接入 | 同上，three.js 渲染不回退 |
| U10 | landlord 抽出 + stage | 同上，新增 `e2e/landlord-visual.spec.ts` |
| U11 | styles.css 瘦身核对 + 最终验收 | 各游戏 `.xx-*` 在 styles.css 中归零；`npm run ci` |

每张卡按 wits-wagers 交接包惯例：
- 先用 `page.routeWebSocket` mock 固定 payload 出 V1/V2/V3 关键画面样张（参考 `e2e/wits-wagers-visual.spec.ts` + `e2e/fixtures/wits-wagers.ts`），**基线由用户审核，禁止失败后自动接受新截图**。
- 改样式后手机 + 桌面两分辨率都查；跑 typecheck；同步 dist（e2e 跑的是构建产物）。
- 不通过自动重试、删断言、改截图基准来假装通过。

## 8. 参考

- 平台规范：`docs/design-spec.md`、`docs/TABLETOP_DESIGN_SYSTEM.md`、`AGENTS.md`
- 范式来源：`docs/plans/2026-09-20-wits-wagers/03-visual-contract.md`、`packages/client/src/game/wits-wagers/stage/`
- 主题化参考：`docs/plans/2026-09-19-werewolf-handoff/02-VISUAL.md`
- 令牌权威：`packages/client/src/shared-ui/game-ui.css`
- 视口门：`e2e/game-viewport-contract.spec.ts`；动效门：`e2e/motion-contract.spec.ts`
