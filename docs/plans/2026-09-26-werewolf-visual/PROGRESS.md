# PROGRESS · 唯一状态表

状态：TODO / IN_PROGRESS / IMPLEMENTED / BLOCKED / USER_CONFIRMED。只有用户看图说合格才能写 USER_CONFIRMED。

| 任务 | 内容 | 状态 | 证据（命令 + 退出码 / 截图路径） |
|---|---|---|---|
| W00 | 基线 + before 截图 | IMPLEMENTED | 2026-09-26。① `git status --short packages/client/src/game/werewolf` → 无输出（该目录干净，无未提交改动）。② `npm run typecheck` → 退出码 0；`npx tsx --test packages/client/tests/werewolf*.test.ts`（8 个文件）→ 退出码 0，61 pass / 0 fail。③ **before 截图已由父会话补采**（2026-09-27）：因 W01/W02 已改源码，改用项目推荐的 `git worktree add D:\项目-before-baseline HEAD` 拉起 HEAD 版本 → `npm run build` → Playwright 采集 → `git worktree remove --force` 清理（**未用 `git stash`**）。产出：`docs/superpowers/reports/2026-09-26-werewolf-visual/before/werewolf-1280x800.png`、`werewolf-390x844.png`（12 席、左 6 右 6 与 after 一致，便于逐项对照）。 |
| W01 | 只留剧场主题 + 剧场令牌 | IMPLEMENTED | 2026-09-26。机器门：`npm run typecheck` → 0；`npx tsx --test packages/client/tests/werewolfTheme.test.ts` → 0（7 pass）；狼人杀 8 个单测 + breakpoint/classContracts → 0（69 pass）；`npx eslint`（5 个改动文件）→ 0。`grep -rn "woodcut\|eclipse" packages/client/src` → 只剩 3 处注释（theme.ts ×2 / WerewolfThemeProvider.tsx ×1）+ 1 处**白名单外**残留：`ui/werewolf-result.css:22 [data-result-theme="eclipse-night"]`（属 W07 白名单，见「待用户决定」/差异记录）。改动文件：`theme.ts`、`WerewolfThemeProvider.tsx`、`ui/WerewolfSettingsDrawer.tsx`、`ui/WerewolfStage.tsx`、`theatre.css`、`werewolf-native.css`、`tests/werewolfTheme.test.ts`、`e2e/werewolf-result.spec.ts`；删除 `ui/WerewolfThemeSwitcher.tsx`、`ui/WerewolfThemeArt.tsx`。视觉判定：**待用户看图**（我未看到改造后的画面）。 |
| W02 | 剧场舞台骨架 + 票根席位 | IMPLEMENTED | 2026-09-27。**机器门**：`npm run typecheck` → 退出码 0；`npx tsx --test packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` → 退出码 0（5 pass / 0 fail）；`npx tsx --test packages/client/tests/werewolf*.test.ts` → 退出码 0（64 pass / 0 fail）；`npx eslint`（TheatreStage/TicketSeat/WerewolfStage）→ 退出码 0。**未跑** Playwright / build（父会话串行执行）。**改动文件**：新建 `ui/TheatreStage.tsx`、`ui/TicketSeat.tsx`、`ui/theatre-stage.css`；改 `ui/WerewolfStage.tsx`、`werewolf-native.css`。**视觉判定：待用户看图**（我无法读图，没有看到画面；依据只有方向稿 CSS 源码与 DOM 结构）。**C10 静态推理（非机器证明）**——我没有 Playwright，下面是算出来的，不是测出来的：① 纵向预算：`.werewolf-native-page` 是 `position:fixed; inset:0; height:100dvh; overflow:hidden` 的列向 flex，只有顶栏 / `main.layout` / footer 三段；`main` 是 `flex:1; min-height:0; overflow:hidden`，`.layout` 同为 `flex:1; min-height:0; overflow:hidden` 的三列 grid（左右 `minmax(180px,250px)`、中间 `minmax(0,1fr)`），所以包厢栏拿到的是「视口高 − 顶栏 − footer」的确定高度，任何视口都不会超出。② 席位行：`.seat-rail` 为 `grid-auto-rows:minmax(0,1fr)`（本次补的，与方向稿 `repeat(n, minmax(0,1fr))` 同义），n 个席位等分该确定高度 → 总和恒等于容器高，不产生滚动；1280×800 时 `main` 约 800−56(顶栏)−72(footer)−10(padding) ≈ 660，减包厢栏 32 padding − 5×12 gap = 568 / 6 行 ≈ 94px 行高；390×844 走 `compact` 竖版票根（票根 30 + 头像 32 + 名字 12×1.15 + 状态 10.5 ≈ 90），`main` 约 844−96−72−16 ≈ 660，减 24 padding − 5×10 gap ≈ 586 / 6 行 ≈ 97px，两者行高都大于票根固有高，因此 12 席全部可见。③ 横向：三列 `minmax(180px,250px)+minmax(0,1fr)+minmax(180px,250px)` 在 1280 下取 250/250，中间 1280−500−24gap−2×2% ≈ 700；390 下 `max-width:768px` 把两栏压到 86，中间 390−172−16−16 ≈ 186。④ 兜底：`TicketSeat` 本次补接了 `useCompactLayout()`（断点 `(max-width:768px), (orientation:landscape) and (max-height:520px)`，与 CSS 同一条件），此前 `compact` 属性从未被传入、`.seat.ticket.compact` 整段是死样式。**风险提示**：`e2e/game-viewport-contract.spec.ts` 的越界扫描会 `isClippedByAncestor` 跳过「祖先 overflow:hidden」的元素，`.werewolf-native-page` 正是 `overflow:hidden`，所以那条用例即使席位真的溢出也不会红——**它不能当作 C10 的证明**，C10 必须靠父会话的 1280×800 / 390×844 截图判定。 |
| W02 补充 | 编码损坏修复 + 两处回归回补 | IMPLEMENTED | 2026-09-27。本行记录我在 W02 收尾时对**并发写入遗留**的修复（原 agent `7b9ba107` 上下文耗尽后被父会话中断，磁盘留下未完成状态）。① `ui/theatre-stage.css` 被 PowerShell「UTF-8→GBK→UTF-8」双重编码写坏：46 个注释块全部乱码 + 1 处**用户可见文案**损坏（出局票根的 `content: "作废"` 变成 `content: "浣滃簾"`，且同文件另一处 `content: "已放逐"` 曾丢闭合引号）。已按块序重写全部注释并修回 `作废`；修复后校验：BOM 已去除、注释区外非 ASCII 仅剩 5 字（`作废已放逐`）、替换符 U+FFFD 0 个、花括号 198/198 平衡。② 回补 `RoleTurnOverlay`：原 agent 把夜间职业演出层一并删了，但它**不在 W02 删除清单**（清单只列森林 SVG / 月蚀星轨 / `.theatre` / `art-caption` / `.next` / 中央票型按钮），且 `e2e/werewolf-ui-fixes.spec.ts:44-56` 依赖 `.ww-role-turn-overlay[data-role="wolf"]` 可见并落在 `.art` 盒内。已恢复渲染，几何仍与 `.art` 同界（`.ww-stage__center` 与 `.ww-role-turn-overlay` 都是 `inset:0`）。③ 保留 e2e 钩子：`.seat-rail` / `#seats-left` / `#seats-right`（`werewolf-tabletop.spec.ts:103-105,265-267` 硬断言 12/7 席与 6/4/3 分配）、`.chapter`（同文件 :121）、`.art` 盒（`werewolf-ui-fixes.spec.ts:52,92`）。机器门同上（修复后重跑三项全 0）。 |
| W02 待用户决定 | — | PENDING | ① **视觉判定**：全部 W02 画面一律「待用户看图」，我未看到画面，不写 PASS / 达标。② **`.stage-top` 去留**：`WerewolfStage.tsx` 仍在 `<TheatreStage>` 内渲染 `<div className="stage-top">`（kicker + 倒计时），而契约 §4.0 的中央台口结构并未列出这一条，方向稿 A2 也没有对应块；我按「只补缺口、不推倒重来」原样保留，等用户看图决定要不要并进发言者或删掉。③ **`.ww-stage-topbar` / `.ww-stage-dock` / `.ww-btn` 等新类**：`theatre-stage.css` 里写了这组顶栏/底部/按钮配方，但 `WerewolfStage.tsx` 实际用的是既有 `.ww-topbar` / `.ww-stage-dock` / `.ww-global-action-btn` 体系，两组目前**并存未合并**，属于 W08 或后续统一项。④ **`.seat-rail .seat` 的动效类名**：`native-game-motion.css` 仍按旧类名驱动（`.seat.active` / `.is-actionable` / `.is-my-target` / `.out`），而 `TicketSeat` 产出的类名是 `is-speaking` / `pickable` / `is-picked` / `is-dead`，**脉动与微光不会生效**；该文件不在 W02 白名单，我没有改。 |
| W03 | 白天发言 + 天亮公告 + 交麦 | USER_CONFIRMED | 2026-09-28。**机器门**：`npm run typecheck` → 0；`npx tsx --test packages/client/tests/werewolf*.test.ts packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` → 0（70 pass，含新增「W03：讨论阶段派生发言顺序 / 当前下标 / 下一位」）；`npx eslint`（4 个改动文件）→ 0；`npm run build` → 0；`npx playwright test e2e/motion-contract.spec.ts -g werewolf` → 2/2；`e2e/game-viewport-contract.spec.ts -g werewolf` → 3/3；`e2e/werewolf-tabletop.spec.ts` → 3/3；`e2e/werewolf-visual-shots.spec.ts`（W03 场景）→ 1/1（2.2m，真实 12 人局 + 11 人自动驾驶 + 浏览器 6 号团子）。**改动文件**：`presentation.ts`（新增派生 `speakingOrderIds` / `speechOrderIndex` / `nextSpeakerId`，未改旧字段）、新建 `ui/SpeakerSpotlight.tsx`、`ui/WerewolfStage.tsx`、`ui/theatre-stage.css`、`tests/werewolfPresentation.test.ts`；新增基础设施 `e2e/helpers/werewolfAutopilot.ts`、`e2e/werewolf-visual-shots.spec.ts`、`dbClient.ts`（新增 nicknames 选项）。**截图（中间态验证图）**：`D:\项目\test-results\werewolf-w03\werewolf-speech-1280x800.png`、`werewolf-speech-390x844.png`、`werewolf-speech-self-1280x800.png`、`werewolf-speech-self-390x844.png`（倒计时数字已按规范 mask）。**截图事实描述**：1280×800 下左 6 右 6 票根，中央暖追光 + 圆形头像 + 衬线大字「夜行的猫头鹰」+「5 号 · 第 4 / 11 位发言」+ 倒计时环；5 号票根金边「发言中」、6 号「下一位」、2–4 号「已发言」、7 号起「待发言」；1 号「作废 · 出局」；底部无黄色按钮（等待态为深色禁用）。390×844 下紧凑竖版票根 12 席全部在视口内；轮到 6 号时中央大字「轮到你了」，底部唯一黄色「发言完毕 · 交麦」。**视觉判定：待用户看图**（截图已产出，AI 不自评）。 |
| W04 | 入夜 / 夜间行动 | USER_CONFIRMED | 2026-09-28。**机器门**：`npx tsx --test packages/client/tests/werewolf*.test.ts` + breakpoint/classContracts → 75 pass / 0 fail；`npx eslint`（改动文件）→ 0；`npx vite build` → 0；`npx playwright test e2e/werewolf-visual-shots.spec.ts -g W04` → 3/3（night-wolf / night-witch / night-sleep 真实 12 人局）。**注意**：`npm run typecheck` 全量红，但错误全部在**他人并行改动**的文件（`packages/games/uno/tests/house/schemas.test.ts` 缺 `lastRound`、`night-testimony/` 缺 `triggerRef`），狼人杀范围 0 错误；本会话期间该代理还在并发写代码/跑 e2e（占 3178 端口）。**改动文件**：`presentation.ts`（新增 `self.lastGuardTargetPlayerId`，契约 §2 白名单内字段）、新建 `ui/NightWake.tsx`、`ui/WerewolfStage.tsx`（夜间两步确认：点票根只选中 → 唯一黄色确认按钮发送；女巫药瓶流；闭眼态 `data-view="sleep"` 全席压暗）、`ui/TicketSeat.tsx`（`nightMark`/`picked`）、`ui/theatre-stage.css`（11.6 节 ww-wake/ww-potions/sleep 压暗）、`e2e/werewolf-ui-fixes.spec.ts`（夜间演出断言从 `.ww-role-turn-overlay` 改到 `.ww-wake`，主题遍历改单档——断言意图不变）、`e2e/werewolf-visual-shots.spec.ts`（+3 用例）。**修复**：身份插画原 `height:100%` 在 `place-items:center` 的 grid auto 轨道里被内容撑爆（实测 img 高 242px 超出 180px 容器，压住 kicker），改绝对定位 + margin auto 后 img 归位。**截图**：`test-results/werewolf-w04/werewolf-night-{wolf,witch,sleep}-{1280x800,390x844}.png` + `werewolf-night-witch-poison-pick-390x844.png`。**事实描述**：狼人场景中央冷月光晕 + 狼插画 +「狼人请睁眼」+「已选 4 号，点黄色按钮确认」，队友票根「同伴 · 选了 4 号」红字 + 小狼爪，4 号 Kiki 票根金边「已选择」+ 红爪印章，底部唯一黄色「确认袭击 · 4 号 →」；女巫场景「女巫请睁眼」+「今晚 4 号 Kiki 倒下了」+ 解药/毒药两瓶 + 4 号票根「今晚倒下」红边；村民闭眼场景狼插画压成黑剪影 +「狼人正在行动」+「你是 村民，今夜无需操作」+ 全席压暗、自己 90%「闭眼中」、无黄色按钮。**视觉判定：待用户看图**。 |
| W05 | 投票 / 唱票 / 放逐 / 遗言 | USER_CONFIRMED | 2026-09-28。**机器门**：单测 75 pass（含新文件 `tests/werewolfVoteCount.test.ts` 5 例：空票型/升序展开/同票按席位/字典序兜底/纯函数不改入参）；eslint 0；vite build 0；e2e 截图用例（vote/count/exile）结果见 pwsh-4 总闸输出。**改动文件**：`presentation.ts`（voteLedger.rows 增 `playerId`/`seatLabel`；新增 `runoffCandidateIds` 派生）、新建 `ui/VoteUrn.tsx`（票箱 + 进度点）、`ui/VoteCount.tsx`（含纯函数 `buildBallotQueue`：按得票升序、每票一项）、`ui/WerewolfStage.tsx`（投票 VoteUrn / 唱票 VoteCount + WAAPI 飞票 480ms/张 + 落定 bump + 放逐撕票 640ms + 轻屏震 / 遗言 SpeakerSpotlight）、`ui/TicketSeat.tsx`（`torn`、票数徽章按 count 作 key 重播 bump）、`ui/theatre-stage.css`（11.7 节 ww-vcenter/ww-urn/ww-ballot/torn/降级）、`e2e/werewolf-visual-shots.spec.ts`（+1 用例）。**差异**：唱票只公开得票数，座位「已投/投票中」因服务端不下发逐人已投状态而只在本人票根显示「你 · 已投/未投」；`VoteCount/VoteUrn` 不引 CSS（node --test 加载器不认 .css，样式由 TicketSeat 统一加载）。**视觉判定：待用户看图**。 |
| W06 | 发身份 | USER_CONFIRMED | 2026-09-28。**机器门**：单测 75 pass；eslint 0；vite build 0；e2e `W06 发身份` 用例结果见 pwsh-4 总闸输出。**改动文件**：`presentation.ts`（新增 `roleRevealProgress`/`roleConfirmedIds` 派生）、新建 `ui/RoleDealCard.tsx`（中央大牌：card_back.png 卡背 → 点翻 → 身份插画 + 阵营胶囊 + 衬线身份名 + 技能 + 翻开扫光；防窥纪律与 shared-ui/IdentityFlipCard flip 模式一致：切后台/失焦立即扣回）、`ui/WerewolfStage.tsx`（翻开前不渲染黄色「我已记住身份并就绪」；票根状态行 查看中/已确认）、`ui/theatre-stage.css`（11.8 节 ww-deal/扫光/降级）、`e2e/werewolf-visual-shots.spec.ts`（+1 用例）。**差异**：未直接复用 IdentityFlipCard 组件本体（其 flip 态视觉与 R-reveal 稿差异大），复用的是它的防窥语义（visibilitychange/blur/pagehide 扣回），已在此声明。**视觉判定：待用户看图**。 |
| W07 | 终局揭晓 | USER_CONFIRMED | 2026-09-28。**机器门**：单测 75 pass；eslint 0；vite build 0；e2e `W07 终局揭晓` 用例 + `werewolf-result.spec.ts` 结果见 pwsh-4 总闸输出。**改动文件**：`presentation.ts`（reveal.rows 增 `role/team/seatLabel/artworkUrl/detail`——**可选字段**，moderator 视图不填不回填以遵守「不动 moderator/*」；新增 `finaleDays`（只来自公开 voteHistory 的白天放逐日；夜间死亡服务端不携带天数，故小条不列夜间条目——差异点）、`winnerLineup`）、新建 `ui/FinaleReveal.tsx`、`ui/GameOverReveal.tsx`（新增 `autoOpen` prop，默认 true 保持真人主持端行为不变；剧场舞台传 false 改模态-only）、`ui/WerewolfStage.tsx`（终局票根逐张翻面 200ms/张 + 胜方金光/败方 62% + 中央盖章 + 复盘按钮移入底部）、`ui/theatre-stage.css`（11.9 节）、`e2e/werewolf-result.spec.ts`（先点「查看终局复盘」再进弹窗断言，意图不变）。**视觉判定：待用户看图**。 |
| W08 | 截图组 + 报告 + 构建 | TODO | |

## 待用户决定

（执行中遇到方向稿与计划都没写的细节，写在这里，停下等用户。）

## 与方向稿的差异记录

（实现与方向稿不一致的地方逐条记下，含原因。）

## 用户看图记录

（用户原话逐字记录。）

- 2026-09-27 用户：「先把那些已经定好的完成」→ 选定先做 W00–W02，做完停下来给用户看图。
- 2026-09-28 用户：「帮我按照 Claude 做出来的计划和参照 HTML 效果去修改和完善狼人杀的页面，尤其是手机版页面」→ 继续执行 W03–W08，每任务产双视口截图，手机版（390×844）为重点校验视口。
- 2026-09-28 用户（看 W03–W07 全阶段桌面 + 竖屏截图后）：「我看了一下，基本上都很好。唯一的问题就是在竖屏情况下，如果人数较多，会有部分被遮挡的问题。」→ **桌面（1280×800）各阶段视觉获用户确认**；竖屏（390×844）12 人时底部席位被裁需修（见下「W07 竖屏遮挡修复」）。
- 2026-09-28 用户（竖屏修复方向建议）：「因为竖屏下的空间非常稀有…要不要把它的宽度稍微降低一些？然后把那些内容压缩，但是排版也要正常显示，能腾出更多的空间呢？」→ 采纳：包厢栏收窄（72/60px）+ 票根内容压缩 + 让中央舞台变宽。
- 2026-09-28 用户（看竖屏修复 before/after 后）：「先这样确认吧，其他的我已经进行中，不用做其他游戏了」→ **狼人杀竖屏遮挡修复确认合格；桌面 + 竖屏整体视觉通过**。用户已自行推进其他游戏，本会话不再逐款游戏产验证截图。

## W07 竖屏遮挡修复（2026-09-28）

- **现象**：390×844、12 人终局，左右包厢栏各 6 席，第 6 席被裁（`overflow:hidden` 裁掉底部）。
- **根因（实测非推断）**：包厢栏 JSX 类名是 `box-rail seat-rail`（单 w），而唯一给 `display:grid` 的 CSS 规则是 `.ww-box-rail`（双 w，`theatre-stage.css:240`）——**类名笔误，包厢栏从来不是 grid 容器**。`werewolf-native.css` 里 `.werewolf-native-page .seat-rail` 只写了 `grid-auto-rows:minmax(0,1fr)+align-content:stretch` 但没 `display:grid`，属性全程惰性。席位按内容高堆叠（103–116px×6≈651px）塞进 593px 栏 → 第 6 席溢出被裁。桌面栏够高，6 席恰好堆得下，所以未暴露。
- **修复**：`werewolf-native.css` `@media (max-width:768px)` 内给 `.werewolf-native-page .seat-rail { display: grid; }`，激活既有 `grid-auto-rows:minmax(0,1fr)+align-content:stretch`；同时 `.layout` 加 `grid-template-rows:minmax(0,1fr)` 给栏确定高度。**仅作用竖屏**，桌面维持用户已确认外观。另收窄包厢栏（@768 86→72px、@380 74→60px）+ 压缩 `.seat.ticket.compact` 内容（号码字号 21→18、头像图 26→22、名字 12→11.5、tag 10.5→10、body padding/gap 收紧），把宽度让给中央舞台。
- **实测证据**（临时埋点 `page.evaluate` 量几何，量完已撤）：修复后栏 clientH=593，6 席各 99px，`seat6 top=594 bottom=693`，`clippedBelowRail:false`（6 席全部），dock top=701 不重叠。修复前：栏 clientH=593 scrollH=651，`seat6 bottom=751 clippedBelowRail:true`。
- **机器门**：`npm run build -w @ldj/client` → 0；`npm run typecheck` → 0；`npx playwright test …-g "W07"` → 1 passed。
- **before/after 同视口截图**：`output/werewolf-shots/_portrait-fix/before|after/werewolf-finale-{wolves,village}-390x844.png`。
- **视觉判定：用户已确认（2026-09-28）**（原话「先这样确认吧」；已看 before/after 竖屏对照）。


## W03 起执行中的裁定（记入差异）

- **`.stage-top` 收缩方案**：迁移完成的阶段（W03：discussion / free_discussion / day_announcement）不再渲染 `.stage-top`，信息并入 SpeakerSpotlight 的 kicker + 倒计时环；未迁移阶段暂保留，W07 全部迁移后删除（替代原「待用户决定」项 ②——按 A2 方向稿中央结构裁定）。**2026-09-28 更新：W03–W07 全部阶段已迁移，`.stage-top` 与旧 `.speaker` 文本块已不再为任何已知阶段渲染（保留代码作未知阶段兜底）。**
- **底部等待态按钮**：由 `primary`（黄）改为深色禁用态，满足「同视口黄色主按钮 ≤1」契约。
- **交麦按钮文案**：展示层把 `finish_speech` 的「结束发言」改写为契约文案「发言完毕 · 交麦」，不改服务端动作。
- **RoleTurnOverlay 下线**：W04 用 NightWake 接管夜间中央（同一 `.art` 盒、同一身份插画、新增 art-in 出场动效），`ui/RoleTurnOverlay.tsx` 文件保留但不再被调用；`e2e/werewolf-ui-fixes.spec.ts` 的夜间演出断言相应改选 `.ww-wake`（意图：夜间职业演出落在舞台中央、有入场动效、插画就绪——不变）。
- **唱票「已投/投票中」逐座标签未实现**：方向稿 V-vote 在投票阶段给每个票根标「已投/投票中」，但服务端只下发聚合数（`votesSubmitted/votesExpected`）不下发逐人已投状态，隐私红线也不允许推导；本人票根显示「你 · 未投/已投」，他人不标。
- **终局逐日小条只含白天放逐日**：方向稿 R-reveal 的小条含「第 N 夜 被袭击」，但服务端公开视图不含夜间死亡的天数（`exitReason` 只有死因），`finaleDays` 只从 `voteHistory` 派生；票根死因对放逐显示「第 N 天 · M 票放逐」，夜间死亡显示「夜里被袭击/被女巫毒杀/被猎人带走」（无天号）。
- **IdentityFlipCard 组件本体未复用**：W06 复用其防窥语义（切后台/失焦/页面隐藏立即扣回），视觉按 R-reveal 稿的 `card_back.png` 大卡实现；方向稿与 IdentityFlipCard 的 gothic 卡面差异较大。
- **e2e 端口 3178 孤儿进程**：Playwright 在 Windows 下 teardown 杀不掉 `start-server.mjs` 的孙进程（`packages/server/src/index.ts`），多轮跑会留孤儿占端口；本轮对策为「跑前检测父进程已死的 3178 持有者并清理」，未改 `start-server.mjs`（共享基础设施，影响面超出本计划）。

## 父会话串行验证（Playwright / build；子代理被禁止执行）

以下为**父会话**（有 Playwright 与读图能力）在 W02 收尾后实测的结果，补上子代理无法完成的机器证明：

| 项 | 命令 | 结果 |
|---|---|---|
| 生产构建 | `npm run build` | 退出码 0，无 CSS 语法告警 |
| 视口合约（狼人杀三端） | `npx playwright test e2e/game-viewport-contract.spec.ts -g werewolf` | 3/3 passed |
| DOM 事实（1280×800） | 真实 12 人房 + 浏览器玩家 | `.seat-rail` ×2；`.seat` ×12；`#seats-left` 6；`#seats-right` 6；`.seat.ticket` ×12；`.art` = 705×656 且 `display ≠ none`；`.chapter` 有文本 |
| DOM 事实（390×844） | 同上 | `.seat` ×12；`.seat.ticket.compact` **×12**（修复前为 0）；`.art` = 186×671 可见 |
| **席位卡溢出实测**（1280×800） | 对 12 张卡逐个量「卡内可见后代是否越出卡片矩形」 | **越界 0 处，最大 0px** |
| **席位卡溢出实测**（390×844） | 同上 | **越界 0 处，最大 0px**（修复前：**60 处越界、最大 61px** —— 名字与状态被挤出卡外） |
| C10（12 席免滚动看全） | 上面两档截图 + 溢出实测 | 12 席全部在视口内、`documentElement.scrollHeight` == 视口高（800 / 844），无滚动 |

> 说明：子代理只能做静态推理；上表是父会话**实测**结果。C10 因此不再是「仅静态推理」。

### 已产出截图（父会话采集，供用户看图）

**W00 before 组**（从 `git worktree add D:\项目-before-baseline HEAD` 的 HEAD 版本构建后采集；用后已 `git worktree remove --force` 清理，未用 `git stash`）：

- `D:\项目\docs\superpowers\reports\2026-09-26-werewolf-visual\before\werewolf-1280x800.png`
- `D:\项目\docs\superpowers\reports\2026-09-26-werewolf-visual\before\werewolf-390x844.png`

**W02 after 组**（中间态验证图，`role_reveal` 阶段）：

- `D:\项目\test-results\werewolf-w02\werewolf-1280x800.png`
- `D:\项目\test-results\werewolf-w02\werewolf-390x844.png`

**看图事实描述（只描述，不评价）**：

| 视口 | before（HEAD） | after（W02） |
|---|---|---|
| 1280×800 | 米白/奶油"纸面"底；左右各 6 张白色圆角长方形席位卡（大号数字 01–12 + 名字 + 「存活」），无票根齿孔；中央是**深绿森林狼头插画**（白底深绿几何狼 + 两侧斜线纹），上方小字「林中证词」；底部深绿「我已记住身份并继续」按钮 | 深色剧场底；顶部台口拱门 + 红色条纹幕布 + 中央暖色锥形追光 + 底部一排脚灯；左右各 6 张**票根卡**（左上 SEAT 小字 + 大号衬线数字，虚线齿孔分隔，右侧头像 + 名字 + 「存活」）；底部「我的身份 / 仅自己查看」+ 金色「我已记住身份并继续」 |
| 390×844 | 同上纸面底；席位卡为横向长条（数字 + 名字 + 存活）；中央森林狼头插画缩小 | 深色剧场底；台口拱门 + 红幕 + 追光；席位卡转为**紧凑竖版票根**（上：数字；下：头像 + 名字 + 存活），12 席全部在视口内 |

> 关键差异：**"每款一个世界"落地前是米白纸面 + 森林插画，落地后是赤幕剧场**（DESIGN-DIRECTION C1 / 狼人杀改口为"只要剧场"）。W01 起已删除森林/月蚀主题与主题切换入口。

> 这是 W02 的**中间态验证图**，不是 W08 的正式截图组；正式截图组在 W08 按 `03-ACCEPTANCE.md` §2 的 11 画面 × 2 视口采集。
