# 谁是狱警「C 牛皮纸档案室」视觉落地 · 验收报告（T6）

日期：2026-09-29　依据：`docs/plans/2026-09-26-night-testimony-visual/README.md`　模板：design-spec §11.4

## 机器门

| 项 | 结果 | 命令 / 退出码 |
|---|---|---|
| typecheck | PASS | `npm run typecheck` → 退出码 0（2026-09-29） |
| 全量单测 | PASS 73/73 | `npm test` → 退出码 0 |
| 夜审舞台单测 | PASS 9/9 | `npx tsx --test packages/client/tests/nightTestimonyStage.test.ts` → 退出码 0 |
| 构建 | PASS | `npm run build` → 退出码 0（vite 13.09s） |
| e2e 完整局 | PASS | `npx playwright test e2e/night-testimony-tabletop.spec.ts` → 1 passed (3.5m)，退出码 0 |
| visual-audit `--grep night` | 无匹配用例 | 退出码 1「No tests found」（用例标题均为中文，无 night 字样；计划命令不可执行） |
| visual-audit 夜审截图（替代执行 `--grep "6b"`） | 夜审项成功 | `screenshots/21_night_testimony_tabletop.png` 于 2026-09-29 14:35 刷新；分组整体退出码 1，失败点为**铃铛对决** `.tabletop-shell` 缺失（既有缺陷，9-18 起，非本计划白名单范围） |

说明：T5 前置「服务端猜罪期 `reveal.crimes` 下发」隐私修复**仍未合入**（`views.ts` 仅按 `phase==='game_over'` 判断）；前端按计划红线在猜罪期间不渲染任何囚犯真罪行（该字段仅被截图脚本用于代选标签，不进画面）。

## 视觉判定（状态：待用户看图）

截图目录：`D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\night-testimony-archive\`
采集方式：真实服务端（8091）+ vite dev（5199）+ Playwright 真实浏览器整局驱动（`scratch/nt-capture.ts`，2026-09-29 14:52–15:04 全量重采，exit 0）。
与 §1.6 fixture 的偏差（事实记录）：采自真实整局驱动，狱警身份与拍摄时题号随局而定（非固定「老王=狱警、第 3 问」）；`game-over` 取自「猜错一张」分支。

| 画面 | 截图绝对路径 | 对照物 | 事实描述 | 用户结论 |
|---|---|---|---|---|
| 出题·出题人 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\night-testimony-archive\night-testimony-pick-asker-1280x800.png | docs\ui-preview\night-testimony\directions\S1-pick.html（v=asker） | 桌面中央三张悬浮审问单（牛皮纸分类签、衬线题目、Courier 单号 No.002-A/B/C），右上「已归档」叠 Q1 旧单，出题人档案袋淡紫「挑单中 ✎」，底栏罪行条+「轮到你出题」+自告次按钮 | （空，等用户） |
| 出题·出题人 390x844 | 同目录 `night-testimony-pick-asker-390x844.png` | 同上 | 同构成，审问单竖排、档案袋 3 列两行 | （空，等用户） |
| 出题·其他人 1280x800 | 同目录 `night-testimony-pick-other-1280x800.png` | S1-pick.html（v=other） | 虚线框空单位置「阿杰 正在挑审讯单……」，无候选题目泄露，底栏等待说明 | （空，等用户） |
| 出题·其他人 390x844 | 同目录 `night-testimony-pick-other-390x844.png` | 同上 | 同构成移动端 | （空，等用户） |
| 问答盖章 1280x800 | 同目录 `night-testimony-answering-1280x800.png` | C-kraft-archive.html（用户已确认 2026-09-26） | 夹板审讯单（Courier「审讯单 No.001 · 提问人」、30px 衬线问题）、每座盖章格（已答=实线「已盖章」，未翻面前无 YES/NO）、底部盖章计数，底栏「盖 NO」「盖 YES」+自告 | （空，等用户） |
| 问答盖章 390x844 | 同目录 `night-testimony-answering-390x844.png` | 同上 | 同构成移动端，操作按钮在底栏直出（R1 已拆除回合弹窗） | （空，等用户） |
| 问答·全员翻开 1280x800 | 同目录 `night-testimony-answering-flipped-1280x800.png` | C-kraft-archive.html（点「盖 NO」后） | 全员盖章格翻开：YES 红框斜章 / NO 蓝框斜章，YES 章落档案袋余量格 | （空，等用户） |
| 问答·全员翻开 390x844 | 同目录 `night-testimony-answering-flipped-390x844.png` | 同上 | 同构成移动端 | （空，等用户） |
| 问答·6 人 1280x800 | 同目录 `night-testimony-six-answering-1280x800.png` | C-kraft-archive.html | 6 只档案袋一排（含长名字囚犯），无重叠溢出 | （空，等用户） |
| 问答·6 人 390x844 | 同目录 `night-testimony-six-answering-390x844.png` | 同上 | 6 只档案袋 3 列两行 | （空，等用户） |
| 投票 1280x800 | 同目录 `night-testimony-vote-1280x800.png` | S2-vote.html | 中央「结案汇总」表（每行一问×每列一人，YES 红/NO 蓝），档案袋可点选，已自告袋灰显「不能投」，底栏珊瑚红「贴封条」 | （空，等用户） |
| 投票 390x844 | 同目录 `night-testimony-vote-390x844.png` | 同上 | 汇总表横滚，档案袋 3+2 网格，操作在底栏（无弹窗） | （空，等用户） |
| 开票·抓到狱警 1280x800 | 同目录 `night-testimony-reveal-caught-1280x800.png` | S3-reveal.html（case=caught） | 被抽档案袋居中放大，证件滑出为深色「监狱工作证」（黄字），告示牌「抓到狱警了！」，原位置袋 30% 透明；画面无票数无投向 | （空，等用户） |
| 开票·抓到狱警 390x844 | 同目录 `night-testimony-reveal-caught-390x844.png` | 同上 | 同构成移动端 | （空，等用户） |
| 开票·抓错人 1280x800 | 同目录 `night-testimony-reveal-wrong-1280x800.png` | S3-reveal.html（case=wrong） | 抽出袋内为奶油底「囚犯档案 · 不是狱警」，真狱警档案袋翻开深色「狱警」，告示牌「狱警 可可 独胜 / 你们抓的是 老王（恶意纵火）」；底部已浮现「再来一局」面板（服务端进终局、客户端演出仍在定格期） | （空，等用户） |
| 开票·抓错人 390x844 | 同目录 `night-testimony-reveal-wrong-390x844.png` | 同上 | 同构成移动端，要素齐全 | （空，等用户） |
| 猜罪·狱警视角 1280x800 | 同目录 `night-testimony-guess-warden-1280x800.png` | S4-guess.html（v=warden） | 告示牌「给每只档案袋贴上罪行」+罪行标签池（交替倾斜），档案袋底部虚线标签位，已自告袋预贴锁定，黄色主按钮「提交猜罪」；画面无弹窗 | （空，等用户） |
| 猜罪·狱警视角 390x844 | 同目录 `night-testimony-guess-warden-390x844.png` | 同上 | 标签池在桌面上直接点选（R1 拆除弹窗后） | （空，等用户） |
| 猜罪·囚犯围观 1280x800 | 同目录 `night-testimony-guess-inmate-1280x800.png` | S4-guess.html（v=inmate） | 虚线框「狱警 X 正在给大家的档案袋贴罪行……」，档案袋标签位「待贴」，无操作按钮 | （空，等用户） |
| 猜罪·囚犯围观 390x844 | 同目录 `night-testimony-guess-inmate-390x844.png` | 同上 | 同构成移动端 | （空，等用户） |
| 终局核对 1280x800 | 同目录 `night-testimony-game-over-1280x800.png`（狱警视角 `-game-over-warden-` 同名） | S4-guess.html 终态 | 告示牌胜负结果，卷宗核对卡逐袋列「真罪行 vs 狱警所贴」✓/✗，底部「再来一局」面板；核对完成后才出现囚犯真罪行 | （空，等用户） |
| 终局核对 390x844 | 同目录 `night-testimony-game-over-390x844.png`（+`-warden-`） | 同上 | 同构成移动端 | （空，等用户） |

补充证据：`screenshots/21_night_testimony_tabletop.png`（visual-audit 6b 夜审项，2026-09-29 14:35 刷新）——4 人局开局帧，新档案室皮肤在 e2e 管道下正常渲染。

## 用户看图记录

- 2026-09-29 用户驳回（原话）：「囚徒之夜前端页面不行」。追问确认：① 指视觉没落地/难看，非功能故障；② ①③④⑤ 参照稿全部认可，直接按计划实施，不再逐张确认。
- 2026-09-29 R1 驳回修复：拆除 9-28 会话自行引入的移动端通用白弹窗（`nt-turn-modal`），操作全部回到桌面与底栏（详见 PROGRESS.md「2026-09-29 驳回修复轮 R1」）。
  - ⚠ 事实记录：R1 重采为同名覆盖，9-28 驳回版 before 图未留存，本轮无法提供同视口 before/after 对照（违反 §11.5 留存要求，后续轮次改为改名留存）。
- 2026-09-29 T6：机器门全绿 + 截图组全量重采（本报告）。**视觉结论保持「待用户看图」**，请重点对照 S1–S4 参照稿看 R1 之后的移动端操作区（无弹窗）与开票/猜罪画面。

## 遗留（不阻塞验收，按计划归属）

1. 服务端隐私修复「猜罪期不下发 `reveal.crimes`」：另一任务，未合入；前端已按红线渲染。
2. `e2e/visual-audit.spec.ts` 铃铛对决段 `.tabletop-shell` 缺失（既有，9-18 起）；`--grep night` 无匹配（用例标题为中文）——若要让计划 §4 命令可执行，需给夜审用例标题加英文别名或改计划命令。
3. README §6 待确认第 1 条（服务端作答期是否只下发「谁已答」）仍待用户答复。
