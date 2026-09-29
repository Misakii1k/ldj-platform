# 02 · 视觉与交互锁定

## 1. 结构不重做

以最新运行页面的中央舞台、左右席位、席位顺序与选号语义为骨架。保留原背景构图和透明职业素材；本轮改主题、工具入口、覆盖层、底栏和演出，不切成卡片仪表盘，不改成圆桌/横向玩家列表。
最新基线候选见 00-STATE.md，必须先真实看图。若工具不能显示图片，视觉项只能标未验收。

顶栏：保留原局次/阶段信息，右侧仅清晰“设置”“聊天(未读数)”；去掉 A/B/C 常驻按钮。主题选择放设置内部，两组卡片而不是四个随便切的皮肤。

## 2. 唯一主题源

新建 D:/项目/packages/client/src/game/werewolf/theme.ts（纯映射/偏好读写）及必要 provider。
持久 key：ldj_werewolf_theme_pair_v1；值 forest/theatre，缺省 forest。一次性兼容旧 ldj_werewolf_theme：woodcut/eclipse→forest，theatre→theatre；无效/存储异常使用 forest。不让旧 key 继续和新 key 争权。

游戏根 + 专用 portal root 同步 data-ww-theme（woodcut-day/eclipse-night/theatre-day/theatre-night），由同一个 provider 驱动。不要给全站 body 永久写主题；如沿用 body portal，显式在内容 wrapper 注入主题并卸载清理。

|时段|forest|theatre|
|---|---|---|
|准备/身份确认/白天/终局|日光木刻|白昼剧场|
|night|月蚀星轨|赤幕剧场|

新流程用 timeline.period；无 timeline 旧流程按服务端 phase 推导，不按本地时钟/音频播放状态。猎人技能等过渡若仍处于夜间结算，以服务端公开 timeline.period 为准。game_over 强制 day。

## 3. 固定基础色板（实体底色）

|token|木刻日|星轨夜|剧场日|剧场夜|
|---|---|---|---|---|
|desk|#f4efe5|#191d2b|#f7efe5|#1b1019|
|card|#fffdf7|#272d40|#fffaf2|#321c2a|
|text|#203c30|#f0edf6|#4b2430|#fff2e7|
|secondary|#465c4e|#c8c8da|#714654|#ddc3cd|
|active|#245844|#e6e1ee|#753747|#f1c997|
|active-ink|#ffffff|#2b2b40|#ffffff|#311821|
|edge|#748575|#81879e|#a57b87|#ab8495|

这些组合已计算文字≥4.5、edge/card≥3，见 theme-contrast.json；仅对实体底有效。半透明背景、disabled opacity、图片底、动态叠层需重新测量实际合成色。
原 --bg/--panel/--ink/--muted/--line 与 --ww-* / --gp-* 映射到唯一语义 token，不各写一套“差不多”的颜色。
不额外自由发挥彩虹强调色、霓虹蓝光或粉色玻璃卡。错误/危险按钮必须独立高对比底板并标注动作，不能只靠红色表达危险。

### 美术限制

- 日光木刻：保留 A 木刻构图和线条层，暖纸 + 日光 + 深绿；不是把原深底单纯提亮，原亮字全部改语义 token。
- 月蚀星轨：保留 B 星空/轨迹组织，控制装饰亮度，字幕底板清晰。
- 白昼剧场：与夜剧场同舞台构图，暖白舞台和深酒红文字，幕布弱化为边缘结构。
- 赤幕剧场：幕布限制在左右边缘/上缘，暗莓红，聚光指向中央而非照亮所有文字；与日剧场配对。不得把 C 换成与现有舞台无关的全新插画。
- 复用 D:/项目/packages/client/public/assets/roles 的透明素材；不联网找新立绘覆盖风格。首次核对透明通道。

## 4. 通用职业演出

建议独立 D:/项目/packages/client/src/game/werewolf/ui/RoleTurnOverlay.tsx，只接 public role、timelineId、时钟/动效偏好。不得接 self/seat/target/查验结果。

- 第一段 open：450ms opacity 0→0.9、scale .96→1；突出 1500ms 后降至 .18–.26 的轮廓；close 末段 350ms 淡出。
- 同职业 open→action 不重复闪出另一张图；职业切换按当前 timeline/state 更新，过期出场回调不覆盖新角色。
- mask radial-gradient 边缘渐隐 + 柔光；pointer-events:none；无不透明长方形底板。
- 自身台词/操作仍在原中央高对比卡片层，不把文字叠在立绘脸部。立绘层低于字幕/操作，不挡席位点击。
- 白天/夜晚背景双层交叉淡化 900ms；只动画 opacity/transform，避免全屏持续 blur/filter 或布局反复计算。
- 小屏保留 96–144px 剪影/图标，低高度横屏保留至少 64px 轮廓，不沿用隐藏整个 .art 的规则。
- prefers-reduced-motion：短淡化≤120ms、无缩放/漂移。document.hidden/退出：停动画与声音；回前台以当前阶段恢复，不补演队列。
- 动画不决定 action gate、不锁全屏、不拦截真实时钟。不要再添加“画面还在夜晚所以假装服务器没天亮”的补丁。

## 5. 设置、聊天、复盘、底栏

- 优先复用现有 Drawer/Menu/按钮能力；共用语义 token 和间距，不把所有游戏 CSS 改成狼人杀。
- 设置含：两组主题、规则、法官播报开关与音量、界面音效开关/音量、暂离、退出；房主可见解散。退出/解散二次确认，有 busy/error，失败保持会话。
- 聊天：公共标签 + 私聊选择器（同房真人）；每会话未读，显示“私聊 · 对方名字”，发送失败保留草稿。抽屉内滚动；输入区固定在抽屉底并避开安全区/软键盘，不盖住关闭按钮。
- 设置/聊天/复盘有 accessible name、焦点圈、Esc 关闭、关闭回到触发按钮；复用原组件焦点管理，不重复绑定全局监听。
- 复盘：胜负、playerId 关联的全员身份/出局状态、已有投票记录。没有的投票不捏造；私聊不出现。姓名相同也不能串头像/状态。
- TabletopSettlementDock 与准备/取消准备/再开一局/退出应用同主题。房主明确开始；不增加“所有人准备就开”的触发器。

## 6. 断点与视觉关卡

仅允许 width:380/480/640/768/1024/1280，height:520/620；360/390/844 是验收视口，不是新 CSS 断点。
固定验收：360×640、390×844、844×390、1280×800；四种主题分别截图。

先只做四张同一稳定场景的主题样张 + 当前移动端一张，签收结构和色彩再铺满所有弹层。若没有签收，不得以“模型审美更好”替换设计。
没有动画帧随机差异的测试使用 reduced-motion/固定阶段截图；另录正常动效的关键帧证明 enter/focus/idle/exit。

拒收：横向滚动、席位顺序变化、点不到的按钮、底栏遮挡操作、浅底白字、深底深字、弹层未继承主题、小屏职业完全消失、聊天覆盖角色私密操作、蒙版把字幕也变透明。
