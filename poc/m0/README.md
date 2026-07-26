# M0 可行性 PoC：Termux + SQLite + WebSocket

目的：在**真实 Android ARM64 设备**上验证运行时可行性，冻结 SPEC 决策门槛
**DG-01**（Node 版本 + SQLite 驱动 + 安装方式）与 **DG-02**（参考设备与采样基线）。
对应 SPEC §13.3、§15 M0。

脚本已在 Windows + Node 24.13.1 本机验证通过；请在 Termux 上重复并回填下方记录表。

## 真机执行清单

1. 安装 [F-Droid 版 Termux](https://f-droid.org/packages/com.termux/)（不要用 Play 商店旧版），然后：
   ```sh
   pkg update && pkg upgrade
   pkg install nodejs
   node -v        # 必须 ≥ 24，否则 node:sqlite 不可用 → 记录实际版本
   ```
2. 把 `poc/m0` 目录传到设备（任选：`git clone`、`termux-setup-storage` 后从下载目录复制、或 `scp`）。
3. **数据库验证**：
   ```sh
   node sqlite-poc.mjs
   ```
   预期：输出全部 `✔`，退出码 0；记录"单行事务延迟"的 avg/p95。
4. **WebSocket 自测**（需先装依赖，`ws` 为纯 JS 无编译）：
   ```sh
   npm install
   node ws-poc.mjs
   ```
   预期：`✔ 20 并发连接 × 10 消息回显完成` 且优雅关闭。
5. **局域网可达性**：
   ```sh
   SERVE_ONLY=1 node ws-poc.mjs
   ```
   用**同一 Wi-Fi 的另一台手机**浏览器打开打印出的地址，页面应显示"WebSocket 回显成功"。
   失败则排查路由器 AP 隔离（SPEC §3.3）。
6. **优雅停止**：Ctrl+C 后确认输出"已优雅关闭"，`echo $?` 为 0，重新运行不报端口占用。
7. **重启恢复**：再次 `node sqlite-poc.mjs` 应能重建并通过（脚本每次清理旧库）。
8. **锁屏行为**：`SERVE_ONLY=1` 运行中锁屏 5 分钟，回来看进程是否被杀、
   另一台设备是否还能访问；记录现象（SPEC §13.3.7，用于编写保活文档）。

## 结果记录（回填后冻结 DG-01/DG-02）

| 项目 | 结果 |
|------|------|
| 设备型号 / Android 版本 | |
| CPU 核心数 / 内存 | |
| Termux 来源与版本 | |
| `node -v` | |
| sqlite-poc 是否全通过 | |
| 单行事务延迟 avg / p95 | |
| ws-poc 自测是否通过 | |
| 局域网第二设备访问是否成功 | |
| Ctrl+C 优雅退出是否正常 | |
| 锁屏 5 分钟后现象 | |

## 判定

- **全部通过** → 冻结 DG-01：Node ≥ 24（Termux `pkg install nodejs`）+ `node:sqlite`；此表即 DG-02 基线附件。
- **node < 24 或 node:sqlite 不可用** → 记录版本，换用备选驱动 `better-sqlite3` 重测
  （`npm install better-sqlite3`，若要求编译链则该路线判负，需另评估）。
- **局域网不可达** → 按 SPEC §3.3 排查 AP 隔离；不影响 DG-01，但要写入部署文档。
