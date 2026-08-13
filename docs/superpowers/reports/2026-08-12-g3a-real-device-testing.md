# G3-A 真机测试顺畅化：新游戏规则机器人 + 邀请深链/大厅二维码

## 结论
**通过。** 本轮解决真人真机测试的两个痛点：① 5 款新游戏支持「添加规则机器人」凑满人数；② 邀请深链 `/join/<房间码>` + 大厅二维码 + 复制邀请链接，扫码直达加入页并自动填房间码，显著降低进房门槛。

## 一、5 款新游戏补规则机器人（测试陪练级）

### 机器人策略
每款游戏在 `server/bot.ts` 实现 `pickBotAction(input: { view, playerId, random })`（纯函数，只读该玩家视角，返回合法 PlayerAction 或 null；null = 此刻不该动，由计时器/系统推进；动作必须过 `parseAction` + `playerMatches` + `reduce`）。

| 游戏 | 策略 |
|---|---|
| 铃铛对决 | 轮到自己：优先出与桌面同色/同数字的牌，出不了摸牌；按铃窗口已有人拍铃返回 null |
| 奶酪大盗 | 4 人局 `choose_hour` 随机选时刻；独醒村民 50/50 偷看他人骰子或跳过；共犯按人数档随机选；身份卡猫/狗按需揭示；投票随机投非自己或弃票 |
| 以鹅传鹅 | 头鹅/传递轮到即确认；指认随机指非自己；投票随机投非自己 |
| 暗夜证词 | 被问时随机 YES/NO；投票随机投非自己；**狱警被票出后按终局披露猜罪**（`submit_guesses`）以闭环结算 |
| 伪人测试 | 判官出题（固定原创短句）、玩家回答（固定短句）、判官指认随机选非自己 |

### 共享目录变更
- `catalog.ts`：5 款 `botSupport: 'none'` → `'rule'`（durian/loveletter 保持 none；传统 4 款保持 rule_and_llm）。
- `catalog.test.ts`：断言放开为三分法（none / rule / rule_and_llm）。
- 服务端 `bots.ts` 放行逻辑本就只认 `module.pickBotAction` 存在，无需改；房主在大厅点「添加规则机器人」即可凑满人数。

### 测试
- 每款游戏包内新增 `tests/botAction.test.ts`：覆盖各关键 phase 的合法动作产出（parseAction + reduce + playerMatches）、「不该动返回 null」（非自己回合/已动作/game_over）、完整冒烟推进至终局。
- 服务端新增 `tests/newGameBotFullGame.test.ts`：5 款游戏各跑一局「1 真人 + N 规则机器人」**生产真实链路**完整局——BotRunner 驱动机器人、真人房主动作由测试注入（同一规则策略模拟）、到期计时器由 timerRunner 消费，断言 FINISHED + 产出 game_results。

### 过程中修复的缺陷
- **night-testimony 卡局**：票出狱警后对局停在 `game_over` 等狱警 `submit_guesses`（无计时器兜底）。补上 bot 猜罪策略（读终局披露的 crimes 猜全）闭环。
- **goose-relay 测试 TS2678**：烟囱测试在 `while (phase !== 'game_over')` 循环内 switch 又写 `case 'game_over':`（TS 控制流收窄为死代码），删除两处。
- **6 处 lint 未用变量**（子 agent 测试代码）：`_seed` 参数、`let→const`、未用 import/常量，全部修复。

## 二、进房体验：邀请深链 + 大厅二维码

### 实现
- **深链** `http://<主机IP>:8080/join/<5位房间码>`：首页挂载时解析 `location.pathname`，命中有效码即自动打开加入弹层并预填房间码（`JoinRoomSheet` 新增 `initialRoomCode`）；建立身份后 `history.replaceState` 清掉地址栏深链，避免刷新重复弹窗；无效码忽略回正常首页。SPA fallback 已支持任意路径，服务端零改动。
- **大厅二维码**：`RoomPage` 房间码卡片新增二维码（`qrcode.react` QRCodeSVG，内容 = `${location.origin}/join/<房间码>`）+「复制邀请链接」按钮；手机扫码 → 打开深链 → 自动弹加入层填好房间码。视觉按 oil-frontend 契约：二维码是分享场景核心信息直接可见（不藏菜单）、"复制房间码"（手动输入用）与"复制邀请链接"（扫码/分享用）并存、390px 垂直堆叠无溢出。
- 顺带修正：房间码卡片角标硬编码"卧" → 显示当前游戏首字（`roomGame.displayName.slice(0, 1)`）。

### 手动验收（Playwright，11/11 通过）
| # | 项目 | 结果 |
|---|---|---|
| 1 | 首页渲染 | PASS |
| 2 | `/join/AB2CD` 深链自动弹加入层并预填 `AB2CD` | PASS |
| 3 | `/join/xyz` 无效码不弹加入层 | PASS |
| 4 | 真实 UI 建房（房间码 5BYUP）进大厅 | PASS |
| 5 | 二维码渲染（`.room-invite__qr`） | PASS |
| 6 | 复制邀请链接按钮 | PASS |
| 7 | 二维码 aria-label | PASS |
| 8 | 二维码尺寸 128px | PASS |
| 9 | **390px 无水平溢出（scrollWidth 差 = 0）** | PASS |
| 10 | 390px 二维码可见（116×116 @ 137,544） | PASS |
| 11 | 390px body 无溢出（390 ≤ 390） | PASS |

截图：`g3a-shots/g3a-join-sheet.png`（深链预填）、`g3a-shots/g3a-room-qr.png`（桌面大厅二维码）、`g3a-shots/g3a-room-qr-390.png`（390px 竖屏）。

## 三、质量门
全量 `npm run ci` 各门（`--retries=0` 口径）全部通过：

| 门 | 结果 |
|---|---|
| typecheck（server + client） | PASS |
| lint（eslint .） | PASS |
| test（tsx 包测试 + node 脚本测试） | PASS |
| compliance:d1 | PASS |
| build（vite 生产构建） | PASS |
| test:e2e（23 项，串行） | PASS（23/23，含本次修复的 smoke/launch-playable/landlord/loveletter） |

说明：全量 e2e 偶发 night-testimony 完整局超时（全量并发负载下），单独运行 3.3s 通过、复跑全量通过——与本轮改动无关的既有 flaky，未做掩盖性重试（配置 `retries: 0`）。

## 四、顺带修复：上一阶段遗留的 5 项 e2e 失败（本轮让全量 CI 全绿）
G2-B（ffdc01c）遗留 5 项 e2e 失败，本轮一并修复并全部转绿：
- **smoke 文案**：断言「找出那个人」未同步源码 ffdc01c 改成的「找出隐藏卧底」→ 断言更新。
- **launch-playable 选择器**：`.phase-word_reveal` 在源码不存在（已改为 `.game-phase.word-reveal`）→ 选择器更新。
- **landlord 选择器**：`.landlord-table` 在源码不存在（页面已迁移到 `TabletopOvalShell`）→ 断言重写为 `.tabletop-shell`/`.tabletop-seat`；bidding 阶段不把手牌（`CardFanEngine` 只在 playing 渲染）纳入断言；扇卡点击 `force`（邻牌重叠拦截 pointer）；出牌按钮改 `.card-fan-play-btn`（文案含 "🚀 出牌 (N张)"，`getByRole exact` 匹配不到）。
- **loveletter 真实布局 bug（e98db51 页面重构引入）**：`.tabletop-action-dock` 原是 `position: fixed` 覆盖在页面上（bottom 吸附），手牌区高度超出后卡片被 dock 遮住、真实用户点不到牌（`elementFromPoint` 命中确认）。修复共享桌台布局：dock 改为参与 `.tabletop-bottom-bar` 流内排版（`position: relative` + `width: min(100%, 560px)`）、`.tabletop-shell` 去掉为旧固定 dock 预留的 `+104px` 底距、`.tabletop-arena-container` 补 `min-height: 0` 保证 flex 收缩。
- **loveletter 交互死锁（同一 bug 的规则层）**：页面 `canPlay` 一律要求守卫必猜身份，但服务端规则允许「无合法目标时无目标打出守卫」→ 无合法目标时前端永远禁用按钮。同步修正 `canPlay`/提交载荷/猜测区显示三处，条件对齐服务端。

## 五、已知限制（如实说明）
- **机器人是测试陪练级策略，不追求棋力**：随机出牌/投票/回答，目的只是「凑满人数把流程跑通」，供真人真机试玩与验收，不用于对战强度评估。
- **部分视图未暴露「已投票」信号**：cheese-thief/goose-relay/night-testimony 的玩家视图缺少 `hasVoted` 类字段，bot 在投票阶段可能重复投递被 reducer 拒绝（平台吞掉记日志），由投票计时器兜底结算——与生产行为一致，不卡局。
- **不做 LLM bot**：5 款新游戏仅 `rule` 级；`buildBotPrompt` 未实现（平台会退化为规则策略）。
- **对局中不能补 bot**：`add_bot` 保持 LOBBY-only（平台既有约束），测试请开局前在大厅加够机器人。

## 六、文件清单
- 新增：5 × `server/bot.ts`、5 × `tests/botAction.test.ts`、`packages/server/tests/newGameBotFullGame.test.ts`、`docs/superpowers/reports/g3a-shots/*`
- 修改：5 × `server/module.ts`（+4 × `server/index.ts` 导出）、`catalog.ts`、`catalog.test.ts`、client `App.tsx`/`GameHomePage.tsx`/`JoinRoomSheet.tsx`/`RoomPage.tsx`/`styles.css`、`LoveLetterGamePage.tsx`（守卫无目标可打）、`e2e/smoke.spec.ts`/`launch-playable.spec.ts`/`landlord-platform.spec.ts`/`loveletter-tabletop.spec.ts`、`package.json`+`package-lock.json`（qrcode.react）
