# 伪人测试 视觉契约（U03）

日期：2026-09-22。对应任务卡 U03。

## 1. 设计方向

法庭。浅色纸感（G0-1），**只在 `judgment` 阶段加局部暗角**——审判席聚光，旁听席压暗。不做整局深色。

平面（G0-3）。

核心隐喻：**判词台 + 木槌**。中央是审判长面前的判词台，考题像一份卷宗摊在台上；判定时木槌敲下，台面 4px 下沉回弹。伪人揭晓用 `IdentityFlipCard` 翻面 + accent 扫光。

这款现在**零 keyframe、零音效、零震动**，是三款里感官层最空的。U03 的重点是补感官层，不是改布局——它已有的响应式双栏（宽屏 `"side main"` grid）是三款里最好的骨架，保留。

## 2. 阶段机

`judge_setup → answering → judgment → game_over`，四值全部可达。

- `judge_setup`：**两类玩家并行操作**——审判长从 3 张题卡选 1；其余人自由 `choose_role` 切 human/impostor（选 impostor 由系统发不重复 `triggerWord`）。
- `answering`：非审判长按座次轮流口头发言，发言人 `finish_speaking` 交棒；审判长也能代为推进。
- `judgment`：审判长 `accuse` 提交 `targetPlayerIds[]`，**可多选也可空数组**（判全员人类）。
- 每人各当一次审判长后 `game_over`。

服务端 timer 用 `answerSeconds` / `judgmentSeconds`，**PublicView 无 `deadlineAt`**，U03 第一步补它（三处同步）。

## 3. 色值

### 3.1 平台令牌

| 令牌 | 用途 |
|---|---|
| --game-paper | 判词台面、题卡底 |
| --game-surface | 侧栏面板、身份卡 |
| --game-ink / --game-muted | 正文 |
| --game-yellow | 唯一主 CTA |
| --game-coral | 被指控标记、抓获名单 |

### 3.2 本游戏 accent

catalog 登记 `accent: 'sunset', surface: 'social'`；shell 传 `theme="court"`。**拍板：catalog `sunset` 为权威**，`.game-card--sunset { --game-accent: #e76835; --game-soft: #fde0c6; --game-dark: #a83f19; }`。

注意 `sunset` 与 bell-clash 的 shell theme 撞名但语义无关——bell-clash 的 catalog accent 是 `berry`，U04 会把它理顺。

### 3.3 对比度硬约束

| 组合 | 比值 | 结论 |
|---|---|---|
| ink / paper | 13.68 | ✅ |
| white / game-dark `#a83f19` | 6.61 | ✅ 主按钮备选 |
| game-dark / paper | 6.03 | ✅ 正文 |
| accent `#e76835` / paper | **2.93** | ❌ 仅描边、图标、≥24px 大字 |
| white / accent | 3.35 | ❌ 不做按钮底 |
| ink / soft `#fde0c6` | 11.2 | ✅ 选中卡底上的文字 |

`sunset` 的 accent 对比度是 6 个主题里最差的，**扫光、木槌、聚光边缘可以用它，任何文字不行**。

## 4. 根结构

保留现有 `.echo-judge-stage` 的单列/双栏切换，改动限于：

```
.ej-game[data-phase]
  TabletopOvalShell
    centerArena:
      .ej-stage                       ← 现 .echo-judge-stage，保留 grid-template-areas
        .ej-stage__sidebar            阵营选择 → IdentityFlipCard → 积分榜（现有顺序不变）
        .ej-stage__main
          .ej-stage__rail             StageCountdownRing + 发言进度
          .ej-bench                   判词台（常驻容器，内容随阶段换）
            .ej-bench__dossier        卷宗：题卡三选一 / 大引号考题
            .ej-bench__gavel          木槌（aria-hidden，只在 judgment 显示）
          SeatTargetPicker            judgment 多选（现有）
        .ej-spotlight                 暗角层，judgment 显示
    bottomBar: ActionDock
  FlightLayer
```

宽屏媒体查询里三条 `!important` 覆盖（`.echo-identity-toggle-btn`、`.echo-private-panel.is-collapsed-mobile`）迁入 `echo-judge.css` 时改为不用 `!important`——用属性选择器提高特异性。

## 5. 三个关键画面

### V1：出题 + 选阵营（judge_setup）

```text
伪人测试            第 1/4 轮         [环 --]  ← 此阶段不计时
┌─ 侧栏 ─────┐ ┌─ 判词台 ─────────────────────┐
│ 你是：      │ │  ┌──────┐ ┌──────┐ ┌──────┐  │
│ [人类][伪人]│ │  │ 童年 │ │ 旅行 │ │ 饮食 │  │  ← 审判长看到 3 张卷宗
│             │ │  │ 你最 │ │ 去过 │ │ 最讨 │  │     其余人看"审判长选题中"
│ ┌身份卡┐    │ │  └──────┘ └──────┘ └──────┘  │
│ │ 伪人 │    │ └──────────────────────────────┘
│ │触发词│    │
│ └──────┘    │
│ 法庭积分榜  │
└─────────────┘
[ 出题：童年 ]                                  ← 审判长的黄色 CTA
```

非审判长这个阶段的 CTA 是「切换为伪人 / 切换为人类」——**不是黄色**（次要动作，用 ink 描边）。`IdentityFlipCard` 切阵营时翻面（组件已有），拿到 `triggerWord` 时卡面 accent 描边闪一次。

### V2：轮流发言（answering）

```text
伪人测试            第 1/4 轮         [环 01:15]
┌─ 侧栏 ─────┐ ┌─ 判词台 ─────────────────────┐
│ ┌身份卡┐    │ │                              │
│ │ 人类 │    │ │   "  你最早的童年记忆是？  " │  ← 大引号考题 ≥24px
│ └──────┘    │ │                              │
│ 积分榜      │ │   ▓▓▓▓▓▓░░░░  3/5 已发言     │
│  玩家1  +2  │ │   正在发言：玩家4             │
│  玩家2  -1  │ └──────────────────────────────┘
└─────────────┘
[ 我说完了 ]                                    ← 当前发言人的黄色 CTA
```

发言人席位 `isSpeaking` 波纹（已有）。**演出 E1（交棒）**：`currentSpeakerId` 变化时，一枚小话筒图标从旧发言人席位飞到新发言人席位（`FlightLayer`，`motion: 'slide'`，`paper: false`）。去重键 `speaker:${roundToken}:${answeredCount}`。审判长的 CTA 是「推进到下一位」，ink 描边非黄色。

### V3：审判（judgment，开暗角）

```text
伪人测试            审判            [环 00:40]
▓▓┌─ 侧栏 ───┐ ┌─ 判词台 ──────────────────┐▓▓
▓ │ 身份卡    │ │   "  童年记忆…  "     🔨  │ ▓  ← 木槌在台角
▓ │ 积分榜    │ │                           │ ▓
▓ │           │ │   谁是伪人？（可多选）    │ ▓
▓ │           │ │   [席位选择器 max=N-1]    │ ▓
▓▓└───────────┘ └───────────────────────────┘▓▓
[ 提交判决（已选 2 人）]  或  [ 判定全员人类 ]
```

非审判长看到的是同一画面但 `SeatTargetPicker` 禁用、CTA 区显示「审判长裁决中」。

**演出 E2（宣判）**：`judgment → game_over` 或下一轮 `judge_setup` 时：
1. 木槌 `.ej-bench__gavel` 敲下（rotate -30deg → 0，`--gp-dur-fast`），同帧判词台 `translateY(4px)` 回弹（`--gp-ease-press`），音效 `playBuzzer`。
2. 被指控者席位上的 `IdentityFlipCard` 翻面揭晓；伪人卡面 accent 扫光一次（`sheen` 用共享 `.stage-flight__sheen` 同款渐变但不飞行）。
3. 分数变化：积分榜数字用 `RollingNumber`（shared-ui 已有）滚到新值。

去重键 `verdict:${roundToken}`。整段收敛在 `deadlineAt` 内。

## 6. 状态矩阵

| 状态 | 表现 |
|---|---|
| judge_setup，我是审判长 | 三张卷宗可点；黄色 CTA「出题：<类别>」 |
| judge_setup，我不是审判长 | 台上「审判长选题中」；侧栏阵营按钮可切；CTA 区为 ink 描边「切换为伪人/人类」 |
| answering，我在发言 | 席位波纹；黄色 CTA「我说完了」 |
| answering，我不在发言 | 无 CTA；waitingReason「等待 X 发言」 |
| answering，我是审判长 | ink 描边 CTA「推进到下一位」（现 `judge-advance`） |
| judgment，我是审判长 | 暗角开；多选；黄色 CTA 随选中数变文案；空选时文案「判定全员人类」 |
| judgment，我不是审判长 | 暗角开；picker 禁用；waitingReason |
| game_over | 暗角关；`TabletopVictoryBurst`；积分榜排序定格 |

## 7. 动效与资源约束

- 新增 keyframes 上限 **3 个**：木槌敲击、台面回弹、accent 扫光。全部可被 `html[data-motion-level]` 门控，reduced 档保留木槌（信息）停扫光（装饰）。
- 话筒飞行走共享层。
- 音效 4 个：出题 `playCardPlay`、交棒 `playTick`、宣判 `playBuzzer`、终局 `playVictory`。震动 1 处：轮到我发言 `[30,40,30]`（与 bell-clash 的「轮到自己」节奏一致，跨游戏统一）。
- `StageCountdownRing` 在 `answering` 与 `judgment` `active`。
- 发言进度条从 inline `width` 改为 `transform: scaleX`（只动 transform）。

## 8. CSS 迁移

`styles.css` 里 `^.echo` 共 46 条迁入 `echo-judge.css`，前缀统一为 `.ej-*`。现有 `echo-judge.css` 96 行的 grid 骨架保留。

## 9. e2e 影响面

- `.tabletop-shell` 不变。
- `echo-judge-tabletop.spec.ts` 四个座位全 WS 驱动、终局才开浏览器，对中间画面的 DOM **无依赖**，改动自由度最大。
- `visual-audit.spec.ts` 的 `22_echo_judge_tabletop.png` 是覆写式存档，非断言。
- 新增 3 个 keyframe 受 motion-contract 的 0.5s 门控约束。

## 10. 验收矩阵

同囚徒之夜 §10，spec 换成 `--grep echo-judge`。额外：
- 宽屏双栏（768×1024 / 1280×800）与窄屏单列（390×844）都要截 V2、V3。
- 横屏矮视口 844×390 下 `max-height:520px` 的压缩规则仍生效（现有）。
