# 调研与发现

## 2026-07-26 SPEC v1.1 实施前审查

结论：v1.1 整体成熟，可作为实施基线；发现 8 处边界缺口，已全部补入
`docs/SPEC.md`（同步桌面原件），明细见 SPEC 附录 D。要点：

1. **零有效票**（D-1/D-2）：普通投票与加赛全员弃票时均"无人淘汰进下一轮"，不进加赛——避免"0 票并列全员成为加赛候选人"的荒谬推导。
2. **VOTE_RESULT 时长**（D-3）：原文未定义停留时间，定为固定 5 秒计时器推进。
3. **选票锁定语义**（D-4）：已提交的票不因随后断线作废；"弃票"仅指结算时未提交。
4. **房主主动离开**（D-5）：原文只覆盖"掉线 30 秒"，补充 LOBBY/POST_GAME 主动离开立即转让。
5. **再次开始语义**（D-6）：状态图 POST_GAME→LOBBY→IN_GAME 与"POST_GAME 允许再次开始"存在张力，明确为语法糖（先回 LOBBY 再校验开局）。
6. **安全点定义**（D-7）：`player_forfeited` 仅在投票结算窗口顺延，其余阶段立即执行。
7. **SQLite 驱动候选**（D-8）：见下方环境发现。

## 环境发现

- 开发机：Windows 11，Git Bash，Node **24.13.1**（LTS）、npm 11.8.0、git 2.52。
- **Node 24 内置 `node:sqlite`（DatabaseSync）**：零原生依赖。这直接化解 SPEC §16 头号风险
  "Termux 上 SQLite 原生驱动安装失败"——Termux `pkg install nodejs` 即得 ≥24 的 Node，
  无需 python/clang 编译链。`better-sqlite3` 降为备选。
- Node 24 自带全局 WebSocket **客户端**；服务端仍需 `ws`（纯 JS，Termux 可装）。
- `node:sqlite` 在线备份是**模块级函数** `backup(db, path)`，不是 `db.backup()` 方法
  （首次 PoC 因此误报失败，已修正）；`VACUUM INTO` 亦可用作兜底。
- `node:sqlite` 在 Node 24 仍带 ExperimentalWarning（API 可能变动）——可接受：
  persistence 层保持薄边界（SPEC §8.1.6），必要时可换 `better-sqlite3`；发布说明需固定 Node 版本。
- D:\项目 初始为空目录，非 git 仓库（已 init）。

## M0 PoC 覆盖点设计（对应 §15 M0 + §13.3）

- 数据库：打开/WAL/外键/建表/千行事务/回滚/孤儿行拒绝/崩溃重开/`db.backup()` 或
  `VACUUM INTO` 备份/完整性检查/单行事务延迟采样（喂给 NFR 基线）。
- WebSocket：20 并发连接回显、优雅关闭释放端口。
- 局域网模式：`SERVE_ONLY=1` 启动 HTTP+WS 服务并打印全部网卡地址，
  供第二台设备浏览器访问验证（预演 FR-BOOT-001/002 与 AP 隔离排查）。
- 真机记录模板在 poc/m0/README.md，结果回填后冻结 DG-01/DG-02。

## 待办跟踪（需用户参与）

- [ ] ARM64 Termux 真机执行 poc/m0 清单（阻塞 DG-01/DG-02 冻结，但不阻塞 M1 开发）
- [ ] M3 前复核词库 100 组（DG-04）
- [ ] M5 真实 8 人聚会验收（AC-18）

## 2026-07-26 M2 alpha 安全复核

- `ack.payload.result` 必须走与游戏动作相同的安全 JSON 树校验，拒绝 `__proto__`、`constructor`、`prototype`、超深嵌套和超过 16 KiB 的载荷。
- 所有面向用户的 Unicode 文本必须拒绝未配对 UTF-16 surrogate；否则不同密码可能在 UTF-8 编码时折叠为同一替换字符，昵称也可能绕过重名判断。
- 会话接管 API 必须接收已绑定成员身份的认证结果，不能组合客户端 `memberId` 与独立布尔值授权。
- 房主断线转让需关联 timer/epoch，并在截止时确认原房主仍离线，防止陈旧计时器转走已恢复的房主。
- 客户端收到 `session_replaced` 后必须停止重连；`resync_required` 不得提前推进本地序号，恢复凭证失效后必须退出陈旧房间视图。
- `ws@8.18.3` 命中内存耗尽公告，升级到 8.21.1；`npm audit --omit=dev` 已清零。构建/测试工具链告警留到依赖升级切片验证，不使用破坏性的 `audit fix --force`。

## 2026-07-26 M1 决策冻结（DG-03）

- 运行时 schema：Zod 4；所有协议、配置与 JSON 动作使用严格 schema，危险键在解析前拒绝。
- 日志：Pino JSON；密码、恢复凭证、秘密词、种子和完整快照统一脱敏。
- 数据迁移：仓库内连续编号 SQL 文件 + 自研薄迁移器，不引入 ORM。
- SQLite 访问仅存在于 `server/persistence` 边界；M0 Termux 结果回填前仍将 `node:sqlite` 视为首选候选而非最终冻结。
