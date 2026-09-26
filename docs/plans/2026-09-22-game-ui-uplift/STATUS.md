# 交接状态：其余游戏前端提升

更新时间：2026-09-26（U00–U11 及 V01–V07 全部完成；已并入主开发分支）。工作区 `D:\项目`，分支 `feat/wits-wagers-tabletop-stage`。

## 当前结论

**1. 基础演出层（U00–U11）与高品质打磨（V01–V07）全部圆满完成。**
- 引入 `@fontsource/noto-serif-sc` 展示字体、舞台配方令牌与三栏全屏 sim 骨架；
- Ding、情书、奶酪大盗、以鹅传鹅、一智千金桌面模拟等五款视觉质感全量对齐狼人杀 / 榴莲档位；
- `styles.css` 由最初 27,021 行深度瘦身至 **15,720 行（累计缩减 −41.8%）**，`.cheese-*` 与 `.sim-*` 彻底归零迁出；
- 最终验收全量门：`typecheck` 0 错误、视口合约 20/20、动效合约 27/27、生产构建通过、核心游戏 E2E 全绿（详见 `reports/V07-final.md`）。

## 2026-09-25 事故复盘：stash 回退了并行会话的整版工作

U01 期间那次 `git stash push --include-untracked` / `pop` 往返，除了回退我自己的 U01 改动（当时已重做），
还**静默回退了并行会话已完成、未提交的一整版工作**：狼人杀三主题剧场、榴莲水果派对、一智千金客户端路由、
以及 6 款游戏的阶段盖印 / 胜利爆屏。表现是新 CSS 与组件文件仍在磁盘上，但 `main.tsx` 的 import、
`GamePage` 的 case、`viewRegistry` 的键全没了——**文件存在不代表生效**。

后果：U11 报告把 werewolf 视口/动效门与 `wits-wagers-sim` 的失败误判为「并行会话存量」，实际都是这次回退造成的；
榴莲的 184 条 styles.css 残留被写成「G0-4 决议不动」，实际早已迁完。

恢复方式：从 `git fsck --unreachable` 找回 stash 提交 `0a72ea19ed`（untracked 部分在 `f7a2616dee`），
54 个无冲突文件直接 checkout，24 个双方都改过的文件逐个三方合并（功能重叠全部保留待用户裁决），
styles.css 用当初迁移脚本同一套正则剥掉狼人杀/榴莲规则（剥前核对：34 条游戏表里找不到的选择器在 TSX 中也零引用，是被新页面替换的旧 DOM）。

**仍需你做的**：9 款关键画面样张尚未经你审核；P1 三款的视觉契约（`contracts/`）
你也还没看过。契约里写明「基线由用户审核，禁止失败后自动接受新截图」。

## 工作区现状（非本计划引入）

另一会话留下的未提交半成品仍在工作区里，本计划**不负责也不应替它收尾**：

- 11 项单测失败（`Client-to-Game Full Start` / `Progression View Audit` 的 5 个 `*_sim_v1` + `autoStart`）：服务端新增「桌面模拟需至少一台公共大屏」校验，这些 fixture 未 seed 大屏席位。
- `scripts/add_batch*.cjs` / `merge_all_batches.cjs` 6 个 untracked 脚本带 97 个 lint 错误。

~~`ModeratorVoicePanel.tsx` / `resultRoster.ts` 孤儿文件~~ ——09-25 查明它们不是孤儿，是被 stash 回退后失去引用方的正常组件，恢复后 typecheck 0 错误。

## 红线补充：不要用 git stash 做基线对比

这个工作区的 untracked 文件太多，`git stash pop` 的还原语义不可靠（U01 过程中曾因此回退掉已完成的改动）。要对比基线请用：

```bash
git worktree add /tmp/ldj-probe f16a70d
```

用完 `git worktree remove /tmp/ldj-probe --force`。

## G0 决策记录（2026-09-22）

| 编号 | 议题 | 决策 |
|---|---|---|
| G0-1 | 视觉方向 | 浅色纸感 + 局部暗角；不做整局深色主题 |
| G0-2 | 优先顺序 | 简陋优先：night-testimony → echo-judge → bell-clash → goose-relay → undercover → uno → loveletter → cheese-thief → landlord |
| G0-3 | 3D 预算 | 只给有飞行道具的 5 款：bell-clash / goose-relay / uno / loveletter / landlord |
| G0-4 | 榴莲 | 本轮不动 `--d-*` 与自建外壳 |
| G0-5 | 截图基线 | git checkout 还原当前覆写 PNG，U00 重截供审阅 |

详见 `README.md` §6。

## 任务卡进度

| 卡 | 内容 | 状态 |
|---|---|---|
| U00 | 基线：全量门 + 9 款样张 | **已完成**（`reports/U00-baseline.md`）。其中榴莲/狼人杀的 e2e 选择器修正已在工作区生效 |
| U01 | shared-ui 上提（StageCountdownRing / useStageMachine / FlightLayer / flip / stageMemory / felt-3d） | **已完成**（`reports/U01-shared-ui-stage.md`）。一智千金已切换，46/46 单测通过，视口与动效合约零回归 |
| U02 | night-testimony stage（平面 + 夜间暗角） | **已完成**（`7effa96`） |
| U03 | echo-judge stage（平面 + 判定暗角） | **已完成**（`26ba29b`） |
| U04 | bell-clash stage（3D）+ CSS 迁出 | **已完成**（`3454591`） |
| U05 | goose-relay stage（3D） | **已完成**（`0f8136c`） |
| U06 | undercover classic 收编（平面） | **已完成**（`18ef0ce`） |
| U07 | uno stage（3D）+ legacy 抽出（见 U11 报告 §5） | **已完成**（`1a928a2`） |
| U08 | loveletter 拆分 + stage（3D） | **已完成**（`49a2b6a`） |
| U09 | cheese-thief stage 接入（平面） | **已完成**（`868efbe`） |
| U10 | landlord 抽出 + stage（3D） | **已完成**（`4c8898f`） |
| U11 | styles.css 瘦身核对 + 最终验收 | **已完成**（`reports/U11-final.md`） |

## U02–U04 开工前必须先解决的前置

调查已确认三款共同的硬前置（详见下一节「P1 三款调查结论」）：

**三款都拿不到 `deadlineAt`。** 服务端六类 timer（`nt-question`/`nt-vote`、`answerSeconds`/`judgmentSeconds`、`turnSeconds`/`bellSeconds`）全部存在且生效，但三个 PublicView 都没暴露截止时刻。客户端解析器用 `hasExactKeys` 做**键数相等**校验，加字段必须三处同步改：服务端 `views.ts` 的 zod schema、客户端 `types.ts` 的 interface、`PUBLIC_KEYS` 数组。这是 `StageCountdownRing` 上屏的唯一前置条件，一智千金已有 `deadlineAt: number | null` 可直接参照。

## P1 三款调查结论（2026-09-22）

### night-testimony 囚徒之夜（平面）

- 阶段：`question → vote → game_over`。**`'deduction'` 是死值**——服务端 `rules.ts` 从未赋过它，页面的「推理辩论」分支与 `usePhaseEventOverlay` 里 `deduction` 的「审讯结束」盖印**永远不会触发**。另有正交的 `guessingInProgress` 布尔支线（狱警猜罪），不是 phase。
- 外壳：`TabletopShell theme="mystery"` → `TabletopOvalShell`。骨架单列纵向 flex，**四个 ArenaBoard 条件互斥渲染**（不是一个 board 换内容）。
- 动效：仅 1 个 keyframe（`testimonyWarnPulse`）。**零音效、零震动。**
- CSS：`night-testimony.css` 仅 51 行，真正的样式在 `styles.css` 里（`^.testimony|^.nt-` 共 116 条规则）。

### echo-judge 伪人测试（平面）

- 阶段：`judge_setup → answering → judgment → game_over`，**四值全部可达**。`judge_setup` 是两类玩家并行操作（审判长选题 / 其余人自由切阵营）；`judgment` 的 `accuse` 可多选也可提交空数组。
- 外壳：`TabletopShell theme="court"`，`stageFit="arena"`。**三款里唯一的响应式双栏**（宽屏 `grid-template-areas: "side main"`）。
- 动效：**零 keyframe、零音效、零震动。** 进度条是 inline width 过渡。
- CSS：`echo-judge.css` 96 行纯布局，`styles.css` 里 46 条。

### bell-clash Ding（3D）

- 阶段：只有 `playing | game_over`，**无真正的阶段机**。状态由三个正交字段承载：`currentPlayerId` / `bellOpen` / `bellClaimantId`。
- 外壳：**与另两款完全不同**——直接用 `TabletopOvalShell`（不经 `TabletopShell`），`stageFit="safe"`，带 `phaseBannerText`。不使用 ArenaBoard / ArenaRail / SeatTargetPicker / ActionDock / IdentityFlipCard 中的任何一个，改用 `CardFanEngine` + 自绘案台，与 UNO 同构（复用 `.uno-*` 类）。
- 动效：**三款里唯一有完整感官层**——7 个 keyframes、5 个音效（`playTurnAlert`/`playBuzzer`/`playCardPlay`/`playDealCards`/`playVictory`）、3 种震动节奏、直调 `TabletopEventOverlay`。
- **抢铃窗口是 `StageCountdownRing` 最有价值的落点**：玩家现在完全不知道窗口还剩多久。
- CSS：无独立文件，全在 `styles.css`（`^.bell|^.ding` 共 80 条，集中在 5298–6014 行）。

### 改 DOM 前必读：e2e 硬编码类名

1. **`.tabletop-shell`** — 最关键。三款在 viewport-contract 与 motion-contract 都用它作 `readySelector`，bell-clash 专属 spec 也等它。它由 `TabletopOvalShell` 渲染，改根类名会同时炸掉 6 个 spec。
2. **`.testimony-private`** — `night-testimony-tabletop.spec.ts:111` 的可见性断言，三款里唯一的游戏专属类名断言。
3. **`.action-dock button`** — NT spec 按索引取 `.nth(1)`，对 ActionDock 内按钮顺序有位置依赖。
4. **已失效的断言（死代码，靠 `.catch(() => false)` 吞掉）**：`.testimony-over`（实际是 `.testimony-over-stage`）、`.goose-transmit__input`（以鹅传鹅遗留）；`getByRole` 的 `'回答 YES'`/`'回答 NO'`/`'提交猜罪'` 与页面当前 label（`'回答「是」(YES)'` 等）**已对不上**。NT 的浏览器侧驱动现在基本全靠 Node 侧三个座位把局推完。
5. motion-contract 扫描全页要求 reduced/off 档下任何元素 `animation-duration` ≤ 0.5s。bell-clash 那 7 个 infinite keyframes 必须能被门控住，新增 keyframes 时这是硬约束。

### 两处需要在视觉契约里拍板的不一致

- **shell theme 与 catalog accent 三款全部不一致**：mystery/violet、court/sunset、sunset/berry。且 echo-judge 的 catalog accent(sunset) 与 bell-clash 的 shell theme(sunset) 撞名但语义无关。
- **两条外壳路线**：NT/echo-judge 走 `TabletopShell` 的「竞技场」语汇；bell-clash 走 `TabletopOvalShell` 的「牌桌」语汇。`TabletopShell` 只是 OvalShell 的薄封装，且带一段按 title 关键字猜 theme 的历史兜底逻辑。

## 未完成（不能宣称已验证）

- ~~U02–U11 共 10 张卡的实现与验收。~~ 已完成。
- P1 三款的视觉契约已写，但**尚未经用户审核**。
- 9 款关键画面样张**尚未经用户审核**（视口合约门每次跑会覆写 baseline/ 下的 390×844 与 1280×800）。

## 红线（每张卡都适用）

- 只用 `--gp-*` / `--game-*` 令牌；局部变量只允许布局量，不允许颜色。共享层（`game-ui.css`）禁止写裸主题色——`classContracts` 测试会拦。
- 断点白名单：宽 380/480/640/768/1024/1280，高 520/620。
- 动效只动 transform/opacity，遵守 `html[data-motion-level]` 四档。
- 每视口单一黄色 CTA；禁全屏忙碌遮罩。
- 改样式必查手机 + 桌面两分辨率；改完跑 typecheck；e2e 前同步 dist（e2e 跑的是构建产物）。
- 不通过自动重试、删断言、改截图基准来假装通过。
- 不用 git stash 做基线对比，改用 git worktree。
