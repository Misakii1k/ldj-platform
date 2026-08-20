# 局域网桌游平台前端设计系统与交互规范 (Tabletop Design System)

本规范规定了局域网桌游平台（包括谁是卧底、狼人杀、斗地主、UNO、榴莲店长、情书、暗夜证词、以鹅传鹅、奶酪大盗、伪人测试等全部游戏）在移动端全面屏适配、UI 美学、3D 引擎动效、手牌扇形交互以及沉浸式转场 标准开发范式。

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
仅在有**实际内部长列表内容需要滑动**的局部独立容器中开启，例如：长发言顺序列表、全员结算长身份档案、聊天消息历史抽屉、规则说明弹层。

### 2.2 规格与配色标准
- **超细胶囊尺寸**：宽度/高度严格限定为 **`5px`**，圆角 **`999px`** 胶囊状，绝不侵占内容排版。
- **轨道（Track）**：完全透明 (`background: transparent`)。
- **滑块（Thumb）主题配色**：
  - **日间 / 经典主题**：基础 `rgba(217, 119, 6, 0.32)`；悬浮 `0.70`。
  - **暗色 / 夜间主题**：基础 `rgba(255, 209, 102, 0.35)`；悬浮 `0.75`。

---

## 3. 沉浸式游戏 UI 与舞台统一 (Immersive UI & GameMotion)

### 3.1 多层视差渐变背景 (Game Environments)
- 引入游戏级沉浸背景，严禁使用单调纯色背景。
- **昼夜平滑过渡**：例如狼人杀，必须使用多层 CSS 渐变实现无缝切换（日间 `#faf5e6 → #ebd6b0`，夜间 `#1a1320 → #07050b`）。

### 3.2 全屏毛玻璃模态判定大舞台 (Full-Screen Verdict Overlay)
- 质疑结算、身份判定与核心对决**严禁挤在局部小卡片内**。
- 统一采用全屏暗色毛玻璃遮罩模态（`backdrop-filter: blur(16px); background: rgba(15, 23, 42, 0.88)`）。
- 居中展示超大尺寸对决卡片、数字向上滚动翻转动效（`RollingNumber`）。

### 3.3 可拖拽面板体系 (`useDragPanel`)
- 聊天历史、全场身份表等悬浮元素，必须使用原生指针事件驱动的可拖拽抽屉。
- 严禁使用 `setPointerCapture`（会阻塞底面游戏桌事件）。支持半屏折叠和全开之间流畅切换。

### 3.4 狼人杀/谁是卧底马蹄席位收敛 (Horseshoe Tribunal)
- **拒绝传统圆环绝对定位**：摒弃传统的绝对圆形，改用左右双列收缩的马蹄形布局。
- **安全边界收敛**：席位必须收敛在垂直 `[12%, 80%]`，水平 `[12%, 88%]` 的相对空间内，保障在超宽/超长非标比例全面屏下边缘不被截断溢出。
- **居中复盘大殿**：终局身份揭晓移至中央舞台，以大画幅网格卡片呈现全员头像、席位、专属高彩角色图标（`🐺 狼人`、`🧙 女巫`等）与存活/出局徽章。

---

## 4. 3D 物理与骰盅引擎规范 (ThreeDiceCupCanvas)

### 4.1 无遮挡掀盖力学与视觉
- **弹簧双轴掀盖**：掀起骰盅时，必须放弃旧版的“直上直下平移”。要求采用弹簧驱动的双轴旋转，向右后方退让（Displacement），确保完全露出骰面，不遮挡玩家向下俯视的视线。
- **材质与光影升级**：
  - **骰子**：必须使用 512px 贴图，开启各向异性过滤（Anisotropic），外加珠光质感透明涂层（Clearcoat）。
  - **骰盅**：采用车工旋压工艺（Lathe）网格，内壁植绒、外壁木纹/金属材质程序化生成。
  - **光照**：要求手工调配的 PMREM `envMap` 柔光箱照明，配合 `PCFShadowMap` 强化硬阴影立体感。

### 4.2 物理运动与音效同步 (Physics & WebAudioManager)
- 抛弃 CSS 假动画，全面拥抱刚体物理。定义严格的重力、惯性、底面/内壁碰撞边界。
- **碰撞回弹**：物理引擎停止时采用 `easeOutBack` 四元数（Quaternion）计算，产生真实的触底反弹回正。
- **音效同步**：物理碰撞必须触发 `WebAudioManager`，实现骰子与木底座碰撞的精确清脆音效同步。

### 4.3 极致按需渲染性能优化 (Render-On-Demand)
- **休眠机制**：3D 引擎闲置时，必须主动切断 `requestAnimationFrame` 挂起引擎，仅在页面可见性改变（Visibility API）或组件属性 Diff 唤醒时重绘。杜绝移动端后台疯狂耗电。
- **生命周期隔离**：配合 React `useEffect` 严格隔离，防止上层 React 状态变更引发 WebGL Context 和材质的重复挂载/销毁。

---

## 5. 手牌扇形展开引擎规范 (CardFanEngine)

### 5.1 动态扇区布局与降级回退 (Dynamic Arc Spread & Compact Fallback)
- **扇形算法**：必须根据手牌数量，动态计算完美的贝塞尔/圆弧扩展角度与卡牌重叠率，锚点为 `transform-origin: bottom center`。
- **紧凑条回退 (Compact Ribbon)**：移动端当卡牌数量 $\ge$ 5张时，自动平滑回退为高度 $\le 36\text{px}$ 的紧凑条，通过 `×数量` 表达并高亮生效侧，避免小屏层叠遮挡。

### 5.2 相邻卡牌物理联动与出牌锁 (Tactile Physics)
- **物理联动交互**：
  - 悬浮聚焦卡牌：放大 `1.06` 倍，`rotate` 归 `0deg`。
  - 相邻波纹反馈：距离聚焦牌 1 张的邻居上浮 8px，距离 2 张的邻居上浮 4px。解决传统紧密堆叠下误触的问题。
- **出牌飞出锁 (180ms Fly-out)**：
  - 玩家点击出牌后，必须立即切断后续点击响应。
  - 卡牌执行 180ms 的悬浮放大并渐隐飞出舞台中心的动画。
  - 动画完毕后方可执行业务层回调，以此提供优质反馈并隐性解决双击并发 Bug。

### 5.3 SVG ID 性能与防撞体系 (UseId Anti-Collision)
- 多张相同手牌（SVG 材质）同屏渲染时，强制引入 React `useId`。
- 动态拼接并重写 SVG 内部的渐变（gradients）、滤镜、遮罩（masks）等 ID 引用，彻底解决相同元素复用时的 ID 冲突与渲染错乱。

---

## 6. 全局提示与实体复古派对质感规范 (Tactile Retro-Party Solid Style)

### 6.1 视觉标准
- **拒绝单薄 1px 细线框**：全局所有 Toast 通知、弹窗与悬浮面板，必须遵循平台实体复古派对质感：
  - **粗黑边框**：`2.5px solid var(--game-line, #221e1a)` 粗实体轮廓；
  - **实体下沉投影**：`box-shadow: 0 4px 0 var(--game-line), 0 8px 20px rgba(0, 0, 0, 0.35)`；
  - **组件重排间距**：带有实体下沉投影的卡片，必须显式声明底部外边距（如 `margin-bottom: clamp(44px, 6.5vw, 68px)`），防止黑色立体厚度遮挡后置元素。

---

## 7. 房间开局全屏水波与结算坞规范 (Universal Flow Transitions)

### 7.1 转场三阶段标准时序 (Game Start Transition)
1. **绿色水波爆发（Ripple Blast）**：从底部胶囊圆形向外波纹扩散铺满视口。
2. **彩色百叶窗横扫（Shutter Stripes Sweep）**：7 道倾斜彩条（琥珀金、深林绿、亮黄色等）横扫，伴随金色徽章与立体音效。
3. **平滑揭幕（Curtain Reveal）**：淡出露出正式界面。

### 7.2 沉浸式结算坞 (TabletopSettlementDock)
- 游戏结束阶段完整保留当前牌桌战况与榜单，不强制跳出。
- 全局挂载底部操作坞，实时高亮就绪状态（`已准备 X/Y`）。全员就绪后 3 秒极速重开。
- 提供房主专属「🏠 返回大厅」和任意玩家「🚪 退出房间」双分离操作。
