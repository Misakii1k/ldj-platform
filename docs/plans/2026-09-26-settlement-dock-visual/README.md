# 平台结算坞 + 开局转场 · 交接计划

**日期**：2026-09-26　**工作区**：`D:\项目`　**分支**：`feat/wits-wagers-tabletop-stage`
**设计决定来源**：`docs/DESIGN-DIRECTION.md` §9「平台结算坞」条目（用户原话都在那里）。
**像素参照（定稿方向稿，照着做，不要自由发挥）**：
- 结算坞 = `docs/ui-preview/settlement-dock/B-signin-board.html`（共用样式 `_dock.css`、脚本 `_dock.js`）
- 开局转场 = `T1-dock-sheet.html`、`T2-curtain.html`、`T3-theme-stripes.html`（共用 `_transition.css` / `_transition.js`），**三种每次开局完全随机选一种**

本地查看方向稿：`npx vite docs/ui-preview --port 5190`，然后打开 `http://localhost:5190/settlement-dock/index.html`。

---

## 0. 开工前必读（执行模型）

1. **并行会话**：`D:\项目` 常有多个会话同时在改。开工前用 `git status` 看 `packages/client/src/styles.css`、`App.tsx` 是否正被别人改；改 `styles.css` 只做**删除本计划指定的两段**，不要整文件格式化、不要改别处。每完成一步就提交一次，避免被别的会话 reset 掉。
2. **不做新的视觉决定**。计划没写到的（比如某个间距、某个颜色），**以方向稿 HTML 为准**；方向稿里也没有的，停下来列问题交回用户。
3. 视觉合格只由用户看图判定（`AGENTS.md`「视觉验收规范」），报告里视觉项只能写「待用户看图」。

---

## 1. 用户已确认的决定（不可改）

| # | 决定 |
|---|---|
| D1 | 坞**只管「下一步」**：谁准备好了、再来一局、倒计时、离开。胜负 / 翻牌是各游戏自己的事，坞里不出现胜负文字。 |
| D2 | 坞表皮**浅 / 深两套**，按游戏自动切换（映射见 §3）。浅 = 奶油卡纸 + 3px 墨边 + 硬投影；深 = 暗底 + 金色 1.5px 细边。 |
| D3 | 只露**一个**黄色主按钮；返回大厅 / 暂离回首页 / 退出房间收进「⋯」菜单。 |
| D4 | 全员就绪倒计时 = 坞内衬线大数字 3→2→1 **每秒砸入** + 滴答。 |
| D5 | 坞样式 = **B 签到牌**：悬浮窄卡片（最大宽 620px）+ 顶部吊牌；每人一张签到小牌，准备 = 实线框 + 「备」字章砸下；倒计时时吊牌里换成大数字。 |
| D6 | 开局转场 = **T1 / T2 / T3 每次完全随机**（允许连续相同）。坞样式**不**随机。 |
| D7 | 去掉现版转场的绿色水波胶囊、红绿蓝黄固定彩条、「✦ 牌局开启 · 全力以赴 ✦ / 正在进入对决竞技场...」徽章。 |

**AI 自定、用户尚未单独确认（照做，但截图报告里单列出来请用户看）**：
- 状态文案点名在等谁：自己没准备 →「对局结束 · 再来一局？」；只差 1 人 →「就等 {名字} 了」；否则 →「还在等 {n} 人」。
- 狼人杀全员就绪不自动开局：房主看到黄色「▶ 开局」，非房主看到「全员就绪 · 等房主开局」。
- 观战者没有主按钮，只看进度。
- 坞数到 1 后不显示「开局」，直接交给转场；转场中央一律是**游戏名牌**。
- 房间页首次开局也走同一套转场。
- 名牌副标题：方向稿写的是「第 2 局 · 6 人」，但**房间快照里没有局数字段**，正式版改成「{n} 人局」（n = 玩家席人数）。不要为此改协议或服务端。
- §3 里每款游戏的图标与 T3 配色。

---

## 2. 文件白名单

只允许改动 / 新建下列文件：

| 文件 | 动作 |
|---|---|
| `packages/client/src/game/TabletopSettlementDock.tsx` | 重写渲染部分（逻辑与 send 调用保持） |
| `packages/client/src/game/settlementDock.css` | **新建**，坞的全部样式 |
| `packages/client/src/game/settlementDockModel.ts` | **新建**，纯函数：状态文案、按钮集合 |
| `packages/client/src/shared-ui/GameStartTransition.tsx` | 重写 |
| `packages/client/src/shared-ui/gameStartTransition.css` | **新建**，转场全部样式 |
| `packages/client/src/shared-ui/platformSkin.ts` | **新建**，游戏 → 表皮 / 图标 / 配色映射 + 随机选转场 |
| `packages/client/src/App.tsx` | 只改 `GameStartTransition` 的调用（传 `gameId`、`origin`、`playerCount`） |
| `packages/client/src/styles.css` | 只**删除**两段：`/* 全局开局震撼转场动效 … */` 开始的 `.game-start-transition-layer` … `.gst-emblem-subtitle`（约 4520–4675 行）；`/* 通用对局结算沉浸式操作坞 (TabletopSettlementDock) */` 段（约 12482–12704 行）。行号会漂，按注释标题定位。 |
| `packages/client/tests/settlementDockModel.test.ts` | **新建** |
| `packages/client/tests/platformSkin.test.ts` | **新建** |
| `docs/plans/2026-09-26-settlement-dock-visual/` 下的报告与截图 | 新建 |

**不许碰**：服务端、`packages/shared`、协议、各游戏自己的结算画面、`RoomPage.tsx` 的 `AutoStartBanner`（它保持原样，只作为 T1 在「房间页起点」时的出发位置）、`WerewolfThemeProvider.tsx`。

---

## 3. 映射表（写进 `platformSkin.ts`）

```ts
export type PlatformSkin = 'light' | 'dark';
export type StartTransitionKind = 'sheet' | 'curtain' | 'stripes'; // T1 / T2 / T3
export interface GamePlate { skin: PlatformSkin; icon: string; bars: readonly [string, string, string, string]; }
```

`bars` = T3 五条彩条里的第 1、2、4、5 条（第 3 条固定用表皮纸色：浅 `#fffaf0` / 深 `#1c1712`）。

| gameId | 表皮 | 图标 | bars（a, b, c, d） | 依据 |
|---|---|---|---|---|
| `werewolf` | dark | 🐺 | `#7a1420` `#3b0a12` `#e9c874` `#241015` | 赤幕剧场 |
| `undercover` | dark | 🕵️ | `#2b2f4a` `#151726` `#e9c874` `#3a1f3f` | C12 |
| `wits-wagers` | dark | 🪙 | `#1f5a3c` `#0f2e1f` `#e9c874` `#5a1620` | 深夜赌场绿毡 |
| `goose-relay` | dark | 🪿 | `#6b4a2b` `#2a1d12` `#c0392b` `#1a130c` | 深夜案情墙（软木 + 红线） |
| `cheese-thief` | light | 🧀 | `#f7c84b` `#8f9bd6` `#e98f5a` `#6f7fc4` | 月夜阁楼（方向稿原值） |
| `durian` | light | 🍈 | `#f7c84b` `#7fb04a` `#e0a23b` `#4f7a2a` | 果摊 |
| `loveletter` | light | 💌 | `#e8a0a8` `#b8324a` `#f3d9b1` `#7a2334` | 信笺 |
| `landlord` | light | 🀄 | `#c23616` `#7a4a22` `#f7c84b` `#3f2a17` | 老茶馆 |
| `uno` | light | 🎴 | `#e53935` `#1e88e5` `#fbc02d` `#43a047` | 糖果纸盒 |
| `bell-clash` | light | 🔔 | `#1f6b4a` `#f7c84b` `#e53935` `#0f4430` | Ding 深绿姊妹盒 |
| `echo-judge` | light | ⚖️ | `#8a5a2b` `#d8b477` `#4a3320` `#b23a2a` | 老式法庭 |
| `night-testimony` | light | 🗂️ | `#c9a36b` `#b23a2a` `#8a6a3f` `#3f4a5a` | 牛皮纸档案室 |
| 其他 / 未知 | light | 🎲 | `#f7c84b` `#08715d` `#c23616` `#7358a7` | 平台色 |

名牌文字用 `GAME_CATALOG`（`@ldj/shared`）里的 `displayName`，不要自己写游戏名。

```ts
export function pickStartTransition(rand: () => number = Math.random): StartTransitionKind {
  const kinds = ['sheet', 'curtain', 'stripes'] as const;
  return kinds[Math.min(2, Math.floor(rand() * 3))];
}
```

---

## 4. 逐步任务

### 步骤 1 · `platformSkin.ts` + 单测
- 按 §3 写 `plateFor(gameId: string | null): GamePlate` 与 `pickStartTransition`。
- 单测：12 个已知 gameId 的 skin 与上表一致；未知 id 走兜底；`pickStartTransition(() => 0)` = sheet、`() => 0.5` = curtain、`() => 0.999` = stripes。
- **完成判据**：`npm test` 通过。提交。

### 步骤 2 · `settlementDockModel.ts` + 单测
纯函数，输入 `{ players: {playerId,nickname,ready,isMe}[], isHost, isSpectator, meReady, allReady, isWerewolf, countdown }`，输出：
- `statusLine: string`（规则见 §1「AI 自定」第 1、2 条；倒计时中 =「全员就绪 · 即将开局」；观战且未全员 =「观战中 · 等玩家准备」）
- `primary: 'again' | 'start' | 'none'` 与 `secondary: 'cancelReady' | 'readyCancel' | 'none'`，对照方向稿 `_dock.js` 的 `actions()`：

| 状态 | 主按钮（黄） | 次按钮（描边） |
|---|---|---|
| 未准备、非观战 | ↻ 再来一局 | — |
| 已准备、未全员 | — | ✓ 已准备 · 取消（绿色描边态，占满宽） |
| 倒计时、房主 | ▶ 立即开局 | 取消准备 |
| 倒计时、非房主 | — | 取消准备 |
| 狼人杀全员就绪、房主 | ▶ 开局 | — |
| 狼人杀全员就绪、非房主 | — | 取消准备 |
| 观战 | — | — |

「⋯」按钮永远在最右。菜单项：返回房间大厅（仅房主，副文字「带全员回房间，可换游戏」）/ 暂离回首页（「席位保留，随时回来」）/ 分隔线 / 退出房间（红字，「释放你的席位」）。
- 单测覆盖上表 7 行 + 三种 statusLine 文案。
- **完成判据**：`npm test` 通过。提交。

### 步骤 3 · 结算坞重写
- `TabletopSettlementDock.tsx`：保留现有 `send` / `clearMe` / `setViewingHome` / 倒计时 `useEffect`（包括狼人杀不自动开、Hooks 顺序那条注释）。只换 JSX 和 class。
- 根节点：`<aside className="settlement-dock" data-dock-skin={plateFor(room.gameId).skin} role="region" aria-label="对局结算与再来一局操作坞">`。保留 `data-ww-theme` 透传（狼人杀会话还依赖它）。
- 结构照 `B-signin-board.html` 的 `render()`：`.settlement-dock__board` > 吊牌 `.settlement-dock__tab` + 签到牌网格 `.settlement-dock__slips` + 按钮行 `.settlement-dock__acts`。
- 签到牌头像继续用 `UserAvatar` + `resolveMemberAvatar`；「我」显示为「我」；房主头像顶上 👑；准备好的牌右上角「备」章。
- 新变为已准备的那张牌（和上一帧比从 false→true）播一次盖章动画（方向稿 `.slip.is-fresh .stamp`）。用 `useRef` 记上一帧 ready 集合。
- 人数 > 5 时签到牌改横排小卡（方向稿 `.slips.n10`），网格固定 5 列。
- 倒计时：吊牌里 `RollingNumber` 换成衬线大数字（桌面 60px / 手机 50px，`--gp-font-display`），每次数字变化重播 `slam` 动画并 `webAudio.playTick()`。**countdown 到 0 时继续显示「1」**，不显示「开局」「正在」字样（交棒给转场）。
- 「⋯」菜单：点外部或按 Esc 关闭；菜单项最小高 44px。
- 样式全部写进 `settlementDock.css`（在组件里 `import './settlementDock.css'`），数值从 `_dock.css` 的 `.skin-light / .skin-dark` 令牌与 B 稿 `<style>` 照搬；颜色能用 `--gp-*` 的用 `--gp-*`（`--gp-ink` `--gp-paper` `--gp-yellow` `--gp-green` `--gp-shadow*` `--gp-font-display`），深色用方向稿里的金色值。
- 删除 `styles.css` 里旧坞那一段。
- 动效档：`html[data-motion-level="reduced"]` 盖章与砸入保留但时长 ×0.62；`minimal` / `off` 不播砸入与盖章，只换数字。
- **完成判据**：`npm run typecheck`、`npm run lint`、`npm test` 通过；`npm run build -w @ldj/client` 成功。提交。

### 步骤 4 · 开局转场重写
- `GameStartTransition` 新增 props：`gameId: string | null`、`origin: 'dock' | 'room'`、`playerCount: number`。
- `active` 从 false→true 时调用一次 `pickStartTransition()` 存进 state，本次演出期间不变。
- 渲染：`<div className="gst-layer" data-kind={kind} data-skin={skin} data-origin={origin} data-motion-level={level} style={{'--gst-a':…, '--gst-b':…, '--gst-c':…, '--gst-d':…}}>`。
- 三种的 DOM 与 CSS **照抄**对应方向稿的 `markup()` 与 `<style>`，把类名前缀 `t1-/t2-/t3-/t-` 改成 `gst-sheet-/gst-curtain-/gst-stripes-/gst-`。方向稿里的场景类（`is-go` `is-name` `is-close` `is-open` `is-in` `is-out` `is-reveal`）改成组件内 `phase` state，在根节点上加 `phase-<名字>`。
- 时间线（ms，完整档；reduced ×0.62，minimal ×0.3，off 直接 `onComplete` 不渲染——沿用现有 scale 逻辑）：
  - sheet：0 go → 380 name → 1000 reveal → 1420 完成
  - curtain：0 go → 60 close → 420 name → 1050 open → 1640 完成
  - stripes：0 go → 40 in → 480 name → 1080 out → 1720 完成
- 名牌：`plate.icon` + `displayName` + 「{playerCount} 人局」。
- T1 的起点：`origin==='dock'` 时从坞的位置长出（底部居中，浅 = 奶油纸 3px 墨边 / 深 = 暗底金细边）；`origin==='room'` 时从 `AutoStartBanner` 位置长出，颜色用 `#0c715d` 胶囊（与方向稿「房间页起点」一致）。
- 屏震：T1、T2 在 name 时刻给根节点加 260ms、≤4px 的 `translate` 抖动；T3 不震。`reduced` 及以下不震。
- 音效：保留 App 里已有的 `webAudio.playDealCards()`；name 时刻加一次 `webAudio.playCardFlip()`。不新增音效文件。
- 所有动画只动 `transform` / `opacity`（T1 方向稿用了 `width/height/left` 的 `t1-grow`，正式版改成对一个满屏元素做 `scale` + `border-radius` 从坞尺寸放大到 1，视觉一致即可）。
- 样式写进 `gameStartTransition.css`；删除 `styles.css` 旧转场段。
- `App.tsx`：在已有的 `useEffect` 里，根据 `prev === 'POST_GAME' ? 'dock' : 'room'` 记下 origin；`playerCount = room.members.filter(m => m.seatRole === 'player').length`。
- **完成判据**：typecheck / lint / test / build 通过。提交。

### 步骤 5 · 截图组（交给用户看图）
截图目录：`docs/plans/2026-09-26-settlement-dock-visual/shots/`。桌面 `1280x800` + 手机 `390x844` 两档都要。

参考 `e2e/launch-playable.spec.ts` 的方式让一局跑到 `POST_GAME`（真实昵称、≥ 最低人数）。至少两款：**奶酪大盗（浅）**、**狼人杀或一智千金（深）**；外加一款 **10 人**的（谁是卧底或狼人杀）。

| 编号 | 画面 |
|---|---|
| S1 | 刚结算，自己未准备（浅 / 深各一） |
| S2 | 自己已准备，只差 1 人（文案「就等 X 了」） |
| S3 | 倒计时中，数字「2」（房主视角，有「立即开局」） |
| S4 | 「⋯」菜单展开（房主，三项都在） |
| S5 | 10 人签到牌 |
| S6 | 狼人杀全员就绪，非房主「等房主开局」 |
| S7 | 观战者视角 |
| S8–S10 | 转场 sheet / curtain / stripes 各一张：定格在 name 阶段（用 `page.evaluate(() => document.getAnimations().forEach(a => a.pause()))` 在对应时刻暂停；要测哪种就临时用 `Math.random` 桩固定结果，不许为截图在正式代码里加开关） |
| S11 | 转场 stripes 的深色版（狼人杀配色） |

每张截图旁写：对应方向稿文件 + 状态（如 `B-signin-board.html · 状态=我已准备 · 浅色 · 5 人`），只做事实描述。

### 步骤 6 · 报告
`docs/plans/2026-09-26-settlement-dock-visual/REPORT.md`：两栏——「机器门」（命令 + 结果）与「视觉判定：待用户看图」；列出截图绝对路径；把 §1「AI 自定」各条单列请用户确认。

---

## 5. 验证命令

```
npm run typecheck
npm run lint
npm test
npm run build -w @ldj/client
npx playwright test e2e/launch-playable.spec.ts e2e/loveletter-tabletop.spec.ts e2e/undercover-blank.spec.ts
```

最后一条的这几个 e2e 依赖「对局已结算」文字（来自 `RoomPage` / `HomeActiveRoomBanner`，不在坞里），坞改文案不应影响它们；若失败先查是不是转场遮挡了点击（转场层必须 `pointer-events: none`）。E2E 跑的是构建产物，**先 build 再跑**。

---

## 6. 不许做

- 不许在坞里加胜负、得分、身份任何内容（D1）。
- 不许出现第二个黄色按钮；「立即开局」和「再来一局」不会同时出现。
- 不许保留或复用旧转场的绿色水波、红绿蓝黄彩条、「牌局开启 · 全力以赴」。
- 不许做「避免连续重复」的随机（用户选了完全随机）。
- 不许让坞样式随机（只随机转场）。
- 不许整屏奶油底 + 大面积黄色（C8）；坞里黄色只用在唯一的主按钮上。
- 深色表皮不许上 3px 黑粗边（C2）。
- 不许动 `width/height/top/left` 做动画；不许超过 4px 屏震。
- 不许用 `--update-snapshots` 覆盖任何基线。
- 不许在报告里写 PASS / 达标 / 已对齐。
