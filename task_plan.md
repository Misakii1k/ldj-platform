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

### Phase 1：M1 工程骨架 — completed
- [x] npm workspaces：`packages/shared`、`packages/server`、`packages/client`、`packages/games/undercover`
- [x] shared/protocol：消息 envelope、错误码表（附录 A）、zod 运行时 schema
- [x] server/gateway：HTTP 静态托管 + `/health/live|ready` + WebSocket 接入 + Origin 校验 + 限流骨架
- [x] server/persistence：迁移器 + schema v1（SPEC §10.2 十张逻辑表）+ 数据库薄边界
- [x] server/core：每房间串行命令队列（空房间命令链贯通：校验→入队→事务→ack→广播）
- [x] 结构化日志（脱敏约束 SEC-009）、启动地址检测与二维码输出（FR-BOOT-001/002）
- [x] CI 脚本：typecheck + lint + 单测；lockfile 提交（SEC-008）
- 退出标准（SPEC §15 M1）：健康检查、schema 校验、空房间命令链通过

### Phase 2：M2 房间闭环 — pending
- [ ] 创建/加入/退出/重名校验/密码慢哈希（FR-ROOM-*）
- [ ] 房主权限与转让（FR-HOST-001~006）、踢人、观战（FR-SPEC-*）
- [ ] 公屏聊天 + 游标补发（FR-CHAT-001~005）
- [ ] resumeToken 生成/哈希存储/失效、重连同步、会话接管 SESSION_REPLACED（FR-ID-*、FR-REC-*）
- [ ] roomSeq、requestId 幂等回执、STALE_CLIENT_STATE、resync（§9.4）
- 退出标准：AC-01～04、AC-10～14 自动化通过

### Phase 3：M3 谁是卧底 — pending
- [ ] 词库 ≥100 组中文词对（生成后【需用户】人工复核 → DG-04）
- [ ] GameModule 纯函数实现：状态机（§6.2）、发言/投票/加赛/淘汰/胜负（§6.3~6.8 含补遗 D-1~D-4、D-7）
- [ ] 三类视角白名单构造（§6.9）、计时 effect、种子化随机
- [ ] 不变量/属性测试全覆盖（§6.10）+ 确定性重放
- [ ] 游戏 UI（移动优先，§7：按住看词、遮挡、连接状态反馈）
- 退出标准：AC-05～09、AC-17 自动化通过

### Phase 4：M4 持久化恢复 — pending
- [ ] 每动作单事务提交（§10.3 五步原子写）、先提交后 ack
- [ ] 计时器持久化 + 到期补执行、启动恢复流程（§10.4，RECOVERING）
- [ ] 崩溃注入测试：各阶段 kill -9 后重启验证
- 退出标准：AC-15～16 通过；已确认动作 RPO=0，恢复 ≤60 秒

### Phase 5：M5 发布候选 — pending
- [ ] 移动端 UI 打磨、可访问性（§7.4）、PWA manifest（P1 非阻塞）
- [ ] Termux 部署文档（§13.3）、备份/恢复说明
- [ ] 性能测试（12+8 连接三局、NFR-001~009）、安全测试（§14.1 安全行）
- [ ] 【需用户】真实 8 人聚会连续 3 局（AC-18）、真机资源采样（AC-19/20）
- 退出标准：AC-18～20 通过，无未关闭 P0 缺陷

## 关键决策

| 决策 | 结论 | 依据 |
|------|------|------|
| SQLite 驱动 | 首选 `node:sqlite`（Node 24 内置） | 零原生编译，天然满足 Termux 约束；真机 PoC 后冻结 |
| WebSocket 库 | 服务端 `ws`（纯 JS） | 无原生依赖；客户端用浏览器/Node 内置 WebSocket |
| 运行时校验 | zod | 生态成熟，shared 包内定义 schema 双端复用 |
| git | 已 init，首次提交待用户确认 | 遵循"用户要求才提交" |

## 错误记录

| 错误 | 尝试 | 解决 |
|------|------|------|
| npm 依赖范围解析到不完整的未来版本 | 2 | 将工具链和 workspace 依赖固定为 Node 24 兼容版本，成功生成 lockfile |
