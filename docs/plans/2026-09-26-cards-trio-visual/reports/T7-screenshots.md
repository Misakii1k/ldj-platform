# 纸牌三姐妹（斗地主 / UNO / Ding）固定截图组报告

## 机器门

| 项 | 结果 | 命令 / 退出码 | 改动文件与详情 |
|---|---|---|---|
| 类型检查 | PASS | `npm run typecheck` → 0 | 覆盖前后端全量 TypeScript 代码 |
| 代码规范 | PASS | `npm run lint` → 0 | ESLint 静态代码检查无任何警告与错误 |
| 单元与契约套件 | PASS | `npx tsx --test "packages/**/tests/**/*.test.ts"` → 0 | 1595 项测试通过，0 项失败 |
| 平台合规门 | PASS | `npm run compliance:d1` → 0 | D1 compliance 架构与规则集校验通过 |
| 客户端生产构建 | PASS | `npm run build` → 0 | `packages/client/dist` 产物构建成功 |
| 斗地主平台端对局与移动端闭环 | PASS | `npx playwright test e2e/landlord-platform.spec.ts` → 0 | 2 项通过（宽视口叫分出牌闭环 + 窄视口无溢出） |
| 视口合约七档 | PASS | `npx playwright test e2e/game-viewport-contract.spec.ts -g landlord` → 0 | 1 项通过（7 档视口全部符合横竖屏与几何契约） |
| UNO 平台房规端到端闭环 | PASS | `npx playwright test e2e/uno-house.spec.ts` → 0 | 4 项通过 |
| Ding 铃铛对决端到端闭环 | PASS | `npx playwright test e2e/bell-clash-tabletop.spec.ts` → 0 | 3 项通过 |

---

## 视觉判定（状态：待用户看图）

> 视觉合格只能由用户看图判定，模型不作主观评价。用户结论栏在用户回复前保持为空。

### 1. 斗地主 (Landlord)

| 画面 | 截图绝对路径 | 对照物 | 事实描述 | 用户结论 |
|---|---|---|---|---|
| 叫地主 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-bid-1280x800.png | `contracts/landlord.md §4.1`、`docs/ui-preview/cards-trio/r2/landlord-1-bid.html`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/landlord-1280x800.png` | 1280x800 宽屏。正堂八仙桌背景，左右两人席位剪影与名牌，桌心三张底牌背面与三块叫分木牌（1分阿杰灰底、2分、3分），底部 17 张大牌面扑克手牌，右下叫分按钮。 | |
| 叫地主 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-bid-844x390.png | `contracts/landlord.md §4.1`、`docs/ui-preview/cards-trio/r2/landlord-1-bid.html`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/landlord-844x390.png` | 844x390 手机横屏。对手缩至两侧上方，桌心木牌与底牌背面，底部 17 张手牌收紧，右下操作坞。 | |
| 定地主后 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-bid-decided-1280x800.png | `contracts/landlord.md §4.1`、`docs/ui-preview/cards-trio/r2/landlord-1-bid.html` | 1280x800。底牌三张翻开公开，我方获得地主身份圆章与金元宝名牌，手牌扩展至 20 张且新入手 3 张带金边。 | |
| 定地主后 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-bid-decided-844x390.png | `contracts/landlord.md §4.1`、`docs/ui-preview/cards-trio/r2/landlord-1-bid.html` | 844x390。手机横屏下 20 张手牌自适应收紧无溢出，新入手 3 张带金边。 | |
| 出牌 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-play-1280x800.png | `contracts/landlord.md §4.2`、`docs/ui-preview/cards-trio/r2/landlord-2-play.html` | 1280x800。桌心为上家阿杰出的一对 K 及标签“阿杰 · 对子”，右侧倍数牌“×3”与倒计时环，底部 14 张手牌与“不出/出牌”操作坞。 | |
| 出牌 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-play-844x390.png | `contracts/landlord.md §4.2`、`docs/ui-preview/cards-trio/r2/landlord-2-play.html` | 844x390。手机横屏紧凑布局，出牌区对 K 居中，底部 14 张手牌与出牌操作坞互不遮挡。 | |
| 炸弹 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-play-bomb-1280x800.png | `contracts/landlord.md §4.2`、`docs/ui-preview/cards-trio/r2/landlord-2-play.html` | 1280x800。桌心为 4 张 8 组成的炸弹及标签，倍数翻为“×6”，手牌剩余 10 张。 | |
| 炸弹 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-play-bomb-844x390.png | `contracts/landlord.md §4.2`、`docs/ui-preview/cards-trio/r2/landlord-2-play.html` | 844x390。横屏下炸弹 8888 居中，右侧倍数“×6”。 | |
| 地主胜 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-result-win-1280x800.png | `contracts/landlord.md §4.3`、`docs/ui-preview/cards-trio/r2/landlord-3-result.html` | 1280x800。中央展开朱红捷报卷轴，顶端“捷报”，中间“地主胜”，下方战绩与“返回房间/再来一局”按钮，左右对手亮出剩余手牌正面。 | |
| 地主胜 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-result-win-844x390.png | `contracts/landlord.md §4.3`、`docs/ui-preview/cards-trio/r2/landlord-3-result.html` | 844x390。横屏下捷报卷轴适配显示，文字与按钮完整可见。 | |
| 春天 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-result-spring-1280x800.png | `contracts/landlord.md §4.3`、`docs/ui-preview/cards-trio/r2/landlord-3-result.html` | 1280x800。地主获胜且两名农民各有 17 张余牌，捷报卷轴右下角印有方形“春”印章。 | |
| 春天 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-result-spring-844x390.png | `contracts/landlord.md §4.3`、`docs/ui-preview/cards-trio/r2/landlord-3-result.html` | 844x390。横屏下带“春”印的捷报卷轴。 | |
| 农民胜 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-result-lose-1280x800.png | `contracts/landlord.md §4.3`、`docs/ui-preview/cards-trio/r2/landlord-3-result.html` | 1280x800。中央捷报卷轴显示“农民胜”，“阿杰、可可 联手拿下”。 | |
| 农民胜 844x390 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-result-lose-844x390.png | `contracts/landlord.md §4.3`、`docs/ui-preview/cards-trio/r2/landlord-3-result.html` | 844x390。横屏下农民胜捷报卷轴。 | |
| 旋转提示 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\landlord-rotate-hint-390x844.png | `contracts/landlord.md §4.4`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/landlord-390x844.png` | 390x844 手机竖屏。全屏遮罩显示手机旋转动画图、大字“请把手机横过来”、副说明“斗地主只做横屏：三家手牌和出牌区要一眼看全”。 | |

### 2. UNO

| 画面 | 截图绝对路径 | 对照物 | 事实描述 | 用户结论 |
|---|---|---|---|---|
| 出牌 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-play-1280x800.png | `contracts/uno.md §4.1`、`docs/ui-preview/cards-trio/r2/uno-1-play.html`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/uno-1280x800.png` | 1280x800。6人派对桌，环绕席位贴纸与气泡，桌心弃牌堆红7与摸牌堆，下方 7 张手牌（红3 红反转 蓝7 绿跳过 红+2 变色 +4）。 | |
| 出牌 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-play-390x844.png | `contracts/uno.md §4.1`、`docs/ui-preview/cards-trio/r2/uno-1-play.html`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/uno-390x844.png` | 390x844 竖屏。顶部两排对手贴纸，桌心中部弃牌堆与摸牌堆，下方手牌扇形排列。 | |
| +4出牌 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-play-draw4-1280x800.png | `contracts/uno.md §4.1`、`docs/ui-preview/cards-trio/r2/uno-1-play.html` | 1280x800。打出 +4 选蓝后，桌心顶牌变色为蓝，下家 Momo 席位挂 +4 罚牌标记。 | |
| +4出牌 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-play-draw4-390x844.png | `contracts/uno.md §4.1`、`docs/ui-preview/cards-trio/r2/uno-1-play.html` | 390x844 竖屏。桌心顶牌 +4 变色为蓝，下家罚牌状态提示。 | |
| 牌多16张 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-hand16-1280x800.png | `contracts/uno.md §4.3`、`docs/ui-preview/cards-trio/r2/uno-1-play.html` | 1280x800。手牌 16 张按红黄绿蓝万能归堆，自动收紧露角标，无横向溢出。 | |
| 牌多16张 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-hand16-390x844.png | `contracts/uno.md §4.3`、`docs/ui-preview/cards-trio/r2/uno-1-play.html` | 390x844 竖屏。16 张手牌在手机宽度内紧凑排布，只露角标，无横向溢出。 | |
| 牌多25张 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-hand25-1280x800.png | `contracts/uno.md §4.3`、`docs/ui-preview/cards-trio/r2/uno-1-play.html` | 1280x800。手牌 25 张高密度排布，角标紧凑清晰，两侧不超出屏幕边界。 | |
| 牌多25张 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-hand25-390x844.png | `contracts/uno.md §4.3`、`docs/ui-preview/cards-trio/r2/uno-1-play.html` | 390x844 竖屏。25 张手牌在手机小屏下收紧展示，无横向溢出。 | |
| 局结算 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-round-result-1280x800.png | `contracts/uno.md §4.2`、`docs/ui-preview/cards-trio/r2/uno-2-result.html` | 1280x800。本局结算弹窗，显示可可出完手牌获胜、各玩家本局手牌罚分、累计分及排名。 | |
| 局结算 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-round-result-390x844.png | `contracts/uno.md §4.2`、`docs/ui-preview/cards-trio/r2/uno-2-result.html` | 390x844 竖屏。手机结算弹窗，各玩家积分与名次清晰陈列。 | |

### 3. Ding (铃铛对决)

| 画面 | 截图绝对路径 | 对照物 | 事实描述 | 用户结论 |
|---|---|---|---|---|
| 平时态 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-idle-1280x800.png | `contracts/ding.md §4.1`、`docs/ui-preview/cards-trio/r2/ding-1-play.html`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/bell-clash-1280x800.png` | 1280x800。6人派对桌，中央木托盘大金铃与弃牌堆（蓝4），手牌 6 张（含短语卡），轮到阿杰出牌。 | |
| 平时态 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-idle-390x844.png | `contracts/ding.md §4.1`、`docs/ui-preview/cards-trio/r2/ding-1-play.html`、`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/bell-clash-390x844.png` | 390x844 竖屏。木托盘大金铃居中，上方对手席位，下方 6 张手牌与悬浮拍铃按钮。 | |
| 挑卡态 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-picking-1280x800.png | `contracts/ding.md §4.1`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 1280x800。点击拍铃后的挑卡状态，短语卡高亮上浮，普通数字卡半透明，提示“请亮出一张短语卡”。 | |
| 挑卡态 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-picking-390x844.png | `contracts/ding.md §4.1`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 390x844 竖屏。手机端挑卡状态，短语卡凸起，数字卡半透明置灰。 | |
| 质疑判定 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-challenge-1280x800.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 1280x800。质疑判定中，中央大卡亮出「伸了一个懒腰」，倒计时环显示 1 秒，下方投票统计“4 有 / 1 没做过”。 | |
| 质疑判定 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-challenge-390x844.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 390x844 竖屏。质疑卡牌全屏居中放大，倒计时环与投票进度条。 | |
| 拍铃成功 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-success-1280x800.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 1280x800。拍铃成功，顶牌变成绿短语「伸了一个懒腰」，回合成功转给拍铃者（小鱼干），手牌变为 5 张。 | |
| 拍铃成功 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-success-390x844.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 390x844 竖屏。拍铃成功接管回合，桌心顶牌更新为打出的短语卡。 | |
| 拍错判定 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-miss-1280x800.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-2-miss-result.html` | 1280x800。亮出「做了一个鬼脸」，4/5 票认为没做过，判定拍错，短语卡放回并罚摸牌。 | |
| 拍错判定 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-miss-390x844.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-2-miss-result.html` | 390x844 竖屏。质疑过半判定拍错。 | |
| 终局结算 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-result-1280x800.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-2-miss-result.html` | 1280x800。可可最先出完手牌获胜，中央结算板展示胜利者与各家剩余张数。 | |
| 终局结算 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-result-390x844.png | `contracts/ding.md §4.2`、`docs/ui-preview/cards-trio/r2/ding-2-miss-result.html` | 390x844 竖屏。手机结算弹窗。 | |
| 牌多24张 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-hand24-1280x800.png | `contracts/ding.md §4.3`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 1280x800。手牌 24 张，自动收紧露角标，扇形平整不溢出。 | |
| 牌多24张 390x844 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\bell-clash-hand24-390x844.png | `contracts/ding.md §4.3`、`docs/ui-preview/cards-trio/r2/ding-1-play.html` | 390x844 竖屏。24 张手牌在手机端无横向溢出。 | |

---

## 待确认事项（原样对照 README §5）

| # | 问题 | 执行时的默认做法 | 用户回答 |
|---|---|---|---|
| Q1 | UNO/Ding 手机紧凑模式"第一次点抽出来看、第二次点出牌" | 按此实现 | |
| Q2 | Ding 质疑窗口 3 秒、严格过半算拍错 | 按此实现，可配置 | |
| Q3 | 拍铃打断别人回合，别人的选择作废 | 按此实现 | |
| Q4 | 斗地主要不要「提示」按钮 | 先不做 | |
| Q5 | 平板竖屏 768×1024 也显示斗地主旋转提示 | 显示 | |

---

## 用户看图记录

- （待用户看图回复）
