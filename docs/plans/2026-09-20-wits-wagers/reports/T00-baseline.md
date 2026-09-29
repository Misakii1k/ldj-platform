# T00 基线与决策报告

日期：2026-09-20。执行者：负责人会话。工作根：`D:\项目`。
范围：只读基线勘察 + G0 产品确认。**未创建任何游戏源码文件，未改动产品代码。**

---

## 1. 工作区基线

### 1.1 分支与提交

```
分支：main（追踪 origin/main）
HEAD：21c2daf feat(updater): 修复更新边缘函数拓扑与安全容错，新增 Cloudflare wrangler 配置
     6c158fe fix(e2e): 修复内嵌主机应用导致的对局界面断言全面失效
     f17af23 refactor(client): 断点契约全量迁移，清空遗留白名单
     bd25b43 chore: 提交视觉升级前的项目现状快照
     f6290af feat(ai): 优化 AI 玩家提示词 harness
```

HEAD 与规划包 README/STATUS 记载的 `21c2daf` 一致，基线未漂移。

### 1.2 未提交改动（必须保留，不属于本功能）

| 类别 | 数量 |
|---|---|
| 已修改未暂存（` M`） | 161 |
| 未跟踪（`??`） | 77 |
| 已暂存删除（`D `） | 1（`e2e/tmp-probe3.spec.ts`） |
| **合计** | **243** |

主要集中在：狼人杀（`packages/games/werewolf/**`，含 13 个新增未跟踪测试/源文件）、e2e 规格、视觉基线 PNG、`compliance/d4/third-game-baseline.json`。

**这些改动全部与《一智千金》无关，T00 未 touch、未 stage、未 stash、未 reset。**

### 1.3 worktree

```
D:/项目           21c2daf [main]          ← 本功能唯一开发工作树
D:/项目-r1-mvp    e689c51 [сodex/r1-mvp]  ← 禁止在此安装/写入/测试本功能
```

### 1.4 基线决定

按 04 T00 第 2 条：**继续在当前工作区（`D:\项目`，main）局部新增**，不创建新 worktree。
理由：243 处未提交改动中含 werewolf 在途重构，从 HEAD 新建 worktree 会丢失这些内容，且本功能全部为新增文件（`packages/games/wits-wagers/**`、`packages/client/src/game/wits-wagers/**`），与在途改动无文件重叠。仅 T05/T08 的 catalog/registry/admission 三处共享入口需要串行协调。

---

## 2. 基线命令与结果

全部日志落盘 `D:\项目\output\wits-wagers-baseline\`（非产品目录，不入构建）。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | **0** | 通过（`tsc -p tsconfig.server.json` + `tsc -p packages/client/tsconfig.json`，base 配置 `noEmit: true`，无产物写出） |
| `npm run lint` | **1** | **38 errors / 0 warnings，横跨 17 个文件（存量）** |
| `npm test` | **1** | **1391 pass / 0 fail（tsx 单测段）；68 tests → 64 pass / 4 fail（`node --test scripts/tests/**` 段）** |
| `node scripts/d1-compliance.mjs .` | **0** | `D1 compliance: PASS` |
| `npm run build` | **0** | Vite 构建成功（12.19s），仅 chunk >550kB 的既有警告 |
| `py -3 verify-plan.py`（规划包自检） | **0** | 216 断言通过；35/45 数值黄金用例独立核验 |

### 2.1 存量测试失败（4 项，均与本功能无关）

全部来自 `scripts/tests/d4/`：

1. `driver.test.mjs` — `driver：werewolf 稳定基线模块完整局可收束`
   对局超出最大步数 800，会话仍 ACTIVE，卡在 `day_announcement`。
2. `measure-loc.test.mjs` — `已知样例锁定：冻结源集合 9 文件全部哈希/行数/有效 LOC 与 baseline 一致`
3. `measure-loc.test.mjs` — `runMeasurement：reductionPercent 达标`（1777 ≠ 1514）
4. `measure-loc.test.mjs` — `runMeasurement：未提供目标实现时为 content-hash provisional`

**根因已定位**：`packages/games/werewolf/server/module.ts` 在途改动使其脱离 D4 冻结基线。

| | baseline 记录 | 当前工作区 |
|---|---|---|
| sha256 | `40b304ad…` | `a41555b9…` |
| lineCount | 1571 | 1872 |

`compliance/d4/third-game-baseline.json` 本身也在未提交改动中（已被改成 `a52b040b…/1585`，仍不等于当前的 `a41555b9…/1872`），说明 werewolf 重构尚在进行中。

**结论：这 4 项是他人在途工作的存量失败，不是回归，T00 不修复、不接管。** 后续任务卡报告测试结果时必须扣除这 4 项，且不得写"全部通过"。

### 2.2 存量 lint 失败（38 errors / 17 文件）

主要为 `no-unused-vars` 与 `no-explicit-any`。涉及 `packages/games/werewolf/tests/**`（7 个未跟踪新测试文件）、`packages/server/tests/**`、`packages/client/**`，以及 3 个 `output/model-refinement/*.mjs` 研究脚本。同属在途工作，不由本功能承担。

**注意**：`npm run ci` 串接 lint，当前状态下 CI 必然红。T10 全局门必须把这 38 个 lint error 与 4 个测试失败作为存量单列。

---

## 3. 接入点存在性核验

04 引用的所有共享入口均存在（只读确认，未修改）：

```
OK  packages/server/src/core/game/registry.ts
OK  packages/shared/src/game/catalog.ts
OK  compliance/d1/game-admission.json
OK  tsconfig.server.json
OK  packages/shared/tests/catalog.test.ts
OK  packages/shared/tests/gameProgressionAudit.test.ts
OK  packages/client/src/game/viewRegistry.ts
OK  packages/client/src/game/GamePage.tsx
OK  packages/client/tests/breakpointContract.test.ts
OK  playwright.config.ts
OK  scripts/build-server-bundle.mjs
OK  AGENTS.md
```

现有游戏包 11 个：`bell-clash / cheese-thief / durian / echo-judge / goose-relay / landlord / loveletter / night-testimony / undercover / uno / werewolf`。**无 `wits-wagers` 目录 —— 确认零存量、干净新增。**

补充事实（供 T01/T05 使用）：

- `tsconfig.server.json` 为每个游戏包显式声明 `paths` 别名（`@ldj/game-<id>/server`）。T01 新增包时需同步追加 `@ldj/game-wits-wagers/server`（及 `/manifest`，若 client 需要）。
- `compliance/d1/game-admission.json` 现有 11 条 `games` 记录，字段结构：`gameId / catalogStatus / rulesets[] / rights{status,recordId,scope,expiresAt,rightsApprover,rulesApprover}`。**T05 新增条目的 `rights.status` 必须为待审核真实状态，不得复制他人 `approved` 记录。**
- `packages/client/dist` 在 `.gitignore` 中（`dist/`），**不纳入 git**。04/AGENTS.md 所说"同步生产构建产物"指本地 `npm run build` 产出，不是提交动作。

---

## 4. G0 决策：用户已确认（2026-09-20）

以下 7 项经交互式提问由用户逐项选定，非模型代签。

| ID | 用户选择 | 落地含义 |
|---|---|---|
| **P1 超时作答** | 系统补 1，不给作者奖励 | 未提交者记为猜测 `1`，标记系统补答；可被押注，但**不得** +3 作者奖励、**不计入** `winningGuesses` |
| **P2 超时下注** | 保留最后确认投注；未放置则不下注 | 以服务端截止前最后一次成功接受的整组投注为准；完全未放置者本轮不下注、不输不赢，两枚永久筹码下轮照常 |
| **P3 节奏** | 作答 30/60/90 可选，下注固定不提前 | 作答默认 30s、建房可选 60/90，全员交齐可提前翻牌；**下注始终走满时长、不提前封盘**；展示排序 3s、结算 8s 自动进入下一轮；不依赖房主在线 |
| **P4 终局平局** | 并列冠军 | 分数 → `winningGuesses` → 仍相同则多人并列获胜。**不采集生日，不加赛。** |
| **P5 席位/设备** | 3–7 席位，一队一设备 | 每席位 = 一个提交身份 = 一台设备，小队共用同一台当面商量。**不改平台成员/权限模型**，首版无多设备组队、无队内私聊、无队长转让 |
| **P6 视觉** | **复用平台现有浅色纸感 + 新 accent** | **与 03 原稿冲突，见 §5** |
| **P7 数值/题库/AI** | 整数范围 + 70 题 + 无 AI | 猜测与答案 `1..999,999,999,999` 正整数；发布目标 70 道原创中文题；**首版不接任何付费 AI**，离线 LAN 可玩 |

P1–P5、P7 与 01 §6 的建议默认值一致，`01-rules-and-sources.md` 的规则主线无需改动。

---

## 5. P6 冲突：03 视觉契约第 3 节作废

用户选择「完全复用平台浅色纸感 + 新 accent」，与 `03-visual-contract.md` §1/§3 写死的**深绿底 `#0B2424` + 米白字**方向相反。

### 5.1 平台现状（只读勘察，`packages/client/src/styles.css`）

平台是**浅色纸感**体系，不是深色：

```
--game-paper:   #fff4df   数字牌/卡片底
--game-surface: #fffdf7   面板底
--game-ink:     #292722   主文案
--game-muted:   #575147   次要文案
--game-line:    #292722   描边
--game-yellow:  #f7c84b   高亮
--game-coral:   #c23616   危险/错误
```

accent 为 6 选 1（`GAME_THEMES`），每款游戏挑一个，并在 `.game-card--<theme>` 下带 `--game-accent / --game-soft / --game-dark` 三件套。
现有 11 款占用情况：`violet ×2`、`berry ×2`、`sunset ×4`、`mint ×3`。
**`ocean` 与 `cyan` 尚未被任何游戏使用** —— 一智千金可直接取用，在首页目录中天然可辨识。

`visualTheme.surface` 三选一（`cards` / `social` / `board`），现有 `board ×5`、`social ×3`、`cards ×3`。本游戏有赔率板与数字卡，`board` 最贴切。

### 5.2 新色值与实测对比度

以平台既有 token 为底，独立计算 WCAG 对比度（相对亮度公式，不透明底色）：

| 前景 / 背景 | 比值 | 判定 |
|---|---|---|
| ink `#292722` / paper `#fff4df` | **13.68** | AA 正文 ✅ |
| ink `#292722` / surface `#fffdf7` | **14.67** | AA 正文 ✅ |
| muted `#575147` / paper | **7.20** | AA 正文 ✅ |
| muted `#575147` / surface | **7.72** | AA 正文 ✅ |
| ink `#292722` / yellow `#f7c84b` | **9.46** | AA 正文 ✅ |
| white / coral `#c23616` | **5.48** | AA 正文 ✅ |
| **ocean-dark `#115665` / paper** | **7.57** | AA 正文 ✅ |
| **white / ocean-dark `#115665`** | **8.26** | AA 正文 ✅ |
| white / ocean `#237c93` | **4.80** | AA 正文 ✅（临界） |
| ocean `#237c93` / surface | **4.72** | AA 正文 ✅（临界） |
| ⚠️ ocean `#237c93` / paper | **4.40** | **仅大字 ≥3:1，正文不达标** |
| ⚠️ cyan `#1a8fb0` / paper | **3.44** | **仅大字，正文不达标** |
| ⚠️ white / cyan `#1a8fb0` | **3.75** | **仅大字，正文不达标** |
| cyan-dark `#0d6c8a` / paper | **5.46** | AA 正文 ✅ |
| cyan-dark `#0d6c8a` / surface | **5.85** | AA 正文 ✅ |

**建议 accent = `ocean`**（比 `cyan` 安全余量大）。硬约束，T07 必须遵守：

- **纸底上的正文/数值/倍率文字一律用 `--game-ink`，禁止用 `--game-accent`（4.40 不达标）。**
- accent 只用于：描边、选中态边框、图标、≥24px 大号标题。
- **实心 accent 按钮必须用 `--game-dark`（ocean-dark `#115665`）作底 + 白字 = 8.26**，不要用 `--game-accent` 底（4.80 太临界，一旦设计微调即掉出 AA）。
- `cyan` 若被选用，其 `--game-accent` 与白字组合（3.75）**不可用于按钮**。

### 5.3 03 文件的处置

`03-visual-contract.md` 的处置已随本报告写入该文件头部与 §3（标注 SUPERSEDED 并给出替代表）。
**保留不变**的部分：§2 根结构/断点矩阵、§4 三张关键画面结构、§5 状态矩阵、§6 动效约束、§7 验收矩阵 —— 这些与配色无关。
**失效**的部分：§1 的"深绿/米白/金色"方向句、§3 整张 `--ww-*` 色表及其 5 个对比度结论。

> 上表为 token 层面的数学计算，**不等于浏览器渲染验收**。T07 仍须在真实页面计算样式下逐项核验（AGENTS.md 强制要求）。

---

## 6. 本任务改动清单

**新增**：

- `docs/plans/2026-09-20-wits-wagers/reports/T00-baseline.md`（本文件）
- `output/wits-wagers-baseline/npm-test.log`、`npm-lint.log`、`npm-build.log`、`compliance-d1.log`

**修改**：

- `docs/plans/2026-09-20-wits-wagers/STATUS.md`（决策记录、基线、下一步）
- `docs/plans/2026-09-20-wits-wagers/03-visual-contract.md`（§1/§2根结构一句/§3 按 P6 重写，其余保留）
- `docs/plans/2026-09-20-wits-wagers/verify-plan.py`（色值断言同步 P6）

### 6.1 verify-plan.py 同步

重写 03 后发现校验器仍硬编码旧深绿色表（`#0B2424` 等 5 组），即在验证一组已不存在的色值。已更新为：

- 8 组新色对的独立对比度断言（ink/paper、white/game-dark 等）
- 1 条**天花板**断言：accent `#237c93` / paper 必须恰为 `4.40`（即**低于** 4.5），锁死"accent 不得作纸底正文色"这条规则
- 2 条同步断言：03 中 `--ww-bg` / `0B2424` 只允许出现在标注 SUPERSEDED 或"作废"的说明行，不得再作为生效表格行

断言数 216 → **225**，`py -3 verify-plan.py` 退出码 **0**。

**反向验证**（在 `/tmp` 副本上做，已删除，未污染工作区）：

1. 把 `white/#115665` 期望值从 8.26 改成 9.99 → 如期失败 `AssertionError: contrast #FFFFFF/#115665`
2. 向 03 追加一行 `|--ww-bg|#0B2424|根底色|` → 如期失败 `AssertionError: superseded dark palette no longer a live token row`

两条新断言确认不是空转。

**未改动**：所有产品代码、依赖、`package-lock.json`、构建产物、他人 243 处未提交修改、`compliance/**`、另一 worktree。

`npm run build` 会写 `packages/client/dist/`（gitignore，不入版本库），属基线验证副作用，未改变源码。

## 7. 进程

本任务未启动任何常驻服务：无 dev server、无 preview、无浏览器实例、无后台 Node 进程。
所有命令均为前台一次性执行，退出码已逐条记录。**无需清理的 PID。**
未进行任何付费模型调用。未访问网络。

---

## 8. 完成标准对照

| T00 完成标准 | 结果 |
|---|---|
| 记录 `git status --short --branch` / `git log -5` / `git worktree list` | ✅ §1 |
| 选择用户认可的开发基线 | ✅ §1.4，当前工作区局部新增，不建 worktree |
| 与用户确认 G0 P1–P7 | ✅ §4，7/7 由用户交互选定 |
| 开工前跑基线并保存原始失败，区分存量与新回归 | ✅ §2，4 测试失败 + 38 lint error 全部定位为 werewolf 在途工作存量 |
| 基线和用户决定可追溯 | ✅ 日志落盘 + 决策表 |
| 没有游戏入口新增 | ✅ `packages/games/` 无 `wits-wagers`；catalog/registry/admission 未改 |

**T00 完成。未进入 T01。**
