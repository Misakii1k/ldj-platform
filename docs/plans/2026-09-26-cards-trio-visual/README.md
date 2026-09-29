# 斗地主 / UNO / Ding 视觉重做 · 交接计划

日期：2026-09-26　｜　定稿人：用户　｜　计划作者：Opus（只负责定稿与写计划）　｜　执行：更便宜的模型

> **执行模型先读这一页，再按 `tasks/` 顺序做。** 本计划写到"没参与讨论也能照做"的程度；
> 计划里没写到的视觉决定，**一律停下来列问题交回用户**，不要自己发挥（`docs/DESIGN-DIRECTION.md` C14）。

---

## 0. 这次要做成什么样（一句话）

| 游戏 | 世界 | 像素参照（定稿方向稿，双击可开） |
|---|---|---|
| 斗地主 | **老茶馆正堂**：第一人称坐在八仙桌前，桌面透视；远处梁、灯笼、对联、牌匾、花窗；**只做横屏** | `docs/ui-preview/cards-trio/r2/landlord-1-bid.html` / `landlord-2-play.html` / `landlord-3-result.html` |
| UNO | **整屏色块**：当前颜色就是整张桌布，换色从弃牌堆泼满全屏；中央纸板圆盘；对手贴纸环绕上半圈 | `docs/ui-preview/cards-trio/r2/uno-1-play.html` / `uno-2-result.html` |
| Ding | **UNO 同系列**：同一套桌布 / 圆盘 / 贴纸 / 牌框，主色 Ding 深绿；**铃在圆盘正中**；**规则按用户纠正重写**（见 `contracts/ding-rules.md`） | `docs/ui-preview/cards-trio/r2/ding-1-play.html` / `ding-2-miss-result.html` |

方向稿是**像素参照**：颜色、尺寸、间距、演出时长以方向稿为准；方向稿里写死的假数据、工具条按钮、"演示用"的流程不照抄（见各契约 §7「不照抄」）。

预览方式（二选一）：
- 双击 HTML 文件直接开；
- 或 `npx vite docs/ui-preview --port 5191`，打开 `http://localhost:5191/cards-trio/r2/index.html`。

## 1. 文件结构

```
docs/plans/2026-09-26-cards-trio-visual/
├── README.md                 ← 本页：流程、全局规则、不许做
├── STATUS.md                 ← 执行进度 + 用户看图记录（执行模型维护）
├── contracts/
│   ├── landlord.md           ← 斗地主视觉契约（§11.2 六节 + 不照抄 + 待确认）
│   ├── uno.md                ← UNO 视觉契约
│   ├── ding.md               ← Ding 视觉契约
│   └── ding-rules.md         ← Ding 规则改写（服务端 + 测试 + 合规）★ 先做这个
└── tasks/
    ├── T0-baseline.md        ← 开工前基线：跑机器门、存 before 截图
    ├── T1-ding-rules.md      ← Ding 服务端规则重写 + 测试
    ├── T2-party-kit.md       ← UNO / Ding 共用的"派对桌"组件与样式
    ├── T3-uno.md             ← UNO 页面接入
    ├── T4-ding.md            ← Ding 页面接入（依赖 T1、T2）
    ├── T5-teahouse-kit.md    ← 斗地主"茶馆"场景 / 牌面 / 席位组件
    ├── T6-landlord.md        ← 斗地主页面接入 + 横屏 + 竖屏旋转提示
    └── T7-screenshots.md     ← 固定截图组 + 报告
```

**顺序**：T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7。T1 与 T2、T5 互不依赖，可以并行；T4 必须等 T1 和 T2 都完成。

## 2. 每个任务的固定动作

1. 开工前：`git status` 看工作区；**只 `git add` 本任务白名单里的文件**，不要 `git add -A`（工作区有大量别的会话的未提交文件）。
2. 做之前把任务卡"完成判据"读一遍；做完逐条自查。
3. 机器门（每个任务结束都跑，全部退出码 0 才算这个任务完成）：
   ```bash
   npm run typecheck
   npm test
   npm run lint
   npm run build
   ```
   涉及页面的任务（T3/T4/T6）再加：
   ```bash
   npx playwright test e2e/game-viewport-contract.spec.ts e2e/motion-contract.spec.ts
   ```
   e2e 跑的是构建产物——**先 `npm run build` 再跑 e2e**，否则测的是旧 UI。端口 3178 起不来时先查是不是有孤儿服务，不要乱杀进程。
4. 在 `STATUS.md` 对应行写：完成日期、机器门结果（命令 + 退出码）、改了哪些文件。**视觉那一栏不许写 PASS / 达标 / 已对齐**，只写"待用户看图"。
5. 一个任务一个提交，提交信息格式：`feat(<game>): <做了什么>（CT<编号>）`，结尾带 `Co-Authored-By` 行。

## 3. 全局规则（所有任务都适用）

### 3.1 颜色
- 只用平台令牌 `--gp-*` / `--game-*`，或本计划契约 §3 里列出的**本游戏局部变量**（`--th-*` 茶馆、`--pt-*` 派对桌、`--bc-*` Ding）。局部变量只在游戏根类里定义一次，其他地方引用变量，不写字面量色。
- UNO / Ding 的红黄绿蓝四色是**牌面语义色**，不受"一款一个 accent"限制，但同样只在根类定义一次。
- 黄色 `--gp-yellow` 只给**唯一主按钮**（每个视口同时只有一个黄色按钮），以及方向稿里明确用了黄色的：当前玩家高亮环、"最高"叫分木牌、选中牌外框。

### 3.2 断点
- 只能用 `packages/client/tests/breakpointContract.test.ts` 允许的集合：宽 380/480/640/768/1024/1280，高 520/620，`orientation`，`prefers-reduced-motion`，`hover`/`pointer`。
- 方向稿里用的是 `.device[data-size=...]`，落地时换成：
  - 桌面 = 默认样式；
  - 手机竖屏 = `@media (max-width: 480px)`；
  - 手机横屏 = `@media (orientation: landscape) and (max-height: 520px)`（与 `useCompactLayout.ts` 的 `COMPACT_LAYOUT_QUERY` 一致）。

### 3.3 动效
- 只动 `transform` / `opacity`（泼色用 `clip-path` 是方向稿已确认的例外，只用于 UNO/Ding 桌布泼色层）。
- 单次演出 ≤ 600ms（结算逐行累计除外）。
- 四档 `data-motion-level`：`default / reduced / minimal / off`，降级规则见各契约 §5。`off` 档：没有飞行、没有屏震、没有冲屏大字，状态直接切换；**信息不能丢**（冲屏大字要换成一条静态提示）。
- 飞行统一走 `shared-ui/stage/FlightLayer.tsx` + `flightPresets.ts`；倒计时统一走 `shared-ui/stage/StageCountdownRing.tsx`；数字滚动走 `shared-ui/RollingNumber.tsx`。不要自己再写一套。

### 3.4 数字与字体
- 大数字（张数、倍数、分数、倒计时）用衬线 `var(--gp-font-display)`；小辅助字用正文无衬线。

### 3.5 截图与验收
- 视觉合格**只由用户看图判定**。执行模型在报告里只写事实描述（"中央纸板圆盘，上半圈 5 个贴纸"），不写"精致 / 已对齐 / 达标"。
- 截图读不出来（Read 超时）时，明确写"我没有看到画面"，不要凭 DOM 推断效果。
- 不得用 `--update-snapshots` 或覆盖 baseline 目录来让视觉回归转绿。

## 4. 不许做（出现任何一条即不合格）

来自 `docs/DESIGN-DIRECTION.md` §2 的否定项 + 本次三款的禁区：

1. 整页奶油底 + 粗墨边 + 大面积黄色（C8）。
2. 一张通用面板居中、四周空白；舞台中央只有一行文字（C9）。
3. 画面与规则对不上（C18）：
   - 斗地主**不许**画"炸弹 / 王炸后倍数翻倍"，倍数只等于最高叫分；**不许**画积分结算，只判地主胜 / 农民胜。
   - "春天"不是规则项，只是结算画面的附加印章，**不许**影响任何数值。
   - UNO 经典单局（`uno_legacy_platform_v1`）不计分；只有欢乐房规（`uno_platform_house_v1`）有逐局计分。
   - Ding **不许**再出现"别人打出短语卡后开 10 秒抢铃窗口""拍铃须持同色短语卡"这类旧规则的画面或文案。
4. 斗地主手机竖屏**不做**布局，只盖"请把手机横过来"。
5. UNO / Ding 手牌多时**不许**横向滚动、**不许**拆成两行、**不许**把牌缩到看不清角标；只按"自动收紧、只露角标"处理（见 `contracts/uno.md` §4.4）。
6. 不许引入新的第三方依赖、新字体文件、新图片素材；方向稿里的插画全部是内联 SVG / CSS，照搬即可。
7. 不许改其他游戏的文件；不许改 `shared-ui/` 里别的游戏在用的组件的**默认行为**（要扩展就加可选 props，默认值保持原样）。

## 5. 待确认（执行中遇到就停下来问用户，不要自己定）

- **Q1（UNO/Ding）**：手机上手牌处于紧凑模式时，方向稿做的是"第一次点 = 把牌抽出来看，第二次点 = 出牌"。这是 AI 补的交互细节，用户还没确认。T3/T4 先按这个做，报告里单列一行请用户确认。
- **Q2（Ding）**：质疑窗口时长方向稿用 3 秒、过半判定为"严格大于半数"（5 人里 3 人质疑才算拍错）。规则任务 T1 按这个做，配置项留出来（见 `contracts/ding-rules.md` §3），报告里请用户确认数值。
- **Q3（Ding）**：拍铃者亮卡时，如果当时正轮到别人且那人已经选中了一张牌但还没出，是否打断？T1 按"打断：回合立即交给拍铃者，那人的选择作废"做，报告里请用户确认。
- **Q4（斗地主）**：方向稿有「提示」按钮，但现有代码没有提示算法。T6 先不做这个按钮，报告里问用户要不要（要的话另开任务）。
- **Q5（斗地主）**：平板竖屏（768×1024）也按"只做横屏"显示旋转提示？T6 先按"显示"做，报告里请用户确认。

## 6. 参考

- 设计基调：`docs/DESIGN-DIRECTION.md`（§2 已确认条目、§9 本次三款的全部用户原话）
- 规范：`docs/design-spec.md` §11（视觉交付流程、契约模板、截图规范、报告模板）
- 验收规则：`AGENTS.md`「视觉验收规范」
- 旧契约（仅供了解现状，**以本计划为准**）：`docs/plans/2026-09-22-game-ui-uplift/contracts/bell-clash.md`
