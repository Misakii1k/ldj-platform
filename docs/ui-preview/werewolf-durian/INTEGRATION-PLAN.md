# 狼人杀与榴莲 UI 正式接入执行计划 (Integration Plan)

- **更新时间**：2026-09-18
- **依据文件**：`integration-diff.html`（差异清单）、`DESIGN.md`（设计基准与定稿状态）、`HANDOFF.md`（技术交接）
- **适用工程**：`D:\项目`

---

## 1. 接入总则与红线契约

1. **工作树保护**：
   - 当前工作区包含约百处有效未提交修改，**绝不执行 `git reset --hard`、`git clean -fd`**。
   - 每完成一个批次，统一运行全套校验后，提交原子 Commit 快照。
2. **服务端权威与隐私隔离铁律**：
   - 隐藏信息（狼人队友、预言家验人、女巫死者、榴莲其他玩家头顶牌、真实总库存）**绝对由服务端投影（`views.ts`）剥离**，严禁在前端代码中使用“条件渲染”或 CSS 隐藏来伪造安全。
   - 权限控制由服务端 Reducer 严格校验（如法官 4 命令返回 `NOT_AUTHORIZED`），前端按钮隐藏仅作交互提示，不构成安全防护。
3. **视觉对比度与交互铁律（遵守 `AGENTS.md`）**：
   - 前景色与背景色满足 WCAG AA 规范（常规文字 ≥ 4.5:1，大号粗体 ≥ 3:1，重要操作 ≥ 7:1）。
   - 移动端所有可点击交互元素尺寸必须满足最小 **44×44px**。
   - 响应式断点严格限定：宽度 `380/480/640/768/1024/1280px`，高度 `520/620px`。
4. **大数字排版与字体**：
   - 榴莲牌面、需求、罚分大数字统一使用 Georgia 衬线字体（`--durian-numeral-font`），正文及辅助小数字保持无衬线。
   - 数量渲染于水果下方，开启对应槽位的 `showBadge`。

---

## 2. 原型与生产落点映射矩阵

| 原型文件 | 生产落点 | 接入性质 | 核心工作 |
|---|---|---|---|
| `art-directions.html` | `packages/client/src/game/werewolf/ui/WerewolfStage.tsx`<br>`packages/client/src/game/werewolf/werewolf.css`<br>`packages/client/src/game/werewolf/theatre.css` | 舞台与席位架构重构 | ① 左右席位替换旧环形<br>② A木刻/B月蚀/C赤幕三主题同时搭载+顶栏切换器+持久化<br>③ 11个阶段骨架对齐与语音保留 |
| `durian.html` | `packages/client/src/game/durian/DurianGamePage.tsx`<br>`packages/client/src/game/durian/DurianTurnSheet.tsx`<br>`packages/client/src/game/durian/durian.css` | 玩家视角渲染与交互升级 | ① 开启 `showBadge`，统一大数字与纵向排版<br>② 回合弹窗接真实状态机（摸牌/选半边/翻牌/猴子牌）<br>③ 质疑倒计时自动推进与 2–7 人自适应 |
| `moderator.html` | `packages/client/src/game/werewolf/moderator/ModeratorHostConsole.tsx` | 法官全知控制台升级 | ① 视觉风格统一为夜桌深色<br>② 对接服务端 4 命令二次确认与权限判定<br>③ 呈现 `WerewolfModeratorStatistics` 与 `suggestedOutcome` |
| `durian-table.html` | `packages/client/src/game/durian/DurianGamePage.tsx` 中的 `isSimulatorTable` 分支 | 既有公共桌面分支视觉升级 | ① 对接 `buildDurianSpectatorView`<br>② 严格排除手牌与库存私密信息（DOM 结构断言保证） |
| `display.html` | `packages/client/src/app/`（视 AppMode 策略定） | 新增对外展示牌 | ① 接入 `room_status` 心跳<br>② 动态渲染房间号、游戏状态与扫码二维码 |

---

## 3. 详细分批接入实施计划

### 批次 1：狼人杀玩家端接入（主体工程最大项）
- **目标**：将 `art-directions.html` 的左右席位与三主题视觉合入生产。
- **关键任务**：
  1. **主题 Token 归并**：将原型的多层覆盖层提取归并为 CSS 语义变量（`--ww-theme-desk`, `--ww-theme-card`, `--ww-theme-ink`, `--ww-theme-border`），分别配置 A（木刻）、B（月蚀）、C（赤幕）三套样式表。
  2. **顶栏切换器**：在对局顶栏添加主题切换下拉/按钮，选择值存入 `localStorage('ldj_werewolf_theme')`，默认值 `woodcut`。
  3. **席位结构替换**：重构 `WerewolfStage.tsx`，由单环形重构为自适应左右席位双列排布，支持 5–12 人动态映射，绑定真实房间席位号。
  4. **阶段组件骨架**：对齐 11 个生产阶段枚举，确保抽卡翻牌、白天发言、公投、夜间行动均有合理呈现。
  5. **私密身份与交互**：保留 `SecretRoleCard.tsx` 的失焦遮蔽机制；更新 `werewolf-tabletop.spec.ts` 等 E2E 测试选择器。

### 批次 2：榴莲玩家端接入
- **目标**：将 `durian.html` 的最新纸卡视觉、大数字及回合弹窗机制接入生产。
- **关键任务**：
  1. **牌面数字规范**：在 `DurianGamePage.tsx` 中各牌面半边开启 `showBadge: true`，统一样式类为 Georgia 衬线字体；小数字保持无衬线。
  2. **回合操作弹层**：正式挂载 `DurianTurnSheet.tsx`，绑定 `turn_action`、`choose_placement` 与真实命令（`draw_card`, `place_fruit`）。
  3. **完整流程补齐**：补齐 `choose_flip`（翻牌目标选择）与 4 种猴子牌分支显示；接入标准模式倒计时自动推进。
  4. **布局自适应**：测试 2–7 人不同席位数下的桌面展示，紧凑模式一屏呈现，超小屏舒展模式保持 127px 顺畅滚动。

### 批次 3：法官端 + 榴莲公共桌面接入
- **目标**：完成裁判与观战视角的视觉与协议对接。
- **关键任务**：
  1. **法官控制台**：改造 `ModeratorHostConsole.tsx` 及其子组件，应用夜桌深色背景，对接服务端 `eliminate_player` / `revive_player` / `end_game` 命令与二次确认，展示建议结局。
  2. **公共桌面大屏**：改造 `DurianGamePage.tsx:isSimulatorTable` 分支，按 `durian-table.html` 渲染累计需求与公开出牌列，禁止渲染任何头顶暗牌和真实库存。

### 批次 4：朝外展示端接入
- **目标**：完成独立对外展示牌功能。
- **关键任务**：
  1. 依据拍板的“对外展示牌”定位，增加轻量展示模式或路由。
  2. 对接轮询/心跳获取当前房间的 `status`、`gameId`、`playerCount`，并基于 `qrcode.react` 实时生成入房二维码。

---

## 4. 门禁与验收命令集

在每一批次开发完成后，必须无条件执行并通过以下验收清单：

```powershell
# 1. 静态类型校验
npm run typecheck

# 2. 规范性 Lint 校验（必须 0 错误）
npm run lint

# 3. 核心领域规则与视图单测
node --import tsx --test packages/games/durian/tests/views.test.ts packages/games/durian/tests/rules.test.ts
node --import tsx --test packages/games/werewolf/tests/moderator/contract.test.ts
node --import tsx --test packages/client/tests/seatDriftRobustness.test.ts

# 4. 生产包构建（验证产物无破损）
cd packages/client && ..\..\node_modules\.bin\vite.cmd build
```
