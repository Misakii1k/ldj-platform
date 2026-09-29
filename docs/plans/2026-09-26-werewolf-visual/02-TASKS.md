# 02 · 任务卡（W00–W08）

所有路径以 `D:/项目/` 为根。每张卡：**白名单**之外的文件不许改；**完成判据**全部满足才可把状态改成 IMPLEMENTED。
W02–W07 都改 `ui/WerewolfStage.tsx`，严格串行。建议把新画面拆成子组件，避免 `WerewolfStage.tsx` 继续膨胀。

下文 `WW = packages/client/src/game/werewolf`。

---

## W00 · 基线（不改代码）

- **做**：记录现状，便于之后 before/after。
  1. `git status --short packages/client/src/game/werewolf` 记入 PROGRESS。
  2. 跑 `npm run typecheck`、`npx tsx --test packages/client/tests/werewolf*.test.ts`，记退出码。
  3. 按 `03-ACCEPTANCE.md` §2 的截图清单截**改造前**的 before 组（能截到几张算几张，截不到的阶段写原因），落到 `docs/superpowers/reports/2026-09-26-werewolf-visual/before/`。
- **白名单**：只写 `docs/plans/2026-09-26-werewolf-visual/PROGRESS.md` 与 before 截图目录。
- **完成判据**：PROGRESS 里有 git 状态、两条命令退出码、before 截图绝对路径清单。

---

## W01 · 只留剧场主题 + 剧场令牌

- **做**：
  1. `WW/theme.ts`：主题对只剩 `theatre`；`resolveWerewolfTheme` 只返回 `theatre-day` / `theatre-night`；旧存储值（`forest` / `woodcut` / `eclipse` / 任何未知值）一律迁移为 `theatre`。保留 `resolveThemePeriod` 逻辑不变。
  2. `WW/WerewolfThemeProvider.tsx`：去掉 `setPair` 的主题选择能力（可保留签名返回 no-op，避免消费者报错）。
  3. `WW/ui/WerewolfSettingsDrawer.tsx`：删除主题切换那一块 UI；其余设置不动。
  4. 删除 `WW/ui/WerewolfThemeSwitcher.tsx`、`WW/ui/WerewolfThemeArt.tsx`（先 grep 确认无其他引用；`WerewolfThemeArt` 里对 `WerewolfThemeKey` 的类型引用一并清掉）。
  5. `WW/theatre.css`：删除 woodcut / eclipse 两段作用域；**`theatre-day` 改为暗场**（与 `theatre-night` 同底色，只是灯光不同，见契约 §1）；在剧场作用域写入契约 §3 的全部 `--ww-*` 令牌。
  6. `packages/client/tests/werewolfTheme.test.ts`：按新行为改断言（旧值迁移到 theatre；只有两种渲染主题）。
- **白名单**：上面 6 个文件 + `WW/werewolf.css`、`WW/werewolf-native.css`（仅删除 woodcut / eclipse 专属选择器）+ `e2e/werewolf-result.spec.ts`（若它循环主题，改成只测 `theatre-day` / `theatre-night`）。
- **不许**：改 `moderator/*` 的逻辑。真人主持两端只需编译通过、页面不白屏（它们会自然落到剧场主题）。
- **完成判据**：`npm run typecheck` 0；`werewolfTheme.test.ts` 通过；全仓 `grep -rn "woodcut\|eclipse" packages/client/src` 无残留（注释除外）；AI 法官模式页面进入后顶栏无主题切换、底色为暗红。

---

## W02 · 剧场舞台骨架 + 剧场票根席位

- **参照**：`A2-box-wings.html`（白天）、`N-night.html`（夜，看红幕 / 脚灯 / 暗角）。
- **做**：
  1. 新建 `WW/ui/TheatreStage.tsx`：纯展示组件，渲染台口拱门、帷幔、左右红幕、地板、脚灯、锥形追光、追光落点；props：`period: 'day' | 'night'`，`children`（中央内容插槽）。昼夜切换按契约 §5 第一行。
  2. 新建 `WW/ui/TicketSeat.tsx`：一张剧场票根卡；props 取 `WerewolfSeatModel` + `compact` + 额外展示态（`stamp`、`voteCount`、`revealRole`、`tone` 等可选）；实现契约 §4.1 全部状态。点击回调沿用现有 `handleSeatClick`。
  3. 新建 `WW/ui/theatre-stage.css`：把方向稿 `_shared.css`（台口、帷幔、红幕、地板、脚灯、追光、倒计时环、发言者）与 `_ticket.css` 的样式移植过来，**字面量色全部换成 `--ww-*` 令牌**，字体换成 `--gp-font-display`。只用断点契约允许的宽度 `380/480/640/768/1024/1280` 与高度 `520/620`。
  4. `WerewolfStage.tsx`：左右 `aside.seat-rail` 改为包厢栏 + `TicketSeat`（右栏自下而上排）；中央 `section.stage` 改为 `<TheatreStage>`；**删除** 森林 SVG、月蚀星轨、旧 `.theatre` 块、`art-caption`、`.next`、中央 `#ledger` 按钮；顶栏改为契约 §4.0（票型记录并入顶栏 📜 图标，打开现有 ledger 弹窗）。
  5. 中央暂时保留原 `.speaker` 文本（W03 再替换）。
- **白名单**：`WW/ui/WerewolfStage.tsx`、新建的 3 个文件、`WW/werewolf-native.css`、`WW/werewolf.css`、`WW/theatre.css`。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` 通过；`npx playwright test e2e/game-viewport-contract.spec.ts` 狼人杀相关用例通过；1280×800 与 390×844 下 12 人无需滚动即可看到全部席位（C10）。

---

## W03 · 白天发言 + 天亮公告 + 交麦演出

- **参照**：`A2-box-wings.html`（发言者用 A 原版圆形头像，**不是**拱形海报——用户已否定海报）。
- **做**：
  1. 新建 `WW/ui/SpeakerSpotlight.tsx`：契约 §4.5 的中央发言者（kicker / 圆形头像 / 衬线大名字 / 顺序行 / 倒计时环）。头像用现有 `getSpeakerIllustrationUrl`。
  2. 倒计时环：优先复用 `shared-ui` 已有倒计时（`useCountdown` / `TabletopCountdownText`）拿秒数，环自己画；≤10 秒 `warn`，≤5 秒 `crit` 脉冲。
  3. 票根状态行：发言中 / 下一位 / 已发言 / 待发言（从 `speakingOrder` 与当前发言者推导；需要时在 `presentation.ts` **新增**只读派生字段 `speechOrderIndex` / `nextSpeakerId`，不改旧字段，并补单测）。
  4. 交麦飞行：`seats` 里 `isSpeaking` 的席位变化时，从旧席位飞一枚 🎙 金球到新席位（Web Animations API，560ms）；落点回弹 + 屏震 + 名字 slam。四档降级见契约 §5。
  5. `free_discussion` 与 `day_announcement` 按契约 §4.2 / §4.5 文案。
  6. 底部：只有轮到你时出现唯一黄色「发言完毕 · 交麦」。
- **白名单**：`WerewolfStage.tsx`、新建 `SpeakerSpotlight.tsx`、`theatre-stage.css`、`presentation.ts`（仅新增字段）、`packages/client/tests/werewolfPresentation.test.ts`。
- **完成判据**：typecheck 0；presentation 单测通过；`npx playwright test e2e/motion-contract.spec.ts` 通过；同一视口黄色主按钮 ≤1 个。

---

## W04 · 入夜 / 夜间行动

- **参照**：`N-night.html` 五个视角逐一对照。
- **做**：
  1. 新建 `WW/ui/NightWake.tsx`：契约 §4.4 的中央（身份插画 + 冷月光 + kicker / 大字 / 说明 / 倒计时；女巫多两个药瓶按钮；闭眼等待态黑剪影）。插画用 `WEREWOLF_ROLE_ARTWORK`。现有 `RoleTurnOverlay` 的出场节奏可复用或替换，替换则删除其调用。
  2. 票根夜间态：印章（四种颜色 / 图案）、狼队友小爪 + 同伴选择、被刀红光、昨晚已守不可点、预言家查验翻面、非你回合全体压暗。
  3. 选目标改为直接点票根（`targetActions.length === 1` 直接选中高亮，**再点黄色主按钮才发送**——注意现在是点席位立即发送，要改成"选中 → 确认"两步）；`targetActions.length > 1` 仍可弹原 target 弹窗。
  4. 预言家查验结果：删除旧 `ww-seer-verdict-card`，改为票根翻面 + 中央说明。
  5. 猎人 `hunter_shot`：同结构，印章 🎯，主按钮「开枪 · N 号」、次要「不开枪」。
- **白名单**：`WerewolfStage.tsx`、新建 `NightWake.tsx`、`TicketSeat.tsx`、`theatre-stage.css`、`ui/RoleTurnOverlay.tsx`（如替换则删除）。
- **完成判据**：typecheck 0；`npx playwright test e2e/werewolf-unified.spec.ts e2e/werewolf-ui-fixes.spec.ts` 通过（若断言依赖被删的旧 DOM，**改选择器不改断言意图**，并在 PROGRESS 列出改了哪些）；夜间非本人回合 DOM 里不出现任何他人身份文字。

---

## W05 · 投票 / 唱票 / 放逐 / 遗言

- **参照**：`V-vote.html` 四步 + 「平票加赛版」。
- **做**：
  1. 新建 `WW/ui/VoteUrn.tsx`：投票中央（票箱、大字、已投进度点、倒计时）；投票态票根：选中高亮、其他人状态只写「已投 / 投票中」（来源：`voteProgress` 只给人数，所以**逐人状态不显示谁已投**——若服务端不提供逐人已投信息，状态行留空，不得编造）。
  2. 选人同 W04：点票根选中 → 黄色「投给 N 号」确认；「弃票」次要按钮。加赛轮候选人无按钮。
  3. 新建 `WW/ui/VoteCount.tsx`：进入 `vote_result` 时按 `voteLedger.rows` 从少到多播放飞票 + 徽章 +1；播完锁定最高票。**同一个 `vote_result` 只播一次**（按 `day + kind` 记已播，刷新页面直接显示最终态）。
  4. 结果：`eliminated` 撕票（两半复制裁切，下半下落）→ 原位「已放逐」空位；`tie` 候选人橙边；`idiot_saved` 白痴印章；`no_votes` / `runoff_tie` 文案（契约 §4.6 ③）。
  5. `last_words`：追光锁定被放逐者 + 中央头像 / 名字 / 倒计时；是你时「遗言结束」。
- **白名单**：`WerewolfStage.tsx`、新建 `VoteUrn.tsx`、`VoteCount.tsx`、`TicketSeat.tsx`、`theatre-stage.css`、`ui/VoteLedger.tsx`（可复用或删除）。
- **完成判据**：typecheck 0；motion-contract 通过；新增一条单测：给定 `voteLedger.rows = [{4号,5},{3号,3},{10号,1}]` 时播放队列顺序为 10,3,3,3,4,4,4,4,4（写成纯函数 `buildBallotQueue` 并测试）；DOM 中不存在"X 投给 Y"的文字。

---

## W06 · 发身份

- **参照**：`R-reveal.html` ①。
- **做**：新建 `WW/ui/RoleDealCard.tsx`（契约 §4.3）。优先复用 `shared-ui/IdentityFlipCard.tsx` 的状态机（`reduceIdentityCardState` / `computeIsRevealed`），外观按方向稿重写；失焦盖回沿用现有 blur / visibilitychange 逻辑。「我记住了」发 `confirm_role`。
- **白名单**：`WerewolfStage.tsx`、新建 `RoleDealCard.tsx`、`theatre-stage.css`。
- **完成判据**：typecheck 0；`e2e/werewolf-tabletop.spec.ts` 的 `confirm_role` 流程仍通过（按新 DOM 改选择器）；role_reveal 阶段 DOM 只含本人身份。

---

## W07 · 终局揭晓

- **参照**：`R-reveal.html` ②（好人胜、狼人胜两种都对照）。
- **做**：新建 `WW/ui/FinaleReveal.tsx`（契约 §4.7）：票根逐张翻面 → 胜方金光 → 胜负大字盖章 + 屏震 → 胜方插画按身份合并并排 → 底部每日小条（来自 `reveal.voteHistory` 与各玩家 `exitReason`；需要时在 `presentation.ts` 新增派生字段 `finaleDays`，补单测）。现有 `GameOverReveal` 改为「查看完整复盘」弹窗内容，不再占据舞台。「再来一局」沿用现有返回房间逻辑。**同一局只播一次**，刷新直接显示最终态。
- **白名单**：`WerewolfStage.tsx`、新建 `FinaleReveal.tsx`、`TicketSeat.tsx`、`theatre-stage.css`、`ui/GameOverReveal.tsx`、`ui/werewolf-result.css`、`presentation.ts`（仅新增）、`packages/client/tests/werewolfResultRoster.test.ts`。
- **完成判据**：typecheck 0；`npx playwright test e2e/werewolf-result.spec.ts` 通过；终局前 DOM 不含他人身份。

---

## W08 · 截图组 + 报告

- **做**：按 `03-ACCEPTANCE.md` 跑全部机器门；采集 §2 的 after 截图组到 `docs/superpowers/reports/2026-09-26-werewolf-visual/after/`；写报告 `docs/plans/2026-09-26-werewolf-visual/REPORT.md`（§3 模板）；`npm run build` 同步 `packages/client/dist`。
- **白名单**：截图目录、`REPORT.md`、`PROGRESS.md`、可新增一个只用于截图的 e2e 文件 `e2e/werewolf-visual-shots.spec.ts`。
- **完成判据**：机器门全 0；截图清单每一格都有 after（截不到的写原因）；报告「用户结论」列留空；PROGRESS 各任务改为 IMPLEMENTED，等待用户看图。
