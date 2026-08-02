# 七款桌游游戏库扩展实施计划

> **状态：已被取代，不得执行。** 本计划中“资料不足时原创补全并上架”的路线与 `docs/superpowers/specs/2026-08-02-shared-game-engine-design.md` 冲突。后续工作必须先通过 D1 规则与合规基线；本文件只保留历史决策上下文。

> **执行要求：** 按任务顺序实施并逐项验收；实现阶段使用测试驱动方式，低耦合任务可分派独立子代理，但共用规则能力、协议和目录变更必须由主执行者统一复核。

**目标：** 排除《骗子酒馆》，为《情书》《Durian》《奶酪大盗》《以鹅传鹅》《伪人测试》以及原创化的《Ding》《囚徒之夜》完成可上线游戏设计与实现，并分批加入现有游戏库。

**架构：** 先在现有模块化单体内建设可组合的规则能力与统一移动端桌面框架，再按批次实现独立 `GameModule`。所有规则仍由服务端权威纯函数状态机执行，共用层只提供卡牌、可见性、流程、确认、投票、计分、抢铃和线下主持等可组合能力，不引入脚本语言或新的运行时依赖。

**技术栈：** Node.js 24、TypeScript 5.9、React 19、Vite 7、Zod 3、SQLite、原生 WebSocket、Node Test Runner、现有 CSS 设计令牌。

---

## Summary

- 本次共实现 7 款游戏，明确排除《骗子酒馆》，不读取、复制或接入其规则和资产。
- 采用“先共用引擎，再分批上线”的路线：G0 共用能力；G1《情书》《Durian》；G2《奶酪大盗》《以鹅传鹅》；G3《伪人测试》判官模式；G4 原创《叮铃对决》《暗夜证词》；G5 分阶段迁移现有 4 款游戏。
- 新游戏仅保留现有 `GameModule` 的可选机器人扩展点，不实现 `pickBotAction`、`buildBotPrompt`，不允许添加规则机器人或 AI 玩家，房间界面隐藏机器人入口。
- 统一采用“沉浸桌面 + 抽屉”移动端结构：固定顶栏、沉浸主桌面、底部行动坞、本人私密区、玩家带，以及规则/日志/个人信息三个抽屉。
- 规则资料不足的游戏采用原创补全，不宣称忠实复刻；全部规则文案、名称细节、卡面、图标、音效和视觉资产重新创作。
- 每批只有在规则、隐私、恢复、WebSocket、移动端 E2E、完整对局冒烟、全量 CI 和构建全部通过后，才能从 `coming_soon` 切换为 `playable`。

## Current State Analysis

### 项目结构

- 根工作区由 [package.json](file:///d:/项目/package.json) 管理 `packages/shared`、`packages/server`、`packages/client` 和 `packages/games/*`。
- 游戏插件契约位于 [contract.ts](file:///d:/项目/packages/shared/src/game/contract.ts)，已支持配置解析、动作解析、初始化、纯函数归约、玩家/观战视图、结果、快照迁移和可选机器人能力。
- 游戏目录位于 [catalog.ts](file:///d:/项目/packages/shared/src/game/catalog.ts)，当前只含 `undercover`、`uno`、`landlord`、`werewolf` 四款可玩游戏。
- 服务端注册表位于 [registry.ts](file:///d:/项目/packages/server/src/core/game/registry.ts)，客户端分流位于 [GamePage.tsx](file:///d:/项目/packages/client/src/game/GamePage.tsx)。
- 开局配置已通过 `room_command.start_game.gameConfig` 透传，并由 [session.ts](file:///d:/项目/packages/server/src/core/game/session.ts) 调用各模块的 `parseConfig` 权威校验；当前 [RoomPage.tsx](file:///d:/项目/packages/client/src/room/RoomPage.tsx) 尚未提供游戏规则配置面板。
- 现有会话层已具备事务落库、确定性随机游标、计时器 Effect、幂等请求、房间串行队列、恢复、玩家/观战白名单视图和结果持久化，无需为新游戏改写网关或数据库主模型。

### 资料结论

- 资料包 [桌游平台游戏库资料.zip](file:///d:/项目/桌游平台游戏库资料.zip) 包含平台共用规范及 8 款游戏资料。
- 《情书》经典 16 张版规则最完整，可按锁定规则集实现。
- 《Durian》核心反向可见、订单、按铃和怒气机制清楚，但特殊牌与精确终局不足，需以原创规则集补全。
- 《奶酪大盗》《以鹅传鹅》《伪人测试》具备可数字化的核心机制，但投票、计分或流程细节需原创裁定。
- 《Ding》《囚徒之夜》缺少足以支持忠实复刻的高等级规则证据，必须更名并实现完整原创规则。
- 当前工作区在 `feat/homepage-adaptive-motion` 分支上有大量未提交改动；实施前必须建立外部安全快照并切出独立功能分支，不能覆盖或丢弃现有修改。

## Assumptions & Decisions

### 固定范围

| 批次 | 游戏 ID | 展示名 | 人数 | 上线规则集 |
| --- | --- | --- | --- | --- |
| G1 | `loveletter` | 情书：密函心意 | 2–4 | `classic16_v1` |
| G1 | `durian` | Durian：榴莲店长 | 2–7 | `orchard_v1` |
| G2 | `cheese-thief` | 奶酪大盗：月夜鼠影 | 4–8 | `moonlit_v1` |
| G2 | `goose-relay` | 以鹅传鹅：鹅鹅密令 | 5–9 | `relay_v1` |
| G3 | `echo-judge` | 伪人测试：真假回声 | 3–12 | `judge_v1`，只含判官模式 |
| G4 | `bell-clash` | 叮铃对决 | 2–7 | `pattern_v1`，原创规则 |
| G4 | `night-testimony` | 暗夜证词 | 4–6 | `testimony_v1`，原创规则 |

### 共用规则能力边界

- 共用层使用 TypeScript 类型、纯函数和 Zod schema，不引入通用 DSL。
- `visibility` 支持 `public`、`owner_only`、`others_only`、`participants`、`after_reveal` 五类策略；最终玩家视图仍由每款游戏白名单重建。
- `cards` 管理稳定定义 ID、唯一实例 ID、牌堆、弃牌堆、公开区、抽取与确定性洗牌，不执行具体牌效。
- `flow` 管理阶段、合法动作窗口、全员确认栅栏、计时器 ID 和安全超时动作，不替游戏判断胜负。
- `ballot` 支持公开/秘密提交、禁止自投、候选集、锁定、同时揭示、简单多数、全票、平票重投和无人胜出。
- `scoring` 支持个人/阵营分数、轮次累计、阈值终局和并列集合；具体加减分由游戏模块调用。
- `buzzer` 采用服务端先到先得：首个进入房间串行队列并通过合法性校验的请求获胜，状态记录获胜者和 `roomSeq`，后续请求返回已锁定错误。
- `hosted` 只管理线下表演或发言的顺序、计时、完成确认和公开提示，不采集音频、视频或转写。

### 通用产品裁定

- 房主只可选择经过测试的规则预设和少量选项；不开放任意角色数、计分公式或阶段拼装。
- 允许配置项限制为：节奏 `relaxed/standard/quick`、局数或目标分、讨论时长、经过测试的平票策略；每款模块仍会二次校验。
- 真人断线时保留座位，由规则集执行安全超时动作；不调用 AI。动作优先级为“确认当前选择 → 合法跳过 → 弃权该回合 → 暂停并等待房主终止”，每款游戏明确绑定其中一种。
- 新游戏模块不实现机器人方法；目录暴露 `botSupport: 'none'`，服务端继续拒绝添加机器人，客户端不显示入口。
- 旧游戏不在 G0 同步重写；G1–G4 稳定后按 `undercover → werewolf → uno → landlord` 迁移，保持现有协议、快照版本和行为兼容。
- 不复制官方规则书原文、插画、角色造型、商标化界面或音频；代码内不新增注释，遵守当前任务约束。

## Proposed Changes

### 任务 0：建立安全基线与实施分支

**操作：**

1. 记录 `git status --short --branch` 和 `git diff --stat`。
2. 在仓库外创建 `d:\项目-backups\game-library-preflight-<timestamp>.zip`，包含当前工作树但排除 `.git`、`node_modules`、构建产物和数据库运行文件。
3. 校验 ZIP 可打开并包含当前未跟踪源码和资料包。
4. 从当前 HEAD 创建并切换 `feat/game-library-seven-games`；保留当前工作树改动，不提交、不暂存、不清理。
5. 再次对比 `git status --short`，确保切分支前后工作树内容一致。

**验收：** 外部快照可读取；新分支名称正确；没有文件丢失、提交或被覆盖。

### 任务 1：G0 共用规则能力

**新增文件：**

- `packages/shared/src/game/rules/visibility.ts`：可见性策略类型、接收者上下文和 `canObserve` 纯函数。
- `packages/shared/src/game/rules/cards.ts`：`CardDefinition`、`CardInstance`、`CardZoneState`、建牌堆、抽牌、移动区域和确定性洗牌助手。
- `packages/shared/src/game/rules/flow.ts`：阶段定义、确认栅栏、合法动作窗口、计时器命名和安全超时策略。
- `packages/shared/src/game/rules/ballot.ts`：秘密/公开投票状态、提交、锁定、计票和平票策略。
- `packages/shared/src/game/rules/scoring.ts`：个人/阵营计分账本、阈值、固定轮数和并列结果。
- `packages/shared/src/game/rules/buzzer.ts`：抢铃窗口、首个合法请求锁定、冻结快照引用和关闭窗口。
- `packages/shared/src/game/rules/hosted.ts`：线下发言/表演顺序、确认和超时推进。
- `packages/shared/src/game/rules/setup.ts`：规则集与房主可选配置描述，生成客户端可消费的 `GameSetupSpec`。
- `packages/shared/src/game/rules/index.ts`：只导出稳定公共 API。
- `packages/shared/tests/rules.visibility.test.ts`
- `packages/shared/tests/rules.cards.test.ts`
- `packages/shared/tests/rules.flow.test.ts`
- `packages/shared/tests/rules.ballot.test.ts`
- `packages/shared/tests/rules.scoring.test.ts`
- `packages/shared/tests/rules.buzzer.test.ts`
- `packages/shared/tests/rules.hosted.test.ts`
- `packages/shared/tests/rules.setup.test.ts`

**修改文件：**

- `packages/shared/src/index.ts`：导出 `./game/rules/index.ts`。
- `packages/shared/src/game/catalog.ts`：为目录条目增加 `rulesets`、`setup`、`botSupport` 和 `visualTheme`；现有 4 款填入兼容默认值。
- `packages/shared/tests/catalog.test.ts`：验证 ID 唯一、规则集唯一、默认规则集存在、可玩模块人数一致以及新游戏机器人能力为 `none`。

**TDD 步骤：**

1. 先为每项能力编写不变量和错误路径测试，确认测试因模块不存在而失败。
2. 分文件实现最小纯函数 API，每完成一个文件只运行对应测试。
3. 运行共享层全部测试，验证组合使用时不会修改输入对象、不会使用系统时间或非注入随机。
4. 运行 `npm run typecheck`，确保 API 能被服务端与客户端同时消费。

**关键测试：**

- `others_only` 对本人隐藏、对其他在局玩家可见、对观战者隐藏。
- 卡牌实例 ID 唯一，抽牌不会重复，空牌堆返回显式错误。
- 确认栅栏只计算当前参与者，重复确认幂等，掉线超时动作确定。
- 秘密投票在揭示前不暴露目标，平票策略可重投或返回无人胜出。
- 同一抢铃窗口只有一个赢家，重复请求与迟到请求不能覆盖快照。

### 任务 2：G0 统一配置与移动端桌面框架

**新增文件：**

- `packages/client/src/game/tabletop/TabletopShell.tsx`：固定顶栏、桌面、玩家带、行动坞和抽屉容器。
- `packages/client/src/game/tabletop/PlayerStrip.tsx`：2–7 人横向玩家带、8 人以上紧凑座位环。
- `packages/client/src/game/tabletop/ActionDock.tsx`：一个主动作、最多两个次动作、等待原因和请求中状态。
- `packages/client/src/game/tabletop/GameDrawer.tsx`：规则、公开日志、本人私密信息三类抽屉。
- `packages/client/src/game/tabletop/PrivatePanel.tsx`：切后台、重连和权限未确认时强制遮罩。
- `packages/client/src/game/tabletop/GameSetupPanel.tsx`：从目录 `setup` 描述渲染规则预设和有限选项。
- `packages/client/src/game/tabletop/types.ts`
- `packages/client/tests/gameSetup.test.ts`
- `packages/client/tests/privatePanel.test.ts`

**修改文件：**

- `packages/client/src/room/RoomPage.tsx`：房主在大厅选择规则预设与有限选项；`start_game` 携带 `gameConfig`；根据 `botSupport` 隐藏机器人入口。
- `packages/client/src/game/GamePage.tsx`：后续新页面按模块 ID 懒加载，避免 7 款游戏进入首屏主包。
- `packages/client/src/styles.css`：增加 `tabletop-*` 设计令牌与响应式样式，不复制现有游戏的专用类。

**实现约束：**

- 390px 竖屏为首要布局，触控区至少 44px。
- 颜色、文字和图形联合表达状态；焦点可见；抽屉可用 Escape 关闭并恢复触发点焦点。
- `visibilitychange` 进入隐藏状态立即遮住私密区，返回页面后要求主动揭示。
- 不引入新 UI 库；复用 React、现有图标依赖与设计令牌。

**验收：** 组件单测、键盘操作、390×844 与 844×390 布局、减少动态模式以及客户端构建均通过。

### 任务 3：G1《情书：密函心意》

**新增目录：** `packages/games/loveletter/`

**文件：**

- `package.json`：`@ldj/game-loveletter`，只导出 manifest 和 server。
- `shared/manifest.ts`：2–4 人、`stateSchemaVersion: 1`、规则集 `classic16_v1`。
- `server/cards.ts`：16 张牌定义：守卫×5、牧师×2、男爵×2、侍女×2、王子×2、国王×1、伯爵夫人×1、公主×1。
- `server/state.ts`：整局好感、当前轮牌库/移除牌/手牌/弃牌/存活/保护、当前动作、私密结果和终局。
- `server/views.ts`：本人手牌与私密查看结果白名单；他人只见弃牌、存活、保护与好感；观战者不见任何手牌。
- `server/module.ts`：实现 `begin`、摸牌、弃牌、选目标、守卫猜测、牌效、淘汰、轮末比较、发好感和整局终局。
- `server/index.ts`
- `tests/cards.test.ts`
- `tests/module.test.ts`
- `tests/views.test.ts`

**固定规则：**

- 使用经典 16 张版；开局暗移除 1 张，两人局额外公开移除 3 张。
- 每回合摸 1 打 1；伯爵夫人与王子或国王同手时必须打出伯爵夫人。
- 侍女保护到该玩家下回合开始；王子可选自己；弃公主立即淘汰。
- 无合法目标时仍弃牌但效果落空。
- 牌库耗尽先比手牌值，再比本轮公开弃牌总和；仍并列则并列玩家各得 1 好感。
- 整局阈值：2 人 7、3 人 5、4 人 4；同一轮多人同时达到时共同获胜。
- 断线超时：若已摸牌则自动打出数值最低且满足伯爵夫人约束的牌；需要目标时选择席位顺序第一名合法目标；守卫固定猜测当前仍可能的最低非守卫角色。

**客户端新增：**

- `packages/client/src/game/loveletter/LoveLetterGamePage.tsx`
- `packages/client/src/game/loveletter/LoveLetterTable.tsx`
- `packages/client/src/game/loveletter/LoveLetterHand.tsx`
- `packages/client/src/game/loveletter/LoveLetterTargetPicker.tsx`
- `packages/client/src/game/loveletter/LoveLetterReveal.tsx`

**接入修改：**

- `packages/shared/src/game/catalog.ts`
- `packages/server/src/core/game/registry.ts`
- `packages/server/package.json`
- `packages/client/src/game/GamePage.tsx`
- `packages/games/README.md`

**上线门：** 先以 `coming_soon` 接入；规则、视角、恢复、真实 WS、浏览器完整局和全量 CI 全绿后改为 `playable`。

### 任务 4：G1《Durian：榴莲店长》

**新增目录：** `packages/games/durian/`

**文件职责：**

- `shared/manifest.ts`：2–7 人、规则集 `orchard_v1`。
- `server/fruits.ts`：榴莲、香蕉、木瓜、椰子、芒果五种水果稳定 ID。
- `server/inventory.ts`：28 张原创库存卡，每张总量 3–5，五类水果均衡出现；按人数每人 1 张、中央未知 1 张，其余移出本轮。
- `server/orders.ts`：36 张原创二选一订单卡，每侧增加 1–3 个水果。
- `server/specials.ts`：3 张原创店员事件：交换两名玩家库存位置、未知库存计数翻倍、指定水果本轮库存减一；效果触发和持续范围公开。
- `server/state.ts`：库存、未知卡、订单板、当前订单、当前/上一玩家、铃窗口、检查快照、店长怒气、玩家处罚和终局。
- `server/views.ts`：本人库存 `others_only`，其他玩家可见，中央库存全员隐藏，检查后按步骤公开。
- `server/module.ts`：继续接单、二选一、按铃、冻结快照、检查、处罚、怒气增长、新轮和终局。
- `tests/inventory.test.ts`、`orders.test.ts`、`module.test.ts`、`views.test.ts`、`buzzer.test.ts`。

**原创规则裁定：**

- 任一在线且未锁定动作的玩家可在订单确认后的公开铃窗口抢铃；服务端先到先得。
- 超卖定义为任一水果 `orderTotal > inventoryTotal`；等于库存安全。
- 按铃成功由上一位接单者承受当前怒气；失败由按铃者承受。
- 店长怒气从 1 开始，每次检查后加 1，最高 7。
- 玩家累计处罚达到 7 时立即结束；处罚最低者获胜，最低并列则共同获胜。
- 每次检查后重新洗库存和订单、清空订单板；受罚者成为下一轮起始玩家。
- 断线超时：当前玩家自动从二选一中选择左侧；断线玩家仍可被质疑和受罚，但不能抢铃。

**客户端新增：**

- `packages/client/src/game/durian/DurianGamePage.tsx`
- `packages/client/src/game/durian/DurianInventoryRack.tsx`
- `packages/client/src/game/durian/DurianOrderBoard.tsx`
- `packages/client/src/game/durian/DurianBell.tsx`
- `packages/client/src/game/durian/DurianInspection.tsx`

**上线门：** 与任务 3 相同；额外验证 2–7 人每种视角、并发抢铃和检查快照不可覆盖。

### 任务 5：G1 批次集成验收

- 扩展 `packages/server/tests/gatewayGame.test.ts`：两款游戏真实 WebSocket 开局、动作、不同接收者视角、断线重连、终局和返回大厅。
- 新增 `packages/server/tests/newGamesRecovery.test.ts`：文件数据库重启后恢复牌堆、私密结果、铃窗口和计时器。
- 新增可重复浏览器 E2E 脚本到 `packages/client/e2e/`，覆盖 390px 手机视口、键盘、抽屉、私密遮罩和完整局主路径。
- 运行 `npm run typecheck`、`npm run lint`、相关测试、全量 `npm test`、`npm run build`。
- 启动本地服务，用多标签页分别完成一局《情书》和一轮完整《Durian》，检查控制台、网络错误和秘密泄漏。
- 全部通过后将两款目录状态切为 `playable`，更新 README 与游戏资料状态文档。

### 任务 6：G2《奶酪大盗：月夜鼠影》

**新增目录：** `packages/games/cheese-thief/`

**状态机：** `setup → dice_reveal → confirm → night_1..night_6 → dawn → discussion → secret_vote → reveal → game_over`。

**固定原创裁定：**

- 4–8 人；服务端为每人生成 1–6 点私密醒来时刻。
- 夜间每个时刻使用相同持续时间；只有当前醒来组看到同醒者和当时奶酪状态。
- 单人醒来且奶酪仍在时自动成为小偷；多人同醒不能偷；无人偷到则本轮无小偷。
- 天亮后标准讨论 120 秒，可选 90/180 秒。
- 非小偷秘密投票，小偷不投票；获得严格多数且目标为小偷时侦探方胜，否则小偷胜；无人偷到时全员秘密选择“无人偷取”或一名玩家，严格多数选择无人偷取则全员胜，否则全员失败。
- 平票视为侦探方失败，不重投。
- 断线超时自动弃票；夜间窗口不因确认速度缩短。

**新增文件：** manifest、`state.ts`、`night.ts`、`views.ts`、`module.ts`、对应测试，以及客户端页面、骰杯、夜间遮罩、讨论桌面、投票和时间轴揭示组件。

### 任务 7：G2《以鹅传鹅：鹅鹅密令》

**新增目录：** `packages/games/goose-relay/`

**固定原创规则：**

- 5–9 人；1 名头鹅，恶鹅数量为 5–6 人 1 名、7–9 人 2 名，其余白鹅。
- 服务端随机生成一组“嫌疑鹅 + 受害鹅 + 地点 + 动作”案件，仅头鹅先看完整答案；恶鹅只看自己的阵营，不看答案。
- 按席位形成接力链；每棒玩家线下观看上一棒表演后，使用手机确认“已看完”，再向下一棒表演；平台不采集音视频。
- 每棒默认 30 秒，可选 20/45 秒；超时自动完成并进入下一棒。
- 最后一棒从系统提供的候选中提交四项答案；随后全员秘密指认恶鹅。
- 四项答案每正确一项白鹅得 1 分；每正确指认一名恶鹅白鹅再得 1 分。总分至少 `恶鹅数 + 3` 时白鹅胜，否则恶鹅胜。
- 接力过程中禁止游戏内聊天；断线玩家超时跳过该棒，但仍保留阵营和投票资格。

**新增文件：** manifest、`cases.ts`、`state.ts`、`relay.ts`、`views.ts`、`module.ts`、测试，以及客户端案件卡、闭眼等待、接力主持、答案选择、恶鹅指认和结算组件。

### 任务 8：G2 集成验收

- 覆盖等长夜间计时、私密醒来组、后台遮罩、接力聊天禁用、超时推进、恢复和结算。
- 多标签页实际运行 4 人奶酪局和 5 人接力局；使用自动计时缩短配置完成冒烟。
- 完成严格上线门后切换两款为 `playable`。

### 任务 9：G3《伪人测试：真假回声》判官模式

**新增目录：** `packages/games/echo-judge/`

**固定原创规则：**

- 3–12 人；每轮判官按席位轮换且不参与本轮身份分配。
- 其余玩家中，3–5 人时 1 名伪人，6–8 人时 2 名，9–11 人时 3 名。
- 系统从原创题库抽取公开问题，并为每名伪人提供同一私密关键词；人类只看到“自然回答”。
- 30 秒准备，随后按席位每人线下回答 30 秒并确认完成。
- 判官只能指认 1 人；抓中时判官 +2、该伪人 0、人类各 +1；抓错时被误指人类 +2、所有伪人各 +2、判官 0。
- 每人担任一次判官后结束，最高分者获胜；同分共同获胜。
- 首版不含高分模式和团队模式；目录规则说明明确后续规则集不影响本规则集回放。
- 断线回答者自动跳过；断线判官超时由系统按合法目标中席位第一名提交，避免整局阻塞。

**新增文件：** manifest、`prompts.ts`、`keywords.ts`、`state.ts`、`views.ts`、`module.ts`、测试，以及客户端判官席、私密关键词、主持计时、指认和积分榜组件。

### 任务 10：G4 原创《叮铃对决》

**新增目录：** `packages/games/bell-clash/`

**原创规则：**

- 2–7 人；每人 12 张个人图案牌，牌面由颜色、形状、数量三个维度构成。
- 每回合所有玩家同时翻开牌顶；桌面满足任一公开目标时开放抢铃：同色数量和为 5、同形状恰好出现 3 张、或三种颜色各出现一次。
- 抢铃正确者收走桌面全部牌；抢铃错误者向每名其他玩家各支付 1 张牌到底部。
- 无人抢铃 8 秒后继续翻牌；牌堆耗尽且无法支付者淘汰。
- 只剩一人或达到 20 轮时结束；剩余牌最多者获胜，并列共同获胜。
- 服务端先到先得；客户端时间不参与裁定；断线玩家不能抢铃，仍按规则翻牌。

**新增文件：** manifest、`patterns.ts`、`deck.ts`、`state.ts`、`views.ts`、`module.ts`、并发抢铃和规则测试，以及客户端同步翻牌桌、目标条、铃按钮和收牌演出。

### 任务 11：G4 原创《暗夜证词》

**新增目录：** `packages/games/night-testimony/`

**原创规则：**

- 4–6 人，固定 4 轮；身份包含 1 名主谋、1 名调查员，其余目击者。
- 每轮公开 1 张案件场景和 3 条陈述主题；服务器私下给每人 1 张证词，其中主谋证词与真相冲突，调查员可在整局一次私查任一玩家证词类别。
- 玩家按席位依次线下陈述，允许说谎；平台只主持顺序、30 秒计时和完成确认。
- 陈述后全员秘密投票主谋，禁止自投；主谋也投票以制造干扰。
- 主谋得票严格过半则目击者阵营本轮 +2，调查员若投中额外 +1；否则主谋 +2。
- 每轮重新分配主谋与调查员，使用均衡袋避免同一玩家连续两轮为主谋。
- 4 轮后个人分最高者获胜；同分共同获胜。
- 平票视为主谋逃脱；断线玩家自动弃票，陈述超时跳过。

**新增文件：** manifest、`cases.ts`、`testimonies.ts`、`roleBag.ts`、`state.ts`、`views.ts`、`module.ts`、测试，以及客户端案件板、私密证词、调查员能力、发言主持、秘密投票和结算组件。

### 任务 12：G3/G4 集成验收

- 为三款游戏增加真实 WS、恢复、秘密视角、超时动作和完整对局冒烟。
- 验证两款原创改编的页面、规则抽屉和游戏库描述不出现“官方复刻”表述。
- 验证新游戏房间不显示机器人按钮，直接发送 `add_bot` 也被服务端拒绝。
- 通过严格上线门后逐批改为 `playable`。

### 任务 13：G5 迁移现有游戏到共用能力

**顺序与边界：**

1. `undercover`：迁移确认栅栏、发言主持、秘密投票和统一桌面壳；保持现有动作 payload 和快照迁移。
2. `werewolf`：迁移确认、夜间行动窗口、秘密投票、发言主持和玩家带；角色逻辑仍留在模块内。
3. `uno`：迁移卡牌容器、行动坞和抽屉；牌效及现有机器人策略不变。
4. `landlord`：迁移卡牌容器、目标/选择反馈和统一桌面壳；牌型比较不进入共用层。

**每款迁移步骤：**

- 先锁定现有模块测试、网关测试和快照样本为兼容基线。
- 加失败测试证明共用能力输出与旧行为一致。
- 迁移一个能力并跑该游戏全部测试，不同时迁移多个游戏。
- 必要时增加 `migrateSnapshot`，禁止让活动旧局无法恢复。
- 浏览器对比迁移前后主流程、私密信息和移动端布局。

### 任务 14：资料、目录与发布收尾

**修改文件：**

- `packages/games/README.md`：列出 11 款游戏、规则集、状态、机器人支持和测试状态。
- `docs/new-games-preparation.md`：改为七款新增游戏的真实实施状态与后续规则集路线。
- `README.md`：更新支持游戏、人数范围、运行与测试说明。
- `docs/SPEC.md`：补充可组合规则能力、反向可见、抢铃裁定、线下主持和规则集版本兼容原则。
- `packages/shared/src/game/preparation.ts`：替换过期的三款准备资料或扩展为全部游戏的规则说明入口。

**发布检查：**

- 游戏目录、manifest、服务端注册和客户端分流完全一致。
- 所有新游戏 `stateSchemaVersion`、规则集 ID 和展示版本可追踪。
- 首页人数筛选覆盖 2–12 人；新游戏主题、标签、摘要和可玩状态正确。
- 生产构建不包含资料包内容、规则书原文或未授权资产。

## Verification

### 每个能力/游戏的开发循环

1. 编写一个具体失败测试并运行，确认因缺少行为而失败。
2. 实现最小行为并运行目标测试。
3. 增加边界、非法动作、不可变性、确定性和秘密视角测试。
4. 运行对应 workspace 测试与 `npm run typecheck`。
5. 完成批次后再运行全量质量门，不提前标记 `playable`。

### 自动化质量门

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

预期：全部退出码为 0，无跳过的新游戏核心测试，无 TypeScript、ESLint 或 Vite 错误。

### 隐私与安全验收

- 为每款隐藏信息游戏枚举“本人、其他玩家、淘汰玩家、观战者、重连玩家”五类接收者并做字段白名单断言。
- 搜索 WebSocket payload，确认不存在完整内部状态、他人手牌、身份、骰点、未知库存、未揭示投票或隐藏关键词。
- 验证切后台、重连初始帧、错误通知、聊天、日志和浏览器控制台不会泄漏秘密。
- 验证动作 actor 始终由连接上下文推导，目标与规则配置都经 Zod 和模块语义双重校验。
- 验证抢铃只认服务端房间队列顺序，不信任客户端时间戳。

### 恢复与兼容验收

- 在牌效待选目标、秘密投票未揭示、夜间时刻、表演接力、抢铃已锁定和检查动画中分别关闭并重启服务端。
- 重启后验证快照、随机游标、计时器、视角和下一合法动作与中断前一致。
- 对 G5 迁移前创建的快照执行迁移测试，确保旧局可恢复或得到明确、安全的终止结果。

### 浏览器与真实设备验收

- 使用 390×844、844×390 和桌面视口测试每款游戏主路径。
- 验证触控区、滚动、抽屉焦点、键盘操作、读屏名称、减少动态和颜色非唯一编码。
- 每款至少完成一局真实多人对局；G1 两款各完成三局连续冒烟，后续批次沿用该标准。
- 检查控制台错误、失败网络请求、重复提交、弱网等待态和断线恢复提示。
- 通过本地预览向用户展示每批页面，获得视觉验收后才关闭该批次。

### 最终接受标准

- 游戏库共有原 4 款加新增 7 款可玩游戏，不出现《骗子酒馆》。
- 7 款新增游戏均能创建房间、配置规则、加入、开局、完成主循环、结算、返回大厅和再开一局。
- 所有新游戏机器人能力为关闭状态，界面无机器人入口，服务端拒绝机器人加入。
- 规则不足的两款游戏以《叮铃对决》《暗夜证词》原创规则发布，其他游戏也只使用原创文案和视觉资产。
- 全量类型检查、Lint、测试、构建、恢复、WebSocket、移动端 E2E 和人工多人冒烟全部通过。
- 外部安全快照保留到全部批次验收完成；未经用户明确要求不创建 Git 提交、不推送远端。

## 执行顺序

1. 安全快照与功能分支。
2. G0 共用规则能力。
3. G0 统一配置与移动端桌面框架。
4. G1《情书》《Durian》实现与严格验收。
5. G2《奶酪大盗》《以鹅传鹅》实现与严格验收。
6. G3《伪人测试》判官模式实现与严格验收。
7. G4《叮铃对决》《暗夜证词》实现与严格验收。
8. G5 四款旧游戏分阶段迁移。
9. 文档、全量回归、真实多人验收与发布收尾。
