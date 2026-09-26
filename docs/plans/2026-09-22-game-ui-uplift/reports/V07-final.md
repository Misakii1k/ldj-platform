# V07 最终验收报告：五款游戏页面视觉打磨（V01–V07）

日期：2026-09-26。分支 `feat/wits-wagers-tabletop-stage`。
对比基线：V00 恢复起点 `67cb6e9`。

---

## 1. 任务完成概况

根据打磨计划 `rustling-leaping-penguin.md`，V01–V07 目标是消除 Ding、情书、奶酪大盗、以鹅传鹅、一智千金桌面模拟五款游戏的「简陋、空、不像游戏」问题，引入 `@fontsource/noto-serif-sc` 展示字体、舞台配方令牌与三栏全屏 sim 骨架，对齐狼人杀 / 榴莲的高品质视觉体验。

| 任务卡 | 游戏 / 模块 | 核心改动 | Commit / 状态 |
|---|---|---|---|
| **V00** | 整体恢复 | 提交 stash 恢复并校正基线文档 | `67cb6e9` |
| **V01** | 共享基建 | 引入 Noto Serif SC webfont、`--gp-font-display`、`--gp-stage-light`、`--gp-shadow-sticker` 及 §10 舞台工具类 | `4c96416` |
| **V02** | Ding (bell-clash) | 三区抢铃桌（历史区 / 居中实体大铃+木托盘 / 记分板）、UNO 规格同款短语卡牌框、`.stage-art` 大铃剪影 | `5b12f5a` |
| **V03** | 情书 (loveletter) | 宫廷书信桌面、真比例信封手牌与蜡封、蜡封进度板、弹窗全量归一入 `GameDrawer` | `939ef27` |
| **V04** | 奶酪大盗 (cheese-thief) | 全宽三区老鼠半圆席位环、六小时钟面表盘（替换芯片轨）、月光光束与星点、`styles.css` 残留全部迁出 | `4dcd43e`（合并 `09a429d`） |
| **V05** | 以鹅传鹅 (goose-relay) | 椭圆牧场草地跑道、鹅卡席位头像、实体鹅卡沿弧传递、修复孤儿媒体查询 | `e1d2d40`（合并 `c5fc42b`） |
| **V06** | 共享 sim 骨架 | 全屏三栏 sim 骨架（左工具 / 中 3D 毡面 / 右日志）、一智千金 sim 接入完整版 `WitsTableStage` 与倒计时环 | `2400804`（合并 `75ed56e`） |
| **V07** | 全量验收 | 全量门跑通、14 张样张更新、产出最终总结 | **本报告** |

---

## 2. styles.css 深度瘦身统计

| 阶段 | 行数 | 变化 | 关键事件 |
|---|---|---|---|
| U00 起点 | 27,021 | — | 项目初始单文件 CSS |
| U11 阶段 | 22,466 | −4,555 | U01–U10 阶段迁出 |
| 09-25 恢复后 | 18,047 | −4,419 | 找回并剥离狼人杀（427 条）与榴莲（215 条） |
| **V04 / V06 本轮迁出** | **15,720** | **−2,327** | **`.cheese-*` 全部迁至 `cheese-thief.css`（归零）；`.sim-*` 全部迁至 `sim-stage.css`（归零）** |
| **累计瘦身** | | **−11,301 行（−41.8%）** | |

### 各游戏选择器在 styles.css 中的残留核对

- `.cheese-*`：**0**（V04 彻底清零）
- `.sim-*`：**0**（V06 彻底清零）
- `.testimony-*` / `.nt-*`：**0**
- `.echo-*` / `.ej-*`：**0**
- `.bell-*` / `.bc-*`：**0**
- `.goose-*` / `.gr-*`：**0**
- `.loveletter-*` / `.ll-*`：**0**
- `.ww-*` / `.werewolf-*` / `.durian-*`：**0**

---

## 3. 全量验收门（Verification Gates）

| 验证项 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | **PASS (0 errors)** | `tsc -p tsconfig.server.json && tsc -p packages/client/tsconfig.json` 全绿 |
| 客户端契约单测 | **PASS (11/11)** | `breakpointContract` (无非规范断点)、`classContracts`、`ambientMotion` (动效门控同步) 全部通过 |
| 生产构建 `npm run build` | **PASS (12.29s)** | 产物正常生成，字体分包及 chunk 按需加载 |
| 视口合约 `e2e/game-viewport-contract.spec.ts` | **PASS (20/20)** | 20 款/形态在 7 档常用视口（含手机 390×844 / 桌面 1280×800）全无横向溢出，元素无压盖 |
| 动效合约 `e2e/motion-contract.spec.ts` | **PASS (27/27)** | 所有游戏在 `reduced` 与 `off` 档位下严格遵守动效门控与时长压制 |
| 核心游戏 E2E 完整流转 | **PASS** | `cheese-thief`（5 人完整局）、`bell-clash`（3 人完整局）、`goose-relay`（5 人完整局）全绿通过 |

*(注：`loveletter-tabletop.spec.ts` 存在历史既有的 WS 房主出牌循环超时，已在 U08 与 V03 中标注为存量待办，非本轮前端引入)*

---

## 4. 关键画面样张核对（14 张高质对比）

以下 7 款游戏（五款新升级 + 两款标杆）的桌面端与移动端基准截图均已在 `docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/` 刷新就绪：

1. **Ding (bell-clash)**：`bell-clash-1280x800.png` / `bell-clash-390x844.png`
2. **情书 (loveletter)**：`loveletter-1280x800.png` / `loveletter-390x844.png`
3. **奶酪大盗 (cheese-thief)**：`cheese-thief-1280x800.png` / `cheese-thief-390x844.png`
4. **以鹅传鹅 (goose-relay)**：`goose-relay-1280x800.png` / `goose-relay-390x844.png`
5. **一智千金·桌面模拟 (wits-wagers-sim)**：`wits-wagers-sim-1280x800.png` / `wits-wagers-sim-390x844.png`
6. **狼人杀 (werewolf)**：`werewolf-1280x800.png` / `werewolf-390x844.png`
7. **榴莲 (durian)**：`durian-1280x800.png` / `durian-390x844.png`
