# 设置页内容与排版优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将平台设置改为桌面侧栏、移动端顶部分类的三分类布局，并把 AI 配置整理为常用操作优先、高级参数按需展开的渐进式体验。

**Architecture:** `SettingsSheet` 只管理平台级分类状态，动效和背景各自拆成展示组件，AI 容器继续持有现有请求与表单状态。分类键盘导航和高级区展开状态使用小型纯函数支持测试，现有服务端接口、共享类型和持久化逻辑保持不变。

**Tech Stack:** React 19、TypeScript 严格模式、Vite、集中式 CSS、Node `node:test`

---

## 文件结构

- Create: `packages/client/src/app/settings/settingsNavigationState.ts` — 平台分类常量与键盘导航纯函数。
- Create: `packages/client/src/app/settings/SettingsNavigation.tsx` — 桌面侧栏与移动端顶部分类导航。
- Create: `packages/client/src/app/settings/AppearanceSettings.tsx` — 动效状态与偏好卡。
- Create: `packages/client/src/app/settings/BackgroundSettings.tsx` — 背景主题卡。
- Modify: `packages/client/src/app/SettingsSheet.tsx` — 装配三分类和标签面板。
- Modify: `packages/client/src/app/ai-settings/AiEngineSettings.tsx` — 调整 AI 内容顺序并改为高级折叠。
- Modify: `packages/client/src/app/ai-settings/AiQuickConnect.tsx` — 精简快速连接文案和错误关联接口。
- Modify: `packages/client/src/app/ai-settings/AiModelPicker.tsx` — 放入高级区域并保持目录与手动输入能力。
- Modify: `packages/client/src/app/styles.css` — 新增设置壳层、分类、渐进内容和响应式样式，清理确认无引用的旧设置类。
- Create: `packages/client/tests/settingsNavigationState.test.ts` — 分类导航行为测试。
- Modify: `packages/client/tests/aiSettingsState.test.ts` — 保留并扩展渐进展示所需纯状态测试。

### Task 1: 分类导航状态

**Files:**
- Create: `packages/client/src/app/settings/settingsNavigationState.ts`
- Create: `packages/client/tests/settingsNavigationState.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_SECTIONS, nextSettingsSection } from '../src/app/settings/settingsNavigationState.ts';

test('settings navigation：保持 AI、界面、背景的固定顺序', () => {
  assert.deepEqual(SETTINGS_SECTIONS.map((item) => item.id), ['ai', 'appearance', 'background']);
});

test('settings navigation：方向键循环切换分类', () => {
  assert.equal(nextSettingsSection('ai', 'ArrowRight'), 'appearance');
  assert.equal(nextSettingsSection('background', 'ArrowRight'), 'ai');
  assert.equal(nextSettingsSection('ai', 'ArrowLeft'), 'background');
});

test('settings navigation：Home 和 End 跳转首尾', () => {
  assert.equal(nextSettingsSection('background', 'Home'), 'ai');
  assert.equal(nextSettingsSection('ai', 'End'), 'background');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx tsx --test packages/client/tests/settingsNavigationState.test.ts`

Expected: FAIL，提示找不到 `settingsNavigationState.ts`。

- [ ] **Step 3: 实现最小导航状态**

```ts
export type SettingsSectionId = 'ai' | 'appearance' | 'background';

export const SETTINGS_SECTIONS = [
  { id: 'ai', label: 'AI 引擎', description: '连接服务、模型与推理参数' },
  { id: 'appearance', label: '界面效果', description: '调整动效与性能偏好' },
  { id: 'background', label: '背景主题', description: '选择桌面视觉主题' },
] as const;

export function nextSettingsSection(current: SettingsSectionId, key: string): SettingsSectionId {
  const index = SETTINGS_SECTIONS.findIndex((item) => item.id === current);
  if (key === 'Home') return SETTINGS_SECTIONS[0].id;
  if (key === 'End') return SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id;
  if (key === 'ArrowRight' || key === 'ArrowDown') return SETTINGS_SECTIONS[(index + 1) % SETTINGS_SECTIONS.length].id;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return SETTINGS_SECTIONS[(index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length].id;
  return current;
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npx tsx --test packages/client/tests/settingsNavigationState.test.ts`

Expected: 3 tests PASS。

### Task 2: 平台设置壳层与分类组件

**Files:**
- Create: `packages/client/src/app/settings/SettingsNavigation.tsx`
- Modify: `packages/client/src/app/SettingsSheet.tsx`

- [ ] **Step 1: 创建分类导航组件**

实现 `SettingsNavigation`，接收 `activeSection`、`onChange` 和 `tabRefs`。每个按钮使用 `role="tab"`、`aria-selected`、`aria-controls` 和 roving `tabIndex`；方向键通过 `nextSettingsSection` 计算目标后切换并聚焦对应按钮。

- [ ] **Step 2: 改造 SettingsSheet 状态**

将原有两个 `fieldset` 替换为：

```tsx
const [activeSection, setActiveSection] = useState<SettingsSectionId>('ai');
const firstTabRef = useRef<HTMLButtonElement | null>(null);

<SheetDialog
  title="平台设置"
  description="管理 AI、动效与背景主题。"
  onClose={onClose}
  initialFocusRef={firstTabRef}
>
  <div className="settings-layout">
    <SettingsNavigation activeSection={activeSection} onChange={setActiveSection} firstTabRef={firstTabRef} />
    <section
      id={`settings-panel-${activeSection}`}
      role="tabpanel"
      aria-labelledby={`settings-tab-${activeSection}`}
      className="settings-content"
    >
      {activeSection === 'ai' && <AiEngineSettings />}
      {activeSection === 'appearance' && <AppearanceSettings />}
      {activeSection === 'background' && <BackgroundSettings />}
    </section>
  </div>
</SheetDialog>
```

- [ ] **Step 3: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS；若外观组件尚未创建，仅允许报告对应模块缺失，下一任务立即补齐。

### Task 3: 拆分界面效果与背景主题

**Files:**
- Create: `packages/client/src/app/settings/AppearanceSettings.tsx`
- Create: `packages/client/src/app/settings/BackgroundSettings.tsx`
- Modify: `packages/client/src/app/SettingsSheet.tsx`

- [ ] **Step 1: 创建 AppearanceSettings**

迁移 `MOTION_OPTIONS`、`MOTION_LEVEL_LABELS`、`MOTION_REASON_LABELS` 和 `useMotion` 读取逻辑。输出分类标题、当前实际等级状态卡、四个紧凑选择卡和系统减少动态效果说明。

- [ ] **Step 2: 创建 BackgroundSettings**

迁移 `useBackground` 与四个背景选项。为选项补充性能提示：派对插画“平衡画质与性能”、粒子“适合性能较好的设备”、视频“效果丰富，耗电较高”、极简“低耗省电”。保持选择即调用 `setBgMode`。

- [ ] **Step 3: 删除 SettingsSheet 中已迁移常量和业务逻辑**

`SettingsSheet` 最终只保留分类状态、导航和三个分类组件装配。

- [ ] **Step 4: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS。

### Task 4: AI 渐进式内容

**Files:**
- Modify: `packages/client/src/app/ai-settings/AiEngineSettings.tsx`
- Modify: `packages/client/src/app/ai-settings/AiQuickConnect.tsx`
- Modify: `packages/client/src/app/ai-settings/AiModelPicker.tsx`
- Modify: `packages/client/src/app/ai-settings/types.ts`

- [ ] **Step 1: 删除内部三级页签状态**

移除 `activeTab`、`AiSettingsTabs` 和 `AiSettingsTab`。增加 `advancedOpen` 布尔状态，默认 `false`。

- [ ] **Step 2: 调整首屏顺序**

表单内容依次为：分类标题与说明、`AiEngineStatus`、`AiProfilePicker`、`AiQuickConnect`、当前模型卡、高级设置按钮、高级设置内容、错误信息。

- [ ] **Step 3: 实现高级折叠语义**

```tsx
<button
  type="button"
  className="ai-advanced-toggle"
  aria-expanded={advancedOpen}
  aria-controls="ai-advanced-settings"
  onClick={() => setAdvancedOpen((current) => !current)}
>
  <span><strong>高级连接与推理设置</strong><small>接口、模型目录、思考深度、超时和管理员权限</small></span>
  <span aria-hidden="true">{advancedOpen ? '收起' : '展开'}</span>
</button>
```

高级区域仅在展开时渲染，包含协议、Base URL、`AiModelPicker`、思考深度、超时、管理员口令和危险区。

- [ ] **Step 4: 增加错误关联**

表单错误使用固定 `id="ai-settings-error"`。超时非法时给超时输入设置 `aria-invalid="true"` 和 `aria-describedby="ai-settings-error"`；其他服务器错误保留分类级 `role="alert"`。

- [ ] **Step 5: 运行 AI 状态测试与类型检查**

Run: `npx tsx --test packages/client/tests/aiSettingsState.test.ts && npm run typecheck`

Expected: 全部 PASS。

### Task 5: 设置页视觉与响应式样式

**Files:**
- Modify: `packages/client/src/styles.css`

- [ ] **Step 1: 添加桌面设置壳层**

新增 `.settings-layout` 双列网格、`.settings-navigation` 深色侧栏、`.settings-navigation__tab` 选中状态、`.settings-content` 内容滚动区和分类标题样式。弹层设置专用宽度应容纳侧栏与内容，但不超过视口安全边距。

- [ ] **Step 2: 添加渐进式 AI 样式**

新增状态、预设、快速连接、当前模型、`.ai-advanced-toggle` 和 `.ai-advanced-content` 的层级间距。主要按钮保持深色，测试连接为次级按钮，危险区保持独立红色语义。

- [ ] **Step 3: 添加界面与背景卡片样式**

动效卡在宽屏为两列、窄屏为单列；背景主题卡使用两列并在窄屏降为单列。选中态同时使用边框、背景和可见标记。

- [ ] **Step 4: 添加移动端规则**

在现有设置断点附近将 `.settings-layout` 改为单列，将导航改为顶部横向可滚动标签栏，并确保按钮和标签最小高度为 44px、无横向内容溢出。

- [ ] **Step 5: 清理旧设置样式**

先用内容搜索确认 `settings-profiles-bar`、`settings-profile-add-btn`、`settings-model-menu` 和 `settings-model-chips` 无组件引用，再删除对应旧规则。不得清理其他区域样式。

- [ ] **Step 6: 运行构建**

Run: `npm run build -w @ldj/client`

Expected: Vite build PASS。

### Task 6: 自动化回归验证

**Files:**
- Modify: `packages/client/tests/settingsNavigationState.test.ts`
- Modify: `packages/client/tests/aiSettingsState.test.ts`

- [ ] **Step 1: 补充非导航键保持当前分类测试**

```ts
test('settings navigation：无关按键不改变分类', () => {
  assert.equal(nextSettingsSection('appearance', 'Enter'), 'appearance');
  assert.equal(nextSettingsSection('appearance', 'Tab'), 'appearance');
});
```

- [ ] **Step 2: 运行客户端定向测试**

Run: `npx tsx --test packages/client/tests/settingsNavigationState.test.ts packages/client/tests/aiSettingsState.test.ts packages/client/tests/motionPolicy.test.ts`

Expected: 全部 PASS。

- [ ] **Step 3: 运行完整质量门禁**

Run: `npm run typecheck && npm run lint && npm test`

Expected: 全部 PASS，无新增警告或失败。

### Task 7: 浏览器烟雾测试

**Files:**
- No code changes expected unless verification reveals a defect.

- [ ] **Step 1: 构建并启动服务**

Run: `npm run build -w @ldj/client`

Expected: build PASS；复用当前 `http://localhost:8080` 服务，若服务未运行则执行 `npm run dev:server`。

- [ ] **Step 2: 桌面端第一轮**

在 1440×900 下验证：打开设置、默认 AI 分类、侧栏三分类、预设切换、API Key 区、测试连接、高级区展开收起、分类切换和关闭焦点归还。

- [ ] **Step 3: 移动端第一轮**

在 390×844 下验证：顶部分类栏、单列内容、无横向溢出、44px 触控目标、动效与背景切换即时生效。

- [ ] **Step 4: 桌面端第二轮**

重新加载后验证：设置弹层仍可打开，背景与动效持久化，AI 表单加载成功，控制台无新增错误。

- [ ] **Step 5: 移动端第二轮**

重新加载后验证：分类切换不丢失未保存 AI 表单状态，高级区和危险操作不溢出，Escape 或关闭按钮可正常退出。

- [ ] **Step 6: 记录验证结果**

在最终交付中列出执行命令、通过结果、桌面与移动端两轮烟雾测试结论，以及任何仍存在但不属于本次范围的问题。
