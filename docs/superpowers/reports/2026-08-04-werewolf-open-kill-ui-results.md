# 狼人杀开放夜刀规则集与“月相审判桌”实施结果

## 范围与结论

本轮完成两项相互配套、但边界独立的内部原型交付：

1. 新增规则集 `werewolf_platform_open_kill_v1`，允许狼人夜间选择任意存活玩家，包括自己和狼人同伴。
2. 用原创“月相审判桌”替换旧狼人杀客户端页面，同时保留服务端权威 reducer、持久化、计时器、恢复、玩家/观战视角隔离和机器人正常动作链。

`werewolf_legacy_platform_v2` 没有被就地修改，仍保持狼人不能选择自己或狼人同伴的兼容语义。狼人杀整体仍为 `internal_prototype`，新增规则集的权利状态仍为 `unverified`；本轮不构成规则批准、权利批准、发布准入或上线授权。

## 权威规则集映射

状态 schema 从 3 升至 4，模块版本从 `0.3.0` 升至 `0.4.0`。当前规则映射为：

| 规则集 ID | 服务端派生 `wolfKillScope` | 夜刀合法目标 |
| --- | --- | --- |
| `werewolf_legacy_platform_v2` | `non_wolf` | 存活的非狼人玩家 |
| `werewolf_platform_open_kill_v1` | `any` | 全部存活玩家，包括自己和狼人同伴 |

服务端以 `rulesetId` 为权威输入并派生 `wolfKillScope`。正常 setup 只提交所选规则集 ID，目录不再暴露一个可与规则集互相矛盾的独立 `wolfKillScope` 选项。显式传入矛盾的规则集/范围组合会被拒绝；当前 schema 4 快照恢复也会重新执行相同校验，不能把矛盾配置克隆回运行中会话。

开放夜刀只扩大狼人击杀候选集。以下规则保持不变：

- 守卫不能自守，且不能连续两夜守同一目标。
- 女巫自救继续受 `witchSelfSave` 约束。
- 守护、解药、毒药、猎人、白痴、发言、投票、加赛和胜负结算继续由既有服务端流程裁定。
- 狼人平票仍按稳定席位顺序决定；超时 fallback 仍只从当前规则集的合法候选中选择。

规则机器人与 LLM 候选提示均改为消费公开视图中的规则范围，候选集合与 reducer 保持一致。提示文案同时按 `numbers` / `roles` 区分胜负条件，并排除已经翻牌且失去投票权的白痴。

## 迁移与恢复

新增相邻迁移 v3 → v4；v1、v2 和 v3 历史快照均沿既有迁移入口恢复到 schema 4，并固定为：

```text
rulesetId = werewolf_legacy_platform_v2
wolfKillScope = non_wolf
```

因此历史对局不会因新规则集出现而改变夜刀语义。有效的 schema 4 开放夜刀快照可以原样恢复；规则集与范围矛盾的 schema 4 快照会被拒绝。

`packages/server/tests/recovery.test.ts` 使用现有历史夹具验证 v1/v2/v3 启动恢复和重复恢复字节稳定性。本轮没有修改生产恢复链、数据库迁移或 `packages/server/src`。

## 客户端架构

新页面采用单向管线：

```text
服务端公开视图
→ parseWerewolfView 严格解析
→ buildWerewolfPresentation 纯表现映射
→ WerewolfStage 组件
→ useGameAction().act(既有动作载荷)
```

客户端不读取服务端快照、不本地推进阶段、不计算赢家，也不绕过 `game_action`。表现层只把服务端给出的阶段、计时、合法上下文、投票进度、投票结果和终局公开身份转换为可序列化 UI 模型。

运行时解析器只接受 schema 4 和两种已知规则集，并严格检查根/config/player/private/vote/reveal 字段。它接受不含 `me` 的正常观战视图并归一化为 `me: null`，拒绝旧 schema 3、规则集/范围矛盾，以及含警长或白狼王等未支持上游规则形状的视图。

原创组件包括：

- `MoonPhaseHeader`：天数、阶段叙事、氛围和服务端截止时间倒计时。
- `SeatRing`：6–12 人自适应席位环，9–12 人启用紧凑桌面布局；移动端改为两列席位网格。
- `PrivateRolePanel`：默认遮蔽私密身份，失焦、页面转后台或断线时重新遮蔽，重连后不自动揭示。
- `WerewolfActionPanel`：只渲染表现模型给出的现有动作，并在请求期间禁用重复提交。
- `VoteLedger`：只展示服务端投票进度与 tally。
- `GameOverReveal`：只展示服务端公开的终局身份。

旧 `NewGamePages.tsx` 内联狼人杀页面已经移除，UNO 与斗地主继续复用抽出的 `useGameAction`。旧 `.new-game-page--werewolf` 死样式也已删除。

## 视觉与交互边界

页面使用项目内 CSS 和系统字体实现月白、黑曜石、铜金与血红层级，包含文本/符号状态提示、键盘焦点、`aria-current` 和 reduced-motion 兼容。没有引入外部字体、头像、音频、Wolfcha 品牌或素材，也没有引入 Tailwind、Framer Motion、Radix、DiceBear 或 Wolfcha 依赖栈。

### 12 人真实链路验收

验收使用仓库外临时脚本创建内存 SQLite 应用，并通过现有测试夹具播种一间历史内部房间。一个后台房主和十个规则机器人均通过真实 WebSocket `resume_room` / `room_command` 链进入；浏览器作为第 12 名玩家通过正常加入、准备和自动开局路径进入。房间选择：

- 规则集：`werewolf_platform_open_kill_v1`（开放夜刀）。
- 节奏：轻松。
- 女巫自救：仅首夜。
- 胜负条件：屠边人数。

这只是测试环境的内部房间夹具，没有修改生产准入逻辑或加入任何运行时绕过。

#### 桌面 1440 × 1000

截图：

```text
C:\Users\87850\.zcode\cli\artifacts\sess_41b56371-f097-4fbc-8430-881a68c65b7d\call_KMrCpajA58kyJGo4vAED7m5A-tool-result-c81c4a0e-9eff-4e56-a361-805af3d71ff3.png
```

身份确认阶段的语义树显示 `审判桌，共 12 个席位`，私密身份按钮仍为“按下查看本人私密信息”。浏览器实测：

| 指标 | 结果 |
| --- | --- |
| 席位数 | 12 |
| 任意两张席位卡交叠 | 0 对 |
| 席位卡覆盖中央审判桌 | 0 张 |
| 席位卡覆盖阶段页头 | 0 张 |
| 席位环尺寸 | 1000 × 660 px |
| 中央桌尺寸 | 350 × 216.04 px |

#### 移动端 390 × 844

截图：

```text
C:\Users\87850\.zcode\cli\artifacts\sess_41b56371-f097-4fbc-8430-881a68c65b7d\call_kamQV6eqQVevUDCZ0QVGPH4Z-tool-result-d24efa48-61fb-4f8a-8c24-bc1e6fe9b5ec.png
```

对局已继续进入首日流程，语义树仍显示全部 12 个席位；私密身份保持遮蔽。浏览器实测：

| 指标 | 结果 |
| --- | --- |
| 席位数 | 12 |
| 任意两张席位卡交叠 | 0 对 |
| `main.clientWidth / scrollWidth` | 375 / 375 px |
| `documentElement.clientWidth / scrollWidth` | 375 / 375 px |
| 横向溢出 | 无 |
| 退出牌局按钮高度 | 44 px |
| 私密身份是否遮蔽 | 是 |

此前 6 人辅助验收也覆盖了 1440 × 1000 环形桌面和 390 × 844 两列移动布局，均未发现席位交叠或横向溢出。

## 测试证据

新增或强化的规则测试覆盖：

- 规则集 ID 对目标范围的权威映射。
- 未知规则集、非法范围和矛盾组合拒绝。
- legacy 拒绝自刀/刀同伴，open-kill 接受自刀/刀同伴。
- 席位稳定平票、超时 fallback、女巫救自刀狼人。
- 守卫拒绝自守、允许守被狼人同伴选择的狼人。
- 玩家与观战视图公开规则范围。
- v3 → v4 历史语义固定，以及 v4 有效恢复/矛盾拒绝。
- 规则机器人、LLM 候选和 reducer 合法性一致。
- 十个阶段的表现动作集，以及守卫、女巫、白痴、加赛、投票 ledger、终局 reveal 和观战解析边界。

最终自动化结果：

| 命令或门 | 实际结果 |
| --- | --- |
| 狼人杀/客户端聚焦选择 | 15/15 通过 |
| 包内全量测试 | 414/414 通过 |
| D1 扫描器契约测试 | 4/4 通过 |
| `npm run typecheck` | 退出码 0 |
| `npm run lint` | 退出码 0 |
| `npm run build` | 退出码 0；Vite 转换 1893 个模块 |
| 构建后 `npm run compliance:d1` | `D1 compliance: PASS` |
| `git diff --check` | 报告写入后再次执行，退出码 0 |

构建产物包含独立懒加载页面 `WerewolfGamePage-BeJoF8yR.js`，以及共享动作辅助与其余新游戏页面 chunk。

## D1 冻结与范围审计

两份 D1 黄金 fixture 未修改，SHA-256 仍为：

| 规则集 | SHA-256 |
| --- | --- |
| `uno_legacy_platform_v1` | `e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6` |
| `undercover_classic_v1` | `38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68` |

最终范围核对：

- 未改变 `werewolf_legacy_platform_v2` 语义。
- 未把任何游戏改为 `playable`。
- `internal_prototype`、`blocked_rights` 和权利批准边界不变；新增规则集权利状态为 `unverified`。
- 未实现警长/警徽、1.5 票、白狼王或守卫自守。
- 未复制 Wolfcha 源码、资产、品牌、音频、头像或依赖。
- 未修改生产恢复链或数据库迁移。
- 客户端仍为服务端权威；机器人仍走正常玩家视图和权威动作路径。

## 与 D2 的关系

本轮狼人杀规则与页面交付和当前工作树中的 D2 低风险原语包并存，但不提升 D2 原语成熟度。后续完成的 D2 visibility 第四包已使 `visibility` 达到候选并完成 D2 获批范围；该结论来自 UNO 与《谁是卧底》的独立真实消费者迁移，不来自狼人杀页面。`random` 与 `cards` 仍为实验、`turns` 与 `visibility` 仍为候选，D3/D4、统一桌面和七款新游戏仍未完成，也不得据此进入产品发布开发。

## 版本控制

本轮未创建或切换分支，未暂存、提交、推送、打标签、stash、reset 或 clean。所有狼人杀与既有 D2 改动继续以未提交工作树形式保留，供后续人工审阅。
