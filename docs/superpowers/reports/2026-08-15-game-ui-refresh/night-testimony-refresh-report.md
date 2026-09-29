# 囚徒之夜（night-testimony）UI 重制 · 终验报告

日期：2026-09-28。基线：结算坞交接（`602111b`）之后的会话工作。

---

## 1. 本轮范围

按参考稿将「谁是狱警？」全阶段 UI 重制为审讯室纸质档案风：

- **出题**：夹子悬挂的三张问题卡便签（`nt-slip`），选中动画与退场
- **问答**：夹板审讯单（`nt-form`）+ YES/NO 印章盖戳（`nt-chip` / `nt-chip--flip` 同时揭开）
- **投票**：全员档案袋选票陈列（`nt-tallies`）
- **揭示**：抽出被指控者档案袋（`nt-pulled`）→ 撕封条 → 滑出证件（囚犯档案 / 监狱工作证 `nt-idcard`）→ 结果告示牌（`nt-notice`）
- **档案袋席位行**（`ArchiveFiles`）：编号角标、格子照、罪行名、三格 YES 珠、自告紫袋高亮
- **底栏**（`nt-dock`）：私密罪行条（点击遮挡）、阶段提示、自告 / 盖章按钮
- **终局**：胜负告示牌 + 全员档案卡记分牌（真实罪行 vs 狱警猜测 ✔/✘）+ 已归档审讯单

## 2. 本轮修复的实测缺陷

| 缺陷 | 修复 |
|---|---|
| 问答阶段 YES 珠泄漏当前实时票数（应只显示历史已归档票数） | `ArchiveFiles.tsx`：`yesCounts ? (yesCounts[id] ?? 0) : …`，`{}` 时不再回退实时计数 |
| 揭示阶段告示牌被档案袋行压住 / 重叠 | `.nt-notice` 提至 `z-index:4`；撕封条与结果步 `.nt-tallies` 改为 `display:none` 让出纵向空间 |
| 六人局截图覆盖五人局同名文件 | `nt-capture.ts` six 模式改用 `six-` 前缀输出 |
| mDNS 服务名冲突导致游戏服务器崩溃（`Service name is already in use`） | 采集脚本统一以 `MDNS_DISABLE=1` 启动服务器 |
| 出题人竞态（偶尔卡住） | 采集脚本加 `dumpView` 插桩与按座位 stash 诊断 |
| 盖 YES 为实心红主按钮，视觉上引导选 YES | 改为与盖 NO 完全同款的纸面描边按钮，仅以印章色（红/深蓝）区分；手机端自告独占一行、NO/YES 等分同一行 |
| 「必须如实回答」文案暗示系统会评判答案 | 底栏改「按你的理解作答即可」，规则页改「系统不评判对错」（服务端本就不校验答案正误，题卡也没有标准答案数据，答案完全由玩家自主理解） |
| 手机端主画面内容被裁切、回合操作与场景同层需滑动 | 新增窄屏（≤640px）回合弹窗 `nt-turn-modal`：轮到我作答/出题/投票/猜罪时自动弹出，收起居底栏「去操作」按钮可重新打开；底栏收窄为纯状态区，档案袋行完整入屏不再裁切。桌面端维持平铺不变 |
| 揭示阶段证件「贴」在档案袋上，没有从袋里抽出的层次 | 档案袋拆为背板 + 前袋两层：证件夹在中间，撕封条后从袋口向上滑出（下部始终插在袋内）；前袋带拇指半圆缺口、袋口内侧阴影与 CASE FILE 贴纸；同时修复中央区 stacking context 导致告示牌被档案袋行压住的问题（`.nt-center:has(.nt-pulled)` 提层） |

## 3. 验证门

| 验证项 | 结果 | 说明 |
|---|---|---|
| `tsc -p packages/client/tsconfig.json` | **PASS (0 errors)** | 客户端类型检查全绿 |
| `packages/games/night-testimony` 单测 | **PASS (37/37)** | 规则 / 视图 / 模块全绿 |
| `packages/server` 单测 | **PASS** | 仅 `llmConnectionTest` 初跑失败，定位为环境代理（`HTTP_PROXY=127.0.0.1:7897` 拦截 `upstream.test`），`NO_PROXY` 补名单后 20/20 全绿；与本轮改动无关 |
| 桌面 1280×800 全流程实机截图 | **PASS** | 12 张：出题(他人/本人)/问答/翻开/投票/揭示/猜罪(囚犯/狱警)/终局×2，见 `night-testimony-archive/` |
| 手机 390×844 全流程实机截图 | **PASS** | 12 张同构；终局长页可滚、案卷两列流式陈列 |
| 六人局布局 | **PASS** | `six-*.png` 3 张：桌面单排 6 袋、手机 2×3；长名截断正常 |

### 存量待办（非本轮引入）

- `e2e/night-testimony-tabletop.spec.ts` 驱动的是旧规则词汇（`answer`/`ask`），现行规则只接受 `answer_question`/`pick_question_card`——自基线提交 `f5c07e8` 起即坏。建议按 `scratch/nt-capture.ts` 的 Node 驱动模式重写该 spec。

## 4. 截图清单（`night-testimony-archive/`）

五人局桌面 + 手机各 12 张；六人局 `six-pick-other` / `six-answering`（1280×800、390×844）。

## 5. 复跑方式

```powershell
$env:PORT='8091'; $env:DATA_DIR='D:\项目\scratch\nt-capture-data'; $env:LOG_LEVEL='warn'; $env:E2E_JOIN_LIMIT_MAX='1000'; $env:MDNS_DISABLE='1'; node packages/server/src/index.ts
# 另开终端
npx tsx scratch/nt-capture.ts desktop   # 或 mobile / six
```
