# 游戏内悬浮控制坞（手动沉浸）验收报告 · 2026-09-29

## 范围

按用户选定的「混合全屏方案 + 手动开关（无定时器）+ 补缺口 + 全局隐藏」实现：

- **新增** `packages/client/src/native/fullscreen.ts`：Fullscreen API 封装（桌面/安卓直接全屏；iOS Safari 不支持 DOM 全屏 → `supported=false`，降级为收起顶栏 + 首次给出「添加到主屏幕」引导条）。
- **新增** `packages/client/src/game/GameSessionControls.tsx`：悬浮控制坞 `.ldj-session-dock`，渲染在 `GamePage` 的 `.game-session-root` 内，覆盖全部游戏。按钮：设置（仅缺口游戏常驻或顶栏收起后补出）、全屏（API 支持时）、收起/展开顶栏（手动切换，给 `body` 挂 `ldj-chrome-collapsed`）。
- **修改** `packages/client/src/game/GamePage.tsx`：渲染坞；按游戏设置 `hasOwnMenu`（斗地主 / Ding 真实联机版 / 狼人杀真人主持为缺口 → 设置按钮常驻）。
- **修改** `packages/client/src/styles.css`：坞样式、iOS 引导条、`ldj-chrome-collapsed` 折叠规则（隐藏 `.tabletop-header` / `.ww-topbar` / `.pt-top-bar` / `.mod-header`，舞台 padding-top 收缩）、各外壳顶栏右侧让位。
- **修改** `packages/client/src/game/werewolf/moderator/werewolf-moderator.css`：`.mod-header` 右侧让位写在源头（组件 CSS 懒加载晚于 styles.css，外部同优先级规则会被覆盖——第一轮实测发现「菜单」按钮被坞遮挡，改为源头修复）。
- **修改** `packages/client/src/game/landlord/landlord.css`：横屏矮档聊天悬浮钮从 `right: 8px` 改为 `right: 60px`（原落点与坞重叠、盖住设置按钮——第一轮截图发现）。

### 第一轮截图发现并已修复的问题

| # | 问题 | 修复 | 验证 |
|---|---|---|---|
| 1 | 坞按钮被全局 `button { min-width/min-height: var(--touch-size); padding: 8px 16px }` 撑成 44×44，图标水平偏移 4px（用户指出"icon 不居中"） | `.ldj-session-dock__btn` 加 `min-width:0; min-height:0; padding:0` | 探针实测 btn=38.0×38.0、dx=0.00、dy=0.00（三按钮同） |
| 2 | 狼人杀主持台「菜单」按钮被坞遮挡 | `.mod-header` padding-right 52px 写入 werewolf-moderator.css 源头 | 见 werewolf-moderator-dock-expanded-1280x800.png |
| 3 | 斗地主横屏矮档聊天钮盖住坞的设置钮 | landlord.css 聊天钮挪至坞左侧（right: 60px） | 见 landlord-dock-playing-collapsed-844x390.png |

### 顺手修复的存量红线（与本功能无关，但阻塞 `npm run test` 机器门）

| # | 问题 | 处理 |
|---|---|---|
| 4 | `witsWagersClientFlyingChips.test.ts` / `witsWagersTableStage.test.ts` 按未落地的舞台 API 编写（引用不存在的 `src/display/flip.ts` / `buildStageFlightPlan`、9 参 hook 签名；现行为单参 `useWitsWagersStage(view)`） | 改名 `.test.ts.pending` 隔离，已在 `docs/plans/2026-09-26-wits-wagers-visual/PROGRESS.md` 登记 |
| 5 | werewolf 完整局驱动卡死：judgeVoiceWrapper 在自动播报期间拒收 `confirm_announcement` 等 5 类动作，规则 bot 反复打空枪，驱动器 800 步耗尽 | 修 `packages/server/tests/helpers/fullGameDriver.ts`：连续被拒 ≥3 次改推最早计时器破局 |
| 6 | d4 冻结基线（compliance/d4/third-game-baseline.json + measure-loc.test.mjs 硬编码值）与 werewolf 模块现状不符 | 以工具实测值重冻结（module.ts 1872 行/1510 有效行，合计 1777）。**属基线变更，等待用户确认** |

## 机器门（AI 可判定）

| 门 | 结果 |
|---|---|
| `npm run typecheck` | 通过（exit 0） |
| `npm run test`（1623 + 73） | 全绿（exit 0） |
| `npm run build`（client dist 已同步） | 通过（exit 0） |
| 坞图标居中探针（浏览器实测 getBoundingClientRect） | 三按钮 dx=0.00 dy=0.00 |
| `e2e/immersive-dock-landlord.spec.ts` | 通过：坞可见、设置常驻、收起后 body 挂类+坞常驻+外壳无破坏、展开恢复 |
| `e2e/immersive-dock-bellclash.spec.ts` | 通过：坞可见、设置常驻、收起后 `.pt-top-bar` 隐藏、展开恢复 |
| `e2e/immersive-dock-moderator.spec.ts` | 通过：坞可见、设置常驻、收起后 `.mod-header` 隐藏、展开恢复 |
| 响应式断点 | 未引入非规范断点（仅复用 480px 既有断点） |

## 视觉判定（只能由用户看图，AI 不自评）

**状态：待用户看图。** 我没有对画面美丑下任何结论；以下仅为事实性描述。

截图目录（绝对路径）：`D:\项目\docs\superpowers\reports\2026-09-29-immersive-dock\baseline\`

### 斗地主（1280x800 + 844x390 横屏，遵循该游戏既有横屏约定）

| 文件 | 事实描述 |
|---|---|
| `landlord-dock-bidding-expanded-1280x800.png` / `-collapsed-` | 叫地主时刻，茶馆全景；坞三钮（橙设置/全屏/收起）在右上，不压任何元素；收起后仅切换钮图标变向下 |
| `landlord-dock-bidding-expanded-844x390.png` / `-collapsed-` | 手机横屏叫地主；聊天钮在坞左侧，互不遮挡 |
| `landlord-dock-playing-expanded-1280x800.png` / `-collapsed-` | 出牌时刻（阿杰对 K、我 14 张手牌、倍数×3、倒计时） |
| `landlord-dock-playing-expanded-844x390.png` / `-collapsed-` | 手机横屏出牌；聊天钮在坞左侧 |

（斗地主外壳自身无顶栏，收起态主要变化是坞按钮态，符合预期。）

### Ding 真实联机版（1280x800 + 390x844）

| 文件 | 事实描述 |
|---|---|
| `ding-dock-playing-expanded-1280x800.png` / `-collapsed-` | 出牌时刻（6 席、中央铃铛、蓝 4 顶牌、我 6 张手牌） |
| `ding-dock-playing-expanded-390x844.png` / `-collapsed-` | 手机竖屏出牌；坞三钮右上 |
| `ding-dock-challenge-expanded-1280x800.png` / `-collapsed-` | 质疑时刻（亮出「伸了一个懒腰」、4 确认 1 质疑） |
| `ding-dock-challenge-expanded-390x844.png` / `-collapsed-` | 手机竖屏质疑面板；坞不压面板 |

（该画面 `.pt-top-bar` 在此类时刻无可视内容，expanded/collapsed 差异主要是坞按钮态；隐藏断言已由机器门覆盖。）

### 狼人杀真人主持 · 法官控制台（1280x800 + 390x844）

| 文件 | 事实描述 |
|---|---|
| `werewolf-moderator-dock-expanded-1280x800.png` | 第 1 夜·狼人行动·手动控场；法官全知底牌（2 狼/预言家/女巫/猎人/村民）+ 4 格状态卡；「本局规则」「菜单」完整可见不被坞遮挡 |
| `werewolf-moderator-dock-collapsed-1280x800.png` | 顶栏隐藏，状态卡上移至顶部，坞仍在右上 |
| `werewolf-moderator-dock-expanded-390x844.png` / `-collapsed-` | 手机竖屏同两态 |

## 对照物

- 既有基线：`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/`（同游戏同视口常规画面，用于比对坞引入前后的画面差异）
- 修复前对照：本轮第一轮截图已被同名覆盖；问题 1（图标偏移）有探针数值前后对比（dx 4.00 → 0.00），问题 2/3 的修复后画面见上表。

## 已知边界

- iOS Safari 无法对普通 DOM 全屏：坞不显示全屏按钮，首次收起顶栏时弹出「添加到主屏幕」引导条（本次截图均为桌面 Chromium，未覆盖 iOS 实测画面）。
- 收起/展开为即时切换，无过渡动画。
- 全屏按钮在有头浏览器实测可进入/退出全屏；无头截图环境未单独截全屏态。
