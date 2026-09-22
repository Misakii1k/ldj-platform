# Ding 视觉契约（U04）

日期：2026-09-22。对应任务卡 U04。

## 1. 设计方向

派对牌桌。**3D**（G0-3）：这是三款里唯一开 `.stage-felt-3d` 的——出牌飞到中央牌堆、摸牌从牌堆飞回手边，需要景深。

核心隐喻已经在了：中央一枚可按的铃、四色光晕弃牌堆、扇形手牌。Ding 是三款里**感官层最完整**的（7 keyframes、5 音效、3 震动、直调 EventOverlay），U04 的重点不是补感官而是：
1. 把 80 条散在 `styles.css` 5298–6014 行的规则迁出成 `bell-clash.css`；
2. 铃台改成共享 3D 毡面上的实体道具（硬投影 `0 7px 0`，按压 `0 1px 0`），不再是三层 div 叠的假 3D；
3. 出牌 / 摸牌接共享 `FlightLayer`，替代现在的瞬移；
4. **抢铃窗口加 `StageCountdownRing`**——玩家现在完全不知道窗口还剩多久，这是三款里倒计时最有价值的落点。

## 2. 状态模型（不是阶段机）

`phase` 只有 `playing | game_over`。真正的状态由三个正交字段承载：

| 字段 | 含义 | 驱动的画面 |
|---|---|---|
| `currentPlayerId` | 谁的回合 | 席位光晕、`playTurnAlert`、我的手牌可出态 |
| `bellOpen` | 抢铃窗口开着 | 铃台高亮 + 倒计时环 + `playBuzzer` + 震动 |
| `bellClaimantId` | 谁抢到了 | 铃台文案、席位 badge「抢到铃！」、EventOverlay |

服务端约束：`bellOpen` 时禁止正常出牌与摸牌；`!bellOpen` 时 `ring_bell` 被拒；打出 phrase 卡置 `bellOpen=true`。

timer 有两类：`turnSeconds`（回合）与 `bellSeconds`（抢铃窗口）。**PublicView 无 `deadlineAt`**，U04 补它——且要能区分是哪类 timer 的截止（建议服务端暴露 `deadlineAt` + `deadlineKind: 'turn' | 'bell'`，客户端用 `deadlineKind` 做 `phaseKey`，两类计时互不干扰满格测量）。

## 3. 色值

### 3.1 平台令牌

| 令牌 | 用途 |
|---|---|
| --game-paper / --game-surface | 手牌检视器、浮条 |
| --game-ink | 文案、牌面数字 |
| --game-yellow | 唯一主 CTA（出牌按钮 / 拍铃按钮，同一时刻只有一个亮） |
| --game-coral | 罚牌提示、错拍反馈 |

### 3.2 毡面配色（3D 毡面需要三个变量）

共享 `.stage-felt-3d` 不带主题色，本游戏提供：

```css
.bc-game {
  --stage-felt-a: var(--game-accent);
  --stage-felt-b: var(--game-dark);
  --stage-felt-rail: var(--game-ink);
}
```

catalog 登记 `accent: 'berry', surface: 'board'`；shell 传 `theme="sunset"`。**拍板：catalog `berry` 为权威**，`.game-card--berry { --game-accent: #146e59; --game-soft: #d9ece2; --game-dark: #075342; }`。berry 是深绿，作牌桌毡面天然合适；毡面上的白字对比度：white / `#146e59` = 5.72 ✅、white / `#075342` = 8.9 ✅。

现在用 `sunset` 是历史遗留，且与 echo-judge 的 catalog accent 撞名。改回 berry 后，铃的金属色（现有 `.bell-desk-bell` 三层渐变）在深绿毡面上更醒目。

### 3.3 UNO 四色光晕保留

`.uno-discard-halo--{red,yellow,green,blue}` 是牌面语义色，不是主题色，**不受"一款一个 accent"约束**，原样迁入 `bell-clash.css` 并改名 `.bc-halo--*`（不再依赖 `.uno-*` 类，UNO 自己的 U07 可能改它）。

### 3.4 对比度

毡面上所有文字白色，见 §3.2。检视器与浮条在纸底，ink/muted 正文。牌面数字走 `/assets/uno/{color}_{number}.png` 图片，不涉及。`DingPhraseCard` 的白椭圆上短语用 ink（13.68）。

## 4. 根结构

```
.bc-game[data-bell-open][data-my-turn]
  TabletopOvalShell（直接用，不经 TabletopShell——现有方案，保留）
    centerArena:
      .bc-arena.stage-felt-3d                  ← 共享 3D 毡面
        .bc-arena__plane.stage-felt-3d__plane  ← 统一倾角
          .bc-compass                          方向指引环（现 .uno-direction-compass）
          .bc-core                             三元核心
            .bc-draw-pile   [data-stage-anchor="draw"]
            .bc-discard     [data-stage-anchor="discard"]  含 .bc-halo--*
            .bc-bell        [data-stage-anchor="bell"]     实体铃
          .bc-core__meta                       剩余张数 / 当前色
        StageCountdownRing                     绝对定位在毡面右上，bellOpen 时红色紧张态
    bottomBar:
      .bc-inspector                            手牌检视器（现有）
      .bc-controls                             浮条（现 .uno-floating-controls）
      CardFanEngine  [data-stage-anchor="hand"]
  FlightLayer                                  挂 shell 外
  GameDrawer                                   现有，shell 外
```

**飞行层与 3D 毡面的边界**：`FlightLayer` 必须在 `.stage-felt-3d` 之外（共享层文档已写死这条），起终点用 `measureAnchor` 取屏幕投影。

## 5. 三个关键画面

### V1：我的回合（playing，`currentPlayerId === me`，`!bellOpen`）

```text
Ding                              剩 42 张
╔═══════════ 3D 毡面（深绿，透视 16°）═══════════╗
║          ↻ 顺时针                              ║
║   ┌────┐        ┌────┐         ╭─────╮         ║
║   │牌堆│        │ 红7│  红     │ 🔔  │         ║  ← 铃：实体半球，投影 0 7px 0
║   │ 42 │        │    │ 光晕    │抢铃台│         ║
║   └────┘        └────┘         ╰─────╯         ║
╚═══════════════════════════════════════════════╝
[ 检视器：红 3 ]  [ 摸牌 ]                       ← 浮条
     ╲ 红3 ╱ ╲ 蓝7 ╱ ╲ 口令 ╱ ╲ 红K ╱           ← 扇形手牌，可出的 pulse
[ 打出 红 3 ]                                    ← 唯一黄色 CTA（选中后出现）
```

**演出 E1（出牌）**：`discardTop` 变化且 `me.handCount` -1 时，选中的牌从 `hand` 锚飞到 `discard` 锚（`FlightLayer`，`motion: 'toss'`，`paper: false`——牌是硬纸板不是钞票，用 toss 的抛物线但关掉翻面压暗/高光）。落地同帧 `.bc-halo` 换色。音效 `playCardPlay`（已有）。他人出牌：从其席位飞到 `discard`。去重键 `play:${roundToken}:${discardCount}`。

**演出 E2（摸牌）**：`drawCount` -1 且某人 `handCount` +1 时，一张背面牌从 `draw` 锚飞到该人席位（我则飞到 `hand`）。`motion: 'slide'`。音效 `playDealCards`（已有）。

### V2：抢铃窗口（`bellOpen === true`，重点）

```text
Ding                              剩 41 张    [环 00:03]  ← 红色紧张态
╔═══════════ 3D 毡面 ═════════════════════════════╗
║                                                 ║
║   ┌────┐        ┌────┐         ╭─────╮          ║
║   │牌堆│        │口令│  红     │ 🔔  │ ◀ 震动   ║  ← bellRingShake（已有）
║   │ 41 │        │"哎呀"│ 光晕   │立即拍铃!│        ║     + bellSonicRipple 波纹
║   └────┘        └────┘         ╰─────╯          ║
╚═════════════════════════════════════════════════╝
[ 拍铃！]                                          ← 黄色 CTA，替代出牌按钮
     ╲ 红3 ╱ ╲ 蓝7 ╱ ╲ 口令 ╱ ╲ 红K ╱             ← 仅同色口令卡可点
```

`StageCountdownRing` 用 `phaseKey="bell:${bellEpoch}"`，`deadlineAt` 来自 `bellSeconds`。窗口只有几秒，环从满格到空非常快，**这正是它存在的意义**。`bellOpen` 边沿：`playBuzzer` + 震动 `[40,50,40]`（已有）。

**演出 E3（抢到铃）**：`bellClaimantId` 从 null 变有值时，铃 `translateY(6px)` 按下 + 投影 `0 7px 0 → 0 1px 0`（实体按压），一圈 `bellSonicRipple` 从铃扩散到抢到者席位方向。`TabletopEventOverlay` 1600ms（已有，`isMe` 切 reveal/burst）。去重键 `claim:${roundToken}:${bellEpoch}`。

错拍（我 `ring_bell` 后服务端 `handCount` +1 而 `bellClaimantId` 不是我）：铃不按下，检视器区域 coral 文案「错拍，罚摸一张」+ 一张背面牌从 `draw` 飞到 `hand`（复用 E2）。

### V3：终局（game_over）

```text
Ding                              胜者：玩家2
╔═══════════ 3D 毡面 ═════════════════════════════╗
║   玩家2 席位 badge「获胜」                       ║
║   ┌────┐        ┌────┐         ╭─────╮          ║
║   │牌堆│        │ 绿2│         │ 🔔  │          ║
║   └────┘        └────┘         ╰─────╯          ║
╚═════════════════════════════════════════════════╝
[ 返回房间 ]
```

`TabletopVictoryBurst`（已有）+ `playVictory`（已有）。剩余手牌从各席位飞到 `discard` 收桌（`motion: 'slide'`，每人一叠错峰）——这是终局的仪式感，收敛在 `deadlineAt` 内。

## 6. 状态矩阵

| 状态 | 表现 |
|---|---|
| 我的回合，未选牌 | 可出的牌 `dingPlayablePulse`；浮条「摸牌」ink 描边；无黄色 CTA |
| 我的回合，已选可出牌 | 黄色 CTA「打出 <牌>」；检视器显示大牌面 |
| 我的回合，已选不可出牌 | 检视器 coral 文案「需同色或同数字」；CTA 禁用 |
| 他人回合 | 手牌无 pulse；浮条状态芯片「等待 X」 |
| bellOpen，我有同色口令卡 | 黄色 CTA「拍铃！」；该口令卡 `bellPlayablePulse`；环红色 |
| bellOpen，我无同色口令卡 | CTA 禁用「无可用口令卡」；环仍显示 |
| bellClaimantId 有值 | 铃按下态；席位 badge；EventOverlay 一次 |
| 我错拍 | coral 提示 + 罚牌飞行 |
| game_over | 收桌演出 + VictoryBurst |

**黄色 CTA 唯一性**：出牌按钮与拍铃按钮永不同时亮——`bellOpen` 时出牌被服务端禁止，`!bellOpen` 时拍铃被拒，状态本身互斥。

## 7. 动效与资源约束

- 现有 7 个 keyframes 全部迁入 `bell-clash.css`，**不新增**（唯一新增的"铃按压"用 transition 不用 keyframe）。全部登记进 `game-ui.css` 3.4 的 reduced 清单或标注为必要反馈——现在只有 `.bell-floating-bell-btn` 在清单里、`.bell-draw-pile.is-playable` 标注为必要反馈，其余 5 个（`bellRingShake` / `bellSonicRipple` / `bellActiveJiggle` / `bellFloatPulse` / `bellInspectorPop`）要逐个归类。
- 出牌 / 摸牌 / 收桌全走共享 `FlightLayer`，本游戏不再写任何位移 keyframe。
- 3D：`.stage-felt-3d` 的 `--stage-felt-tilt` 默认 16deg，窄屏 12deg、横屏矮视口 8deg、off 档 0——共享层已定义，本游戏不覆盖。
- 音效 5 个全部已有，不新增。震动 3 处已有，不新增。
- `StageCountdownRing`：`bellOpen` 时 `active` 且 `phaseKey` 带 `bellEpoch`；`!bellOpen` 且是我的回合时用 `turn:${turnEpoch}` 显示回合倒计时；他人回合不显示。

## 8. CSS 迁移

`styles.css` 5298–6014 行 `^.bell|^.ding` 共 80 条 → `bell-clash.css`，前缀统一 `.bc-*`。同时**解除对 `.uno-*` 的复用**（`.uno-direction-compass` / `.uno-discard-halo--*` / `.uno-floating-controls` / `.uno-floating-btn` / `.uno-floating-status-chip` 五个），复制为 `.bc-*` 版本。这样 U07 改 UNO 时不会连带炸 Ding。

## 9. e2e 影响面

- `.tabletop-shell` 不变。
- `bell-clash-tabletop.spec.ts:102` 的 `getByRole('heading', { name: 'Ding' })` 依赖 OvalShell 把 `title` 渲染成 heading——不动 title。
- 三人完整局全 WS 驱动、终局才开浏览器，中间画面 DOM 无断言。
- **motion-contract 是最大风险**：7 个 infinite keyframes 在 reduced/off 下必须 `animation-duration ≤ 0.5s` 或 `animation: none`。迁出时逐个验证 `html[data-motion-level]` 选择器仍命中新前缀。
- 视口合约的 `bell-clash-sim` 用例待并行会话的大屏 seed 修好才能跑。

## 10. 验收矩阵

同前两款，`--grep "bell-clash"`。额外：
- V2 必须截**紧张态**（`bellOpen` 且环 ≤10s）——mock payload 里 `deadlineAt = now + 4000`。
- 3D 毡面在 320×568 下不横向溢出（`overflow-x: auto` 共享层已给，但要实测扇形手牌 + 毡面叠加高度不超 568）。
- 飞行落点精度：出牌后牌的屏幕位置与 `discard` 锚点中心偏差 ≤ 4px（`buildFlightPoses` 末帧钉死到目标，单测已覆盖几何，这里验真实 DOM）。
- `styles.css` 中 `grep -c "\.bell\|\.ding"` 归零，且 `grep -c "\.uno-" packages/client/src/game/bell-clash/` 归零。
