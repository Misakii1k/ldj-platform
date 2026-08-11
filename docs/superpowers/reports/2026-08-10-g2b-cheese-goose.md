# 阶段 1 验收报告：奶酪大盗 + 以鹅传鹅（G2-B 上架）

## 结论
**通过。** 两款游戏按「原版规则 + 线下辅助工具」定位完成，5 道质量门全绿、21 条 E2E 全绿、2 张验收截图确认桌面渲染符合预期（390px 移动视口无溢出、私密信息按 view 边界分发）。

## 范围与定位

按用户「线下游玩为主、线上部分用于辅助道具/推进」的产品定位，本阶段实现：

| 游戏 | 原版身份（2026-08-10 调研） | 平台实现定位 |
|---|---|---|
| **奶酪大盗** cheese_thief_classic_v1 | 《Cheese Thief》栢龙玩具/Jolly Thinkers，官方 App「奶酪大盗主持人」佐证核心流程 | 线下桌游辅助：App 负责骰点/身份/共犯私密分发、夜间 1→6 推进、讨论/投票计时、终局判定；讨论在线下进行 |
| **以鹅传鹅** goose_relay_classic_v1 | 地核桌游原创，5–9 人/10–20 分钟 | 线下桌游辅助：App 负责案情私密分发、传递顺序/计时、从末位逐一指认、投票揪恶与终局判定；传递为线下肢体比划 |

## 规则基线（核心差异 vs 旧 moonlit_v1 / relay_v1 原创补全版）

| 维度 | 旧（原创补全） | 新（原版基线） |
|---|---|---|
| 奶酪共犯 | 无 | 5 人 1 / 6 人 1 相识 / 7 人 2 不相识 / 8 人 2 相识；7 人不相识由服务器随机分配 |
| 奶酪 4 人变体 | 不支持 | 两骰自选（hour_choice 阶段 30s 超时兜底） |
| 奶酪结算 | 严格最高票 → 盗贼胜 | **平票一并出局**；投中大盗 → 好人胜；白老鼠被投出 → 单独胜利（可选身份卡） |
| 奶酪身份卡 | 无 | 猫/狗/白老鼠（默认关闭，可配置） |
| 以鹅指认 | case_fidelity（末位对比）/ evil_vote 二选一 | **从末位起逐一指认凶手+受害，直到有人指对**；指对 → 投票投恶鹅；全错 → 恶鹅胜 |
| 以鹅投票 | 案情保真或全揪出 | 投中（并列最高票均为恶鹅）→ 白方胜；投错 → 恶鹅胜 |
| 以鹅计分 | 无 | 原版含计分，细则缺失 → 平台裁定（胜方+1/+2、负方−1） |

> 完整原版调研、来源 URL、证据等级、平台裁定项见：
> - `docs/game-library/桌游平台游戏库资料/07_奶酪大盗/01_游戏规则.md`
> - `docs/game-library/桌游平台游戏库资料/01_以鹅传鹅/01_游戏规则.md`
> - 准入台账 `compliance/d1/game-admission.json`（internal-admission-g2-2026-08-10-c01 / g01）

## 交付物

### 服务端
- `packages/games/cheese-thief/` — 5 文件规则层（types/schemas/rules/views/module）+ 6 测试文件
- `packages/games/goose-relay/` — 同上结构
- 状态机：夜间偷取/同醒目击/共犯选择（相识/不相识）/4 人两骰自选/讨论/投票/平票同出局/白老鼠单独胜利（以鹅：从末位逐一指认/超时兜底/投票投恶）
- 计时器：`nightHourSeconds` / `discussionSeconds` / `accuseSeconds` / `voteSeconds` / `hourChoiceSeconds` 全部可配置
- 私密信息边界严格按 view 层分发（终局前公开视图不含 `wakeHours`/`thiefId`/`accomplices`/`peeks`/`roleCards`）

### 客户端
- `packages/client/src/game/cheese-thief/CheeseThiefGamePage.tsx` — TabletopShell 桌面框架、私密信息区、夜间遮罩、共犯选择（按人数档多选）、偷看/投票 UI、终局披露
- `packages/client/src/game/goose-relay/GooseRelayGamePage.tsx` — 案情卡私密区、传递输入、演绎链公开、指认双角色选择、投票 UI
- `packages/client/src/game/{cheese-thief,goose-relay}/types.ts` — 严格 view 解析器（手写 hasExactKeys 校验，无 zod 依赖）
- `styles.css` — 两款游戏 `cheese-*` / `goose-*` 样式（390px 移动优先）
- viewRegistry 注册：cheese-thief / goose-relay 进入严格解析
- GamePage.tsx 懒加载分发

### 集成
- `packages/shared/src/game/catalog.ts` — 新增 2 条 playable 目录条目（含 setup 选项与 `theme`）
- `packages/server/src/core/game/registry.ts` — 注册两个 module
- `compliance/d1/game-admission.json` — 新增 2 条 internal-admission 记录（rights approved，证据来源与平台裁定如实标注）

## 验收

### 质量门（全绿）

| 环节 | 结果 |
|---|---|
| `npm run typecheck`（server + client） | ✓ |
| `npm run lint` | ✓ |
| `npm run test` | 68/68 ✓（含两款游戏 65 项 + 既有套件） |
| `npm run compliance:d1` | PASS（台账与 GAME_CATALOG 数量一致，playable 全部带完整授权证据） |
| `npm run build` | ✓（cheese-thief / goose-relay 页面已进 bundle） |

### E2E（21/21 全绿，`--retries=0`）

| Spec | 状态 | 备注 |
|---|---|---|
| **cheese-thief-tabletop** 5 人完整局 | ok 8.5s | 真实 WS 交替 + 浏览器渲染 + 隐私断言 + 服务端战绩 |
| **goose-relay-tabletop** 5 人完整局 | ok 3.7s | 同上 |
| durian / loveletter / landlord / werewolf / undercover / uno / smoke | ok | 既有 spec 不回归 |

### 验收截图

| 截图 | 内容 |
|---|---|
| `docs/superpowers/reports/g2b-shots/cheese-thief-night.png` | 390px 移动视口：夜间第 5 时刻遮罩、私密骰点「醒来时刻 3」+「我是大盗」徽标、提示「请投票指认你怀疑的大盗」 |
| `docs/superpowers/reports/g2b-shots/goose-relay-case.png` | 390px 移动视口：头鹅读卡阶段、原始案情（凶手：灰鹅、受害：白鹅）私密卡片、指示「等待头鹅……阅读案情卡」 |

均通过几何断言（无水平溢出、私密信息按 view 边界分发）。

## 修复与平台裁定

实施过程中发现并修复的两个服务端 bug：

1. **共解析 config 二次解析失败**：`module.createInitialState` 传入 `parseConfig` 后的 Resolved config（含 `accomplicesByPlayers`），`createCheeseThiefState` 内部再次 `parseCheeseThiefConfig` 因 zod record key 类型不匹配失败。修复：检测 `accomplicesByPlayers in configInput` 视为已解析直接使用。
2. **rulesetId undefined 泄漏入快照**：`session.ts` 剥离 `rulesetId` 后 parse，`ResolvedCheeseThiefConfig.rulesetId` 为 optional undefined，被存入 state.config，`canonicalJson` 拒绝 undefined → startGame 报 INTERNAL_ERROR。修复：`parseCheeseThiefConfig` / `parseGooseRelayConfig` 归一化 rulesetId 为默认字面量。

平台裁定项（如实标注于准入台账 digitalAdaptations）：
- 奶酪整夜未盗 → 全员获胜（原版细则未获取）
- 奶酪狗「先投票」为顺序标记（实体桌是举手投）
- 奶酪 4 人两骰自选 + 数字版自动盗取
- 以鹅计分按胜方+1/+2、负方−1（原版细则缺失）
- 以鹅恶鹅配置按人数档推断（5-6 人 1、7-9 人 2）
- 以鹅案情卡含道具/场景为平台扩展（原版要素未确认）

## 风险与后续

- **身份卡（猫/狗/白老鼠）默认关闭**：开启时通过 `roleCards: true` 配置；UI 已在 dawn 阶段提供展示入口。后续如需更多身份卡可扩展。
- **Ding 机制假设纠正**：调研发现 Ding 实际是「UNO 式出牌+短语卡+按铃抢回合」而非资料库推测的「图案/颜色抢答」——本阶段为辅助形态定位试点；Ding 牌表需原创设计（暂未取得原版牌表），阶段 3 实施时再处理。
- **囚徒之夜（night-testimony）**：证据较完整（A/B 级），按"有词身份 + Yes/No 标记 + 投票揪警"机制实施；阶段 2 实施。
- **NFR-006（30 分钟长跑）**：本阶段未跑，需参考机（D7-B 阶段遗留）；下轮安排。

## 状态

- [x] 服务端规则层 + 契约测试
- [x] 客户端辅助页面（390px 无溢出、私密信息按 view 分发）
- [x] 集成接线（catalog/registry/viewRegistry/准入台账）
- [x] E2E 21/21 全绿（--retries=0）
- [x] 验收截图（cheese-thief / goose-relay）
- [x] 修复服务端 bug（config 二次解析 / rulesetId undefined）
- [x] D1 合规：PASS

**阶段 1 收尾完成。可进入阶段 2（囚徒之夜 night-testimony）实施。**
