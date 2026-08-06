# D2 低风险规则原语 Implementation Plan

**Goal:** 在不改变现有规则集语义、目录准入、`GameModule` 契约、服务端执行链、数据库或 UI 的前提下，逐步提取并验证低风险纯函数原语。

**Authority:** `docs/superpowers/specs/2026-08-02-shared-game-engine-design.md`。D1 已按保守范围获得内部重构批准；该批准不构成任何游戏的权利或发布审批。

## D2 边界

D2 只包含：

1. 确定性随机。
2. 座位与回合轮转。
3. 基础牌区操作。
4. 白名单可见性工具。

前两个实施包已交付随机/轮转及其恢复边界，第三实施包已迁移基础牌区。本计划的第四实施包迁移白名单可见性到 UNO 与《谁是卧底》两款真实消费者，并补齐恢复前后视角 JSON 等价证据。

以下已存在能力不计入本包，也不因已有文件或导出而获得稳定 API 身份：

- `ballot`
- `flow`
- `scoring`
- `buzzer`
- `hosted`
- setup UI
- tabletop UI

本包不得为这些能力新增消费者，不得实现 D3 合同迁移、UNO 新平台规则、白板模式、异步裁判、统一桌面或新游戏。

## 成熟度门

- **实验：** 一款真实游戏使用，单元、不可变性和确定性测试通过。
- **候选：** 至少两款结构不同的真实游戏使用，两款完整局黄金回放通过，不包含游戏 ID 分支，输入输出类型稳定，并覆盖空集合、重复参与者、非法当前参与者和两款消费者的恢复边界。
- **稳定：** 必须通过最高优先级设计要求的第三游戏验证、确定性重放、快照恢复、不可变性和视角泄漏门；本包不会把任何 API 标记为稳定。

## Task 1：确定性随机加固

**Files:**

- Modify: `packages/shared/src/game/random.ts`
- Create: `packages/shared/tests/random.test.ts`

**TDD requirements:**

- 相同 seed/cursor 续接序列一致。
- shuffle 不修改输入，固定消耗 `n - 1` 次随机。
- 空数组和单元素数组不消耗随机。
- `nextInt` 继续拒绝非整数边界和空区间。
- cursor 只接受非负安全整数；负数、小数、`NaN`、无穷和不安全整数必须显式失败。
- 合法 cursor 的历史随机序列和两份 D1 fixture 不变。

## Task 2：座位与回合轮转原语

**Files:**

- Create: `packages/shared/src/game/rules/turns.ts`
- Create: `packages/shared/tests/rules.turns.test.ts`
- Modify: `packages/shared/src/game/rules/index.ts`

**Responsibilities:**

- 顺时针和逆时针环绕。
- 按步数选择下一名合格参与者。
- 从完整席位顺序中过滤淘汰、退出或不可行动者。
- 从指定参与者旋转固定顺序。
- 不修改输入。
- 对空顺序、重复参与者、未知当前参与者、无合格参与者、非法方向和非法步数给出明确错误。

**Non-responsibilities:**

- 不处理 UNO 双人反转特例。
- 不决定谁是卧底发言阶段或胜负。
- 不读取状态、数据库、系统时间或随机源。
- 不包含任何游戏 ID 分支。

## Task 3：迁移《谁是卧底》

修改 `packages/games/undercover/server/module.ts`，只替换下一存活玩家与发言顺序轮转逻辑。席位排序、淘汰过滤、动作、状态、事件、计时器 ID 和视角必须与 `undercover_classic_v1` D1 fixture 一致。

通过目标模块测试和完整局黄金回放后，`turns` 仍只记为实验。

## Task 4：迁移 UNO

修改 `packages/games/uno/server/module.ts`，只替换 `nextPlayer` 的环序计算。双人反转仍由 UNO 模块决定前进两步，不进入共用原语。卡牌、动作、状态和规则语义必须与 `uno_legacy_platform_v1` D1 fixture 一致。

UNO 与《谁是卧底》两份完整局黄金回放均通过且 fixture 摘要未改变，只能证明两款消费者的规则路径兼容；还必须补齐两款消费者的恢复边界验证后，`turns` 才可在后续结果报告中记为候选。本包保持实验状态。

## Task 5：恢复边界验证包

**Files:**

- Modify: `packages/server/tests/recovery.test.ts`
- Modify: `docs/superpowers/reports/2026-08-02-d2-low-risk-primitives-results.md`

本任务只增强文件 SQLite 重启测试，不修改生产恢复链、`GameModule` 契约、数据库 schema、游戏规则、目录准入或 UI。测试继续使用现有 `seedRoom` 历史夹具建立未准入房间，后续动作必须经过真实 executor、session 和 startup recovery 链；不得新增生产旁路。

**恢复证据：**

1. 《谁是卧底》首轮 reveal 超时在重启后使用持久化非零 cursor 选择预期首位，并生成准确的完整发言顺序、计时器和下一 cursor。
2. 《谁是卧底》第一轮结果超时在重启后按上一轮首位和存活席位生成准确的第二轮顺序，不消耗随机。
3. UNO 在已摸牌的末席中间状态重启，随后过牌准确环绕至首席且不改变 cursor。
4. UNO 先通过真实动作完成一次运行期弃牌回收，使 cursor 离开初始值；第二次回收跨重启后必须与不中断 oracle 产生完全相同的抽牌、牌堆顺序、事件、状态和 cursor。

期望轮序使用独立数组算法计算，不得调用被测 `turns` 原语作为 oracle。受控 UNO 边界快照只允许在临时测试数据库中建立，写入前必须证明总牌数为 108、实例 ID 唯一且弃牌顶牌不变。

模块级序列化或黄金回放不能替代文件数据库重启。本任务不覆盖 gateway 重连和 TimerRunner 重挂；二者属于后续平台级恢复验收，不阻塞本任务对现有权威持久化链的验证。

`turns` 只有在两款消费者的恢复边界和完整局回放均通过后才可晋升候选，仍不得标记稳定。`random` 即使持久化续接通过，也必须保留 malformed `rng_state_json` 启动恢复策略尚未裁定的限制，不得借本任务修改平台错误处理。

## Task 6：基础牌区迁移包

**Files:**

- Modify: `packages/shared/src/game/rules/cards.ts`
- Modify: `packages/shared/tests/rules.cards.test.ts`
- Modify: `packages/games/uno/server/module.ts`
- Modify: `packages/games/uno/tests/module.test.ts`
- Modify: `docs/superpowers/reports/2026-08-02-d2-low-risk-primitives-results.md`

本任务将只有单元测试的 `cards` 脚手架迁移至 `uno_legacy_platform_v1`，但不改变 UNO 权威状态的 `deck`、`discardPile`、`hands` 结构、schema、实例 ID、动作、事件、视角、规则语义或随机消耗。共享 `CardZoneState` 只作为 reducer 内的临时适配视图，不写入快照。

**共享职责：**

1. 牌区操作只要求牌实例具有唯一 `id`，不得强迫现有游戏牌增加 `definitionId`。
2. 洗牌、摸牌、轮流发牌、按实例 ID 移区以及保留弃牌顶牌后回收均为无状态、不可变的纯函数。
3. 操作前验证牌区存在、源区与目标区不同、数量/请求合法且所有区域的实例 ID 全局唯一。
4. 所有拒绝路径返回显式错误，不修改输入、不产生部分状态且不消耗随机。
5. 摸牌从源区 index 0 取得，移入目标区末尾；回收保留弃牌区末尾顶牌并只洗其余牌。

**UNO 保留职责：**

- 保留本地 `buildDeck()` 和冻结实例 ID。
- 决定首张数字弃牌、出牌合法性、罚牌链、允许部分摸牌的 legacy 循环、颜色、UNO 宣告、轮转和胜负。
- 初始化仍只进行一次完整牌堆洗牌；运行期回收仍精确消耗 `弃牌数 - 2` 个随机数。
- 共享操作对合法状态意外失败时视为内部状态不变量错误，由现有事务回滚；不得新增玩家错误码或公开事件。

本任务不迁移斗地主，也不为非牌类游戏制造消费者。只有 UNO 真实迁移、模块测试、D1 黄金回放和文件 SQLite 回收测试全部通过后，`cards` 才能记为实验；没有第二款结构不同的合格消费者时不得晋升候选。

## Task 7：白名单可见性迁移包

**Files:**

- Modify: `packages/shared/src/game/rules/visibility.ts`
- Modify: `packages/shared/tests/rules.visibility.test.ts`
- Modify: `packages/games/uno/server/module.ts`
- Modify: `packages/games/uno/tests/module.test.ts`
- Modify: `packages/games/undercover/server/views.ts`
- Modify: `packages/games/undercover/tests/module.test.ts`
- Modify: `packages/server/tests/recovery.test.ts`
- Modify: `docs/superpowers/reports/2026-08-02-d2-low-risk-primitives-results.md`

本任务不建立反射式投影器或规则 DSL。游戏模块继续显式从权威状态白名单构造视角、派生展示值并固定字段顺序；共享原语只判断接收者是否满足一个或多个单一可见性策略。

**共享职责：**

1. `canObserve` 保留 public、owner-only、others-only、participants 和 after-reveal 的单一策略判断。
2. `canObserveAll` 对复合策略执行合取，不修改接收者上下文，不识别游戏 ID。
3. 原语不得接受完整权威状态后删除秘密字段，不决定游戏何时淘汰、终局或公开身份。

**消费者兼容要求：**

1. UNO 公共视角字段、键顺序与兼容字段不变；玩家 `me` 只向本局 owner 公开，未知玩家仍为 `me: null`，观战视角仍完全省略 `me`。
2. 《谁是卧底》的公开玩家阵营按单个玩家淘汰或全局终局 reveal；本人角色同时满足 owner-only 与 reveal；双词和完整角色表只在终局进入顶层 `reveal`。
3. 完整牌堆、他人手牌、双词、未公开角色、逐票目标和内部 pending 状态不得进入待过滤候选对象。
4. 视角生成不得修改权威状态；现有显式 `null` 与字段省略语义、数组顺序和运行时 `JSON.stringify` 键顺序保持不变。
5. 文件 SQLite 启动恢复前后逐玩家与观战视角的 JSON 必须完全一致，并继续保持 snapshot/RNG 字节稳定。

只有两款消费者模块、完整局黄金回放、真实 WebSocket 隐私、机器人路径和文件恢复边界均通过且两份 fixture 摘要不变，`visibility` 才可记为候选。该结论只完成 D2 获批范围，不使其他原语稳定，也不批准 D3、D4、统一桌面或新游戏。

## Verification

1. 新增测试先失败后通过。
2. 运行 shared、UNO 和《谁是卧底》目标测试。
3. 对比两份 D1 fixture 的 SHA-256，禁止改写 fixture。
4. 运行 `npm run typecheck`。
5. 运行 `npm run lint`。
6. 运行 `npm test`。
7. 运行 `npm run compliance:d1`。
8. 运行 `npm run build`。
9. 构建后再次运行 `npm run compliance:d1`。
10. 运行 `git diff --check` 并审计差异路径。

结果写入 `docs/superpowers/reports/2026-08-02-d2-low-risk-primitives-results.md`。前三个实施包完成后报告必须继续声明 visibility 尚未迁移；第四实施包只有在两款真实消费者、恢复视角和全部质量门通过后，才可声明 D2 获批范围完成。任何情况下都不得以 D2 通过替代 D3/D4 或共享引擎总计划验收。

## Version Control

本计划不创建或切换分支，不暂存、提交、推送、打标签、stash、reset 或 clean；版本控制操作等待用户单独授权。
