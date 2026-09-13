# 聚乐桌游 · 平台前端设计规范 (Design Spec)

本文档是聚乐桌游（JoyTable）全平台前端 UI、设置弹层、系统功能页以及新模块开发的**权威视觉与交互规范**。
**规则要求**：后续所有新建页面、设置面板、模态弹窗与控制台必须严格执行本规范，禁止使用任何生硬生冷的暗黑内联样式或原生灰框。

---

## 1. 核心视觉理念：实体复古纸质桌游 (Tactile Retro-Party Style)

聚乐桌游采用「温暖羊皮纸背景 + 粗黑实线轮廓 + 复古实体硬下沉投影」的设计语言，传达实体派对桌游的亲和感与玩具质感。

### 1.1 全局调色板 (Design Tokens)

| Token | 变量名 / 默认值 | 视觉含义与使用场景 |
|---|---|---|
| **底纸暖色** | `--home-paper: #fff5e6` | 页面最外层底色，温暖纸张质感 |
| **卡片底色** | `--home-surface: #fffdf8` / `#fffaf1` | 功能卡片、设置表单容器背景 |
| **深墨黑边** | `--home-ink: #312d28` | 核心文字颜色、所有实体描边与硬阴影基色 |
| **次级说明** | `--home-muted: #6f665d` | 字段说明、提示文案、未激活状态 |
| **活力明黄** | `--home-yellow: #f8c822` | 主按钮（`.primary-btn`）、激活标签指示 |
| **派对珊瑚红** | `--home-coral: #ef4d39` | 危险操作按钮（`.danger-btn`）、异常状态指示 |
| **墨绿/薄荷绿** | `--home-green: #0c715d` / `#35ad7a` | 成功连接状态、选中态卡片强调边框 |
| **选中浅绿底** | `#ecfdf5` | 选项卡、选择器被激活卡片的背景色 |

---

## 2. 常用组件与标准排版结构

### 2.1 状态总览卡片 (Status Overview Card)
用于展示系统状态（如公网穿透状态、AI 引擎连接状态、主机网络信息）：
- **外壳容器**：
  ```css
  padding: 16px;
  border-radius: 16px;
  background: #fffaf1;
  border: 2px solid var(--home-ink, #312d28);
  box-shadow: 3px 4px 0 var(--home-ink, #312d28);
  ```
- **状态指示点 (`.status-dot`)**：
  ```css
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--home-ink, #312d28);
  ```
  - 在线/成功：`#35ad7a`
  - 连接中/就绪：`#f7d661`
  - 异常/失败：`var(--home-coral, #ef4d39)`
  - 闲置/未开启：`#b8af9f`

### 2.2 统一卡片选择器 (`.choice-card`)
用于二选一或多选一服务模式（如穿透服务选型、游戏人数、引擎模式）：
- **默认态**：
  ```css
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  border: 2px solid var(--home-ink, #312d28);
  background: #fff;
  box-shadow: 2px 3px 0 var(--home-ink, #312d28);
  cursor: pointer;
  transition: all 0.16s ease;
  ```
- **悬停态 (`:hover`)**：`transform: translateY(-2px); box-shadow: 2px 5px 0 var(--home-ink, #312d28);`
- **选中态 (`.is-selected`)**：
  ```css
  background: #ecfdf5;
  border-color: #059669;
  box-shadow: 0 0 0 2px #10b981, 2px 3px 0 var(--home-ink, #312d28);
  ```
- **选中徽章 (`.choice-badge`)**：胶囊标签 `background: #d1fae5; color: #059669; border-radius: 999px; padding: 2px 8px; font-weight: 900;`

### 2.3 配置子面板与分块 (`.subpanel` / `.tunnel-subpanel`)
- 背景色：`#fffaf1` 或 `#fffdf8`
- 边框：`2px solid var(--home-ink, #312d28)`
- 阴影：`box-shadow: 2px 3px 0 var(--home-ink, #312d28)`
- 圆角：`14px ~ 16px`

### 2.4 表单输入框 (`.text-input` / `.tunnel-input`)
- **外观**：
  ```css
  width: 100%;
  padding: 10px 14px;
  border-radius: 12px;
  border: 2px solid var(--home-ink, #312d28);
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--home-ink, #312d28);
  background: #fff;
  box-shadow: 1px 2px 0 var(--home-ink, #312d28);
  outline: none;
  box-sizing: border-box;
  ```
- **聚焦态 (`:focus`)**：`border-color: var(--home-green, #0c715d); background: #fff;`
- **提示文案 (`.hint`)**：`font-size: 0.76rem; color: var(--home-muted, #6f665d); margin-top: 4px;`

### 2.5 统一按钮规范 (Button Standards)
- **主强调按钮 (`.primary-btn` / `.save-btn`)**：
  ```css
  padding: 10px 28px;
  font-weight: 900;
  border-radius: 999px;
  border: 2px solid var(--home-ink, #312d28);
  box-shadow: 2px 3px 0 var(--home-ink, #312d28);
  background: var(--home-yellow, #f8c822);
  color: var(--home-ink, #312d28);
  cursor: pointer;
  ```
- **危险/关闭按钮 (`.danger-btn` / `.tunnel-toggle-btn.is-stop`)**：
  ```css
  padding: 8px 18px;
  font-weight: 900;
  border-radius: 999px;
  border: 2px solid var(--home-ink, #312d28);
  box-shadow: 2px 3px 0 var(--home-ink, #312d28);
  background: var(--home-coral, #ef4d39);
  color: #fff;
  ```
- **微操作按钮 (`.copy-btn` / `.tunnel-copy-btn`)**：
  ```css
  padding: 4px 10px;
  border-radius: 8px;
  border: 1.5px solid var(--home-ink, #312d28);
  background: var(--home-yellow, #f8c822);
  color: var(--home-ink, #312d28);
  box-shadow: 1.5px 2px 0 var(--home-ink, #312d28);
  font-size: 0.76rem;
  font-weight: 800;
  ```

---

## 3. 开发规范与 Do's and Don'ts

### ✅ Do:
1. 所有新组件必须拥有独立的 `.css` 文件（或归纳至通用设计系统样式中），避免 JSX 中充斥冗长内联样式。
2. 边框必须使用实体墨黑描边（`2px solid var(--home-ink, #312d28)`），阴影必须使用实体偏移投影（`2px 3px 0 ...` 或 `3px 4px 0 ...`）。
3. 交互按钮在 `:hover` 时上浮 1-2px，`:active` 时回沉并消除阴影，提供实体按钮触觉反馈。
4. 弹窗内的滚动区应设置合理间距，确保投影不会被遮挡或在容器边界产生割裂。

### ❌ Don't:
1. **严禁使用冷色深灰/暗黑内联样式**（如 `background: rgba(255,255,255,0.05)`, `border: 1px solid rgba(255,255,255,0.1)`）。
2. **严禁出现未封装的随机裸色**（如直接硬编码 `#22c55e`, `#eab308`），状态色彩必须与桌游调色板对齐。
3. **严禁无下沉投影的扁平灰框**。
