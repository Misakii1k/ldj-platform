# 囚徒之夜 视觉契约（U02）

日期：2026-09-22。对应任务卡 U02。格式沿用 `docs/plans/2026-09-20-wits-wagers/03-visual-contract.md`。

## 1. 设计方向

审讯室长桌。浅色纸感底（G0-1），**只在投票阶段与猜罪阶段加局部暗角**——桌面四角压暗、中央证词板保持纸白，像审讯灯只照着桌中央。不做整局深色主题。

平面（G0-3）：不启用 `.stage-felt-3d`，只用 FLIP 与平面飞行层。

核心隐喻：**证词板**。每一题的问答被钉成便签，累积在板上；YES 票用红色图钉计数。替代现在四个互斥切换的 ArenaBoard。

## 2. 阶段机（写契约前必须先知道的事实）

实际流转 `question → vote → game_over`。**`'deduction'` 是死值**：服务端 `rules.ts` 从未赋过它。页面里「推理辩论」标签与 `usePhaseEventOverlay` 的 `deduction` 盖印永远不会触发，U02 应把它们删掉而不是设计画面。

`guessingInProgress: boolean` 是正交支线（狱警自曝或被票出后进入猜罪），不是 phase。演出状态机的阶段键用 `${phase}:${guessingInProgress}`。

服务端 timer `nt-question-timeout` / `nt-vote-timeout` 都在，**但 PublicView 没暴露 `deadlineAt`**。U02 第一步就是补它（服务端 `views.ts` zod + 客户端 `types.ts` + `PUBLIC_KEYS`，三处同步，`hasExactKeys` 校验键数）。

## 3. 色值

### 3.1 平台令牌（不改定义）

| 令牌 | 色值 | 用途 |
|---|---|---|
| --game-paper | #fff4df | 证词板底、便签底 |
| --game-surface | #fffdf7 | 身份卡、面板 |
| --game-ink | #292722 | 正文、题干、罪名 |
| --game-muted | #575147 | 次要文案、案卷编号 |
| --game-line | #292722 | 描边、图钉杆 |
| --game-yellow | #f7c84b | 唯一主 CTA 底 |
| --game-coral | #c23616 | YES 图钉、警告态 |

### 3.2 本游戏 accent

catalog 已登记 `visualTheme: { accent: 'violet', surface: 'board' }`；shell 传 `theme="mystery"`。**两套不一致，本契约拍板：catalog 的 `violet` 为权威**，`.game-card--violet { --game-accent: #7960a5; --game-soft: #e6ddef; --game-dark: #4e3777; }`。U02 把 `TabletopShell` 的 `theme` 改为按 catalog 派生，不再手写 `"mystery"`。

### 3.3 对比度硬约束

| 组合 | 比值 | 结论 |
|---|---|---|
| ink / paper | 13.68 | ✅ 正文 |
| muted / paper | 7.20 | ✅ 正文 |
| white / game-dark `#4e3777` | 9.13 | ✅ 主按钮备选 |
| game-dark / paper | 8.34 | ✅ 正文 |
| accent `#7960a5` / paper | **3.83** | ❌ 仅 ≥24px 大字或描边 |
| ink / yellow | 9.46 | ✅ 主 CTA |
| white / coral | 5.48 | ✅ YES 图钉计数字 |

规则同一智千金：纸底正文一律 ink/muted；accent 只做描边、图钉头、≥24px 阶段标题；主 CTA 用 `--game-yellow` + ink；暗角只是 `radial-gradient` 叠层，**不改变其下任何文字的底色**，所以不需要重新算对比度。

## 4. 根结构

```
.nt-game[data-phase][data-guessing]        ← 阶段属性挂根，CSS 据此开暗角
  TabletopOvalShell（席位环 + 顶栏）
    centerArena:
      .nt-stage
        .nt-stage__rail      身份卡（折叠）| StageCountdownRing | 全员 YES 计数
        .nt-board            证词板（唯一中央容器，内容随阶段换，DOM 不换）
          .nt-board__pins    钉在板上的历史便签（案卷）
          .nt-board__focus   当前焦点：题卡三选一 / 当前题 / 投票 / 猜罪
        .nt-vignette         暗角层（aria-hidden，只在 vote / guessing 显示）
    bottomBar: ActionDock
  FlightLayer                 挂在 shell 外
```

**关键改动**：现在是四个 `ArenaBoard` 互斥渲染，整块换 DOM。改为一个 `.nt-board` 常驻，只换 `__focus` 内容，便签才能有稳定的 FLIP 起终点。

## 5. 三个关键画面

### V1：出题（question，无 currentQuestion）

```text
囚徒之夜        第 2/5 题        [环 01:32]
┌─ 证词板 ─────────────────────────────┐
│ 📌题1 "你昨晚在牢房吗"  ●●○○  (YES 2) │  ← 已钉便签，YES 数用 coral 圆点
│                                       │
│  ┌───────┐ ┌───────┐ ┌───────┐        │
│  │ 日常  │ │ 关系  │ │ 行踪  │        │  ← 出题人看到的 3 张候选卡
│  │ 你是否│ │ 你和  │ │ 案发时│        │     其余人看到"等待 X 出题"横幅
│  │ ...   │ │ ...   │ │ ...   │        │
│  └───────┘ └───────┘ └───────┘        │
└───────────────────────────────────────┘
[ 提问：日常 ]                            ← 唯一黄色 CTA
```

出题人 `isSpeaking=true` 驱动席位波纹（已有）。候选卡用 `--i` 错峰淡入（已有），不加飞行。

### V2：答题（question，有 currentQuestion）

```text
囚徒之夜        第 2/5 题        [环 00:45]
┌─ 证词板 ─────────────────────────────┐
│ 📌题1 ...  ●●○○                       │
│                                       │
│   ┌─────────────────────────────┐     │
│   │ [待定]  你昨晚离开过牢房吗？ │     │  ← 当前题便签，"待定"印章
│   │  你可以撒谎 / 必须如实回答  │     │  ← 按 isWarden 分岔（已有）
│   └─────────────────────────────┘     │
│   答题进度  ✓✓○○  (2/4)               │
└───────────────────────────────────────┘
[ 回答「是」(YES) ]  [ 回答「否」(NO) ]
```

**演出 E1（全员答完 → 便签入板）**：服务端 view 差分出 `currentQuestion` 从有到无且 `docket` 长度 +1 时，当前题便签从 `__focus` 位置 FLIP 到 `__pins` 末位（`motion: 'slide'`，不翻不飘，便签不是钞票）。YES 数 ≥1 时同帧在便签上敲图钉（coral 圆点 scale 0→1，`--gp-dur-fast`）。去重键 `docket:${roundToken}:${docket.length}`。

### V3：投票 / 猜罪（vote / guessing，开暗角）

```text
囚徒之夜        投票           [环 00:28]
▓▓┌─ 证词板 ────────────────────────┐▓▓  ← 四角暗角，板面仍纸白
▓ │ 📌题1 ●●○○ 📌题2 ●○○○ 📌题3 ●●●○│ ▓
▓ │                                  │ ▓
▓ │   谁是狱警？                     │ ▓  ← ≥24px 大字，可用 accent
▓ │   [席位选择器 SeatTargetPicker]  │ ▓
▓▓└──────────────────────────────────┘▓▓
[ 票选 玩家3 ]
```

猜罪阶段同布局，`SeatTargetPicker` 下方换成 `.nt-crime-grid`（已有 `.testimony-crime-options-grid`）。

**演出 E2（投票结果）**：`vote → game_over` 或 `vote → guessing` 时，票数从各席位飞到被票出者席位（`FlightLayer`，`motion: 'toss'`，`paper: false`，飞行物是小圆票）。去重键 `vote:${roundToken}`。收敛在 `deadlineAt` 内（`fitToDeadline`）。

## 6. 状态矩阵

| 状态 | 表现 |
|---|---|
| 我是出题人，未选卡 | 三张候选卡可点；CTA「提问：<类别>」随选中变化 |
| 我不是出题人，等出题 | 板上「等待 X 出题」横幅；CTA 区无按钮，显示 waitingReason |
| 有当前题，我未答 | 两个按钮并排，**都不是黄色**（二选一无主次）；YES 用 coral 描边、NO 用 ink 描边 |
| 有当前题，我已答 | 按钮变禁用态并显示「已回答：是」；进度指示灯我的那格亮 |
| 我可自告 | 顶栏 `topRightControls` 里一个次要按钮「自告」，走现有 `.nt-expose-modal` |
| 投票中 | 暗角开；SeatTargetPicker 单选；CTA「票选 <名>」 |
| 狱警猜罪 | 暗角开；每名囚犯一个罪名下拉；CTA「提交终局猜罪」 |
| game_over | 暗角关；`TabletopVictoryBurst`（已有）；板上所有便签保留可回看 |

## 7. 动效与资源约束

- 新增 keyframes 上限 **2 个**：图钉敲入、暗角淡入。现有 `testimonyWarnPulse` 迁入 `night-testimony.css` 保留。
- 暗角 = `.nt-vignette` 的 `opacity` 过渡（`--gp-dur-phase`），reduced 档保留（它是信息：阶段变了），minimal/off 直接切换无过渡。
- 便签 FLIP 只动 transform；票飞行走共享 `FlightLayer`，minimal/off 由共享层 `display:none` 兜底。
- 音效 3 个，全部复用 `WebAudioManager` 已有音色：便签入板 `playCardPlay`、图钉 `playTick`、票落 `playCardFlip`。震动不加。
- `StageCountdownRing` 在 `question`（有 currentQuestion）与 `vote` 阶段 `active`，出题选卡阶段不催。

## 8. CSS 迁移

`styles.css` 里 `^.testimony|^.nt-` 共 116 条规则（约 4485–4950 行 token-rack 段，6609+ 身份卡覆盖段）全部迁入 `night-testimony.css`，改名为 `.nt-*` 统一前缀。迁移后 `styles.css` 中 `grep -c "\.testimony\|\.nt-"` 归零。

## 9. e2e 影响面

- `.tabletop-shell` 不变（由 OvalShell 渲染）。
- **`.testimony-private` 必须保留**——`night-testimony-tabletop.spec.ts:111` 断言它可见。身份卡容器改名时保留此类作别名，或同步改 spec。
- `.action-dock button` 的 `.nth(1)` 位置依赖：V2 两个回答按钮的顺序（YES 先 NO 后）不能变。
- spec 里 `'回答 YES'` / `'回答 NO'` / `'提交猜罪'` / `.testimony-over` / `.goose-transmit__input` 五处**本来就已失配**（死代码）。U02 顺手修 spec 让它们真正生效，否则浏览器侧驱动形同虚设。
- motion-contract 要求 reduced/off 下任何元素 `animation-duration ≤ 0.5s`——新增两个 keyframe 都要能被 `html[data-motion-level]` 门控。

## 10. 验收矩阵

| 项 | 方法 |
|---|---|
| 三个画面 × 390×844 / 1280×800 | `page.routeWebSocket` mock 固定 payload 截图，**用户审核**，不自动接受 |
| 视口合约 7 档 | `e2e/game-viewport-contract.spec.ts --grep night-testimony`（含 sim 变体，待 sim 大屏 seed 修好） |
| 动效合约 reduced/off | `e2e/motion-contract.spec.ts --grep night-testimony` |
| 完整局 | `e2e/night-testimony-tabletop.spec.ts`，修好失配断言后跑 |
| 便签 FLIP 不重播 | 刷新页面后 `docket` 不重飞（`stageMemory` 单测 + 手测） |
| styles.css 归零 | `grep -c` 断言进 U11 |
| 对比度 | 真实页面计算样式核验 §3.3 每一组，不只算 token |
