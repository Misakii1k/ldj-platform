# 主页自适应动效升级实施计划

> **执行要求：** 实施时按任务顺序推进；先创建独立分支，再使用测试驱动方式完成每个阶段，并在最终交付前执行静态检查、自动化测试、构建、桌面/移动端浏览器冒烟和性能降级验证。

**目标：** 在保留“聚乐桌”手绘派对风格的前提下，将主页升级为明显活泼但不过度炫技的动效体验，并依据系统无障碍偏好、设备能力和实际卡顿情况自动降级。

**架构：** 新增独立的动效策略模块和 React 上下文，分离“用户偏好”与“实际运行档位”。自动模式先做静态能力初判，再在页面稳定后进行有限时长的帧率采样，只允许逐级降档；主页动效与现有全局 Canvas 背景统一读取实际档位，设置页提供自动、完整、轻量、关闭四档手动控制。

**技术栈：** React 19、TypeScript 5.9、原生 CSS 动画与变换、Canvas 2D、`requestAnimationFrame`、`matchMedia`、Page Visibility API、Node Test Runner；不新增第三方运行时或测试依赖。

---

## 摘要

- 保留现有主页结构、文案、游戏目录、背景模式和手绘视觉，不进行品牌重做。
- 增加统一动效档位：实际运行档位为 `full / reduced / minimal / off`，用户偏好为 `auto / full / reduced / off`。
- 自动模式结合系统减少动态效果、CPU 核心数、设备内存、节省流量偏好和短时真实帧率进行判断。
- 自动策略只在一次页面会话内降级、不自动升档，避免视觉效果反复跳变；刷新后重新评估。
- 主页增加分层入场、人物与灯光氛围、细微指针视差、筛选反馈、卡片交互反馈；低档位逐层移除持续效果。
- 全局粒子与极光背景接入同一档位，后台时彻底停止 RAF，恢复前台后再继续。
- 设置页提供手动控制、当前实际档位及降级原因；用户选择持久化在本地，不改服务端设置协议。

## 当前状态分析

- [GameHomePage.tsx](file:///d:/项目/packages/client/src/app/GameHomePage.tsx#L18-L147) 已包含顶栏、Hero、人数筛选、游戏卡片、加入引导和设置抽屉，适合在现有 DOM 上做渐进增强。
- [HomePartyScene.tsx](file:///d:/项目/packages/client/src/app/HomePartyScene.tsx#L8-L72) 已依据人数显示 2–12 位人物，并具有灯、桌、沙发、花环和闪光元素，是主页氛围动效的主要载体。
- [styles.css](file:///d:/项目/packages/client/src/styles.css#L2543-L2613) 已有卡片入场、人物摇摆和闪光漂浮，但缺少统一性能档位；后置主页覆盖样式从 [styles.css](file:///d:/项目/packages/client/src/styles.css#L5895-L6408) 开始，实施时必须把最终规则放在该覆盖区之后，避免被旧声明覆盖。
- [BackgroundCanvas.tsx](file:///d:/项目/packages/client/src/shared-ui/BackgroundCanvas.tsx#L25-L160) 仅在挂载时检查一次系统减少动态效果；页面隐藏后仍持续申请 RAF。
- [BackgroundVideo.tsx](file:///d:/项目/packages/client/src/shared-ui/BackgroundVideo.tsx#L7-L90) 不检查系统减少动态效果，页面隐藏后同样持续申请 RAF。
- [BackgroundContext.tsx](file:///d:/项目/packages/client/src/shared-ui/BackgroundContext.tsx#L1-L60) 只管理背景模式；动效性能偏好应使用独立上下文，避免混合视觉主题与性能策略。
- [SettingsSheet.tsx](file:///d:/项目/packages/client/src/app/SettingsSheet.tsx#L589-L616) 已有本地背景选择区，可在同一“界面与背景视觉特效”区域增加动效档位控制，无需修改服务端 API。
- [App.tsx](file:///d:/项目/packages/client/src/App.tsx#L87-L99) 是全局 Provider 装配点，适合在背景系统外层加入动效 Provider。
- 客户端没有组件测试框架；根测试命令会执行 `packages/**/tests/**/*.test.ts`，因此新增纯策略函数测试，不引入 DOM 测试库。

## 方案比较与决策

### 方案 A：静态设备分档

- 优点：实现简单、运行开销极低、档位稳定。
- 缺点：无法识别浏览器实际卡顿、后台负载、WebView 差异或设备省电状态。
- 结论：不采用，因为无法满足“是否卡顿自动切换”。

### 方案 B：分层自适应

- 优点：先用低成本信号避免高风险默认值，再用短时真实帧率校正；运行监控有明确结束点，不会长期增加负担。
- 缺点：首次评估结束后可能发生一次向下切换，需要用仅降低持续效果的方式避免明显跳变。
- 结论：采用。它在体验、稳定性、功耗和可维护性之间最均衡。

### 方案 C：全程动态升降档

- 优点：可持续响应设备负载变化。
- 缺点：持续监测本身有成本，且升降档可能造成视觉闪烁和行为不可预测。
- 结论：不采用；仅保留有限时长采样和前台恢复后的安全续播。

## 假设与已锁定决策

- 动效强度采用“明显活泼，但不过度炫技”，动效服务于“选人数 → 选游戏 → 创建房间”的视觉引导。
- 范围采用“主页视觉升级 + 全局动效性能底座”；房间页和游戏页不新增场景动效，只让现有共享背景获得降级、限帧和后台暂停能力。
- 用户控制采用“自动 + 手动”：`auto`、`full`、`reduced`、`off`，保存在 `localStorage`。
- 系统 `prefers-reduced-motion: reduce` 具有最高优先级：除用户主动选择 `off` 外，其余偏好都强制解析为 `minimal`，不允许手动完整档覆盖系统无障碍要求。
- 自动静态初判使用保守规则：节省流量或至多 2 核/2GB 进入 `minimal`；至多 4 核/4GB 进入 `reduced`；其余进入 `full`。缺失的浏览器能力字段不作为低性能证据。
- 自动帧率采样在首屏稳定 1 秒后开始，最多采样约 4 秒；平均帧率低于 28 FPS 或长帧比例超过 40% 降到 `minimal`，低于 45 FPS 或长帧比例超过 20% 降到 `reduced`，否则保持当前档位。
- 实际档位只能从当前档位向下收敛，不在当前访问中自动升级；手动修改偏好时立即重新解析。
- `full` 允许 60 FPS Canvas、少量指针视差和全部氛围效果；`reduced` 将 Canvas 限制到约 30 FPS、降低粒子数量并关闭指针视差；`minimal` 和 `off` 不挂载 Canvas。
- 页面隐藏时取消 RAF，而不是继续空循环；恢复时从当前状态继续，不重置粒子或重新播放主页入场。
- 不增加埋点、远程上报或设备指纹，不记录原始硬件信息。
- 按用户的项目安全偏好，执行第一步先创建 `feat/homepage-adaptive-motion` 分支；未经明确要求不提交 Git commit。

## 文件职责映射

- 新建 `packages/client/src/motion/motionPolicy.ts`：定义偏好/档位/原因类型、静态能力判定、帧样本判定和只降不升合并逻辑；保持纯函数可测试。
- 新建 `packages/client/src/motion/MotionContext.tsx`：读取并持久化用户偏好、监听系统偏好、执行有限帧率采样、设置根节点数据属性并暴露上下文。
- 新建 `packages/client/src/motion/useHomeParallax.ts`：仅在完整档与精细指针设备上，用单个 RAF 合并指针事件并更新主页 CSS 变量。
- 新建 `packages/client/tests/motionPolicy.test.ts`：覆盖静态分档、系统无障碍优先级、帧率阈值、降级单向性和非法持久化值回退。
- 修改 `packages/client/src/App.tsx`：装配 `MotionProvider`，确保背景和全部页面均可读取实际档位。
- 修改 `packages/client/src/app/GameHomePage.tsx`：接入主页视差钩子，在根节点暴露档位，并为主要区块提供稳定的动效分层选择器。
- 修改 `packages/client/src/app/HomePartyScene.tsx`：保持现有语义与人数逻辑，补充场景分层容器所需的数据属性，不引入额外图片或 Canvas。
- 修改 `packages/client/src/app/SettingsSheet.tsx`：增加动效偏好卡片、实际档位状态和原因文案；继续使用本地设置，不并入 AI 设置提交。
- 修改 `packages/client/src/shared-ui/BackgroundManager.tsx`：依据实际档位决定是否挂载 Canvas，并向背景组件传入质量档位。
- 修改 `packages/client/src/shared-ui/BackgroundCanvas.tsx`：按档位控制粒子数量、帧率、指针交互、DPR，并实现前后台启停。
- 修改 `packages/client/src/shared-ui/BackgroundVideo.tsx`：按档位控制帧率和 DPR，并实现前后台启停。
- 修改 `packages/client/src/styles.css`：增加根数据属性下的动效令牌、主页分层动画、精细指针交互、低档位覆盖和 44px 触控区域修复。

## 实施任务

### 任务 1：建立安全分支和纯动效策略

**文件：**
- 新建：`packages/client/src/motion/motionPolicy.ts`
- 新建：`packages/client/tests/motionPolicy.test.ts`

- [ ] 检查工作区状态，确认用户已有修改不会被覆盖，然后创建 `feat/homepage-adaptive-motion` 分支；不暂存、不提交用户现有变更。
- [ ] 先编写策略测试，覆盖以下输入输出：减少动态效果强制 `minimal`；手动 `off` 保持 `off`；2 核或 2GB 自动为 `minimal`；4 核或 4GB 自动为 `reduced`；高能力设备自动为 `full`；低于 28 FPS 为 `minimal`；低于 45 FPS 为 `reduced`；良好样本不降级；合并函数永不升级。
- [ ] 运行 `npm test -- --test-name-pattern="motion policy"`，确认测试因模块或导出不存在而失败。
- [ ] 实现并导出以下稳定接口：

```ts
export type MotionPreference = 'auto' | 'full' | 'reduced' | 'off';
export type MotionLevel = 'full' | 'reduced' | 'minimal' | 'off';
export type MotionReason = 'user' | 'reduced-motion' | 'save-data' | 'device' | 'runtime' | 'default';

export interface DeviceMotionSignals {
  prefersReducedMotion: boolean;
  saveData: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export interface FrameSample {
  averageFps: number;
  longFrameRatio: number;
}

export interface MotionResolution {
  level: MotionLevel;
  reason: MotionReason;
}
```

- [ ] 提供 `parseMotionPreference`、`resolveInitialMotion`、`assessFrameSample` 和 `lowerMotionLevel` 纯函数；档位顺序固定为 `full > reduced > minimal > off`。
- [ ] 再次运行目标测试并确认通过，然后运行 `npm run typecheck` 验证类型定义不依赖浏览器实验类型。

### 任务 2：实现全局动效 Provider 和有限时长采样

**文件：**
- 新建：`packages/client/src/motion/MotionContext.tsx`
- 修改：`packages/client/src/App.tsx`

- [ ] 在 Provider 中使用存储键 `ldj_motion_preference`，无值或非法值回退到 `auto`。
- [ ] 通过 `matchMedia('(prefers-reduced-motion: reduce)')` 读取并监听系统偏好；以局部结构类型安全读取 `navigator.deviceMemory` 和 `navigator.connection?.saveData`，不扩展全局声明。
- [ ] 暴露 `preference`、`setPreference`、`level`、`reason` 和 `isAuto`；设置偏好时同步更新本地状态与 `localStorage`，存储失败不影响页面。
- [ ] 在自动且初始档位高于 `minimal` 时，延迟 1000ms 启动采样；使用 RAF 记录相邻帧间隔，在约 4 秒或达到足够样本后计算平均 FPS 与超过 50ms 的长帧比例。
- [ ] 将采样结果通过 `lowerMotionLevel` 合并，确保只降不升；卸载、切换手动偏好或页面隐藏时取消待执行计时器和 RAF。
- [ ] 在 `<html>` 设置 `data-motion-level`、`data-motion-preference` 和 `data-motion-reason`，供 CSS 与调试检查使用。
- [ ] 在 [App.tsx](file:///d:/项目/packages/client/src/App.tsx#L87-L99) 中把 `MotionProvider` 放在 `BackgroundProvider` 外层、`BackgroundManager` 之上，使背景和页面共享同一状态。
- [ ] 运行 `npm run typecheck` 与 `npm run lint`，确认 effect 清理、Hook 依赖和实验 API 类型均无错误。

### 任务 3：让共享 Canvas 背景按档位运行

**文件：**
- 修改：`packages/client/src/shared-ui/BackgroundManager.tsx`
- 修改：`packages/client/src/shared-ui/BackgroundCanvas.tsx`
- 修改：`packages/client/src/shared-ui/BackgroundVideo.tsx`

- [ ] 让 `BackgroundManager` 读取实际档位：仅 `full` 或 `reduced` 挂载粒子/极光 Canvas；`minimal` 与 `off` 保留静态背景和 atmosphere overlay。
- [ ] 为两个 Canvas 组件增加 `quality: 'full' | 'reduced'` 属性；完整档目标 60 FPS、DPR 上限 1.5，轻量档目标 30 FPS、DPR 上限 1。
- [ ] 粒子背景完整档沿用面积自适应但最多 40 个，轻量档最多 16 个；轻量档不注册 `mousemove`，使用画布中心作为光晕位置，并降低阴影模糊成本。
- [ ] 调整 Canvas 像素缓冲为 `cssWidth * cappedDpr`，绘制前设置正确变换，兼顾清晰度与填充成本。
- [ ] 把渲染循环改为显式 `start`/`stop`：`visibilitychange` 隐藏时取消 RAF，显示时重置上一帧时间并继续；确保任何时刻只有一个 RAF。
- [ ] 使用时间戳节流轻量档绘制频率，不通过 `setInterval` 叠加第二套调度器。
- [ ] 删除 `BackgroundCanvas` 内部一次性的系统减少动态效果判断，因为挂载决策统一由 MotionProvider 负责。
- [ ] 运行类型检查、Lint 和构建，确认 Canvas 属性、清理函数和生产打包正常。

### 任务 4：加入主页视差与分层场景动效

**文件：**
- 新建：`packages/client/src/motion/useHomeParallax.ts`
- 修改：`packages/client/src/app/GameHomePage.tsx`
- 修改：`packages/client/src/app/HomePartyScene.tsx`

- [ ] 实现 `useHomeParallax(rootRef, enabled)`：仅在完整档、`(hover: hover) and (pointer: fine)` 匹配且页面可见时注册 `pointermove`。
- [ ] 将指针坐标归一化到 `-1..1`，每帧最多更新一次 `--motion-x` 和 `--motion-y`；`pointerleave` 平滑归零；禁用或卸载时移除监听、取消 RAF 并清空内联变量。
- [ ] 在主页根节点增加 `ref` 与 `data-motion-level`，由实际档位决定是否启用视差；不改变现有按钮、锚点、标题层级和抽屉逻辑。
- [ ] 为顶栏、Hero、筛选器、游戏目录、加入引导和页脚增加统一的 `home-motion-layer` 与阶段数据属性，使 CSS 使用 0–5 的固定错峰顺序，而不是依赖 DOM 位置猜测。
- [ ] 在派对场景根节点补充可供 CSS 分层使用的 `data-scene-stage`；人物仍只由 `selectedCount` 决定，不创建额外状态或定时器。
- [ ] 保持场景 `aria-hidden="true"`，确保装饰性变化不会进入辅助技术朗读树。
- [ ] 运行类型检查和 Lint，确认 ref 类型、事件清理和现有主页行为不变。

### 任务 5：实现四级主页视觉效果与触控修复

**文件：**
- 修改：`packages/client/src/styles.css`

- [ ] 在文件最终主页覆盖区之后定义动效令牌：持续时间、位移距离、场景幅度、视差幅度和是否允许持续动画，全部由 `html[data-motion-level]` 控制。
- [ ] 完整档加入以下效果：顶栏与 Hero 轻量分层入场；标题强调词一次性擦入；派对场景桌面/地毯细微视差；人物错峰浮动；灯光呼吸；花环轻摆；卡片依次入场；卡片在精细指针设备上轻微抬升和插画错层；人数变化时场景人物使用现有 pop-in 反馈。
- [ ] 轻量档保留一次性分层入场、按钮按压、卡片 hover/active 和人数切换反馈；关闭视差、人物持续摇摆与花环持续动画，并缩短阴影/滤镜过渡。
- [ ] 极简档只保留不超过 160ms 的透明度与按压反馈；关闭所有无限动画、滤镜动画、视差和大位移。
- [ ] 关闭档对非必要动画和过渡统一设为 `none`/`0s`；保留焦点环、状态可见性和布局变化。
- [ ] 把 hover 样式包在 `@media (hover: hover) and (pointer: fine)` 中，避免触屏粘滞 hover。
- [ ] 保留并强化现有 `prefers-reduced-motion` 兜底规则，使脚本未加载时仍不会播放持续动效。
- [ ] 同步修复审查中发现的触控问题：顶栏按钮、Hero 操作、游戏卡操作和人数刻度真实点击区域至少 44×44px；人数刻度网格从 12 列修正为 11 列。
- [ ] 在 320px 宽度下允许人数刻度点击区域通过网格重叠或横向空间压缩保持 44px 高，不允许因此产生页面横向滚动。
- [ ] 运行生产构建，检查 CSS 无语法错误；确认新增规则位于最终覆盖之后并实际生效。

### 任务 6：在设置页增加自动与手动控制

**文件：**
- 修改：`packages/client/src/app/SettingsSheet.tsx`
- 修改：`packages/client/src/styles.css`

- [ ] 从 MotionContext 读取偏好、实际档位、原因和设置函数；背景模式仍由 BackgroundContext 独立管理。
- [ ] 在“界面与背景视觉特效”区域、背景模式选择器之前增加四张单选卡：自动调节、完整动效、轻量动效、关闭动效。
- [ ] 使用以下固定含义：自动调节“根据设备和流畅度自动降级”；完整动效“启用全部氛围和交互效果”；轻量动效“保留反馈，降低持续效果”；关闭动效“仅保留必要状态变化”。
- [ ] 显示实际状态，例如“当前：完整动效”或“当前：极简动效”；自动降级时显示原因文案“系统减少动态效果”“设备能力”“节省流量”或“检测到持续卡顿”。
- [ ] 明确提示系统减少动态效果优先于手动完整档，避免用户误以为设置失效。
- [ ] 单选操作即时生效且不依赖表单底部“保存设置”，避免与服务器 AI 设置提交耦合。
- [ ] 复用背景卡片的视觉语言，但使用独立类名 `motion-mode-selector` / `motion-mode-card`，避免后续修改背景卡片时误伤性能控制。
- [ ] 确保每张卡完整可点击、键盘可选、焦点清晰，并在移动端保持至少 44px 高。
- [ ] 运行类型检查、Lint 与构建。

### 任务 7：自动化验证与多轮浏览器验收

**文件：**
- 验证：`packages/client/tests/motionPolicy.test.ts`
- 验证：所有本次修改文件

- [ ] 第一轮运行 `npm run typecheck`、`npm run lint`、`npm run test` 和 `npm run build`；任何失败都必须修复后重新完整执行。
- [ ] 启动本地服务后进行桌面端冒烟：主页可进入、人数筛选正常、四张卡可建房、加入抽屉和设置抽屉可开关，动效升级不改变业务路径。
- [ ] 在设置中依次选择自动、完整、轻量、关闭，检查 `<html>` 数据属性、主页持续动画和 Canvas 挂载状态与档位一致；刷新后确认偏好持久化。
- [ ] 模拟 `prefers-reduced-motion: reduce`，确认实际档位为 `minimal`、Canvas 不挂载、主页不播放持续动画，并且设置页解释原因。
- [ ] 模拟低能力信号与低帧率策略单元输入，确认自动模式只降不升；浏览器实际验收中使用性能面板人为增加 CPU 限速，观察采样结束后从完整档降级且不反复跳档。
- [ ] 切换粒子与极光背景，确认完整档绘制、轻量档限帧、极简/关闭档不挂载；切后台 5 秒后确认没有持续 RAF，回到前台后仅恢复一个循环。
- [ ] 第二轮响应式冒烟覆盖 320×568、390×844、768×1024、1280×800：无横向滚动、装饰层不遮挡按钮、所有主要触控目标至少 44×44px。
- [ ] 第三轮键盘冒烟：仅使用 Tab、Shift+Tab、Enter、Space、Escape 完成人数选择、打开设置、切换动效档位和关闭抽屉；焦点顺序与焦点环保持可见。
- [ ] 最后再次运行完整 `npm run typecheck && npm run lint && npm run test && npm run build`，记录通过结果；不以开发服务器“能打开”替代自动化验证。

## 验收标准

- 默认自动模式下，高性能设备展示完整但不抢占主操作的主页动效。
- 普通设备以轻量档运行，低性能、节省流量或持续卡顿设备自动降至极简档。
- 系统减少动态效果始终生效，所有 Canvas 与无限动画停止。
- 用户可手动选择自动、完整、轻量、关闭，偏好刷新后保留；设置页能解释当前实际档位。
- 自动模式不会在一次访问中频繁升降档；降级不改变布局、不重播整页入场、不阻断操作。
- 页面隐藏时没有持续 Canvas RAF；恢复后没有重复渲染循环。
- 主页现有筛选、建房、加入、设置和连接状态功能保持正常。
- 320px 至桌面宽屏无横向滚动，主要触控目标达到 44×44px，键盘操作和焦点可见性不退化。
- 类型检查、Lint、全部现有测试、新增策略测试和生产构建全部通过，并完成至少三轮浏览器冒烟。

## 非目标

- 不重做主页信息架构、品牌配色、游戏卡内容或房间创建流程。
- 不为房间页和游戏页新增独立场景动画。
- 不引入 GSAP、Framer Motion、WebGL 或新的图片资源。
- 不新增远程性能分析、用户追踪、服务端设置字段或数据库迁移。
- 不在本计划中处理代码拆包、静态资源压缩缓存、Service Worker 缓存策略或完整 Lighthouse CI；这些可作为独立性能专项。

## 回滚与兼容

- 所有新行为集中在 MotionProvider、根数据属性和独立 CSS 覆盖中；删除 Provider 装配并移除最终动效覆盖即可回到原行为。
- 本地存储非法值自动回退 `auto`，旧用户没有该键时无需迁移。
- 不修改背景模式存储键 `ldj_bg_mode`，原有背景偏好继续有效。
- 不修改共享协议、服务端 API 或数据库，因此不存在跨版本数据兼容问题。
