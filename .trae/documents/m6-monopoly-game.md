# M6 大富翁11 游戏接入计划（以大富翁11为基座）

> [!CAUTION]
> **当前状态（2026-08-02）：被 D1 合规/权利准入阻断，禁止实施。** 本文是 D1 建立前形成的历史设计草案，仅保留需求与探索上下文，不是可执行计划。当前 `compliance/d1/game-admission.json` 没有 `richman` 准入记录，现有游戏权利证据也均未完成；因此不得据本文新增包、注册目录/路由、复制专有规则或素材，也不得把合规问题记为“后续确认”。下文任何“先 `coming_soon`、测试或 CI 通过后直接切 `playable`”的旧路线均已失效。
>
> **解除阻断的前置条件**：先完成规则来源与权利边界审查，在 D1 台账中取得 `approved` 状态及完整 `recordId / scope / expiresAt / rightsApprover / rulesApprover` 证据，并由合规检查确认允许的命名、规则表达、素材与发布范围。只有完成准入后，才能基于获准范围重新立项；测试通过不能替代权利准入，也不能单独触发 `playable`。

## 背景

用户要求接入大富翁游戏，明确"主要基于大富翁11作为基座游戏规则设计"。这意味着不是经典美式 Monopoly + 扩展，而是直接以大宇资讯的大富翁11（RichMan 11）作为基座游戏。

### 大富翁11核心规则（来自攻略确认）

| 系统 | 内容 |
|---|---|
| **棋盘** | 环形棋盘，含街道概念（同一街道房产一起算租金）；3 种地图模式：传统/抢房/热斗 |
| **骰子** | 双骰移动；载具加骰子数；部分卡片影响骰子 |
| **物价指数** | 影响租金、热斗金钱增减、事件收支；会随时变动 |
| **地产** | 买地、建房升级、收租；同一街道房产一起算租金 |
| **股票** | 路过银行可调整现金/存款比例；存款每月银行结算收利息 |
| **卡片** | 45+ 种；商店用钱买；分建筑/移动/攻击/神仙/财务/状态六类 |
| **神仙** | 5 对 10 种：财神/穷神、福神/衰神、天使/恶魔、土地公/糊涂神、武神/凶神 |
| **大型建筑** | 7 种：商业中心、大饭店、地产公司、书店、能源中心、研究所、公园 |
| **机关** | 地图上机关踩上去变动；改变路径或效果 |
| **角色天赋** | 14 个角色，每人 2 个天赋，影响神仙附身/卡片效果/租金加减 |
| **胜利** | 所有对手破产 或 限时后资产最多者获胜 |

预估总代码量 8000-12000 行，分 **三个里程碑**。

---

## 当前状态分析

### 现有游戏集成模式（来自 Phase 1 探索）

新游戏在 `packages/games/<id>/` 下成包，结构：

```
packages/games/<id>/
├── package.json             # name=@ldj/game-<id>, exports: ./manifest + ./server
├── shared/manifest.ts       # <ID>_MANIFEST: {id, displayName, version, minPlayers, maxPlayers, stateSchemaVersion}
├── server/
│   ├── state.ts             # zod schema + State/Action/Event/Result 类型
│   ├── views.ts             # buildPlayerView / buildSpectatorView（视角隔离）
│   ├── module.ts            # GameModule<C,S,A,PV,SV,E,R> 实现（纯函数 reduce）
│   ├── bot.ts               # pickXxxBotAction 规则策略（必选）
│   ├── botPrompt.ts         # buildXxxBotPrompt LLM 材料（可选）
│   ├── index.ts             # re-export 全部公开符号
│   └── (资源文件)            # words.ts / cards.ts / board.ts 等
└── tests/module.test.ts     # 纯函数状态机测试
```

### 接入新游戏的固定改动点

| 文件 | 改动 |
|---|---|
| `packages/shared/src/game/catalog.ts:23-78` | 历史接入模式曾为追加目录项并从 `coming_soon` 切 `playable`；此路线对本计划已失效，须先完成 D1 准入 |
| `packages/server/src/core/game/registry.ts:3-8` | `import` + 加入 `MODULES` 数组 |
| `packages/server/package.json:10` | `dependencies` 加 `"@ldj/game-<id>": "*"` |
| `packages/client/src/game/GamePage.tsx:83-94` | `switch (game.moduleId)` 加 case |

### 不需要改的文件

`ws.ts`、`session.ts`、botRunner.ts、protocol/messages.ts、envelope.ts——对 gameId 完全无感知，靠 `rooms.game_id → game_sessions.module_id → registry.getModule(id)` 自动路由。

### 参考样板

- 完整复杂度参考：`packages/games/undercover/server/module.ts`（586 行，纯函数状态机 + 视角隔离 + 词库 + 规则机器人 + LLM 机器人）
- 卡牌资源参考：`packages/games/landlord/server/cards.ts`
- 简化客户端 UI 模式：`packages/games/uno` 的 `NewGamePages.tsx` 风格（用 `Record<string, unknown>` 不建强类型镜像，顶部 eslint-disable）

---

## 提议的改动

### 里程碑划分（以大富翁11为基座）

```
M6.1 大富翁11 核心 MVP（可玩基座）
  └─ M6.1.1 包骨架 + 棋盘数据 + manifest + catalog 注册
  └─ M6.1.2 状态机基础：双骰移动 + 过起点 + 买地 + 街道收租 + 破产
  └─ M6.1.3 卡片系统（核心特色，先放 15 种高频卡片）
  └─ M6.1.4 神仙附身系统（5 对 10 种神仙）
  └─ M6.1.5 客户端 UI 基础（棋盘 + 玩家面板 + 卡片手牌 + 操作按钮）
  └─ M6.1.6 规则机器人 + 测试 + CI 通过

M6.2 大富翁11 扩展系统
  └─ M6.2.1 股票市场系统（核心特色）
  └─ M6.2.2 大型建筑系统（7 种）
  └─ M6.2.3 物价指数系统
  └─ M6.2.4 机关系统（地图机关）
  └─ M6.2.5 监狱/医院/银行 等特殊格完整规则
  └─ M6.2.6 卡片扩充到完整 45+ 种
  └─ M6.2.7 角色天赋系统（14 角色）

M6.3 完善与机器人智能化
  └─ M6.3.1 多地图模式（传统/抢房/热斗）
  └─ M6.3.2 LLM 机器人 prompt（含股票决策）
  └─ M6.3.3 UI 动画与音效
  └─ M6.3.4 真实聚会验收
```

---

## M6.1 大富翁11 核心 MVP（历史拟实施里程碑；当前禁止执行）

### 设计决策

| 项 | 决定 | 理由 |
|---|---|---|
| gameId | `richman` | 大富翁11英文 RichMan；不与已有 id 冲突 |
| 包名 | `@ldj/game-richman` | 遵循现有命名规范 |
| displayName | `大富翁` | 中文友好 |
| minPlayers | 2 | 大富翁11支持 2-4 人 |
| maxPlayers | 4 | 大富翁11标准上限 |
| stateSchemaVersion | 1 | 新游戏首版 |
| 初始资金 | 15000 | 大富翁11标准 |
| 过起点奖金 | 2000 | 大富翁11标准 |
| 棋盘格数 | 40 | 大富翁11环形棋盘约 40 格 |
| 街道数 | 8 条 | 每条街道 3-5 块地产 |
| 起始位置 | 起点（位置 0） | 大富翁11标准 |
| 卡片手牌上限 | 5 张 | 大富翁11标准 |
| 神仙附身持续 | 5 回合 | 大富翁11标准（角色天赋可调整） |
| 视角隔离 | 玩家看不到他人手牌/未翻开的卡 | 与 undercover 一致 |

### 棋盘数据（图结构，含中间连通路径）

**关键设计**：棋盘不是单一环形，而是**外环 + 中间连通路径**的图结构，整体闭环。玩家在分叉点可选择路径，增加策略性。这是大富翁11真实地图的核心特色。

**布局总览**：
- 外环 40 格（位置 0–39，主路径，顺时针）
- 中间十字连通路径 4 条（每条 5 格，含两端入口）
  - 北南线：连接位置 10 ↔ 30，中间 5 格（位置 40–44）
  - 东西线：连接位置 0 ↔ 20，中间 5 格（位置 45–49）
  - 对角线 1：连接位置 5 ↔ 25，中间 5 格（位置 50–54）
  - 对角线 2：连接位置 15 ↔ 35，中间 5 格（位置 55–59）
- **总地块数：60 格**
- **4 个分叉点**：位置 0/10/20/30 是外环与中间路径的交汇点（玩家在此可选择走外环还是中间路径）

**图结构表示**：每个 space 有 `nextSpaces: number[]` 字段描述后继节点。例如位置 10 的 `nextSpaces = [11, 40]`（顺时针外环下一格 11，或中间路径 40）。

**移动逻辑**：
- 掷骰后按 `direction` 沿路径移动
- 遇到分叉点（`nextSpaces.length > 1`）时，若仍有步数剩余则触发 `choose_path` action 让玩家选择
- 玩家不选则默认走外环
- 中间路径上的格子也可买地/收租/触发效果

**外环 40 格（位置 0–39，按经典大富翁布局）**：

| # | 名称 | 类型 | 街道 | 价格 | 基础租金 | 备注 |
|---|---|---|---|---|---|---|
| 0 | 起点 | special:go | - | - | - | 分叉点（接东西线） |
| 1 | 樱花街 1 号 | property | sakura | 500 | 50 | |
| 2 | 樱花街 2 号 | property | sakura | 500 | 50 | |
| 3 | 樱花街 3 号 | property | sakura | 600 | 60 | |
| 4 | 卡片商店 | shop:card | - | - | - | |
| 5 | 梅花街 1 号 | property | plum | 700 | 70 | 分叉点（接对角线 1） |
| 6 | 梅花街 2 号 | property | plum | 700 | 70 | |
| 7 | 梅花街 3 号 | property | plum | 800 | 80 | |
| 8 | 命运 | action:fate | - | - | - | 神仙台 |
| 9 | 竹林街 1 号 | property | bamboo | 900 | 90 | |
| 10 | 竹林街 2 号 | property | bamboo | 900 | 90 | 分叉点（接北南线） |
| 11 | 竹林街 3 号 | property | bamboo | 1000 | 100 | |
| 12 | 银行 | special:bank | - | - | - | |
| 13 | 菊花街 1 号 | property | chrysanthemum | 1100 | 110 | |
| 14 | 菊花街 2 号 | property | chrysanthemum | 1100 | 110 | |
| 15 | 菊花街 3 号 | property | chrysanthemum | 1200 | 120 | 分叉点（接对角线 2） |
| 16 | 机会 | action:chance | - | - | - | 神仙台 |
| 17 | 枫叶街 1 号 | property | maple | 1300 | 130 | |
| 18 | 枫叶街 2 号 | property | maple | 1300 | 130 | |
| 19 | 枫叶街 3 号 | property | maple | 1400 | 140 | |
| 20 | 卡片商店 | shop:card | - | - | - | 分叉点（接东西线） |
| 21 | 银杏街 1 号 | property | ginkgo | 1500 | 150 | |
| 22 | 银杏街 2 号 | property | ginkgo | 1500 | 150 | |
| 23 | 银杏街 3 号 | property | ginkgo | 1600 | 160 | |
| 24 | 命运 | action:fate | - | - | - | 神仙台 |
| 25 | 松柏街 1 号 | property | pine | 1700 | 170 | 分叉点（接对角线 1） |
| 26 | 松柏街 2 号 | property | pine | 1700 | 170 | |
| 27 | 松柏街 3 号 | property | pine | 1800 | 180 | |
| 28 | 监狱 | special:jail | - | - | - | |
| 29 | 荷花街 1 号 | property | lotus | 1900 | 190 | |
| 30 | 荷花街 2 号 | property | lotus | 1900 | 190 | 分叉点（接北南线） |
| 31 | 荷花街 3 号 | property | lotus | 2000 | 200 | |
| 32 | 机会 | action:chance | - | - | - | 神仙台 |
| 33 | 牡丹街 1 号 | property | peony | 2200 | 220 | |
| 34 | 牡丹街 2 号 | property | peony | 2200 | 220 | |
| 35 | 牡丹街 3 号 | property | peony | 2400 | 240 | 分叉点（接对角线 2） |
| 36 | 卡片商店 | shop:card | - | - | - | |
| 37 | 玉兰街 1 号 | property | magnolia | 2800 | 280 | |
| 38 | 玉兰街 2 号 | property | magnolia | 2800 | 280 | |
| 39 | 玉兰街 3 号 | property | magnolia | 3000 | 300 | |

外环：24 地产 + 3 卡片商店 + 2 命运 + 2 机会 + 1 银行 + 1 监狱 + 1 起点 = 34。剩余 6 格为分叉点本身（位置 0/5/10/15/20/25/30/35，部分与上述重合，因为分叉点本身也可以是地产）。

**中间路径 4 条（位置 40–59，共 20 格）**：

| # | 名称 | 类型 | 街道 | 价格 | 基础租金 | 所属路径 |
|---|---|---|---|---|---|---|
| 40 | 中央大道 1 号 | property | central | 2000 | 200 | 北南线 |
| 41 | 中央大道 2 号 | property | central | 2000 | 200 | 北南线 |
| 42 | 中央广场 | special:plaza | - | - | - | 北南线（M6.2 大型建筑预留） |
| 43 | 中央大道 3 号 | property | central | 2200 | 220 | 北南线 |
| 44 | 中央大道 4 号 | property | central | 2200 | 220 | 北南线 |
| 45 | 横贯路 1 号 | property | traverse | 1800 | 180 | 东西线 |
| 46 | 横贯路 2 号 | property | traverse | 1800 | 180 | 东西线 |
| 47 | 横贯广场 | special:plaza | - | - | - | 东西线（M6.2 大型建筑预留） |
| 48 | 横贯路 3 号 | property | traverse | 2000 | 200 | 东西线 |
| 49 | 横贯路 4 号 | property | traverse | 2000 | 200 | 东西线 |
| 50 | 斜阳街 1 号 | property | sunset | 2400 | 240 | 对角线 1 |
| 51 | 斜阳街 2 号 | property | sunset | 2400 | 240 | 对角线 1 |
| 52 | 斜阳广场 | special:plaza | - | - | - | 对角线 1（M6.2 大型建筑预留） |
| 53 | 斜阳街 3 号 | property | sunset | 2600 | 260 | 对角线 1 |
| 54 | 斜阳街 4 号 | property | sunset | 2600 | 260 | 对角线 1 |
| 55 | 月华街 1 号 | property | moonlight | 2800 | 280 | 对角线 2 |
| 56 | 月华街 2 号 | property | moonlight | 2800 | 280 | 对角线 2 |
| 57 | 月华广场 | special:plaza | - | - | - | 对角线 2（M6.2 大型建筑预留） |
| 58 | 月华街 3 号 | property | moonlight | 3000 | 300 | 对角线 2 |
| 59 | 月华街 4 号 | property | moonlight | 3000 | 300 | 对角线 2 |

**中间路径连接关系**（图边）：

```
外环位置 10 ─┬─ 40 ─ 41 ─ 42 ─ 43 ─ 44 ─ 外环位置 30   (北南线)
             └─ 外环位置 11 (继续外环)

外环位置 0  ─┬─ 45 ─ 46 ─ 47 ─ 48 ─ 49 ─ 外环位置 20   (东西线)
             └─ 外环位置 1  (继续外环)

外环位置 5  ─┬─ 50 ─ 51 ─ 52 ─ 53 ─ 54 ─ 外环位置 25   (对角线 1)
             └─ 外环位置 6  (继续外环)

外环位置 15 ─┬─ 55 ─ 56 ─ 57 ─ 58 ─ 59 ─ 外环位置 35   (对角线 2)
             └─ 外环位置 16 (继续外环)
```

逆时针方向同理（每个分叉点都有两个后继：外环下一格 + 中间路径首格）。

**总地产数**：24（外环）+ 4×4=16（中间路径）= 40 地产，分布在 12 条街道（外环 8 + 中间 4）。
**总格数**：40（外环）+ 20（中间）= 60 格。

**4 个广场格**（位置 42/47/52/57）为 M6.2 大型建筑预留位置，M6.1 阶段为"空地"无效果。

### 街道租金规则（大富翁11核心特色）

落地到他人地产时：
- 单块地产基础租金
- 拥有同街道全部地产 → 租金 ×2（垄断加成）
- 同街道其他地产也有建筑 → 每栋加成（M6.1 简化：只有"是否垄断"两档；M6.2 加入建筑升级）

### 路径选择规则（图结构核心特色）

- 玩家掷骰后，沿当前 direction 移动
- 遇到分叉点（`nextSpaces.length > 1`）且仍有剩余步数时：
  - 触发 `pendingAction: { type: 'choose_path', options: nextSpaces }`
  - 玩家发送 `choose_path` action 选择路径
  - 不选（超时）则默认走外环（`nextSpaces[0]`，外环优先）
- 中间路径走完后会回到外环（自然闭环）
- 转向卡切换 direction 后，分叉点的"外环下一格"也会反向

### 卡片系统（M6.1 先放 15 种高频卡片）

从 45+ 种中精选 15 种作为 MVP：

| 卡片 | 类型 | 效果 |
|---|---|---|
| 购地卡 | building | 强制购买当前所在地的地产（即使属于他人，半价强购） |
| 改建卡 | building | 升级当前所在地建筑 1 级 |
| 停业卡 | building | 让对手某地产停业 3 回合（无租金） |
| 遥控骰子卡 | move | 下次掷骰指定点数（1-12） |
| 停留卡 | move | 下次掷骰结果为 0（原地不动） |
| 转向卡 | move | 改变移动方向（顺时针↔逆时针） |
| 路障卡 | move | 在某格设置路障，对手经过时停止 |
| 飞弹卡 | attack | 对前方 3 格内某玩家造成 1500 伤害 |
| 地雷卡 | attack | 在某格埋地雷，对手踩到造成 1000 伤害 |
| 请神卡 | god | 召唤指定神仙附身自己 |
| 送神卡 | god | 把附身自己的神仙送给前方 3 格内最近对手 |
| 查账卡 | finance | 查看某对手的现金与存款（M6.1 仅现金） |
| 均富卡 | finance | 所有玩家现金平均分配 |
| 免费卡 | defense | 免疫下一次伤害或租金 |
| 涨价卡 | finance | 让某街道地产租金 ×2 持续 5 回合 |

每张卡片有 `useDistance`（使用距离，单位：格），仅对距离内的目标生效。

### 神仙系统（M6.1 完整 5 对 10 种）

| 神仙 | 效果 | 持续 |
|---|---|---|
| 财神 | 每回合开始 +1000 现金 | 5 回合 |
| 穷神 | 每回合开始 -1000 现金 | 5 回合 |
| 福神 | 落地买地半价 | 5 回合 |
| 衰神 | 落地买地双倍价 | 5 回合 |
| 天使 | 落地免租金 | 5 回合 |
| 恶魔 | 落地付双倍租金 | 5 回合 |
| 土地公 | 过起点双倍奖金 | 5 回合 |
| 糊涂神 | 过起点无奖金 | 5 回合 |
| 武神 | 攻击卡伤害 ×2 | 5 回合 |
| 凶神 | 受到攻击伤害 ×2 | 5 回合 |

附身触发：
- 落到神仙格（地图上随机分布，M6.1 暂定位置 8/16/24/32 为"神仙台"）→ 召唤随机神仙附身自己
- 用"请神卡"主动召唤
- 用"送神卡"送给距离内最近对手

### 阶段任务分解

#### M6.1.1 包骨架 + 棋盘数据 + manifest + catalog 注册

**新增文件**：

- `packages/games/richman/package.json`：`@ldj/game-richman`，exports `./manifest` + `./server`

- `packages/games/richman/shared/manifest.ts`：
  ```ts
  export const RICHMAN_MANIFEST = {
    id: 'richman',
    displayName: '大富翁',
    version: '0.1.0',
    minPlayers: 2,
    maxPlayers: 4,
    stateSchemaVersion: 1,
  } as const satisfies GameManifest;
  ```

- `packages/games/richman/server/board.ts`：导出 `BOARD_SPACES`（40 项）、`STREETS`（8 条街道映射）、`STREET_PROPERTY_COUNT`、`getStreetOf(spaceIndex)` 等。约 250 行。

- `packages/games/richman/server/cards.ts`：导出 `CARD_DEFINITIONS`（15 张卡片定义，含 id/type/effect/useDistance/description/price）。约 200 行。

- `packages/games/richman/server/gods.ts`：导出 `GOD_DEFINITIONS`（10 种神仙定义，含 id/name/effect/duration/description）。约 100 行。

- `packages/games/richman/server/index.ts`：re-export 全部公开符号。

- `packages/games/richman/tests/board.test.ts`：校验棋盘数据不变量——40 格、24 地产、8 街道各 3 块、3 卡片商店、2 命运、2 机会、1 银行、1 监狱、1 起点；街道归属正确；价格递增。约 80 行测试。

- `packages/games/richman/tests/cards.test.ts`：校验卡片定义不变量——15 张卡片、每张有 useDistance 与 price、效果描述完整。约 60 行测试。

- `packages/games/richman/tests/gods.test.ts`：校验神仙定义不变量——10 种神仙、5 对正反、每对效果相反。约 50 行测试。

**修改文件**：

- `packages/shared/src/game/catalog.ts`：在 `GAME_CATALOG` 末尾追加：
  ```ts
  {
    id: 'richman',
    displayName: '大富翁',
    minPlayers: 2,
    maxPlayers: 4,
    availability: 'coming_soon',  // 历史草案示例；不得在测试后直接切 playable，须先完成 D1 准入
    summary: '买地、收租、用卡片、召神仙，经典大富翁11玩法。',
    tags: ['策略', '经营', '经典'],
    theme: 'ocean',
    comingSoonMessage: '正在准备棋盘与规则',
  }
  ```

- `packages/server/package.json:10`：`dependencies` 加 `"@ldj/game-richman": "*"`

#### M6.1.2 状态机基础：双骰移动 + 过起点 + 买地 + 街道收租 + 破产

**新增文件**：

- `packages/games/richman/server/state.ts`：zod schema + 类型定义。约 300 行。
  ```ts
  // 核心类型
  export interface RichmanConfig {
    startingCash: number;       // 15000
    passGoBonus: number;        // 2000
    maxHandCards: number;       // 5
    godDurationTurns: number;   // 5
  }
  export type RichmanPhase = 'rolling' | 'awaiting_action' | 'awaiting_card_target' | 'game_over';
  export interface DiceRoll { d1: number; d2: number; total: number; isDoubles: boolean; }
  export interface PlayerState {
    id: string;
    cash: number;
    position: number;
    direction: 1 | -1;       // 顺时针/逆时针
    isBankrupt: boolean;
    skipTurns: number;        // 监狱剩余回合（M6.1.5 阶段加监狱规则）
    activeGodId: string | null;
    godTurnsRemaining: number;
    handCards: string[];       // 卡片 id 数组
    activeEffects: ActiveEffect[];  // 涨价卡/停留卡等持续效果
  }
  export interface PropertyOwnership {
    spaceIndex: number;
    ownerId: string | null;
    buildingLevel: number;    // 0=空地 1-3=小屋/大楼/酒店（M6.1 简化只到 1，M6.2 完整升级）
    isClosed: boolean;        // 停业状态
    closedTurnsRemaining: number;
  }
  export interface CardInstance {
    instanceId: string;       // 唯一实例 id（防重）
    cardId: string;           // 卡片定义 id
  }
  export interface RichmanState {
    schemaVersion: 1;
    phase: RichmanPhase;
    players: string[];
    currentPlayerId: string;
    playerState: Record<string, PlayerState>;
    ownership: Record<number, PropertyOwnership>;
    cardDeck: CardInstance[];   // 牌堆
    cardDiscardPile: CardInstance[];  // 弃牌堆
    lastRoll: DiceRoll | null;
    pendingAction: { type: 'buy_property' | 'pay_rent' | 'none'; spaceIndex: number; amount?: number } | null;
    pendingCard: { cardId: string; awaitTarget: 'player' | 'space' | 'none' } | null;
    turnNumber: number;
    monthCounter: number;      // 每过一圈所有人过起点时 +1，影响银行结算（M6.2 用）
    winnerId: string | null;
    log: LogEntry[];
  }
  export type RichmanAction =
    | { type: 'roll_dice' }
    | { type: 'buy_property' }
    | { type: 'decline_buy' }
    | { type: 'pay_rent' }
    | { type: 'end_turn' }
    | { type: 'buy_card'; cardId: string }           // 在卡片商店买卡片
    | { type: 'use_card'; instanceId: string; target?: { type: 'player'; id: string } | { type: 'space'; index: number } }
    | { type: 'discard_card'; instanceId: string }
    | { type: 'summon_god'; godId: string };            // 仅神台格子触发
  export interface RichmanResult { winnerId: string; finalBalances: Record<string, number>; }
  ```

- `packages/games/richman/server/module.ts`：`richmanModule: GameModule<...>` 主体。约 600 行（M6.1.2 范围）。
  - `parseConfig`：默认 `{ startingCash: 15000, passGoBonus: 2000, maxHandCards: 5, godDurationTurns: 5 }`
  - `parseAction`：zod schema 校验
  - `createInitialState`：初始化玩家、`position:0`、`cash: startingCash`、`ownership: {}`、`cardDeck: shuffleCardDeck()`（初始 30 张随机卡片，5 种各 6 张）
  - `reduce`：处理 `roll_dice` / `buy_property` / `decline_buy` / `pay_rent` / `end_turn` / `buy_card` / `use_card` / `discard_card` / `summon_god`
    - `roll_dice`：用 `ctx.random` 生成 d1/d2，计算新位置（处理方向、过起点）、判断停在何种格子（property/shop/action/special:bank/jail/go）、触发落地效果（抽卡/付租金/买地选项/神台召唤）
    - `buy_property`：扣钱、设 ownerId（考虑福神半价/衰神双倍）
    - `pay_rent`：计算租金（考虑街道垄断加成/天使免租/恶魔双倍/涨价卡）
    - `use_card`：执行卡片效果（购地/改建/停业/遥控骰子/停留/转向/路障/飞弹/地雷/请神/送神/查账/均富/均贫/免费/涨价）
    - `summon_god`：随机选一个神仙附身
    - `end_turn`：切换 currentPlayerId、刷新神仙剩余回合、刷新停业地产剩余回合、刷新持续效果剩余回合
  - `getPlayerView`：返回当前玩家视角（含自己的手牌、所有玩家的现金与位置与附身神仙、地产归属与建筑等级、最近一次掷骰、当前 pendingAction）
  - `getSpectatorView`：旁观者视角（不含手牌）
  - `getResult`：winnerId 或 null

- `packages/games/richman/server/views.ts`：`buildPlayerView` / `buildSpectatorView` 白名单视图生成。约 180 行。

**测试**：`packages/games/richman/tests/module.test.ts` 启动（M6.1.2 阶段）：覆盖初始状态、合法掷骰、移动方向、过起点、买地、街道收租（含垄断加成）、破产。约 400 行测试。

#### M6.1.3 卡片系统（核心特色）

**扩展 `module.ts`**：约 +500 行
- 卡片购买：落到卡片商店格，玩家可选择花费 X 元买一张牌（M6.1 简化为商店固定价格 500 元/张，从牌堆顶抽）
- 卡片使用：每回合可用 1 张卡片（大富翁11标准），使用后入弃牌堆
- 卡片效果实现：
  - `购地卡`：强制购买当前所在地（即使他人所有，半价）
  - `改建卡`：升级当前建筑 1 级
  - `停业卡`：选目标玩家某地产停业 3 回合
  - `遥控骰子卡`：下次掷骰指定 1-12
  - `停留卡`：下次掷骰结果为 0
  - `转向卡`：切换方向
  - `路障卡`：在指定格设路障
  - `飞弹卡`：对距离内某玩家 -1500 现金
  - `地雷卡`：在指定格埋地雷
  - `请神卡`：召唤指定神仙
  - `送神卡`：把附身神仙送给距离内对手
  - `查账卡`：查看目标现金（仅视角，不改资金）
  - `均富卡`：所有玩家现金平均
  - `免费卡`：免疫一次伤害或租金
  - `涨价卡`：让某街道租金 ×2 持续 5 回合

- 路障与地雷状态：`RichmanState` 加 `hazards: { spaceIndex: number; type: 'roadblock' | 'landmine'; placedBy: string }[]`

**扩展测试**：每种卡片至少一个测试，覆盖：合法使用、距离限制、目标合法性、效果生效、入弃牌堆。

#### M6.1.4 神仙附身系统

**扩展 `module.ts`**：约 +200 行
- 落到神仙台（位置 8/16/24/32）→ `summon_god` action，随机选一个神仙附身自己
- 每回合开始时：
  - 财神：+1000 现金
  - 穷神：-1000 现金（可能触发破产）
  - 土地公：本回合过起点双倍
  - 糊涂神：本回合过起点无奖金
  - 福神/衰神/天使/恶魔/武神/凶神：影响落地行为
- `godTurnsRemaining` 每回合 -1，归零时神仙离开
- 用"请神卡"主动召唤指定神仙（覆盖现有附身）
- 用"送神卡"把附身神仙送给距离内对手

**扩展测试**：每种神仙至少一个测试，覆盖附身、效果生效、持续回合、离开。

#### M6.1.5 客户端 UI 基础

**新增文件**：

- `packages/client/src/game/RichmanGamePage.tsx`：主页面组件。约 500 行。
  - 顶部：当前玩家信息（现金、位置、方向、附身神仙图标）
  - 中部：棋盘网格（环形布局，11×11 外环，40 格按经典大富翁棋盘布局）
    - 每格显示：名字、价格、当前归属（颜色条）、建筑等级、街道归属（同色边框）
    - 当前玩家位置高亮（玩家头像 token）
    - 路障/地雷 hazard 标记
  - 底部：操作面板（掷骰按钮、买地按钮、付租金按钮、买卡按钮、用卡按钮、结束回合按钮）
  - 右侧：玩家列表（按现金排序，破产者灰色，附身神仙图标显示在头像旁）
  - 左侧：操作日志时间线
  - 弹层：卡片商店（购买卡片）、卡片选择（使用卡片）、目标选择（选玩家或格子）

- `packages/client/src/game/RichmanBoard.tsx`：棋盘组件。约 350 行。
  - CSS Grid 11×11 布局，外环 40 格
  - 每格根据 type 渲染不同样式（property 显示街道颜色 + 价格 + 建筑等级、shop 显示商店图标、action 显示"?"、bank 显示银行、jail 显示监狱、go 显示起点）
  - 玩家 token 用绝对定位叠加在格子上（多个玩家同格时错位显示）
  - hazard 标记（路障/地雷）显示在格子角落

- `packages/client/src/game/RichmanPlayerPanel.tsx`：玩家列表面板。约 180 行。

- `packages/client/src/game/RichmanActionLog.tsx`：操作日志时间线。约 120 行。

- `packages/client/src/game/RichmanHandCards.tsx`：玩家手牌组件。约 150 行。
  - 显示当前玩家持有的卡片（最多 5 张）
  - 点击卡片查看效果与使用距离
  - 使用按钮 → 进入目标选择模式

- `packages/client/src/styles.css` 追加：`.richman-board` / `.richman-space` / `.richman-space--property` / `.richman-token` / `.richman-player-panel` / `.richman-hand-card` / `.richman-god-icon` 等类。约 250 行 CSS。

**修改文件**：

- `packages/client/src/game/GamePage.tsx:83-94`：switch 加 `case 'richman': return <RichmanGamePage view={game.view as Record<string, unknown>} /><GameChatDrawer />`

#### M6.1.6 规则机器人 + 测试 + CI 通过

**新增文件**：

- `packages/games/richman/server/bot.ts`：`pickRichmanBotAction(input)` 规则策略。约 150 行。
  - `phase === 'rolling'` → `roll_dice`
  - `pendingAction.type === 'buy_property'` 且现金 > 价格 × 2 → `buy_property`（保守策略）
  - `pendingAction.type === 'pay_rent'` → `pay_rent`
  - 在卡片商店：现金 > 2000 且手牌 < 3 → `buy_card`
  - 手中有"飞弹卡"且距离内有对手 → `use_card`（攻击）
  - 手中有"均富卡"且自己现金低于平均 → `use_card`
  - 手中有"请神卡"且未附身 → `use_card`
  - 手中有"免费卡"且下一格是他人地产 → `use_card`
  - 其他 → `end_turn`

**扩展测试**：`packages/games/richman/tests/module.test.ts` 补全到约 800 行测试。覆盖：
- 视角隔离（玩家看不到他人手牌）
- 纯函数不可变（reduce 不改入参）
- 确定性重放
- 边界值（现金正好等于价格、过起点位置正好是 GO）
- 破产清算
- 神仙附身完整生命周期
- 卡片效果生效与目标合法性
- 街道垄断加成
- 路障/地雷 hazard 触发

**修改文件**：

- `packages/server/src/core/game/registry.ts:3-8`：加 `import { richmanModule } from '@ldj/game-richman/server';` 并加入 `MODULES` 数组。
- 历史草案曾要求把 `packages/shared/src/game/catalog.ts` 从 `coming_soon` 切到 `playable`；该步骤现已失效，不能在 D1 准入前执行。

**CI 验证**：`npm run ci`（typecheck + lint + test）全绿。

---

## M6.2 大富翁11扩展系统（后续里程碑，概要）

### M6.2.1 股票市场系统
- 5-8 只虚构股票（科技/地产/能源/消费/医疗等板块）
- 每回合开始时价格波动（基于 random + 事件触发）
- 落到银行格子可调整现金/存款比例
- 存款每月（每过一圈）银行结算利息
- 新 action：`buy_stock` / `sell_stock` / `adjust_deposit`
- 客户端：股票行情看板 UI

### M6.2.2 大型建筑系统（7 种）
- 商业中心：所在街道所有地产租金 +50%
- 大饭店：所在地租金 ×3
- 地产公司：可强制收购对手同街道某地产
- 书店：每回合抽 1 张卡片
- 能源中心：免疫所有攻击卡
- 研究所：手牌上限 +3
- 公园：所在地免租金
- 新 action：`build_large_building` / `demolish_large_building`

### M6.2.3 物价指数系统
- 每回合开始物价波动（0.8x - 1.5x）
- 影响租金、伤害卡金额、事件收支
- 客户端：物价指数显示

### M6.2.4 机关系统
- 地图上机关格踩上去变动
- 改变路径：打开/关闭捷径
- 触发效果：传送/陷阱/奖励
- 新 action：`toggle_mechanism`

### M6.2.5 监狱/医院/银行 完整规则
- 监狱：停留 3 回合或付 500 出狱
- 医院：受伤到一定金额强制住院
- 银行：存款利息结算、贷款

### M6.2.6 卡片扩充到完整 45+ 种
- 攻击类补充：定时炸弹卡、量子飞弹卡、炸药卡、陷阱卡
- 移动类补充：梦游卡、冬眠卡、传送卡、随意门卡、传送门卡、机车卡、汽车卡、魔术卡、启动卡、急速弹卡
- 建筑类补充：换屋卡、工程车卡、怪兽卡、机器工人卡
- 财务类补充：同命卡、转移卡、无懈卡、谋划卡、机器娃娃卡
- 状态类补充：超级骰子卡、辉煌卡、窘困卡、绿化卡、灾祸卡、神眷卡、香蕉皮卡、果冻墙卡

### M6.2.7 角色天赋系统（14 角色）
- 14 个角色可选，每人 2 个天赋
- 影响神仙附身时间、卡片效果、租金加减、特殊免疫
- 客户端：选角色 UI

---

## M6.3 完善与机器人智能化（后续里程碑）

### M6.3.1 多地图模式
- 传统地图：标准买地收租
- 抢房地图：部分初始地块已有建筑
- 热斗地图：每回合获得伤害卡，只有大型地产不受伤害

### M6.3.2 LLM 机器人 prompt
- `botPrompt.ts`：`buildRichmanBotPrompt(input)`
- 把视角翻译成自然语言局势：现金、地产组合、对手状态、手牌、神仙附身、可能的合法动作清单
- 让模型从 options 中选 id
- 含股票决策（M6.2 完成后）

### M6.3.3 UI 动画与音效
- 骰子滚动动画
- 玩家 token 移动动画（沿格子逐格跳跃）
- 卡片使用特效
- 神仙附身动画
- 破产消散动画

### M6.3.4 真实聚会验收
- 4 人真实聚会 3 局完整对局
- 采集性能指标（perf.mjs 扩展支持 richman）

---

## 假设与决策

### 假设
1. **现有架构无需改动**：Phase 1 探索确认，新游戏只需按既有模式新建包 + 4 处固定改动点注册即可。
2. **Node 24 原生 TS 支持**：所有 .ts 文件直接运行。
3. **客户端构建管线不变**：Vite 自动拾取新组件。
4. **CSS 复用现有设计 token**：颜色/字体/间距沿用 styles.css 中已有变量。

### 决策
1. **M6.1 先做大富翁11核心特色**：地产+卡片+神仙三大核心系统，跳过股票/大型建筑/物价/机关/角色天赋（这些放 M6.2/M6.3）。让基座玩法可玩、可验证。
2. **棋盘街道布局**：自定义 8 街道 × 3 块的中文风格布局（樱花/梅花/竹林/菊花/枫叶/银杏/松柏/荷花/牡丹/玉兰），保留大富翁11"同街道一起算租金"核心机制。
3. **卡片精选 15 种**：从 45+ 中精选最高频/最有策略性的 15 种作为 MVP，避免 M6.1 过载。M6.2.6 扩充到完整。
4. **神仙完整 5 对**：神仙系统是大富翁11核心特色，M6.1 直接放完整 10 种。
5. **`coming_soon` → `playable` 旧切换设想（已失效）**：历史草案曾拟在 M6.1.6 测试通过后切换；现行 D1 要求是先取得完整权利准入证据，再按获准范围实现和验证，测试通过本身不得触发 `playable`。
6. **客户端 UI 用简化模式**：参考 uno/landlord 的 `Record<string, unknown>` 风格，加快开发。
7. **棋盘数据硬编码在 board.ts**：不引入 JSON 配置文件。
8. **M6.1 不实现股票/大型建筑/物价/机关/角色天赋/监狱完整规则**：这些放 M6.2/M6.3。M6.1 监狱位置暂时只是"经过无效果"占位。
9. **卡片商店简化**：M6.1 商店固定价格 500 元/张，从牌堆顶抽（M6.3 可改为多档价格或选择性购买）。

---

## 验证步骤

### M6.1.1 验证
- `npm run typecheck` 通过
- `node --test packages/games/richman/tests/board.test.ts` 通过（棋盘数据不变量）
- `node --test packages/games/richman/tests/cards.test.ts` 通过（卡片定义不变量）
- `node --test packages/games/richman/tests/gods.test.ts` 通过（神仙定义不变量）

### M6.1.2 验证
- `npm run typecheck` 通过
- `node --test packages/games/richman/tests/module.test.ts` 通过（基础状态机：掷骰、移动、买地、街道收租、破产）
- 测试覆盖：初始状态不变量、合法/非法 action、过起点奖金、街道收租（含垄断加成）、破产清算

### M6.1.3 验证
- 卡片购买流程（落到商店、买卡、入账手牌）
- 卡片使用流程（选卡、选目标、效果生效、入弃牌堆）
- 每种卡片至少一个测试
- 路障/地雷 hazard 触发与清除
- 手牌上限检查（满 5 张不可再买）

### M6.1.4 验证
- 神仙台触发召唤
- 每种神仙附身效果生效
- 神仙持续回合倒计时
- 神仙归零离开
- 请神卡/送神卡效果

### M6.1.5 验证
- `npm run build -w @ldj/client` 成功
- 历史验证设想：浏览器打开首页检查游戏 UI；**当前禁止**通过 URL hack、临时切 `playable` 或其他方式绕过 D1 准入。
- 棋盘渲染 40 格、玩家 token 移动、街道颜色区分
- 卡片手牌显示、商店购买、卡片使用
- 神仙图标显示在玩家头像旁

### M6.1.6 验证
- `npm run ci` 全绿（typecheck + lint + test + build）
- 新增测试总数 ≥ 50 个（棋盘数据 + 卡片数据 + 神仙数据 + 状态机 + 卡片效果 + 神仙效果 + 机器人策略）
- 历史验收项：`catalog.ts` 切换 `availability: 'playable'`；**现已失效**，必须先满足 D1 完整权利准入并重新审批。
- 启动 `npm run dev:server`，浏览器实际玩一局（2 人或加 rule 机器人）
- 冒烟测试：完整对局能跑完（从起点出发到一方破产）

### 总体验证
- 服务端启动日志出现 `richman` 模块注册
- 首页显示"大富翁"卡片
- 创建大富翁房间、加入、开局、掷骰、买地、付租金、买卡、用卡、召神、送神、破产、结算全流程
- 规则机器人能正常参与对局
- 无类型错误、无 lint 错误、无内存泄漏（heap 增长 < 10MB）

---

## 实施顺序

以下仅保留历史拟议顺序，不得在 D1 阻断解除前实施；解除后也须依据获准范围重新评审，而非直接照此执行：

1. **M6.1.1** 包骨架 + 棋盘/卡片/神仙数据（~700 行）→ 验证：数据测试通过
2. **M6.1.2** 状态机基础（~1100 行）→ 验证：基础玩法测试通过
3. **M6.1.3** 卡片系统（~500 行）→ 验证：15 种卡片效果测试通过
4. **M6.1.4** 神仙附身系统（~200 行）→ 验证：10 种神仙效果测试通过
5. **M6.1.5** 客户端 UI（~1300 行）→ 验证：浏览器能玩
6. **M6.1.6** 机器人 + 注册 + CI（~300 行）→ 验证：CI 全绿、冒烟通过

**M6.1 总代码量预估：~4100 行**

M6.2 与 M6.3 留待 M6.1 完成后再启动，本计划文件可作为后续里程碑的依据。

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 大富翁11规则细节与原版有偏差 | 历史草案曾建议以 `// TODO: 待确认原版规则` 后调；**该做法现已禁止**。规则来源、可用范围与权利证据必须在实现前完成 D1 审查，不能以测试或真实聚会验收替代。 |
| 卡片效果复杂导致状态机臃肿 | 卡片效果用 `effect` 数据驱动，每张卡片的 effect 是一个纯函数 `(state, target) => state`，避免巨型 switch |
| 客户端 UI 复杂度高 | 参考 uno/landlord 简化模式，先用 `Record<string, unknown>` 不建强类型镜像，能跑就行 |
| 神仙效果触发顺序冲突 | 严格按"回合开始 → 移动 → 落地效果 → 卡片使用 → 回合结束"顺序处理 |
| 街道垄断计算开销 | 在 `reduce` 中按需计算，不预存（避免状态膨胀） |
