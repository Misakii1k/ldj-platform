# 局域网桌游平台前端设计系统与交互规范 (Tabletop Design System)

本规范规定了局域网桌游平台（包括谁是卧底、狼人杀、斗地主、UNO、榴莲店长、情书、暗夜证词、以鹅传鹅、奶酪大盗、伪人测试等全部游戏）在移动端全面屏适配、外层滚动条控制、专属美学细滑块、紧凑卡牌条、全屏判定舞台以及开局转场动效的标准开发范式。

---

## 1. 视口零横向溢出与外层滚动条彻底消除规范 (Zero Outer Scrollbars)

### 1.1 核心原则
- **全局禁止页面级横向溢出**：
  整个桌游平台必须保持沉浸式单屏/视口体验。`html`, `body`, `#root`, `.app`, `.game-page`, `.tabletop-shell`, `.tabletop-oval-shell`, `.tabletop-arena`, `.uc-stage`, `.uc-stage__body` 等外层视口容器严禁产生页面级水平横向滚动条或外部纵向滚动条。
- **强制样式标准**：
  ```css
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
    scrollbar-width: none; /* Firefox 隐藏外层滚动条 */
    -ms-overflow-style: none; /* IE/Edge */
  }

  html::-webkit-scrollbar,
  body::-webkit-scrollbar,
  #root::-webkit-scrollbar,
  .app::-webkit-scrollbar,
  .game-page::-webkit-scrollbar,
  .tabletop-shell::-webkit-scrollbar,
  .tabletop-oval-shell::-webkit-scrollbar,
  .tabletop-arena::-webkit-scrollbar,
  .uc-stage::-webkit-scrollbar,
  .uc-stage__body::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
  ```

---

## 2. 专有桌游美学细滑块设计规范 (Custom Aesthetic Scrollbars)

### 2.1 适用场景
仅在有**实际内部长列表内容需要滑动**的局部独立容器中开启，例如：
- 6~12 人长发言顺序列表（`.uc-order__list`）；
- 全员结算长身份档案（`.roles-list`）；
- 游戏内聊天消息历史抽屉（`.game-chat-messages`）；
- 规则说明与游戏玩法长文弹层。

### 2.2 规格与配色标准
- **超细胶囊尺寸**：宽度/高度严格限定为 **`5px`**，圆角 **`999px`** 胶囊状，绝不侵占内容排版。
- **轨道（Track）**：完全透明 (`background: transparent`)。
- **滑块（Thumb）主题配色**：
  - **日间 / 羊皮纸 / 经典主题**：
    - 基础状态：`rgba(217, 119, 6, 0.32)`（半透明焦糖金）；
    - 悬浮 / 拖拽：`rgba(217, 119, 6, 0.70)`。
  - **暗色 / 机密紫 / 狼人杀夜间主题**：
    - 基础状态：`rgba(255, 209, 102, 0.35)`（琥珀暖金）；
    - 悬浮 / 拖拽：`rgba(255, 209, 102, 0.75)`。
- **跨端标准实现代码**：
  ```css
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(217, 119, 6, 0.35) transparent;
  }

  ::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 999px;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(41, 39, 34, 0.28);
    border-radius: 999px;
    border: 1px solid transparent;
    background-clip: padding-box;
    transition: background 0.2s ease;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(217, 119, 6, 0.7);
  }

  /* 暗色机密/夜间桌游主题覆盖 */
  .uc-stage *,
  .tabletop-theme-dark *,
  .werewolf-night *,
  .night-testimony * {
    scrollbar-color: rgba(255, 209, 102, 0.4) transparent;
  }

  .uc-stage *::-webkit-scrollbar-thumb,
  .tabletop-theme-dark *::-webkit-scrollbar-thumb,
  .werewolf-night *::-webkit-scrollbar-thumb,
  .night-testimony *::-webkit-scrollbar-thumb {
    background: rgba(255, 209, 102, 0.35);
  }
  ```

---

## 3. 移动端与全面屏（19.5:9 / 20:9）自适应排布规范 (Mobile Fullscreen Adaptation)

### 3.1 密集卡牌紧凑化（Compact Ribbon）
- 当场上或手牌堆叠卡牌张数超过阈值（如 $\ge 5$ 张）时，必须自动转换为高度 $\le 36\text{px}$ 的**精简紧凑条**。
- 左半边（作废侧）暗化半透明并标注 `✗`，右半边（生效侧）高亮背景并标注 `✓ 生效`，数量通过 `×数量` 明确标注，避免小屏层叠遮挡。

### 3.2 全屏毛玻璃模态判定大舞台（Full-Screen Verdict Overlay）
- 质疑结算或胜负判定**严禁挤在局部小卡片内**。
- 统一采用全屏暗色毛玻璃遮罩模态（`backdrop-filter: blur(16px); background: rgba(15, 23, 42, 0.88)`）。
- 居中展示超大尺寸对决卡片、数字向上滚动翻转动效（`RollingNumber`）、爆破印章与倒计时操作按钮。

### 3.3 操作栏安全嵌入与聊天浮球避让
- 核心操作栏（如「发言完毕，交棒下一位」、「出牌」、「抢单按铃」）必须置于对应互动列底部，或吸底但保留安全边距。
- 严禁操作栏悬浮覆盖右侧发言列表或右下角聊天悬浮按钮。

### 3.4 左右玩家 3 栏安全栅格对齐
- 牌桌战场采用 `grid-template-columns: minmax(120px, 1fr) auto minmax(120px, 1fr)`，确保左右玩家在宽屏和窄屏下均垂直居中对齐，绝不被推离视口或截断。

---

## 4. 房间开局全屏水波与条状百叶窗转场动效规范 (Game Start Transition)

### 4.1 转场三阶段标准时序
1. **Phase 1（0 ~ 450ms）- 绿色水波爆发（Ripple Blast）**：
   从底部就绪胶囊位置以圆形/圆角矩形急速向外波纹爆发扩散，铺满整个视口（`background: radial-gradient(...)`）。
2. **Phase 2（400 ~ 900ms）- 几何彩色百叶窗横扫（Shutter Stripes Sweep）**：
   7 道倾斜条纹（琥珀金、深林绿、亮黄色）交错从左向右横扫推进（`skewX(-12deg)`），中央浮现金色游戏开局徽章与「✦ 牌局开启 · 全力以赴 ✦」，伴随立体洗牌发牌音效。
3. **Phase 3（850 ~ 1200ms）- 平滑淡出揭幕（Curtain Reveal）**：
   转场层优雅淡出，平滑无缝露出加载完成的游戏正式界面。

---

## 5. 全游戏统一沉浸式结算与再来一局流 (Universal Post-Game Rematch Flow)

### 5.1 核心原则
- **终局不立即强制退出或清空页面**：游戏结束进入 `POST_GAME` 阶段时，完整保留当前牌桌战况、身份揭晓与积分榜单，不突兀跳回大厅。
- **全局底部浮动操作坞 (`TabletopSettlementDock`)**：
  - 在 `GamePage` 根部全局自动挂载（`z-index: 800`），悬浮于牌桌正下方，零侵占中间游戏内容。
  - **全员就绪进度条**：以头像胶囊列出房间所有真人与机器人玩家，实时高亮就绪状态（`已准备 X/Y`）。
  - **3 秒极速开局**：全员就绪后自动启动 3 秒极速倒计时（可随时取消准备暂停），房主专属提供「▶ 立即开局」一键跳过倒计时。
  - **双退出操作清晰分离**：
    - `🏠 返回大厅`（房主专属）：一键将房间全员带回大厅调参或换游戏；
    - `🚪 退出房间`（所有玩家）：立即离开房间释放席位返回首页。

---

## 6. 全局提示与弹窗的实体复古派对质感规范 (Tactile Retro-Party Solid Style)

### 6.1 视觉标准
- **拒绝单薄 1px 细线框**：全局所有 Toast 通知、错误提示与悬浮面板，必须严格遵循平台实体复古派对质感：
  - **粗黑边框**：`2.5px solid var(--game-line, #221e1a)` 粗实体轮廓；
  - **实体下沉投影**：`box-shadow: 0 4px 0 var(--game-line), 0 8px 20px rgba(0, 0, 0, 0.35)`；
  - **状态柔和渐变**：错误红（`#fff1f2` → `#fee2e2`）、成功绿（`#f0fdf4` → `#dcfce7`）、提示黄（`#fffdf8` → `#fef3c7`）；
  - **实体独立关闭按键**：独立白底方圆按键，带 `1.5px` 黑边与立体按压回弹微交互（`hover` 变红放大，`active` 下沉）。

---

## 7. 状态指示图标与文字排布规范 (Flexbox Indicators vs Absolute Positioning)

### 7.1 排布原则
- **严禁使用绝对定位放置徽章圆点**：
  - 胶囊徽章（如「局域网极速联机」）左侧的呼吸指示点严禁使用 `position: absolute; left: 9px;`。
  - **必须使用 Flex 容器子项**：
    ```css
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
    }
    .badge::before {
      display: inline-block;
      flex-shrink: 0;
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    ```
  - **收益**：多端响应式媒体查询覆盖 padding 时，指示点永远与文字保持标准间距，绝不重叠。

---

## 8. 区块重排的外边距节奏与投影避让 (Vertical Rhythm & Card Shadow Clearance)

### 8.1 间距原则
- **卡片重排必须同步检查上下外边距节奏**：
  - 当卡片带有实体下沉投影（如 `box-shadow: 6px 7px 0 var(--home-ink)`）时，卡片必须显式声明底部外边距（`margin-bottom: clamp(44px, 6.5vw, 68px)`）。
  - 下一区块（如「游戏目录」）严禁使用负外边距或过紧的上边距，确保卡片的黑色立体厚度与后置标题之间有舒适的呼吸空间。

---

## 9. 狼人杀马蹄席位安全收敛与居中大画幅身份复盘 (Werewolf Tribunal Specs)

### 9.1 席位收敛与终局复盘
- **马蹄形席位安全收敛区间**：
  - 席位卡计算必须收敛在水平 `[12%, 88%]` 与垂直 `[12%, 80%]` 安全范围内，卡片宽度自适应收拢，防止在宽屏或全面屏下边缘被舞台容器截断。
- **终局复盘居中大殿化**：
  - 终局全员身份揭晓必须移至中央舞台核心区域（`werewolf-arena__center-stack`），以大画幅网格卡片呈现全员头像、席位、专属高彩角色图标（`🐺 狼人`、`🧙 女巫`、`🔮 预言家`、`🏹 猎人`、`🛡️ 守卫`、`🧑 村民`）与存活/出局徽章。

---

## 10. 私密身份与掷骰卡片系统 (Secret Identity & Dice Privacy Cards)

### 10.1 私密信息展现规范
- **杜绝裸文字堆叠**：玩家个人私密信息（如奶酪大盗）必须以深色磨砂玻璃专属卡片（`cheese-secret-card`）呈现。
- **模块化三要素**：
  1. **阵营专属彩色大胶囊**（怪盗红、共犯紫、贪睡蓝）；
  2. **3D 投骰睁眼时刻卡片**（`🎲 第 X 时刻`）；
  3. **偷看/目击情报条目**（🐱 猫咪情报、🔍 独醒偷看）。

