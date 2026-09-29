# T2 · 派对桌共用组件（UNO / Ding）

**目的**：把方向稿 `r2/_party.css` + `r2/_party.js` 做成正式组件，T3（UNO）和 T4（Ding）共用。本任务只建组件，**不接入页面**。

## 要建的文件

```
packages/client/src/game/party-table/
├── party-table.css        ← 由 r2/_party.css 改写
├── PartyCloth.tsx         ← 桌布 + 泼色层 + 淡剪影
├── PartyDisc.tsx          ← 纸板圆盘 + 方向环 + 中央插槽（children）
├── PartyCard.tsx          ← 牌（数字 / 功能 / 万能 / 短语 / 背面）
├── PartySeatRing.tsx      ← 上半圈贴纸席位
├── PartySticker.tsx       ← 单个贴纸（也用于"我"）
├── PartyColorPicker.tsx   ← 选色盘
├── PartySlam.tsx          ← 冲屏大字 + 放大残影
└── cornerHandLayout.ts    ← 牌多收紧算法（纯函数）
```

## 逐项要求

1. **`party-table.css`**：
   - 根类 `.pt-table`，按 `contracts/uno.md` §3 定义 `--pt-*`；`data-color="red|yellow|green|blue"` 切换 `--pt-cur`。
   - 类名前缀一律 `pt-`（`.pt-disc`、`.pt-card`、`.pt-sticker`…），不要沿用方向稿的 `.uc2` / `.sticker`。
   - `.device[data-size="mobile"]` 全部换成 `@media (max-width: 480px)`（README §3.2）。
   - 字面量色只允许出现在 `.pt-table { … }` 变量定义那一块里。
2. **`PartyCloth`**：props `color`；换色时从 `originRef`（弃牌堆元素）中心圆形泼色 560ms，泼满后才写回底色（方向稿 `setColor` 的逻辑，**必须用定时兜底**，不能只靠 `animationend`——后台标签页不触发）。`data-motion-level` 为 `minimal / off` 时直接换色。
3. **`PartyDisc`**：props `direction: 'cw' | 'ccw'`、`children`；方向变化时环放大弹一下。
4. **`PartyCard`**：props `card`（UNO 房规牌或 Ding 牌，做一个小适配层把两种牌型转成 `{ color, face: 'number'|'skip'|'reverse'|'draw2'|'wild'|'draw4'|'phrase'|'back', value?, phrase? }`）、`size`、`playable?`、`dim?`、`tinted?`（万能牌打出后显示所选色）、`backLabel?`（"UNO" / "Ding"）、`backAccent?`（牌背中心色：UNO 红、Ding 深绿）。
5. **`PartySeatRing`**：props `seats[]`（id、昵称、头像、张数、是否当前、是否剩 1 张 / 已喊 UNO）；椭圆参数与角度范围照 `contracts/uno.md` §4.1；手机隐藏头像；每个贴纸带 `data-player-id`（飞行层定位用）。
6. **`PartyColorPicker`**：Promise 风格或回调均可；焦点管理：打开时焦点落在第一个色块，Esc 不关闭（必须选色）。
7. **`PartySlam`**：props `text`、`kind`（`draw4|draw2|reverse|skip|uno|ding|phrase|miss`）、`ghostCard?`；每次 `key` 变化播一次；`minimal/off` 档不渲染大字（由调用方改阶段牌文字）。
8. **`cornerHandLayout.ts`**：纯函数 `computeCornerHand({ count, cardWidth, availableWidth, baseOverlap })` → `{ overlap, tight, tiltDeg }`，公式照 `contracts/uno.md` §4.3；再导出 `sortByColor(cards)`（红 → 黄 → 绿 → 蓝 → 万能 / 其他）。
9. **`CardFanEngine.tsx`** 加可选 prop `crowdMode?: 'dense' | 'corner'`：
   - 不传：行为与现在**完全相同**（现有 `denseWhenCrowded` 逻辑不动）。
   - `'corner'`：用 `computeCornerHand` 算重叠；`tight` 时加 `.is-corner-tight` 类；悬停 / `peek` 的牌上抬 40px、放大 1.06、右侧让位；触屏（`pointer: coarse`）下第一次点只 `peek`，第二次点才触发 `onSelectCards`。
10. 单测 `packages/client/tests/cornerHandLayout.test.ts`：7 / 16 / 25 张在 820 与 350 可用宽下的 `overlap`、`tight` 取值；总宽不超过可用宽；`sortByColor` 顺序。

## 完成判据

- 组件能在一个临时 story 页面里渲染（不需要提交这个页面）：把方向稿 `uno-1-play.html` 的固定数据喂进去，桌布 / 圆盘 / 贴纸 / 手牌与方向稿同视口对照，在 STATUS 里写事实描述。
- `breakpointContract.test.ts` 通过；新单测通过；机器门全绿。
- `grep -n "#[0-9a-fA-F]\{3,6\}" packages/client/src/game/party-table/party-table.css` 的结果全部在 `.pt-table { }` 块内。

## 白名单

```
packages/client/src/game/party-table/**
packages/client/src/shared-ui/CardFanEngine.tsx   （只加可选 prop，默认行为不变）
packages/client/tests/cornerHandLayout.test.ts
```
