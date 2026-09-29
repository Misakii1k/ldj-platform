# 奶酪大盗 · 视觉落地 PROGRESS

计划：`./README.md`（先读它）。每完成一步，把「做了什么 / 验证命令与退出码 / 证据」记到对应行，并把状态改为 已完成。**一次只做一步，T1→T7 顺序。**

| 任务 | 内容 | 状态 | 证据（命令、退出码、grep/几何检查、截图路径） |
|---|---|---|---|
| T1 | 阁楼骨架（atticModel + AtticRoom + AtticSeats + 壳接入 + 昼夜扫屏） | 已完成 | 单测 `npx tsx --test packages/client/tests/cheeseThiefAttic.test.ts` 13/13 绿；`npm run typecheck` 退出 0；`npm run build` 退出 0；几何走查 `node scripts/capture-cheese-attic-shots.mjs`：9 场景 × 1280×800/390×844 全部 `hit:[] out:[]`（修复记录：中央区 top 改 `max(37.5%,260px)` 避矮舞台压拱窗；手机席位 116→108px 防擦中央区；窄档用 `@container (max-width:380px)` 因为视口 390 时舞台实测 370；坞文字锁 `--game-ink` 修壳 night 主题浅字继承）。截图：docs/superpowers/reports/2026-08-15-game-ui-refresh/cheese-thief-attic/。偏差备注：①新类名前缀用 `.cta-` 而非计划建议的 `.ct-`——旧 V04 段已占用 `.ct-seat` 等（T6 清场前共存）；②`packages/client/tests/seatDriftRobustness.test.ts` 更新了奶酪大盗断言（原断言钉死旧「时刻自选面板」，与新坞内按钮设计冲突），该文件不在白名单内，属必要同步 |
| T2 | ② 掷骰（大骰盅摇/掀/盖回，4 人两骰 choose_hour，hours mine） | 待开工 | |
| T3 | ① 夜里醒来（可见性口径、自动偷 + 飞行、偷看、私密卡） | 待开工 | |
| T4 | ③ 天亮指认（倒计时圆盘、dawn 坞、点席位投票 + 就是你！+ 已投，隐私） | 待开工 | |
| T5 | ④ 揭晓结算（翻面、三结局盖章、时间线小条、奶酪飞回；旧遮罩下线） | 待开工 | |
| T6 | 公共大屏复用阁楼 + three.js/失效 CSS 清场 + e2e 全绿 | 待开工 | |
| T7 | 验收（§4 全部命令 + §1.6 截图组 + §11.4 报告，用户结论列留空） | 待开工 | |

## 用户看图记录

（空——截图组出来后由用户填写结论，AI 不得代填。）

## 执行中遇到的问题 / 停下来问用户的清单

（空）
