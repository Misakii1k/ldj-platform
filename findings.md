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

## M1 技术基座发现（2026-07-27）

- **Node 24 type stripping 可直跑全部 .ts**（含测试），但拒绝 node_modules 内文件；
  npm workspaces 的 symlink 解析后 realpath 在包目录内，故 `@ldj/shared` 的
  `exports` 直指 `./src/index.ts` 在运行时可用；tsc 侧另用 `paths` 映射。
- tsconfig 开 `erasableSyntaxOnly`：全码库禁 enum/namespace/参数属性，
  用 `as const` 数组派生类型；相对导入必须带显式 `.ts` 后缀
  （`allowImportingTsExtensions`）。client 包单独 tsconfig（DOM lib +
  `moduleResolution: bundler` + `jsx: react-jsx`），Vite 也接受 .tsx 后缀导入。
- ws 库 `verifyClient` 的 `info.origin` 无 Origin 时为空字符串而非 undefined，
  需归一化后再做 Origin 校验（非浏览器客户端放行）。
- 启动冒烟：Windows 双网卡（198.18.0.1 虚拟网卡 + 192.168.1.112）会各自列出，
  二维码默认取第一个地址可能选中虚拟网卡 —— 已提示用 `PUBLIC_BASE_URL` 覆盖，
  M5 部署文档需写明。
- `node --test "packages/**/tests/**/*.test.ts"` glob 由 Node 自身展开，
  Windows PowerShell 下也正常；39 测试 <1s（scrypt 慢哈希占大头）。

## M2 房间闭环发现（2026-07-27）

- **WS 测试客户端首帧竞态**：握手完成后服务端立即推 welcome，若客户端先
  `await once(socket, 'open')` 再挂 message 监听会丢帧——必须在构造时就挂监听，
  再用消息队列 waitFor。gatewayM2.test.ts 的 Client 类按此实现。
- **失败路径写库是徒劳代码**：命令执行器对失败命令回滚整个事务，因此
  resume 过期路径里"先 UPDATE 成 EXPIRED 再 throw"永不生效。已删除该写入；
  EXPIRED 落库归 M4 到期清扫器负责。
- **pickNextHost 需确定性平局**：只按 `joined_at ASC` 排序时同毫秒加入的成员
  次序不确定（AC-12 曾间歇失败），补 `seat ASC` 次序键。
- **WS 应用层关闭码约定**：4001 被踢、4002 会话被接管（SESSION_REPLACED）、
  4003 房间关闭。客户端据此区分"不应重连"的场景。
- **会话接管顺序**：新连接绑定时须先清空旧连接的 state 再 close(4002)，
  否则旧连接的 close 回调会把刚上线的玩家误标为断线。
- **聊天不推 roomSeq**（bumpSeq:false）但仍落幂等回执；系统消息（加入/离开/被踢）
  与业务写入同事务插入 chat_messages，游标补发天然覆盖。
- 删除了 M1 冒烟遗留的 `data/platform.db*`（旧 v1 schema 无部分昵称唯一索引，
  迁移器不重跑 v1，与新代码不一致；测试全用 :memory: 不受影响）。

## 待办跟踪（需用户参与）

- [ ] ARM64 Termux 真机执行 poc/m0 清单（阻塞 DG-01/DG-02 冻结，但不阻塞 M1 开发）
- [ ] M3 前复核词库 100 组（DG-04）
- [ ] M5 真实 8 人聚会验收（AC-18）
