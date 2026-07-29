# 任务计划：局域网桌游平台（谁是卧底 MVP / R1）

## 目标

按 [docs/SPEC.md](docs/SPEC.md)（v1.1 + 2026-07-26 补遗）交付可发布的 R1 MVP：
同一局域网内 4–12 名玩家用手机浏览器完成"谁是卧底"对局，通过全部 P0 验收（AC-01～AC-20）与 NFR 基线。

## 基线

- 规格：`docs/SPEC.md`（与 `C:\Users\87850\Desktop\SPEC-v1.1-optimized.md` 同步，补遗见附录 D）
- 运行时：Node.js 24 LTS（开发机 24.13.1）、npm 11、TypeScript 严格模式、npm workspaces
- 数据库：SQLite；首选驱动 `node:sqlite`（Node 24 内置，零原生依赖），待 M0 真机 PoC 后按 DG-01 冻结
- 里程碑映射 SPEC §15：M0 可行性 → M1 骨架 → M2 房间闭环 → M3 谁是卧底 → M4 持久化恢复 → M5 发布候选

## 阶段

### Phase 0：SPEC 审查与项目初始化 — in_progress
- [x] 审查 SPEC v1.1，补齐 8 处边界缺口（写回原文 + 附录 D 留痕）
- [x] 初始化 D:\项目（计划文件、README、docs/SPEC.md、git init）
- [x] M0 PoC 脚本（node:sqlite + WebSocket + 局域网服务模式）在 Windows 本机验证通过
- [ ] 【需用户真机】按 poc/m0/README.md 在 ARM64 Termux 设备执行清单，回填结果 → 冻结 DG-01/DG-02

### Phase 1：M1 工程骨架 — complete（2026-07-27）
- [x] npm workspaces：`packages/shared`、`packages/server`、`packages/client`、`packages/games/undercover`
- [x] shared/protocol：消息 envelope、错误码表（附录 A 全量 17 个）、zod 运行时 schema
- [x] server/gateway：HTTP 静态托管 + `/health/live|ready` + WebSocket 接入 + Origin 校验 + 限流骨架
- [x] server/persistence：迁移器 + schema v1（SPEC §10.2 十张逻辑表）+ 数据库薄边界
- [x] server/core：每房间串行命令队列（create_room 贯通：校验→入队→事务→ack→广播）
- [x] 结构化日志（脱敏约束 SEC-009）、启动地址检测与二维码输出（FR-BOOT-001/002）
- [x] CI 脚本：typecheck + lint + 单测；lockfile 提交（SEC-008）
- 退出标准已验证：健康检查、schema 校验、空房间命令链全部通过（39/39 测试绿，启动冒烟通过）

### Phase 2：M2 房间闭环 — complete（2026-07-27）
- [x] 创建/加入/退出/重名校验/密码慢哈希（FR-ROOM-*）；满员/观战容量/状态降级规则
- [x] 房主权限与转让（FR-HOST-001~006）、踢人（凭证作废+审计）、观战（FR-SPEC-*）
- [x] 公屏聊天 + 独立游标补发（FR-CHAT-001~005，不推动 roomSeq）+ 系统消息
- [x] resumeToken 生成/哈希存储/失效、重连同步、会话接管 SESSION_REPLACED（FR-ID-*、FR-REC-*）
- [x] roomSeq、requestId 幂等回执、STALE_CLIENT_STATE+currentSeq、resync（§9.4）
- [x] 断线标记（executeInternal）+ 房主断线 30s 自动转让计时器（回归不夺回）
- 退出标准已验证：AC-02/03/10/11/12/14 服务端规则自动化通过（57/57 测试绿）；
  AC-01 启动已在 M1 冒烟验证；AC-04（开局原子性）与 AC-13（观战秘密隔离）依赖 M3 对局能力

### Phase 3：M3 谁是卧底 — complete（2026-07-27）
- [x] 词库 ≥100 组中文词对（实际 120 组；本会话复核补到 120，WORD_BANK_VERSION 1→2；DG-04 用户人工复核留待 M5 真实聚会前）
- [x] GameModule 纯函数实现：状态机（§6.2）、发言/投票/加赛/淘汰/胜负（§6.3~6.8 含补遗 D-1~D-4、D-7）
- [x] 三类视角白名单构造（§6.9）、计时 effect、种子化随机
- [x] 不变量/属性测试全覆盖（§6.10）+ 确定性重放
- [x] 游戏 UI（移动优先，§7：按住看词、遮挡、连接状态反馈）
- 退出标准已验证：AC-05～09、AC-17 自动化通过（94/94 测试全绿，含 gameSession/gatewayGame/module/words 套件）

### Phase 4：M4 持久化恢复 — complete（2026-07-28）
- [x] 每动作单事务提交（§10.3 五步原子写）、先提交后 ack
- [x] 计时器持久化 + 到期补执行、启动恢复流程（§10.4，RECOVERING）
- [x] 崩溃注入测试：各阶段 kill -9 后重启验证
- 退出标准已验证：AC-15/AC-16 自动化通过；已确认动作 RPO=0；恢复流程同步完成、无网络 I/O，远低于 60 秒；Node 24 下 104/104 测试全绿（新增 10 个恢复测试）

### Phase 5：M5 发布候选 — in_progress（2026-07-28）

#### 子任务 5.1：UI 打磨与 PWA — complete
- [x] 移动端可访问性（§7.4）：focus-visible、prefers-reduced-motion、aria 标签
- [x] PWA：manifest、icon、offline fallback、service worker、index.html meta
- [x] UX 反馈：toast 通知、复制成功、输入自动聚焦、错误提示
- 退出标准已验证：client build 成功，dist 含 PWA 资源；104/104 测试无回归；
  dev:server 冒烟 /health/ready、/manifest.json、/sw.js、/offline.html 均 200

#### 子任务 5.2：Termux 部署与运维文档 — pending
- [ ] 编写 packages/server/docs/termux.md（环境安装、启动、后台运行、自启动）
- [ ] 备份/恢复说明（data/platform.db、定时备份脚本）
- [ ] 环境变量与端口配置示例

#### 子任务 5.3：性能与安全测试 — pending
- [ ] 性能压测脚本：12+8 连接三局，采样延迟与 RPS（NFR-001~009）
- [ ] 安全行审计：§14.1 检查清单（输入校验、CORS、密码哈希、日志脱敏、WS 鉴权）
- [ ] 修复子任务发现的 P0 缺陷

#### 子任务 5.4：真实聚会验收 — pending（需用户）
- [ ] 8 人连续 3 局无中断（AC-18）
- [ ] 真机资源采样：CPU/内存/电量（AC-19/20）
- 总体退出标准：AC-18～20 通过，无未关闭 P0 缺陷

#### 子任务 5.5：机器人陪练 + AI 大模型玩家 + 运行期设置面板 — in_progress（2026-07-29）
详细计划见 [docs/settings-panel-plan.md](docs/settings-panel-plan.md)
- [x] 规则机器人（随机合法动作）与 llm 机器人的服务端管道、大厅加减按钮与成员标签
- [x] 迁移 v4 `app_settings` 表；`core/settings.ts` 读写校验；`LlmProvider` 热生效持有者
- [x] `tests/gatewayBot.test.ts` 真实 WS 验证 add_bot 全链路（证明「请求格式有误」是旧进程所致，重启即好）
- [x] HTTP 端点 `GET/PUT /api/settings/llm`（写入需 `ADMIN_TOKEN`，未设则仅放行本机）
- [x] `app.ts` 换用 LlmProvider；`ws.ts` 与 `botRunner.ts` 改为动态读取（构造时固定引用会让热生效到不了机器人）
- [ ] 客户端设置弹层（复用 SheetDialog）+ 首页入口按钮；密钥只写不回显
- [ ] settings 校验分支与 HTTP 端点测试；README 补环境变量与开启 AI 玩家说明
- [ ] `npm run ci` + `npm run build`；版本升至 0.4.0
- 退出标准：不重启服务端即可改端点/密钥/模型并让 AI 玩家生效；密钥原文不出任何接口
- 已知取舍：① 面板里「清空」是回落到环境变量而非关闭功能，部署时设了 `LLM_BASE_URL` 就无法在面板上关掉 AI 玩家；
  ② 未设 `ADMIN_TOKEN` 时手机改设置会得到 403（开发时 vite 代理算本机，故本地无感）

## 关键决策

| 决策 | 结论 | 依据 |
|------|------|------|
| SQLite 驱动 | 首选 `node:sqlite`（Node 24 内置） | 零原生编译，天然满足 Termux 约束；真机 PoC 后冻结 |
| WebSocket 库 | 服务端 `ws`（纯 JS） | 无原生依赖；客户端用浏览器/Node 内置 WebSocket |
| 运行时校验 | zod | 生态成熟，shared 包内定义 schema 双端复用 |
| 运行方式 | Node 24 原生 TS type stripping 直跑 `.ts`，零构建 | 零原生依赖、部署最简；`tsc --noEmit` 严格类型检查兼顾安全 |
| 测试运行器 | `node --test`（内置） | 无额外依赖，原生支持直跑 .ts 测试 |
| 大模型决策形式 | 只做选择题：候选动作由游戏模块枚举，模型回候选 id | 模型无法产出非法动作；超时/格式错/id 不存在一律回落规则策略 |
| 大模型调用位置 | 事务外（peek → 决策 → 同步落库三段式） | 三条命令执行链的 handler 全是同步函数，fetch 不能进事务 |
| 运行期设置 | 存 SQLite，环境变量兜底，热生效不重启 | 聚会现场没人愿意改文件重启进程 |
| 设置写入鉴权 | `ADMIN_TOKEN` 校验，未设则仅本机可写 | 局域网内谁都能访问该端点，改端点或塞入他人密钥花的是服主的钱 |
| git | 已 init，首次提交 `e6250b8` 完成 | M4 完成后用户要求先提交再切分支；当前在 `m5-ui-polish` |

## 错误记录

| 错误 | 尝试 | 解决 |
|------|------|------|
| （暂无） | | |
