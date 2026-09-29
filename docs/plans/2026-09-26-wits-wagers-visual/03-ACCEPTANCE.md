# 03 · 验收

## 1. 机器门

### 1.1 命令（每个任务按卡片要求跑；X08 全跑）

| 项 | 命令 | 通过条件 |
|---|---|---|
| 类型 | `npm run typecheck` | 退出码 0 |
| 一智千金单测 | `npx tsx --test packages/client/tests/witsWagers*.test.ts` | 0 |
| 客户端边界 | `node scripts/verify-wits-wagers-client-boundary.mjs` | 0（客户端不得引入服务端规则代码） |
| 断点 / 类名契约 | `npx tsx --test packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` | 0 |
| 全量单测 | `npm test` | 0（与本计划无关的存量失败记名称与退出码，不许为转绿去改无关测试） |
| 视口契约 | `npx playwright test e2e/game-viewport-contract.spec.ts` | 0 |
| 动效契约 | `npx playwright test e2e/motion-contract.spec.ts` | 0 |
| 一智千金 e2e | `npx playwright test e2e/wits-wagers.spec.ts e2e/wits-wagers-recovery.spec.ts e2e/wits-wagers-visual.spec.ts` | 0 |
| 跳动检测 | 见 1.2 | 0 条（X06 的两类允许项除外） |
| 构建 | `npm run build` | 0，且 `packages/client/dist` 已更新 |

注意（来自项目记忆）：
- **e2e 跑的是构建产物**：改完客户端先 `npm run build`，否则 Playwright 验证的是旧 UI。
- **端口 3178**：Playwright 起不来时先查是否有孤儿服务占着 3178，别急着杀别人的进程。
- **并行会话**：开工前 `git status` 确认没有其他会话在同目录改同一批文件；**禁止 `git stash`**。

### 1.2 跳动检测（用户反馈「跳画面、抖动、突然移动」后新增的门）

脚本：`node scripts/check-stage-jitter.mjs <url> --width <w> --height <h>`。它在演出进行中逐帧采样，报告三类问题：
- `MOVE`：本该静止的容器（顶栏、题目、牌区、席位卡、托盘、牌匾）移动了 >1.5px；
- `JUMP`：牌 / 筹码在相邻两帧之间位移 >20px（瞬移）；
- `FLASH`：可见物件在一帧内突然变透明（闪一下）。

脚本已用方向稿验证：A2 四个画面 × 两个视口 0 条；故意还原旧的 `transform` 震动和开演前延迟，都能抓到（退出码 1）。

对正式页面使用时：
1. 用 e2e fixture 把页面停在目标阶段（参考 `e2e/wits-wagers-visual.spec.ts` 的注入方式），在**阶段切换之后立刻**开始采样。可以把脚本的采样函数搬进一个 Playwright spec，也可以给脚本传能直接进入该阶段的 URL。
2. 正式组件的类名如果和默认选择器不同，用 `--selectors-still` / `--selectors-moving` 传入（默认已包含 `.ww-question,.ww-board,.ww-seat,.ww-tray,.ww-plaque` 与 `.ww-poker-card,.ww-chip`，**新组件照这些类名起名就不用传**）。
3. 另外对每个阶段检查：同一格的筹码不超出格子、不盖住牌面（量每枚 `.ww-chip` 与所在格、牌面的 `getBoundingClientRect`）。

## 2. 截图组（`docs/design-spec.md` §11.3）

目录：before → `docs/superpowers/reports/2026-09-26-wits-wagers-visual/before/`，after → `.../after/`。
文件名：`wits-wagers-<画面>-<宽x高>.png`。视口：`1280x800` 与 `390x844`。fixture 见 `01-CONTRACT.md` §6（6 人，你 = 2 号 小鱼干）。**动画静止后**截；倒计时数字可以 mask，不许整屏 mask。

| # | 画面 | 局面 | 对照物（用同视口打开方向稿对照） |
|---|---|---|---|
| 1 | `answering` | answering，4 / 6 已交，你已输入 324 未交 | `A2-casino-lounge.html` ① 演出结束前（点「▶ 播放演出」后约 0.8 秒） |
| 2 | `arranging` | arranging，6 张牌全部上桌 | `A2-casino-lounge.html` ② 结束态 |
| 3 | `betting` | betting，他人筹码已押，你的 A 押 324 +4、B 押 412 +2 | `A2-casino-lounge.html` ③ 结束态 |
| 4 | `settlement` | settlement，计分全部结束、第一名已戴冠 | `A2-casino-lounge.html` ④ 结束态 |
| 5 | `sim` | 桌面模拟版，已亮牌 | 无方向稿；对照 X00 before 同名图 |

共 5 画面 × 2 视口 = 10 张。截不到的格子写原因，不得用旧图或方向稿截图冒充。

## 3. 报告模板（X08 写 `REPORT.md`）

```markdown
## 机器门
| 项 | 结果 | 命令 / 退出码 |

## 视觉判定（状态：待用户看图）
| 画面 | before | after | 对照物 | 事实描述 | 用户结论 |
| betting 1280x800 | D:\项目\docs\superpowers\reports\2026-09-26-wits-wagers-visual\before\wits-wagers-betting-1280x800.png | D:\项目\...\after\wits-wagers-betting-1280x800.png | A2-casino-lounge.html ③ | 左 3 右 3 席位卡，中央 6 张象牙牌一排，324 格有 5 枚筹码叠放，底部托盘 + 1 个黄色按钮 | （空，等用户） |

## 与方向稿的已知差异
（逐条列出；没有写「无」）

## 用户看图记录
```

- 机器门表与视觉判定表**分开**；「用户结论」列 AI 不许填。
- 事实描述只写看到了什么，不写「精致 / 已对齐 / 达标」。
- 读不到截图就写「我没有看到画面」。

## 4. 不许做

来自 `docs/DESIGN-DIRECTION.md` §2 的否定项，以及本游戏的禁区：

1. 不许整页奶油底 + 粗墨边 + 大面积黄色（C8）；深色游戏只用细边（C2）。
2. 不许一张 `.gp-panel` 居中、四周空白（C9）；不许舞台中央只有一行文字。
3. 不许同一视口出现 2 个及以上黄色主按钮。
4. 不许用无衬线字体显示大数字（答案、余额、牌面、赔率）（C7）。
5. 不许做 Balatro 的霓虹色、像素风、CRT 扫描线（C13）。
6. 不许引入 C 稿（竖向价签阶梯、拍品卡、画架、木槌、「成交」章）或 B 稿（跑马灯、翻牌数字、领奖台）的任何元素——用户要求 C「先留着，不制作」。
7. 手机竖屏席位**不许**改成左右两列（用户最终选定顶部 3×2）。
8. 不许屏震（Q7 答复前）。
9. 不许用 `transform` 关键帧做弹跳 / 震动（`01-CONTRACT.md` §5.1 第 1 条）；不许演出开场延迟；不许物件插入时瞬移。
10. 不许改服务端、协议字段、赔率 / 账本算法、`betDraft.ts` 规则；不许在 `answering` 阶段的 DOM 里出现别人的估数。
11. 不许新增字面量色（全部走 `01-CONTRACT.md` §3 令牌）；不许使用断点契约以外的媒体查询。
12. 视觉回归失败时不许 `--update-snapshots` 转绿；基线变更要标「等待用户确认」。
13. 不许再出现 ¥、钞票、「我的钱」这类金额说法（用户 2026-09-27：「改成筹码，显示分」）。
14. 不许改 game_over 总排名画面的布局和结构（用户 2026-09-27：「总排名画面先保持现状」）。
