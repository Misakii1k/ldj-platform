# T5 · 茶馆场景组件（斗地主）

**目的**：把方向稿 `r2/_teahouse.css` + `r2/_poker.css` + `r2/_teahouse.js` 做成正式组件。只建组件，**不接入页面**（T6 接）。

## 要建的文件

```
packages/client/src/game/landlord/teahouse/
├── teahouse.css          ← 由 r2/_teahouse.css + r2/_poker.css 改写
├── TeahouseScene.tsx     ← 墙 / 墙裙 / 梁 / 梁托 / 花窗 / 对联 / 牌匾 / 灯笼 / 透视八仙桌 / 盖碗茶
├── PokerCard.tsx         ← 牌面（数字 / 人头 / 大小王 / 背面）
├── OpponentFigure.tsx    ← 半身像 + 名牌（身份圆章 / 名字 / 张数 / 小倒计时环）+ 气泡 + 背面小扇
├── LandlordPlate.tsx     ← 我的名牌
├── RotateHint.tsx        ← 竖屏"请把手机横过来"
└── handFit.ts            ← 手牌收紧公式（纯函数）
```

## 逐项要求

1. **`teahouse.css`**：根类 `.landlord-teahouse`，按 `contracts/landlord.md` §3 定义 `--th-*`；类名前缀 `th-`（`.th-card` 取代方向稿 `.pk2`）；`.device[data-size="landscape"]` → `@media (orientation: landscape) and (max-height: 520px)`；`.device[data-size="mobile"]`（竖屏）只保留 `.th-rotate-hint` 的显示规则，改成 `@media (orientation: portrait) and (max-width: 768px)`。
2. **`TeahouseScene`**：纯装饰，`aria-hidden`；灯笼 / 茶壶 SVG 直接从 `r2/_teahouse.js` 的 `LANTERN` / `TEA` 字符串改写成 JSX；对联文字固定"春风得意 / 四海来财"，牌匾"聚乐茶馆"；灯笼摆动在 `reduced` 以下停掉。
3. **`PokerCard`**：props `rank`（`3…10 J Q K A 2 小王 大王`）、`suit?`、`size`、`back?`、`selected?`、`isNew?`（底牌金边）、`flip?`（翻开动画）。人头牌 J/Q/K 中央是字母 + 冠（♛）+ 淡圆徽；大小王是描边圆章 + 星；牌背朱红回纹 + 金色"乐"字。字体用 `var(--gp-font-display)`。
4. **`OpponentFigure`**：props `nickname`、`avatar`、`color`（衣服色，取玩家席位色）、`role: 'lord' | 'farmer' | 'unknown'`、`handCount`、`active`、`deadlineAt?`、`bubble?`（{ text, sticky, hot }）、`revealedCards?`（结算时正面摊开）。半身像：**同一个剪影**，衣服填 `color`，脸的位置放 `UserAvatar` 圆形裁切（方向稿阿杰 / 可可两张画好的脸不要用）。`handCount ≤ 2` 时张数变 `var(--gp-coral)`。
5. **`handFit.ts`**：`computeTeahouseHandOverlap({ count, cardWidth, availableWidth, baseOverlap })`，公式与参数照 `contracts/landlord.md` §4.5；单测 `packages/client/tests/teahouseHandFit.test.ts`：17 / 20 张在 900、400、340 可用宽下总宽不超可用宽。
6. **`RotateHint`**：样式照 `r2/_teahouse.css` `.rotate-hint`；手机图标旋转动画在 `reduced` 以下停掉。

## 完成判据

- 临时 story 页面里把方向稿 `landlord-2-play.html` 的固定数据喂进去，桌面与横屏两档和方向稿对照，在 STATUS 写事实描述（不提交 story 页面）。
- 新单测、`breakpointContract.test.ts` 通过；`teahouse.css` 的字面量色只在 `.landlord-teahouse { }` 块内；机器门全绿。

## 白名单

```
packages/client/src/game/landlord/teahouse/**
packages/client/tests/teahouseHandFit.test.ts
```
