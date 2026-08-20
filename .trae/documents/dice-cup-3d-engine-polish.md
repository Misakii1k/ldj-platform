# 骰盅 3D 引擎与卡牌动效打磨方案

> 范围（已与用户确认）：深度打磨 Three.js 骰子/骰盅引擎（物理动效 + 视觉材质光影 + 性能稳定性三个方向全要）；卡牌侧保持 SVG+CSS 技术栈，做扇形手牌动效与质感升级。不新建 Three.js 卡牌系统。

## 一、现状分析（Phase 1 探索结论）

| 模块 | 文件 | 现状 |
|---|---|---|
| 3D 骰盅引擎 | `packages/client/src/shared-ui/ThreeDiceCupCanvas.tsx` | Three.js 0.185：Canvas 贴图骰面、圆柱杯体+金环、正弦摇晃、lerp 掀盖 |
| 交互层 | `packages/client/src/shared-ui/DiceCup.tsx` | 长按掀盖防窥状态机（含单测 `packages/client/tests/diceCup.test.ts`）、摇骰 setTimeout 500ms |
| 使用方 | `packages/client/src/game/cheese-thief/CheeseDiceCup3D.tsx` → 奶酪大盗页 | props 透传，不受引擎内部改动影响 |
| 扇形手牌 | `packages/client/src/shared-ui/CardFanEngine.tsx` | CSS transform 扇形，用于 UNO 页（`NewGamePages.tsx`） |
| 扑克牌面 | `packages/client/src/game/PlayingCard.tsx` | SVG 2.5D + AI 美术资产 |
| 音效 | `packages/client/src/shared-ui/WebAudioManager.ts` | `playDiceShake`（固定 4 连合成音）、`playDiceReveal`、`playCardFlip/Play` |

### 已确认的问题清单

1. **P0 场景反复销毁重建**：`ThreeDiceCupCanvas` 的 `useEffect` 依赖 `diceValues`（数组引用）。父组件 `DiceCup` 每次渲染 `normalizeDiceValues` 都返回新数组，导致掀盖/摇骰等任何状态切换都会销毁并重建整个 Three.js 场景（WebGL 上下文、几何体、贴图全量重建），摇骰结束时骰子点数"跳变"而非滚动落定。
2. **渲染循环永不暂停**：rAF 常驻，页面后台/静止时仍持续渲染耗电。
3. **WebGL 上下文丢失未处理**：移动端切后台再回来可能黑屏。
4. **dispose 不完整**：`cupTopGeo`、`knobGeo` 等 geometry 有 dispose，但材质/贴图释放顺序与覆盖不完整，`renderer.forceContextLoss()` 未调用。
5. **摇晃是纯正弦抖动**：骰子只是角度微抖 + 上下浮，无滚动/碰撞/落定物理；摇骰结束瞬间姿态跳变。
6. **CSS/3D 双重摇晃叠加**：`.shared-dice-cup-scene.is-shaking` 的 `cupShake` keyframes 与 Three.js 内部摇晃同时生效，视觉打架。
7. **遗留死 CSS**：`styles.css` 17041~17230 区段的 `.shared-cup-base/.shared-die-face/.shared-cup-dome` 等旧版 CSS 3D 骰盅样式已无对应 DOM（当前 DOM 全由 Three.js canvas 渲染）。
8. **PlayingCard SVG id 冲突隐患**：`card-surface-grad`/`card-bevel-grad`/`card-drop-shadow`/`card-back-clip` 为硬编码 id，多张同 rank+suit 牌同屏（如斗地主弃牌区）时 defs 冲突。
9. **材质无环境反射**：metal 主题 metalness 0.65 却无 envMap，金属感发黑发假。

## 二、改动方案

### 2.1 `ThreeDiceCupCanvas.tsx` — 引擎重构（核心）

#### A. 生命周期与渲染调度（P0 稳定性）

- **依赖修复**：场景搭建 `useEffect` 依赖收窄为 `[theme, variant]`。`diceValues/isLifted/isShaking` 继续走 `stateRef`（已存在）。初始化逻辑抽为可重入的 `buildScene()` / `disposeScene()`，供 context restored 复用。
- **diceValues 变化检测**：渲染循环内对 `stateRef.current.diceValues` 与上次值做 join 浅比较，变化时触发"落定动画 + 重新布局"（见 B），不再重建场景。
- **按需渲染**：
  - rAF 循环仅在"有活跃动画"时运行（掀盖插值未收敛 / 摇晃中 / 落定动画中 / diceValues 变化消化中）。
  - 所有动画收敛（位置旋转误差 < 1e-3 连续 5 帧）后 `cancelAnimationFrame` 挂起。
  - 组件每次 React 渲染后通过无依赖 `useEffect(() => { wake(); })` 唤醒循环（外部状态变化的唯一入口）。
  - `document.visibilitychange === 'hidden'` 时强制挂起（DiceCup 层已有失焦自动扣盖，互补）。
- **WebGL 上下文丢失恢复**：监听 `webglcontextlost`（`preventDefault` + 挂起循环）、`webglcontextrestored`（调 `buildScene()` 重建）。
- **dispose 完整化**：所有 geometry/material/texture/PMREM 产物登记进 `disposables: Array<{dispose()}>` 统一释放；卸载时追加 `renderer.forceContextLoss()`。
- **时钟**：`THREE.Clock` delta（clamp 0.033s）驱动，替代当前按帧累加的 `shakeTime`。

#### B. 物理动效

- **摇晃物理（简化刚体）**：每骰子维护 `{ velocity: Vector3, angVel: Vector3 }`：
  - 重力下落 `vy -= g*dt`；杯体轨迹（复合正弦 + 椭圆 + 倾斜的手腕摇动）对骰子施加反向惯性加速度。
  - 与底盘碰撞：`y ≤ dieSize/2` 时反弹 `vy = -vy * 0.45`，触发一次 knock 音效（节流 ≥60ms，强度随 |vy|）；角速度随机重置。
  - 与杯壁碰撞：骰子中心到杯轴径向距离超出 `杯半径 - dieSize/2` 时径向反弹。
- **落定动画**（关键体验）：
  - 触发时机：① `isShaking` true→false 沿；② `diceValues` 值变化。
  - 每骰子从当前姿态用四元数 slerp（easeOutBack，约 500ms）过渡到目标朝向 + `rotY(随机偏转 ±0.35rad)`，y 从当前高度带 1 次小回弹落到 `dieSize/2`。
  - 目标四元数预计算表（由现有 `orientDie` 的 switch 数学转四元数常量），导出为纯函数 `settleQuaternion(value: number, yJitter: number): THREE.Quaternion` 供单测。
- **掀盖动效升级**：杯体升起 lerp 改为带过冲的弹簧感（速度插值 + overshoot 8%），落盖带回弹；掀开时杯体加轻微倾斜展示角（现 -0.35rad 保留并平滑）。
- **音画同步**：`WebAudioManager` 新增 `playDiceKnock(intensity: number)` 单次碰撞声（复用现有 oscillator 合成模式）；`playDiceShake` 保留为摇骰起手背景音。

#### C. 视觉材质光影

- **环境反射**：`THREE.PMREMGenerator.fromScene()` + 手写简易环境场景（暗背景 + 2~3 个 `MeshBasicMaterial` 发光面片模拟顶光/侧窗光），赋给 `scene.environment`。**不引入 three addons（RoomEnvironment 等）**，避免构建路径风险。metal 主题金属件将获得真实反射。
- **骰子材质**：`MeshStandardMaterial` → `MeshPhysicalMaterial`（clearcoat 0.5、clearcoatRoughness 0.25），象牙珠光质感。
- **杯体升级**：`CylinderGeometry` 直圆台 → `LatheGeometry` 车削 S 曲线轮廓（底 r1.7 → 收腰 → 顶 r1.2，`side: DoubleSide` 呈现薄壁杯口）；顶钮改为"球+环"葫芦钮。
- **程序化主题贴图**（`createThemedTextures(theme)`，Canvas 256px）：
  - wood：竖向木纹（正弦扰动条纹 + 噪点）作杯体 map；
  - metal：水平拉丝噪声作 roughnessMap；
  - felt：高频织物噪声 + 高 roughness；
  - 底盘 mat：对应主题细密毡面噪声 map。
- **阴影调优**：主光 `shadow.camera` 收紧为 ±4 / near 1 / far 20；大变体 mapSize 2048、compact 1024；PCFSoftShadowMap 保持。
- **色调映射**：ACESFilmic + exposure 1.15 保留，按 envMap 引入后实机微调（1.0~1.25 区间）。

#### D. 移动端降级与可访问性

- compact 变体：pixelRatio cap 1.5（large cap 2）、贴图 128px。
- `matchMedia('(prefers-reduced-motion: reduce)')`：摇晃幅度 ×0.4、落定动画时长 ×0.6。

### 2.2 `DiceCup.tsx` — 交互层配套

- 摇骰 setTimeout 500ms 保持不变（落定动画由引擎在 `isShaking=false` 后自行继续播放，按需渲染保证动画播完，不依赖外部时序），`onShakeCommit` 时机不变。
- props、状态机、防窥逻辑全部不动（`diceCup.test.ts` 继续通过）。

### 2.3 `styles.css` — 冲突动画与遗留清理

- 删除 `.shared-dice-cup-scene.is-shaking` 规则及 `@keyframes cupShake`（Three.js 内部摇晃已覆盖；类名由 JS 继续添加，作为无样式钩子保留）。执行时先 grep 确认 `cupShake` 无其他引用。
- 删除无 DOM 引用的旧 CSS 骰盅块：`.shared-cup-base/.shared-cup-mat/.shared-dice-cluster/.shared-die-3d/.shared-die-face/.shared-die-dot/.shared-cup-dome` 及其 theme/compact 变体（17041~17230 区段）。执行时逐类名 grep tsx 确认零引用后删除。
- 新增 `.card-fan-item--playing` 出牌飞出动画样式（见 2.4）。

### 2.4 `CardFanEngine.tsx` — 扇形手牌动效升级（保持 CSS 技术栈，props 完全兼容）

- **邻卡联动**：`hoverIdx` state；hover/focus 某牌时，距离 1 的邻卡额外 `translateY(-8px)`、距离 2 的 `-4px`（选中态优先级更高，不叠加）。`onMouseEnter/onFocus` 设置、`onMouseLeave/onBlur` 清空。
- **选中态增强**：选中的牌在上浮基础上加 `scale(1.06)`。
- **出牌飞出动画**：点"出牌"后目标卡加 `card-fan-item--playing` 类（上浮 + 放大 + 渐隐，180ms CSS transition），190ms 后才调用 `onPlayCard`；期间禁用出牌按钮防双击。`onPlayCard` 缺省时行为不变。多选时只飞第一张（与现行为一致：现也只传第一张）。
- **几何计算抽取**：`stepAngle/startX/translateX` 等抽为纯函数 `computeFanLayout(total, cardWidth, maxFanAngle, angleCap)` 导出，供单测。
- 触摸反馈：CSS `:active` 态（styles.css 补一小段）。

### 2.5 `PlayingCard.tsx` / `NewGamePages.tsx` — SVG id 冲突修复

- `PlayingCard` / `CardBack` 内所有 defs id 追加唯一后缀：`const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '')`，如 `card-surface-grad-${uid}`。同屏多张同 rank+suit 牌（弃牌区）不再冲突。
- 纯展示组件，无行为变化。

### 2.6 测试补充

- `packages/client/tests/diceCup.test.ts`：保持现有用例通过。
- 新增 `packages/client/tests/cardFanLayout.test.ts`：测 `computeFanLayout`（1 张 / 多张角度展开上限 / 单卡不偏移）。
- 新增 `packages/client/tests/settleQuaternion.test.ts`：测 `settleQuaternion(v)` 使对应点数面朝 +Y（用四元数旋转单位向量断言，如 1 点 → +X 转到 +Y）。
- 运行方式：`npm test`（根 package.json，tsx --test 已覆盖 `packages/**/tests/**`）。

## 三、实施顺序与分支策略

遵循用户偏好：**先建分支保留可回滚版本，每阶段验证后再进入下一阶段**。

1. `git checkout -b feature/polish-3d-dice-cup`（基于当前主干）
2. **Phase A（P0 稳定性）**：2.1-A + 2.3 冲突动画删除 → 验证
3. **Phase B（物理动效）**：2.1-B + `playDiceKnock` + `settleQuaternion` 单测 → 验证
4. **Phase C（视觉）**：2.1-C/D → 验证
5. **Phase D（卡牌）**：2.4 + 2.5 + `cardFanLayout` 单测 + CSS 遗留清理 → 验证
6. **最终全量验证**（见下）

每阶段验证：`npm run typecheck && npm run lint && npm run test`。

## 四、验证步骤

1. **静态**：`npm run typecheck`、`npm run lint`、`npm test`（含新旧单测）。
2. **构建**：`npm run build`（确认 three tree-shaking 与体积无异常膨胀）。
3. **手动冒烟（多轮，遵循用户测试偏好）**：
   - `npm run dev:server` 起服务，浏览器进入奶酪大盗房间：
     - 长按掀盖：杯体升起有过冲弹性、松手扣盖带回弹；掀盖/扣盖反复多次无卡顿（验证场景不重建）；
     - 摇骰：骰子真实翻滚、有碰撞音、结束后若掀盖可见正确点数朝向；连续快速摇骰无异常；
     - 三个主题 wood/felt/metal 轮换检查材质与反射；
     - 切后台 10s 回来：画面正常（context 恢复）、失焦自动扣盖生效；
     - Performance 面板确认静止时无持续 rAF 渲染。
   - UNO 游戏页：手牌 hover 邻卡抬升、选中上浮放大、出牌飞出动画后正常进入牌局流程。
   - 移动端视口（devtools 模拟）：compact 变体骰盅流畅、卡牌可点。
4. **e2e**：跑 `npx playwright test e2e/cheese-thief-tabletop.spec.ts e2e/uno-house.spec.ts e2e/visual-audit.spec.ts` 确认无回归（若 visual-audit 涉及骰盅截图对比且因骰子随机偏转不稳定，执行时先读该 spec 评估，必要时在实现中固定随机种子）。

## 五、风险与决策记录

| 决策 | 理由 |
|---|---|
| 不引入 three addons（RoomEnvironment/物理引擎） | 避免 examples/jsm 构建路径与体积风险；手写 envMap 场景与简化刚体足够该场景规模 |
| 摇骰时长与 `onShakeCommit` 时机不变 | 保证奶酪大盗业务时序零回归 |
| 出牌动画引入 190ms 延迟 | 视觉增益明显、时序影响可忽略；仅 `onPlayCard` 存在时生效 |
| 手写简化物理而非完整刚体引擎 | 骰子被杯体遮挡大半，观感优先于精确碰撞；维护成本最低 |
| 保留 `is-shaking` 类名但删其 CSS | 零风险清理，类名留作调试钩子 |
| CupLathe 杯体/贴图均为程序化生成 | 无新增静态资产，离线可用（项目有 offline/PWA 约束） |
