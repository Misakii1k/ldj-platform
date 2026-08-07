# D7 计划：恢复根因 + 前端可见打磨 + G1 两款游戏

> 批准日期：2026-08-07。用户确认范围：A（恢复根因）+ B（前端打磨）+ C（G1 两款游戏）；执行方式：A 串行后 B/C 严格文件域并行。
> D7 基线：`25bc41d`（D6 最终 checkpoint）。

## 范围与边界

- **D7-A**：恢复竞态根因深挖与加固（串行，约 1 天）。
- **D7-B**：前端按现有纸牌派对风格可见打磨，不动设计语言，逐页交付前后对照截图。
- **D7-C**：G1 两款新游戏《情书：密函心意》《Durian：榴莲店长》，GameModuleV2 全新实现，`botSupport: 'none'`。
- 不纳入：G2–G4 其余 5 款游戏、Docker/压测/安全复审/限流/metrics、UNO 权利、WebRTC——后续阶段。

## 硬约束

- 迁移仍限 v1–v8，不新增 settings 键；D1 双 fixture 与冻结 9 文件零改动；不新增 game-id 绕过分支。
- 新游戏文案/资产全部重新创作，不复制官方规则书原文；不实现机器人。
- E2E 一律 `--retries=0`；质量门以 `npm run ci` 为准。
- Git 分阶段本地 checkpoint，不 push。
- 权利证据如实：Durian 纯原创走 internal-admission；情书经典规则源于已出版游戏，准入时如实评估，权利未清则保持 `coming_soon`，不伪造授权记录。

## D7-A：恢复竞态根因与加固

1. 核实服务端 `buildRoomSnapshot`/`buildGameStatePayload` payload 与 `parseRoomSnapshot`/`parseGameStatePayload` 完全匹配（parse 要求 `seq:number` + `members:array` 等）。
2. `envelopeReducer.ts` 三处静默路径补 `send_resync`：`room_snapshot` parse fail、`game_state` parse fail、`game_state` stale-drop。
3. `ConnectionContext.tsx`：`sendRaw` 在 socket 非 OPEN 时静默丢弃 resync 的处理；StrictMode 双连接语义核对。
4. 补单元测试：watchdog 行为、静默丢帧→resync、stale-drop→resync。
5. 退出标准：全套 `--retries=0` ≥3 轮全绿 + 根因结论文档。

## D7-B：前端可见打磨（现有风格）

只碰 client 现有文件；逐页交付前后对照截图。E2E 断言的 class/data-attr/可访问名称/几何（overflow、SeatRing、隐私 DOM）不得破坏。

## D7-C：G1《情书》+《Durian》

每款：GameModuleV2（manifest/schemas/rules/module/index）→ catalog `coming_soon` → registry → 客户端 parser + viewRegistry + GamePage 分支 + 页面（首次接入 TabletopShell/ActionDock/GameDrawer）→ contract/模块/views 测试 + E2E → D1 准入（Durian playable；情书按权利评估）→ 文档。

情书固定规则：经典 16 张、摸1打1、伯爵夫人强制、王子可选自己、弃公主淘汰、牌库耗尽比手牌再比弃牌、好感阈值 2人7/3人5/4人4。
Durian 原创规则：2–7 人、28 库存卡（5 水果）、36 二选一订单卡、3 店员事件、服务端先到先得按铃、超卖判定、怒气 1→7、累计处罚 7 结束、处罚最低者胜。

## 执行节奏

D7-A 串行 → B/C 并行（B 只碰 client 现有文件；C 只碰新游戏目录；`catalog/registry/viewRegistry/GamePage/admission` 由主执行统一顺序改）→ 每批全量 `npm run ci` → 分阶段 checkpoint commit。

## 预期结果

恢复竞态有根因结论与回归；浏览器各页有可见打磨与截图证据；G1 两款游戏完成接入（Durian playable，情书按权利评估），含契约/模块/E2E/准入证据。
