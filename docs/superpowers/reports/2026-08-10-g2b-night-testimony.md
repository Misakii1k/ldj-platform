# 阶段 2 验收报告：暗夜证词（囚徒之夜 night_testimony_v1）

## 结论
**通过。** 第三款原版规则游戏按「线下辅助工具」定位完成上架：服务端规则层 + 契约测试（28 项全绿）、客户端页面（oil-frontend 规范、390px 无溢出）、集成接线、E2E 全绿、全部质量门通过。

## 原版身份与规则基线

| 项 | 内容 | 证据 |
|---|---|---|
| 原版 | 《囚徒之夜》台湾嘴嘴出版社，3–6 人 / 20 分钟 / 13+ | A 级（官方产品页明文玩法/组件/胜负） |
| 身份 | 狱警 1 名伪装囚犯潜伏；囚犯各持互异罪行卡 | A/B |
| 问答 | 每人 3 YES + 1 NO 标记；囚犯按罪刑如实回答、狱警可撒谎；YES 留公开轨迹、NO 收回 | A/B（高斯Goh 实况交叉） |
| 结束条件 | 某玩家 YES 用完 或 问满 N 问（N=玩家数，平台裁定） | B/C |
| 推理 | 随机加入一张未使用罪行卡公开混入，线下辩论 | A/B |
| 票选 | 投票选嫌疑人，被票选者公开身份；并列最高票取座位顺序第一（平台裁定） | A |
| 胜负 | 票出囚犯→狱警胜；票出狱警→猜全部罪刑，全对单独胜、否则囚犯胜 | A |

罪刑名称为原创表达（纵火/盗窃/伪造/走私/诈骗/绑架），不复制原版卡面文本。

## 交付物

### 服务端 `packages/games/night-testimony/`
- `types.ts` / `schemas.ts` / `rules.ts` / `views.ts` / `module.ts`（GameModuleV2 五件套）
- 状态机：问答（ask/answer + 标记管理 + 公开轨迹）→ 推理（额外罪行卡）→ 投票 → 票出后猜罪判定
- 计时器：`questionSeconds` / `deductionSeconds` / `voteSeconds` / `questionLimit` 全可配置
- 私密边界：终局前公开视图不含 `wardenId`/`crimes`/`isWarden`；玩家视图仅本人身份+罪行+标记剩余

### 客户端 `packages/client/src/game/night-testimony/`
- `NightTestimonyGamePage.tsx`：TabletopShell 桌面框架、私密信息区（身份+罪行+YES/NO）、问答轨迹公开区、提问/回答/投票/猜罪动作栏、终局披露
- `types.ts`：严格 view 解析器（手写 hasExactKeys，无 zod 依赖）
- 按 oil-frontend 规范：主导动作唯一（回答 YES/NO 或提问或投票或提交猜罪）、名字区分对象、无装饰性强调边、私密信息只在本人区域

### 集成
- catalog（playable，theme violet，4 个 setup 选项）、registry、viewRegistry、GamePage 分发
- 准入台账 `internal-admission-g2-2026-08-10-n01`（rights approved，证据 A/B 级 + 平台裁定如实标注）
- `docs/game-library/桌游平台游戏库资料/04_囚徒之夜/01_游戏规则.md` 更新为原版基线

## 验收

### 质量门（全绿）
typecheck（server+client）✓ · lint ✓ · test 68/68 ✓（含新包 28 项）· compliance:d1 PASS · build ✓

### E2E（21/21 全绿，--retries=0）
`night-testimony-tabletop` 4 人完整局 ok 3.3s：真实 WS 交替（含狱警被票出后的猜罪环节驱动）+ 浏览器渲染 + 隐私断言（终局前公开视图无 wardenId/crimes）+ 战绩落库。

### 截图与几何验收
- 截图：`docs/superpowers/reports/g2b-shots/night-testimony-question.png`（390×844）
- 几何测量（Playwright 实测，替代看图）：`docScrollWidth=390=docClientWidth` → **无横向溢出**；标题「暗夜证词」、私密信息区、问答轨迹区（「问答轨迹（公开）」）、本局规则按钮均可见；私密文案正确「你的罪行：伪造犯 · YES 3 · NO 1」。

## 平台裁定项（如实标注）
- 数字版提问为玩家自拟文字（原版问题卡题库未获取）
- 问答上限默认 = 玩家数；并列最高票取座位顺序第一
- 推理阶段额外罪行卡随机取未使用罪行
- 数字版自动判标记消耗与轨迹公开

## 状态
阶段 2 完成。**下一阶段（阶段 3）：Ding（bell-clash）+ 伪人测试（echo-judge）**——Ding 机制已确认（UNO 式出牌+短语卡+按铃抢回合），牌库需原创设计；伪人测试三模式按 B/C 级交叉验证实现。
