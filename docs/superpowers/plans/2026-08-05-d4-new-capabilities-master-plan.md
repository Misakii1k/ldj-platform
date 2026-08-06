# D4 新增能力 Master Plan

**权威来源：** `docs/superpowers/specs/2026-08-02-shared-game-engine-design.md`（下称「引擎设计」）；D1/D2 结果、D3 计划与结果（`docs/superpowers/plans/2026-08-04-d3-migration-compatibility.md`、`docs/superpowers/reports/2026-08-04-d3-migration-compatibility-results.md`）；规则追踪 `compliance/rules/uno_platform_house_v1.json` 与 `compliance/rules/undercover_blank_v1.json`；第三游戏内容哈希基线 `compliance/d4/third-game-baseline.json`。

**状态：** 已批准可执行。D3 已完成（2026-08-04），只证明兼容，本计划构成 D4 申请获准后的实施蓝本；任何独立门通过都**不**构成后续门、`playable`、权利或发布批准。

---

## 1. 执行要求

本计划的执行**必须**使用 `executing-plans` 技能：执行者加载本计划、批判性复核、按批次执行并保留审阅检查点；批次之间向主模型报告并等待反馈。

本仓库**禁止**任何 Git 状态变更命令：`git branch`、`git add`、`git commit`、`git push`、`git stash`、`git reset`、`git clean`、`git checkout -b`、`git tag` 一律不得执行。因此**频繁提交不得作为执行检查点**，改为**测试检查点（test checkpoint）**：

- 每个任务完成后必须跑完该门质量门清单（见第 5 节），全部通过即为一个测试检查点。
- 每个批次结束时主模型以只读 `git diff` 与 `git status` 复核工作树差异（这两个命令只读，允许执行），人工确认范围与白名单一致。
- 检查点之间不产生任何版本控制痕迹；所有改动以未提交工作树形式保留，等待用户单独授权版本控制操作。

执行顺序总体遵循第 4 节依赖图；同一依赖层内的门可按任意顺序独立执行。

---

## 2. 授权范围与硬边界

### 2.1 授权交付范围

D4 只交付以下内容：

1. **规则集感知注册与会话身份（D4-F1）**：注册表升级为 `(moduleId, rulesetId)` 元组；`game_sessions` 重建并承载权威 `ruleset_id`（数据库 migration v7）。
2. **SUSPENDED 类型化失败（D4-F2）**：规则模块内部错误进入 `SUSPENDED`，携带类型化 `failure` 代码，尝试确定性恢复，不可恢复时终止为 `FAILED_*` 结果。
3. **标准桌面契约（D4-T）**：标准视角元数据字段与封闭版本化能力枚举，统一桌面只消费标准字段。
4. **统一桌面外壳与三个游戏主舞台（D4-UI0、D4-UI1、D4-UI2、D4-UI3）**：平台固定区域复用；UNO、卧底、狼人杀主舞台作为扩展区域接入。
5. **UNO 新平台规则（D4-U，`uno_platform_house_v1`）**：独立规则集，不替换 legacy。
6. **卧底白板与异步裁判（D4-A1、D4-A2、D4-B，`undercover_blank_v1`）**：持久化外部裁判任务、模型裁判链、白板规则集。
7. **开发工具链（D4-TOOLS）**：模块生成器、契约测试套件、完整局驱动器、视角快照工具、规则追踪表、开发期诊断器、`playable` 准入检查、固定 LOC 度量脚本。
8. **第三游戏验证（D4-V）**：以 `werewolf_platform_open_kill_v1` 验证扩展性指标（基础设施复用、40% LOC 减少的内容哈希临时基线、零逃生钩子）。

### 2.2 硬边界（MUST NOT）

- **无 Git 状态变更**：不得执行第 1 节列出的任何 Git 状态变更命令。
- **不改变产品准入/权利状态**：任何门都不得把任何游戏改为 `playable`，不得改变 `internal_prototype` / `blocked_rights` / `unverified` 权利状态，不得修改 `compliance/d1/game-admission.json` 的准入结论，不得新增权利或发布批准。D4 整体完成也不自动改变上述状态。
- **不替换 legacy 规则集**：`uno_legacy_platform_v1`、`undercover_classic_v1`、`werewolf_legacy_platform_v2` 保持可运行与语义冻结；新规则集只能并行注册。
- **不复制 Wolfcha**：不得引入 Wolfcha 源码、资产、品牌、音频、头像或依赖；所有产物（含测试夹具、静态资源、构建产物、目录条目）必须通过禁入扫描（覆盖「骗子酒馆」「Liar's Bar」「liars-bar」「liars_bar」及对应标识）。
- **不实现未批准狼人规则**：警长/警徽、1.5 票、白狼王、守卫自守等一律不实现；狼人规则改动只能通过已注册规则集边界（`wolfKillScope`）表达。
- **不建设 DSL / 可视化规则编辑器**：声明式规则 DSL 与可视化规则编辑器不在本阶段；不得预建生产接口或运行时占位。
- **WebRTC / 音视频全部 `DEFERRED`**：不得创建生产接口、数据表或运行时占位。
- **不注入游戏 ID 分支**：共用执行平台、共享原语与共享 UI 不得出现具体游戏 ID 条件分支；新规则通过组合表达。
- **不声明稳定原语 v1**：在权威 commit 对比可用并通过全部成熟度门之前，不得把任何原语标记为稳定。
- **不伪造结果**：SUSPENDED/异常终止不得伪造获胜者、计入正常胜场、泄露完整权威状态或静默覆盖原对局。

---

## 3. 冻结决定

下列决定已由权威来源与合规规则追踪冻结，执行期间**不得**更改；确需更改必须升级 `rulesetId` 并重新审批。

### 3.1 白板异步裁判冻结决定（`undercover_blank_v1`，`internal_prototype`）

来源：引擎设计「已确认的《谁是卧底》规则集」与「外部模型失败策略」；`compliance/rules/undercover_blank_v1.json`。

- **归一化策略 `blank-normalization-v1`**：Unicode NFC；去除首尾空白；Unicode 空白折叠为单个 ASCII 空格；拉丁字母小写；保留标点；不做简繁转换；不做本地同义词推断。
- **输入边界**：接受 1–64 个 Unicode 码点；拒绝控制字符与换行；非 BMP 字符按一个码点计。
- **裁判链**：本地精确匹配 → 主模型 → 独立备用模型（仅当主模型结果为 `uncertain` / `provider_error` / `timeout` / `invalid_response` 时调用）；备用模型**不得**看到主模型结论；只有 `equivalent` 判定正确；两个非明确结果按猜错失败关闭。
- **隐私**：供应商只收到归一化标准词、归一化猜测与版本化指令；不发送聊天、房间、昵称、角色、投票或其它秘密；日志排除凭据、完整请求头与游戏秘密。
- **最终猜词**：30 秒；只可提交一次或显式跳过；超时与跳过均按猜错处理。
- **规则机器人策略**：`never_submit`（永远不主动猜词）、`skip`（跳过最终猜词）、`receivesStandardAnswer=false`（机器人不接收标准答案）。
- **明文保留**：`erase_after_result_applied`——任务结果应用后擦除标准词与猜测明文，只保留摘要、判定分类与受限审计元数据。
- **暂存结果语义**：提交时冻结资格与序号；后台裁判期间普通流程继续；普通结果先记为暂存；更早提交的 `equivalent` 结果覆盖暂存结果；`not_equivalent` 确认暂存结果或继续当前对局；迟到结果在终局后丢弃；重启后续跑未完成任务但不重复消耗猜词机会；事件重放零供应商调用。

### 3.2 UNO 平台规则冻结决定（`uno_platform_house_v1`，`blocked_rights`）

来源：引擎设计「已确认的 UNO 平台规则集」；`compliance/rules/uno_platform_house_v1.json`。

- **基础回合**：摸牌后可打出手中任意合法牌（含刚摸的牌）；普通回合 15 秒超时温和托管（保守优先级选合法牌；无合法牌自动摸一张且摸后不继续出牌）；托管导致剩一张时原子化自动喊 UNO；双人个人模式反转等同跳过。
- **UNO 声明**：恰有两张牌且已选择合法牌时允许提前喊；提前喊当回合有效、不可取消、可在合法牌间切换、非法牌可见但不可点按；未提前喊时手牌变一张开启 5 秒竞速窗口；补喊与抓漏报按服务端事务顺序竞速；抓漏报成功目标摸两张，错误抓漏报不处罚；下家可并行开始回合，有效出牌/摸牌提前关闭窗口；5 秒自然关闭不处罚。
- **罚牌链与质疑**：`+2` 后可接 `+2`/`+4`；`+2` 链接入 `+4` 升级为 `+4` 链；`+4` 后只能接 `+4`；普通状态第一张 `+4` 可被质疑，第二张叠加后整链关闭质疑；用 `+4` 响应 `+2` 链不允许质疑；不愿/不能叠加者摸全部累计罚牌并跳过，罚牌摸牌不进入摸后可出牌阶段；质疑成功出牌者摸四、所选颜色作废、质疑者正常行动；质疑失败质疑者摸六并跳过；`+4` 与 `+2` 响应窗口均 5 秒，超时自动接受罚牌。
- **终局**：最后一张 `+2` 禁止叠加、下家固定摸两张后结算；最后一张 `+4` 禁止质疑与叠加、下家固定摸四张后结算；罚牌计入下家最终手牌分；数字牌按面值、功能牌 20 分、变色与 `+4` 50 分。
- **计分与排名**：个人模式 2–10 人，按剩余手牌总分从低到高排名，同分共享竞赛名次。
- **组队**：固定四人、队友交错入座、队友手牌完全隐藏、对局内禁止策略交流（服务端强制执行）；任意队员出完牌小局结束，两队员分数相加，低分获胜，同分平局。
- **多小局**：房主选择 1、3、5、7 小局；整场按累计低分排名；首局随机先手，后续由上一小局出完牌者先手。
- **牌堆**：开局任意牌可作首张弃牌但不触发功能效果；首张为变色/`+4` 时由确定性随机源选初始颜色；摸牌堆耗尽保留弃牌顶牌、其余弃牌重新洗回；可用牌不足时动态加入完整 108 张新牌并连同可用牌一起洗，一小局可多次扩牌；新小局重置为一副标准 108 张。

### 3.3 基线冻结

- UNO 冻结哈希（D1 fixture，字节与 SHA-256 均不得改变）：
  `e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6`
- 卧底冻结哈希（D1 fixture，字节与 SHA-256 均不得改变）：
  `38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68`
- 第三游戏验证冻结内容哈希基线：`compliance/d4/third-game-baseline.json`（`frozenAt=2026-08-05`；源集合哈希 `4c20cb5f055357a31a9d21d37c6b85f0ef43f30447c3530f5e70f692dc735412`；验收 bundle 哈希 `606aa814fce4f7019ce1dbbc797dd7e814ff01cc69cf533228a178f498c6b372`；准则哈希 `45345d914ebbd210166b992213865303c9b5f45fcb9adf8c49d248a6416f6047`）。因其为 content-hash provisional（禁止提交导致无法建立不可变基线/目标 commit），权威 commit 对比列为 `DEFERRED` 条件，稳定原语 v1 在满足该条件前不得声明。
- 现有规则集身份（migration v7 回填基准，全部来自当前目录）：`landlord_legacy_platform_v1`、`werewolf_legacy_platform_v2`、`werewolf_platform_open_kill_v1`、`undercover_classic_v1`、`uno_legacy_platform_v1`。
- 数据库迁移现状为 v6；D4 新增 v7（重建 `game_sessions`）、v8（`adjudication_tasks`），只前进、不改历史。

---

## 4. 依赖图与独立门

```text
D4-0 冻结与基线
 └─ D4-F1 规则集感知注册与会话身份（migration v7）
     ├─ D4-F2 SUSPENDED 类型化失败
     │   └─ D4-A1 持久化外部裁判任务（migration v8）
     │       └─ D4-A2 白板裁判模型链路
     │           └─ D4-B 白板规则集（undercover_blank_v1）
     │               └─ D4-B-UI（= D4-UI2）卧底主舞台
     ├─ D4-T 标准桌面契约
     │   └─ D4-UI0 统一桌面外壳
     │       ├─ D4-UI1（= D4-U-UI）UNO 主舞台
     │       ├─ D4-UI2（= D4-B-UI）卧底主舞台
     │       └─ D4-UI3 狼人杀主舞台（桌面骨架复用）
     ├─ D4-U UNO 平台规则（uno_platform_house_v1）
     │   └─ D4-U-UI（= D4-UI1）UNO 主舞台
     ├─ D4-TOOLS 开发工具链
     └─ D4-V 第三游戏验证（werewolf open-kill）
         （需 D4-TOOLS 度量脚本、D4-UI3 骨架证据、D4-U/D4-B 回归）
```

**独立门语义：**

- 每个门具有独立的授权、测试、验收与报告；任一门的通过不自动授权其他门。
- 门之间除上述依赖外互不阻塞；同一依赖层内可并行执行。
- 任何门都不改变 `playable`/权利/准入状态；每个门的结果报告必须复述该声明。
- D4 所有门完成后仅进入「总结与人工审阅」状态，不自动开始任何新游戏、稳定原语 v1 或七款新游戏。
- 允许并在授权范围内将 legacy 狼人杀/斗地主继续走 legacy 路径；D4 不迁移它们到 V2。

---

## 5. 主模型统筹与小模型执行协议

### 5.1 分工

- **主模型（架构师）** 统筹：拆解门与任务、审阅每个批次的工作树差异（只读 `git diff` / `git status`）、判定检查点、更新本计划、汇总结果报告。主模型不直接实现门内细节。
- **小模型（fresh narrow packages）** 执行：每个实施包使用全新上下文（fresh context），任务范围**只限**第 6 节对应门给出的精确文件白名单；白名单外文件一律不得创建、修改或删除；触界即停止并向主模型报告。

### 5.2 每个任务的固定流程（Red-Green-Refactor）

1. **Red**：先写失败测试（断言精确、覆盖正常/空/边界/非法 actor/重复/幂等/恢复）。
2. **Green**：以最小实现让测试通过；不提前抽象。
3. **Refactor**：删除重复、消除逃生钩子、保持语义不变；测试保持绿色。
4. **测试检查点**：跑完第 5.3 节质量门清单；全部通过才可进入下一任务。
5. **审阅**：本批次全部任务完成后，主模型读取只读 diff 复核范围、白名单与不变量，向执行者反馈。

### 5.3 每个门通过时的质量门清单

```text
1. 目标测试（新测试先红后绿，全部通过）
2. npm run typecheck
3. npm run lint
4. npm test（全量；含 scripts/tests 的 mjs 部分）
5. npm run compliance:d1（build 前）
6. npm run build
7. npm run compliance:d1（build 后）
8. git diff --check
9. 审计清单：
   - 无 package.json / package-lock.json 变更（除非门白名单显式允许）
   - 无未授权的数据库 migration（只允许 v7/v8）
   - 两份 D1 fixture 字节与 SHA-256 不变
   - 无 playable / 权利 / 准入状态变更
   - 无 Git 状态变更命令被执行
   - 禁入扫描无命中
```

### 5.4 UI 门专项纪律

- 任何 UI 改动（D4-UI0/1/2/3、D4-U-UI、D4-B-UI）**必须**先调用 `oil-frontend` 技能：先读 SKILL.md 判定范围，按参考文件顺序评审共享实现落点，再实施；不得直接堆叠页面补丁。
- UI 门通过标准包括**真实浏览器 Playwright 验收**（不是纯组件测试）：2/4/6/8/10 人座位布局、当前行动者、触控目标 ≥ 44×44 CSS px、键盘操作、屏幕阅读器、非颜色状态提示、私有信息不先入 DOM 再 CSS 隐藏、断线恢复、等待裁判层、异常终止层、小局与整场结算、移动端横竖屏、减少动态效果。

---

## 6. 门级实施细节

下文每个门给出：目标、精确文件白名单（Create/Modify）、TDD 步骤、测试与验收。文件名以当前工作树为基准，执行者必须逐一核对；白名单外的既有文件即使「看起来相关」也不得改动。

### D4-0 冻结与基线门

**目标：** 固化 D4 基线证据与执行纪律；不产生任何产品代码变更。

**文件白名单：**

- Create：`compliance/d4/d4-freeze-v1.json`
- Create：`docs/superpowers/reports/2026-08-05-d4-0-results.md`

**TDD 步骤：**

1. 以只读方式确认当前工作树状态（`git status`/`git diff --stat`），记录本次执行所依据的本计划文件路径。
2. 验证 `npm run compliance:d1` 通过；重新计算 UNO/卧底 D1 fixture SHA-256，与冻结值（第 3.3 节）逐一比对。
3. 按 `compliance/d4/third-game-baseline.json` 自带 canonicalization 重算 `sourceSet.sha256`、`criteriaSha256`、`bundleSha256` 并比对。
4. 编写 `compliance/d4/d4-freeze-v1.json`：记录第 3 节全部冻结决定、migration v7/v8 决策、注册元组回填基准（第 3.3 节规则集身份列表）、以及「D4 完成不改变 playable/权利」声明。
5. 编写 D4-0 结果报告。

**测试与验收：** 冻结文件为合法 JSON 且字段齐全；三组哈希全部一致；`npm run compliance:d1` PASS；无任何产品代码或准入变更；`git diff --check` PASS。

---

### D4-F1 规则集感知注册与会话身份

**目标：** 注册表从模块级升级为 `(moduleId, rulesetId)` 元组；`game_sessions` 以 `ruleset_id` 为权威规则身份；migration v7 重建表并回填。

**文件白名单：**

- Create：`packages/shared/src/game/rulesetRegistry.ts`
- Create：`packages/shared/tests/rulesetRegistry.test.ts`
- Modify：`packages/shared/src/game/catalog.ts`（`rulesets[]` 与 `defaultRulesetId` 进入注册表校验）
- Modify：`packages/shared/src/game/versionedContract.ts`（`GameModuleV2` 声明 `rulesetId` 与 `registeredRulesets`）
- Modify：`packages/server/src/persistence/migrations.ts`（**只新增 v7**）
- Modify：`packages/server/src/persistence/db.ts`（session 建/读/恢复路径带 `ruleset_id`）
- Modify：`packages/server/src/core/game/`（会话创建要求 `(moduleId, rulesetId)` 对）
- Modify：`packages/server/src/core/recovery.ts`（按 `ruleset_id` 判别恢复路径）
- Modify：`packages/server/src/gateway/ws.ts`（广播携带 `rulesetId`）
- Modify：`packages/games/uno/shared/manifest.ts`、`packages/games/undercover/shared/manifest.ts`、`packages/games/werewolf/shared/manifest.ts`、`packages/games/landlord/shared/manifest.ts`（注册既有+新 ruleset id）
- Modify：`packages/games/uno/server/versionedModule.ts`、`packages/games/undercover/server/versionedModule.ts`、`packages/games/werewolf/server/module.ts`（声明注册规则集）
- Modify：`packages/client/src/game/viewRegistry.ts`（判别符含 `rulesetId`）
- Tests：`packages/server/tests/sessionIdentity.test.ts`、`packages/server/tests/persistence.test.ts`（扩展）

**Migration v7（`game_sessions` 重建）：**

```text
- 新建 game_sessions_new：
  id / room_id / module_id / module_version /
  ruleset_id TEXT NOT NULL                          -- 新增：权威规则身份
  state_schema_version / status CHECK 扩展加入 'SUSPENDED'
  failure TEXT                                      -- 新增：类型化失败代码（NULL 或 FAILED_*）
  snapshot_json / seed / rng_state_json / last_seq / created_at / updated_at
- 回填 ruleset_id = COALESCE(
    json_extract(snapshot_json, '$.rulesetId'),      -- D3 版本化信封优先
    CASE module_id                                   -- legacy 会话按模块默认回填
      WHEN 'uno'        THEN 'uno_legacy_platform_v1'
      WHEN 'undercover' THEN 'undercover_classic_v1'
      WHEN 'werewolf'   THEN 'werewolf_legacy_platform_v2'
      WHEN 'landlord'   THEN 'landlord_legacy_platform_v1'
    END)
- 无法回填（未注册模块）的会话在迁移后显式置 SUSPENDED + failure='FAILED_RULESET_UNAVAILABLE'，
  并在报告中逐条列出供人工审计（不猜测状态）。
- DROP 旧表并 RENAME；唯一索引 idx_sessions_one_active 重建并加入
  status IN ('PREPARING','ACTIVE','RECOVERING','SUSPENDED') 范围不变（SUSPENDED 仍占用活跃位）。
```

**TDD 步骤：**

1. Red：`rulesetRegistry` 测试——元组唯一、未知 `rulesetId` 拒绝、`defaultRulesetId` 必须已注册、每模块至少一个规则集、平台变体标记、`(moduleId, rulesetId)` 不可与目录矛盾。
2. Green：实现注册表并接入 `catalog.ts` 与 `versionedContract.ts`。
3. Red：会话身份测试——创建会话必须显式 `(moduleId, rulesetId)`；未注册组合拒绝；创建后 `ruleset_id` 写入快照信封、广播与视角判别符；恢复按 `ruleset_id` 选择合法校验。
4. Green：改 db/executor/recovery/gateway 全链路。
5. Red：migration v7 升级测试——旧库（含 legacy 无信封会话）升级后回填正确、SUSPENDED 可写、`failure` 列存在、索引行为不变。
6. Green：迁移执行。

**测试与验收：** 注册表与身份测试全绿；D3 恢复测试（trailing 重放、失败关闭、timer 冲突）全绿；两份 D1 哈希不变；全量质量门通过；无 `playable`/权利变更。

---

### D4-F2 SUSPENDED 类型化失败

**目标：** 规则模块内部错误进入 `SUSPENDED` + 类型化 `failure`；平台尝试从最近有效快照+事件确定性恢复；无法确定性恢复时终止为 `FAILED_*` 结果，不伪造获胜者。

**文件白名单：**

- Create：`packages/shared/src/game/sessionStatus.ts`（`SUSPENDED` 状态；失败代码枚举：`FAILED_RECOVERY`、`FAILED_INVARIANT`、`FAILED_RULESET_UNAVAILABLE`，以及内部 `SUSPENDED_*` 原因码）
- Create：`packages/server/tests/suspended.test.ts`
- Modify：`packages/server/src/core/executor.ts`（捕获 reduce 异常/不变量失败/未知 effect/不可序列化 → SUSPENDED）
- Modify：`packages/server/src/core/recovery.ts`（SUSPENDED 恢复尝试与失败关闭）
- Modify：`packages/server/src/core/game/`（状态机含 SUSPENDED 转换；无法恢复时写正式 `FAILED_*` 结果）
- Modify：`packages/server/src/gateway/ws.ts`（SUSPENDED 的断线/等待裁判/暂停层广播）
- Modify：`packages/shared/src/game/versionedContract.ts`（结果类型含 `FAILED_*`）

**TDD 步骤：**

1. Red：`reduce` 抛异常 → 事务回滚（不写事件、不推进序号）、会话 SUSPENDED、`failure` 落库、恢复尝试启动。
2. Red：状态 Schema 失败、不变量失败、未知 effect、不可序列化数据 → 各自映射类型化失败代码。
3. Red：确定性可恢复 → 从最近有效快照重放并恢复 effect/timer，会话回到 ACTIVE。
4. Red：确定性不可恢复 → 终止为对应 `FAILED_*` 结果，不产生获胜者、不计正常胜场、不泄露完整权威状态。
5. Green：executor/recovery 全链路实现。
6. Refactor：保证「合法性判断在事务提交前」与「被拒动作不推进序号」两条平台不变量不被破坏。

**测试与验收：** 全部 SUSPENDED 路径（含崩溃恢复后仍 SUSPENDED）有测试；D3 全量恢复测试保持绿色；`npm test` 全量通过；D1 哈希不变。

---

### D4-T 标准桌面契约

**目标：** 纯 shared 层的标准视角元数据与封闭能力枚举；不实现 UI、不改变既有视角 JSON 的可解析性。

**文件白名单：**

- Create：`packages/shared/src/game/tabletop/contract.ts`（标准字段：`phaseLabel`、`currentActor`、`seatStatus`、`countdown`、`availableCapabilities`、`publicLog`、`resultSummary`；带版本扩展字段类型）
- Create：`packages/shared/src/game/tabletop/capabilities.ts`（封闭版本化能力枚举：`canPlayCard`、`canDraw`、`canCallUno`、`canCatchMissedUno`、`canVote`、`canSpeak`、`canGuessWord`、`canChallenge`、`canAcknowledge` 等——按实际需要收敛为版本化封闭枚举；未知能力按契约错误处理）
- Create：`packages/shared/tests/tabletop.contract.test.ts`、`packages/shared/tests/tabletop.capabilities.test.ts`
- Modify：`packages/shared/src/game/versionedContract.ts`（视角输出可携带标准字段）
- Modify：`packages/games/uno/server/versionedModule.ts`、`packages/games/undercover/server/versionedModule.ts`（视角包含标准字段，扩展字段带版本；字段新增不破坏 D3 严格 parser 的既有判别符）
- Modify：`packages/client/src/game/viewRegistry.ts`（标准字段与扩展字段分离消费）

**TDD 步骤：**

1. Red：contract schema 测试——字段类型/必填/版本、扩展字段必须带版本、未知能力拒绝。
2. Green：contract 类型与校验器。
3. Red：UNO/卧底视角包含标准字段（`phaseLabel`/`currentActor`/`seatStatus`/`countdown`/`availableCapabilities`/`publicLog`/`resultSummary`）且既有解析器仍全绿。
4. Green：模块视角补齐标准字段。
5. Refactor：确认能力只描述「当前能做什么」，不暴露完整规则状态。

**测试与验收：** contract/capabilities 测试全绿；UNO/卧底 D3 视角解析测试与 D1 视角字节门不变；全量质量门通过。

---

### D4-UI0 统一桌面外壳

**目标：** 平台固定区域桌面骨架消费标准桌面契约；2–10 人布局可用；先 `oil-frontend` 后实施，Playwright 真实浏览器验收。

**文件白名单：**

- Modify：`packages/client/src/game/tabletop/TabletopShell.tsx`、`ActionDock.tsx`、`PlayerStrip.tsx`、`GameDrawer.tsx`、`GameSetupPanel.tsx`、`PrivatePanel.tsx`、`types.ts`、`setupState.ts`、`privateState.ts`
- Modify：`packages/client/src/game/types.ts`、`packages/client/src/game/GamePage.tsx`、`packages/client/src/game/GameChrome.tsx`（接入统一外壳）
- Create：`packages/client/e2e/tabletop-shell.spec.ts`（Playwright）
- Modify：`packages/client/src/game/viewRegistry.ts`

**TDD 步骤：**

1. 先运行 `oil-frontend` 技能评审现有 tabletop 组件与共享实现落点；结论写入 UI0 报告。
2. Red：Playwright 验收脚本先以「期望布局」断言失败（当前外壳未达到标准）。
3. Green：实现平台固定区域——房间信息/连接状态、阶段名与倒计时、系统消息与恢复提示、座位/头像/状态、当前行动者强调、公开事件流、通用动作容器、小局与整场结算框架、断线/等待裁判/暂停/异常终止层、设置/退出/观战入口。
4. Refactor：删除单个组件的视觉补丁；共享实现修正优先于页面打补丁。

**测试与验收：** Playwright 桌面 1440×1000 与移动 390×844：2/4/6/8/10 人座位无交叠、无横向溢出、触控目标 ≥44px、键盘/屏幕阅读器/减少动态效果达标、非颜色状态提示、私有信息无 DOM 泄漏、断线恢复、异常终止层。全量质量门通过。

---

### D4-U UNO 平台规则（`uno_platform_house_v1`）

**目标：** 按第 3.2 节冻结决定实现 house UNO；独立注册，不替换 `uno_legacy_platform_v1`。

**文件白名单：**

- Create：`packages/games/uno/server/house/state.ts`、`rules.ts`、`scoring.ts`、`bot.ts`
- Create：`packages/games/uno/server/houseModule.ts`（注册 `uno_platform_house_v1`）
- Modify：`packages/games/uno/server/index.ts`（并行注册）
- Modify：`packages/games/uno/shared/manifest.ts`（`rulesets` 增加 `uno_platform_house_v1`）
- Create：`packages/games/uno/tests/house/base.test.ts`、`uno.test.ts`、`penalty.test.ts`、`terminal.test.ts`、`scoring.test.ts`、`team.test.ts`、`match.test.ts`、`deck.test.ts`、`fullGame.test.ts`
- Tests 引用 `compliance/rules/uno_platform_house_v1.json` 的 `clauseId` 与 `plannedTestIds`。

**TDD 步骤（按条款分组逐组 Red→Green→Refactor）：**

1. GOV/基础回合：`UNO-HOUSE-GOV-001..003`、`UNO-HOUSE-BASE-001..004`（15 秒托管、托管选牌优先级、无牌自动摸、剩一张原子喊 UNO、双人反转跳过）。
2. UNO 声明：`UNO-HOUSE-UNO-001..004`（提前喊、切换合法牌、5 秒竞速、补喊/抓漏报、并行下家、自然关闭）。
3. 罚牌链与质疑：`UNO-HOUSE-PENALTY-001..005`（叠加方向、升级链、质疑资格闭合、质疑成败、5 秒响应窗口超时）。
4. 终局：`UNO-HOUSE-TERMINAL-001`（末张 `+2`/`+4` 固定罚、计入分数）。
5. 计分排名：`UNO-HOUSE-SCORE-001..002`（面值/20/50 分、低分升序、同分共享名次）。
6. 组队：`UNO-HOUSE-TEAM-001..002`（恰四人、交错入座、队友手牌隐藏、服务端禁止策略聊天、双手分求和、低分/平局）。
7. 多小局：`UNO-HOUSE-MATCH-001..002`（1/3/5/7 局、累计低分、随机首手、上局出完者先手）。
8. 牌堆：`UNO-HOUSE-DECK-001..004`（任意首张弃牌、确定性选色、保留顶牌回收、动态完整 108 张扩牌、新小局重置单副）。

**测试与验收：** 每条 clause 至少映射一个测试（按 `plannedTestIds` 命名）；动态扩牌完整局（多次扩牌仍可收束）；house 机器人完整局（`uno_platform_house_v1` bot 候选始终合法）；`uno_legacy_platform_v1` 模块测试与 D1 黄金回放保持绿色；D1 哈希不变；全量质量门通过。

---

### D4-U-UI（= D4-UI1）UNO 主舞台

**目标：** 在统一桌面外壳上实现 UNO 主舞台：手牌、弃牌堆、出牌/摸牌控制、提前喊与竞速抓漏报交互、罚牌链响应窗口、`+4` 质疑、托管倒计时。

**文件白名单：**

- Create：`packages/client/src/game/uno/stage/`（主舞台组件，只消费标准字段+UNO 扩展）
- Modify：`packages/client/src/game/uno/types.ts`
- Create：`packages/client/e2e/uno-house.spec.ts`（Playwright，真人+机器人混合完整局）
- Modify（仅经 `oil-frontend` 判定的共享实现）：`packages/client/src/game/tabletop/`

**TDD 步骤：**

1. 先 `oil-frontend` 评审；Red：e2e 期望行为断言失败。
2. Green：主舞台实现（能力启用控件、服务端权威校验、泛光+文字/符号双提示）。
3. Refactor：删除旧 UNO 页面残留死代码/样式；私有手牌不入 DOM 后再 CSS 隐藏。

**测试与验收：** Playwright 完整 UNO 局（含 UNO 竞速、罚牌链、质疑、托管、双人组队聊天禁止）；触控/键盘/屏幕阅读器；断线重连；私有手牌无 DOM 泄漏。全量质量门通过。

---

### D4-A1 持久化外部裁判任务

**目标：** migration v8 `adjudication_tasks`；`enqueue_adjudication` effect 与 `external_task_result` 回灌；exactly-once 内部结果再入。

**文件白名单：**

- Modify：`packages/server/src/persistence/migrations.ts`（**只新增 v8**）
- Modify：`packages/shared/src/game/versionedContract.ts`（effect 类型加 `enqueue_adjudication`；系统动作加 `external_task_result`）
- Create：`packages/server/src/core/adjudication/`（`taskStore.ts`、`taskQueue.ts`）
- Modify：`packages/server/src/core/executor.ts`（事务提交后调度外部任务；结果再入房间串行事务链）
- Modify：`packages/server/src/core/queue.ts`（外部任务走独立队列，不阻塞房间事务）
- Modify：`packages/server/src/core/recovery.ts`（未完成任务续跑、已结算任务丢弃迟到结果）
- Create：`packages/server/tests/adjudicationTask.test.ts`

**Migration v8（`adjudication_tasks`）：**

```text
CREATE TABLE adjudication_tasks (
  task_id              TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  ruleset_id           TEXT NOT NULL,
  task_type            TEXT NOT NULL,
  submitted_at_seq     INTEGER NOT NULL,
  eligibility_digest   TEXT NOT NULL,
  input_digest         TEXT NOT NULL,
  input_plaintext_json TEXT,          -- 仅 pending/running 需要；结果应用后擦除
  status               TEXT NOT NULL CHECK (status IN ('pending','running','done','discarded','errored')),
  primary_attempt_json TEXT,
  fallback_attempt_json TEXT,
  result_json          TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX idx_adjudication_tasks_session ON adjudication_tasks(session_id, status);
```

**行为定义：**

- `enqueue_adjudication` effect 在 reduce 时声明（`taskId`、`sessionId`、`taskType`、输入、资格摘要）；平台在事务**提交后**创建任务，创建失败不影响已提交房间事务（任务状态 `errored` 可重试）。
- 结果到达按 `task_id` 幂等：已 `done`/`discarded` 的任务结果丢弃；有效结果作为系统动作 `external_task_result` 重新进入房间串行事务链，经 `expectedSequence` 与 `requestId` 校验后由游戏模块 reducer 应用。
- **exactly-once 内部结果再入**：同 `task_id` 只回灌一次；事件重放不再次调用模型、不重新回灌。

**TDD 步骤：**

1. Red：migration v8 升级测试。
2. Red：reduce 发出 `enqueue_adjudication` → 任务落库（独立于房间事务）。
3. Red：`external_task_result` 再入 exactly-once（同 `task_id` 第二次回灌被丢弃；重放不重复）。
4. Red：重启后 `pending`/`running` 任务续跑，不重复消耗猜词机会；已结算任务迟到结果丢弃。
5. Green：实现 taskStore/taskQueue/executor/recovery。
6. Refactor：保证外部任务不直接修改权威状态，必须经系统动作回灌。

**测试与验收：** 全部任务生命周期测试通过；D3 恢复与 `npm test` 全量保持绿色；D1 哈希不变。

---

### D4-A2 白板裁判模型链路

**目标：** `adjudication-policy` 纯函数原语 + `adjudication-runner` 有状态服务；主/备模型独立；暂存结果语义。

**文件白名单：**

- Create：`packages/shared/src/game/rules/adjudication-policy.ts`（纯函数：归一化、本地精确匹配、结果分类、回退决策、迟到结果资格判断；**不发起网络请求、不持久化任务、不调度重试**）
- Create：`packages/shared/tests/rules.adjudicationPolicy.test.ts`
- Create：`packages/server/src/core/adjudication/runner.ts`（主模型/备用模型调用、结构化超时输出、恢复）
- Modify：`packages/server/src/core/llmProtocol.ts`（结构化输出与明确超时；请求与日志只含批准字段）
- Create：`packages/server/tests/adjudicationRunner.test.ts`（可编程替身，不调用真实供应商）
- Modify：`packages/shared/src/game/rules/index.ts`（注册原语）

**TDD 步骤：**

1. Red：policy 纯函数测试——按 `blank-normalization-v1` 的 NFC/trim/collapse/lowercase/保留标点/1–64 码点/拒控制符与换行；本地精确等价；主模型结果分类；非明确结果才触发备用；两个非明确结果失败关闭；迟到结果资格判断。
2. Green：policy 实现。
3. Red：runner 测试——主正确、主错误（不触发备用）、主 `uncertain`/`provider_error`/`timeout`/`invalid_response` 触发独立备用、双失败判定猜错、备用看不到主结论（断言请求载荷）、隐私字段排除、超时处理、崩溃续跑。
4. Green：runner 与 llmProtocol 实现。
5. Refactor：真实模型只用于受控集成测试与人工验收；自动化门全部使用可编程替身。

**测试与验收：** policy/runner 测试全绿；隐私与结构化输出断言通过；`adjudication_tasks` 任务结果回灌到 reducer 后无副作用重复；全量质量门通过。

---

### D4-B 白板规则集（`undercover_blank_v1`）

**目标：** 按第 3.1 节冻结决定实现白板规则集；独立注册，不改变 `undercover_classic_v1`。

**文件白名单：**

- Create：`packages/games/undercover/server/blank/state.ts`、`rules.ts`
- Create：`packages/games/undercover/server/blankModule.ts`（注册 `undercover_blank_v1`）
- Modify：`packages/games/undercover/server/index.ts`（并行注册）
- Modify：`packages/games/undercover/shared/manifest.ts`（`rulesets` 增加 `undercover_blank_v1`）
- Modify：`packages/games/undercover/server/module.ts` / `state.ts` / `views.ts`（仅在不影响 classic 字节的前提下共享纯函数）
- Create：`packages/games/undercover/tests/blank/`（按 clause 分组；引用 `UNDERCOVER-BLANK-*`）
- Modify：`packages/server/tests/adjudicationTask.test.ts` / `fullGameMatrix.test.ts`（白板完整局并入）

**TDD 步骤（按条款分组 Red→Green→Refactor）：**

1. GOV/配置：`UNDERCOVER-BLANK-GOV-001..002`（独立注册、未验收不 playable、身份公开方式快照锁定、运行中不可改身份配置）。
2. 建立/角色：`UNDERCOVER-BLANK-SETUP-001`、`ROLE-001..002`（4–12 人、恰一名白板、无有词卧底、其余平民共享同词、白板显式「无词」秘密、计入卧底方）。
3. 胜负：`UNDERCOVER-BLANK-WIN-001`（白板+一名平民立即获胜；更早 pending 等价猜词仍控制终局）。
4. 主动猜词：`UNDERCOVER-BLANK-GUESS-001..002`（唯一机会、可用阶段、秘密提交、对错后果、机会永久消耗）。
5. 最终猜词：`UNDERCOVER-BLANK-FINAL-001..002`（被投票淘汰且未用过机会时开启 30 秒最终猜词、即时/延迟身份公开、提交一次或跳过、超时/跳过按错、规则机器人不主动猜且跳过最终猜词、不接收标准答案）。
6. 归一化：`UNDERCOVER-BLANK-NORM-001..002`（走 `adjudication-policy`）。
7. 裁判与隐私：`UNDERCOVER-BLANK-ADJ-001..002`（本地精确→主→备；仅 `equivalent` 正确；载荷白名单；备用隔离）。
8. 异步与暂存：`UNDERCOVER-BLANK-ASYNC-001..002`（后台裁判不阻塞发言/投票/加赛；提交冻结；暂存结果覆盖语义）。
9. 任务生命周期：`UNDERCOVER-BLANK-TASK-001..002`（唯一 taskId、终局后丢弃、重启续跑不重复机会、重放零调用、明文擦除与受限审计）。

**测试与验收：** 每条 clause 至少一个测试（按 `plannedTestIds` 命名）；async continuation 测试（pending 不阻塞发言/投票/加赛）；provisional override 测试（更早等价覆盖暂存普通结果、猜错确认或继续）；白板规则机器人完整局（从不主动猜、跳过最终）；`undercover_classic_v1` 模块测试与 D1 黄金回放保持绿色；D1 哈希不变；全量质量门通过。

---

### D4-B-UI（= D4-UI2）卧底主舞台

**目标：** 卧底主舞台：发言、投票、加赛、身份 reveal、白板秘密猜词输入与最终猜词（含 30 秒倒计时、等待裁判层）。

**文件白名单：**

- Create：`packages/client/src/game/undercover/stage/`（主舞台组件，只消费标准字段+卧底扩展）
- Modify：`packages/client/src/game/undercover/types.ts`
- Create：`packages/client/e2e/undercover-blank.spec.ts`（Playwright：含白板猜词、等待裁判层、最终猜词）
- Modify（仅经 `oil-frontend` 判定的共享实现）：`packages/client/src/game/tabletop/`

**TDD 步骤：**

1. 先 `oil-frontend` 评审；Red：e2e 期望行为断言失败。
2. Green：主舞台实现（发言计时、投票/加赛、白板猜词输入、等待裁判层、身份公开、最终猜词 30 秒倒计时）。
3. Refactor：删除旧卧底页面残留死代码/样式；私有身份不入 DOM 后再 CSS 隐藏。

**测试与验收：** Playwright 完整白板局；等待裁判层不阻塞普通流程；最终猜词交互；身份公开时机与配置一致；私有信息无 DOM 泄漏；断线重连。全量质量门通过。

---

### D4-UI3 狼人杀主舞台（桌面骨架复用）

**目标：** 将统一桌面骨架用于狼人杀（月相审判桌页面接入统一外壳），验证 `tabletopSkeleton` 基础设施「直接复用、不复制实现」，为 D4-V 提供桌面骨架复用证据；不改变狼人杀规则语义。

**文件白名单：**

- Modify：`packages/client/src/game/werewolf/WerewolfGamePage.tsx`、`presentation.ts`、`types.ts`
- Modify：`packages/client/src/game/werewolf/ui/`（仅按 `oil-frontend` 判定迁移到统一外壳与标准字段）
- Modify（仅经 `oil-frontend` 判定的共享实现）：`packages/client/src/game/tabletop/`
- Create：`packages/client/e2e/werewolf-tabletop.spec.ts`（Playwright：狼人杀在统一骨架上的完整局）

**TDD 步骤：**

1. 先 `oil-frontend` 评审；Red：e2e 断言失败。
2. Green：狼人杀主舞台接入统一外壳，复用座位/计时/事件/结算/异常层，不复制实现。
3. Refactor：移除狼人杀页面与统一外壳重复的实现；保持 12 人布局与身份遮蔽行为。

**测试与验收：** Playwright 12 人局无交叠、身份遮蔽/重新遮蔽、投票 ledger、终局 reveal、断线；语义树与先前验收一致。全量质量门通过。

---

### D4-TOOLS 开发工具链

**目标：** 提供标准工具链并验证可用性；产出第三游戏 LOC 度量固定脚本。

**文件白名单：**

- Create：`scripts/d4/generate-module.ts`（模块生成器：标准骨架+契约测试占位，不生成伪业务逻辑）
- Modify：`packages/shared/tests/helpers/versionedGameContract.ts`（契约测试套件：identity/初始状态/纯函数/不可变性/确定性/被拒动作不推进/视角 Schema/无秘密泄漏/结果 only-once/快照可重放/机器人合法候选）
- Modify：`packages/server/tests/helpers/fullGameDriver.ts`（完整局驱动器：最大步数+最大虚拟时间上限，超限即失败）
- Create：`scripts/d4/view-snapshot.ts`（视角快照工具：逐玩家+观战视角快照与字节比对）
- Create：`scripts/d4/rule-trace.ts`（从规则追踪 JSON 生成条款→实现→测试映射表，输出 `docs/superpowers/reports/2026-08-05-d4-<gate>-rule-trace.md`）
- Create：`scripts/d4/diagnostics.ts`（开发/测试环境诊断器：阶段、合法 actor、合法动作、计时器、序号、随机值编号；不进入普通玩家视角）
- Create：`scripts/d4/playable-check.mjs`（`playable` 准入检查：按引擎设计「上架准入」清单校验目录；当前输出必须为「无 playable」）
- Create：`scripts/d4/measure-loc.mjs`（**固定版本度量脚本**，按 `compliance/d4/third-game-baseline.json` 的 `measurementRules`/`excludedContent`/`comparisonUnit` 实现：有效非测试 TS LOC；排除生成文件、空行、纯类型声明、静态题库；`reductionPercent >= 40`）
- Tests：`scripts/tests/d4/*.test.mjs`

**TDD 步骤：**

1. Red：工具各自契约/行为测试先失败。
2. Green：实现；对 UNO/卧底跑契约套件与完整局驱动器验证真实消费者。
3. Refactor：生成器产物通过契约测试；诊断器默认关闭且不进入构建产物生产路径。
4. 度量脚本先在已知样例上锁定基线结果（与 `third-game-baseline.json` 源文件哈希一致）。

**测试与验收：** 工具测试全绿；`playable-check` 输出无 playable；`measure-loc.mjs` 对 werewolf open-kill provisional 基线输出 ≥40% 减少（content-hash provisional，权威 commit 对比列 DEFERRED）；全量质量门通过。

---

### D4-V 第三游戏验证（`werewolf_platform_open_kill_v1`）

**目标：** 以狼人杀开放夜刀规则集完成第三款验证游戏的扩展性验证，满足 `compliance/d4/third-game-baseline.json` 的 AC-01..AC-11。

**文件白名单：**

- Modify：`packages/games/werewolf/server/module.ts`（在**语义冻结**约束下复用候选原语与统一视角标准字段；不改变 `werewolf_legacy_platform_v2` 的 `wolfKillScope=non_wolf`，不改变 open-kill 已批准范围）
- Modify：`packages/games/werewolf/server/bot.ts`、`botPrompt.ts`、`shared/manifest.ts`（合法候选与服务端 reducer 一致）
- Modify：`packages/games/werewolf/tests/`（扩展 AC 相关测试）
- Modify：`packages/server/tests/`（完整局、重放、恢复、不可变性、视角泄漏、机器人合法性门对狼人杀打开）
- Modify：`scripts/d4/measure-loc.mjs` 配套基线清单（白名单内）
- Create：`docs/superpowers/reports/2026-08-05-d4-v-results.md`

**验收标准（逐条对照）：**

- AC-01：目标实现不修改服务端执行平台。
- AC-02：执行平台/共享原语/共享 UI 无新增游戏 ID 分支。
- AC-03：7 类基础设施（room、transactions、recovery、broadcast、timers、bot driver、tabletop skeleton）至少 6 类直接复用且不复制实现（其中 tabletop skeleton 证据来自 D4-UI3）。
- AC-04：固定脚本对**同一功能清单**的旧 `GameModule` 基线实现与目标实现计算有效非测试 TS LOC，减少 ≥40%；因禁止提交，本次结果为 content-hash provisional（对比 `third-game-baseline.json` 冻结源集合与目标工作树），权威 commit 对比列为 `DEFERRED`。
- AC-05：通过模块模板与契约测试完成纯规则完整局闭环。
- AC-06：UNO 与卧底回归（含 D4-U/D4-B 结果）与狼人杀的重放、快照恢复、不可变性、视角泄漏验证共同通过。
- AC-07：机器人与真人共用同一权威合法性入口。
- AC-08：逃生钩子数量恰好为 0。
- AC-09：`werewolf_legacy_platform_v2` 语义冻结，legacy 与已迁移快照均为 `wolfKillScope=non_wolf`。
- AC-10：`werewolf_platform_open_kill_v1` 保持 `internal_prototype` 平台变体，不作出 playable/权利/发布/官方/授权声明。
- AC-11：不声明稳定原语 v1（等待权威 commit 对比可用并通过全部成熟度门）。

**TDD 步骤：** 先冻结基线哈希复核 → Red（AC 相关断言测试）→ Green（复用候选原语重构，保持 legacy 语义冻结）→ 度量与证据收集 → 汇总报告。

**测试与验收：** AC-01..AC-11 全部通过并写入 D4-V 报告；两份 D1 哈希不变；`werewolf_legacy_platform_v2` 语义未变；无 playable/权利变更；全量质量门通过。

---

## 7. 最终完成条件

D4 阶段完成当且仅当：

1. **全部门**（D4-0、F1、F2、T、UI0、UI1（U-UI）、U、A1、A2、B、UI2（B-UI）、UI3、TOOLS、V）各自独立通过第 5.3 节质量门清单，且每门有结果报告。
2. **每门结果报告命名**：`docs/superpowers/reports/2026-08-05-d4-<gate>-results.md`，其中 `<gate>` 依次为 `0`、`f1`、`f2`、`t`、`ui0`、`u`、`u-ui`、`a1`、`a2`、`b`、`b-ui`、`ui3`、`tools`、`v`。每份报告必须包含：范围、文件白名单核对、测试检查点证据（含各质量门输出）、D1 哈希复核、「无 playable/权利变更」声明、延期项。
3. **终局全量验证**：最终工作树跑一次 `npm run ci`（typecheck+lint+test+compliance:d1）与 `npm run build`、build 后 `compliance:d1`、`git diff --check`，全部通过。
4. **冻结不变**：两份 D1 fixture 字节与 SHA-256 不变；`werewolf_legacy_platform_v2` 语义冻结；`uno_legacy_platform_v1` 与 `undercover_classic_v1` 保持可运行且未被替换。
5. **状态不变**：无任何 `playable`、权利、发布或目录准入状态变更；D4 完成不自动改变任何状态。
6. **无 Git 状态变更命令被执行**；所有改动以未提交工作树形式保留，供用户单独授权版本控制操作。

D4 完成后仅进入总结与人工审阅；稳定原语 v1 声明、权威 commit 对比、任何新游戏接入与媒体能力均需另行批准。

---

## 版本控制声明

本计划本身及其实施全程不创建或切换分支，不暂存、提交、推送、打标签、stash、reset 或 clean。执行检查点以测试检查点与主模型只读 diff 审阅替代。版本控制操作等待用户单独授权。
