# 03 · 验收

## 1. 机器门（每个任务按卡片要求跑；W08 全跑）

| 项 | 命令 | 通过条件 |
|---|---|---|
| 类型 | `npm run typecheck` | 退出码 0 |
| 狼人杀单测 | `npx tsx --test packages/client/tests/werewolf*.test.ts` | 0 |
| 断点 / 类名契约 | `npx tsx --test packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` | 0 |
| 全量单测 | `npm test` | 0（若有与本计划无关的存量失败，记名称与退出码，不许为转绿去改无关测试） |
| 视口契约 | `npx playwright test e2e/game-viewport-contract.spec.ts` | 0 |
| 动效契约 | `npx playwright test e2e/motion-contract.spec.ts` | 0 |
| 狼人杀 e2e | `npx playwright test e2e/werewolf-*.spec.ts` | 0 |
| 构建 | `npm run build` | 0，且 `packages/client/dist` 已更新 |

注意（来自项目记忆）：
- **e2e 跑的是构建产物**：改完客户端先 `npm run build`，否则 Playwright 验证的是旧 UI。
- **端口 3178**：Playwright 起不来时先查是否有孤儿服务占着 3178，别急着杀别人的进程。
- **并行会话**：开工前 `git status` 确认没有其他会话在同目录改同一批文件。

## 2. 截图组（`docs/design-spec.md` §11.3）

目录：before → `docs/superpowers/reports/2026-09-26-werewolf-visual/before/`，after → `.../after/`。
文件名：`werewolf-<画面>-<宽x高>.png`。视口：`1280x800` 与 `390x844`。fixture：12 人局，你 = 6 号 团子（身份按画面需要设置）。动画静止后截；倒计时数字可 mask。

| # | 画面 | 局面 | 对照物（方向稿，用同视口打开对照） |
|---|---|---|---|
| 1 | `deal` | role_reveal，你的牌已翻开（女巫） | `R-reveal.html` ① 翻开后 |
| 2 | `night-wolf` | night，你是狼人，已选 4 号未确认 | `N-night.html` 狼人视角 |
| 3 | `night-witch` | night，你是女巫，4 号被刀 | `N-night.html` 女巫视角 |
| 4 | `night-sleep` | night，你是村民，狼人行动中 | `N-night.html` 闭眼等待 |
| 5 | `speech` | discussion，5 号发言，你是下一位 | `A2-box-wings.html` 默认 |
| 6 | `speech-self` | discussion，轮到你发言 | `A2-box-wings.html` 交麦一次后 |
| 7 | `vote` | voting，你已选 4 号未确认 | `V-vote.html` ① 选人后 |
| 8 | `count` | vote_result，唱票结束 | `V-vote.html` ② 结束态 |
| 9 | `exile` | vote_result，4 号被放逐（撕票后） | `V-vote.html` ③ |
| 10 | `finale-village` | game_over，好人胜 | `R-reveal.html` ② 好人胜 |
| 11 | `finale-wolves` | game_over，狼人胜 | `R-reveal.html` ② 狼人胜 |

共 11 画面 × 2 视口 = 22 张。截不到的格子写原因，不得用旧图或方向稿截图冒充。

## 3. 报告模板（W08 写 `REPORT.md`）

```markdown
## 机器门
| 项 | 结果 | 命令 / 退出码 |

## 视觉判定（状态：待用户看图）
| 画面 | 截图绝对路径 | 对照物 | 事实描述 | 用户结论 |
| speech 1280x800 | D:\项目\docs\superpowers\reports\2026-09-26-werewolf-visual\after\werewolf-speech-1280x800.png | A2-box-wings.html | 左 6 右 6 票根，中央圆形头像 + "月下听风"… | （空，等用户） |

## 与方向稿的已知差异
（逐条列出；没有写"无"）

## 用户看图记录
```

- 机器门表与视觉判定表**分开**；「用户结论」列 AI 不许填。
- 事实描述只写看到了什么，不写"精致 / 已对齐 / 达标"。
- 读不到截图就写"我没有看到画面"。

## 4. 不许做

**来自 `DESIGN-DIRECTION.md` §2 否定项：**
- 整页奶油底 + 粗墨边 + 大面积黄色（C8）。狼人杀是深色表皮，不上粗墨边硬投影（C2）。
- 一张卡片居中、四周空白、只有文字和通用面板（C9）。
- 画面与规则对不上（C18）：不显示"谁投了谁"，局中不显示出局者身份 / 死因，终局前 DOM 不含他人身份。
- 霓虹浓烈配色、像素 / CRT 风（C13）。
- 大数字用无衬线（C7）。

**本游戏专属：**
- 不许保留或新增森林（木刻 / 月蚀）主题、主题切换入口、奶油浅底的白天。
- 中央发言者不许做成拱形海报立绘（用户 2026-09-26 已否定），用圆形头像。
- 同一视口不许出现第二个黄色按钮。
- 席位不许需要上下滚动才能看全（C10），手机 12 人也一样。
- 不许点席位就立即发送夜间 / 投票动作——必须"选中 → 黄色按钮确认"两步。
- 不许为了让测试转绿去删断言、放宽隐私校验、`--update-snapshots` 自动接受新基线。
- 不许改服务端规则 / 协议 / 法官语音。
- 不许自己设计方向稿里没有、本计划也没写的画面——停下来问。
