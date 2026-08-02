# M5 Termux 部署文档任务列表

## 任务依赖

- Task 1（编写 termux.md）→ Task 2（README 链接）依赖
- Task 3（验证）依赖 Task 1–2

## 任务

- [x] Task 1: 编写 `packages/server/docs/termux.md`
  - 章节结构：
    1. **前置条件**：Android 8+、Termux 0.118+（从 F-Droid 或 GitHub 安装，不用 Play Store 旧版）、Termux:Boot（可选，自启动用）
    2. **环境安装**：
       - `pkg update && pkg upgrade`
       - `pkg install nodejs-lts`（验证 `node --version` ≥ 24）
       - `pkg install git`（克隆仓库用）
       - 验证 `node:sqlite` 原生支持：`node -e "const {DatabaseSync}=require('node:sqlite'); new DatabaseSync(':memory:').exec('CREATE TABLE t(x)')"`
    3. **获取代码**：`git clone <repo>` + `cd 项目根`
    4. **首次启动**：
       - `npm install`（workspaces 自动链接）
       - `npm run build -w @ldj/client`（构建前端）
       - `npm run dev:server` 或 `node --env-file=.env packages/server/src/index.ts`
       - 浏览器访问 `http://<手机IP>:8080`（启动日志会打印局域网地址与二维码）
    5. **后台运行**：
       - `termux-wake-lock`（防止 CPU 休眠）
       - `nohup npm run dev:server > server.log 2>&1 &` 或用 `tmux`/`screen`
       - 解锁：`termux-wake-unlock`
    6. **自启动**（可选）：
       - 安装 Termux:Boot 应用（F-Droid / GitHub）
       - 创建 `~/.termux/boot/start-ldj.sh`：
         ```sh
         #!/data/data/com.termux/files/usr/bin/sh
         termux-wake-lock
         cd <项目根>
         npm run dev:server > server.log 2>&1 &
         ```
       - `chmod +x ~/.termux/boot/start-ldj.sh`
       - 重启手机验证
    7. **备份与恢复**：
       - 在线备份：`sqlite3 data/platform.db "VACUUM INTO 'data/platform.db.bak'"`
       - 离线备份：停止服务后 `cp data/platform.db data/platform.db.bak`
       - 恢复：停止服务 → `cp data/platform.db.bak data/platform.db` → 启动
       - 迁移：复制整个 `data/` 目录到新设备
    8. **环境变量**：列出 `PORT / HOST / DATA_DIR / DB_PATH / PUBLIC_BASE_URL / LOG_LEVEL / ALLOWED_ORIGINS / LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_TIMEOUT_MS / ADMIN_TOKEN`，含默认值与示例 `.env`
    9. **常见问题**：
       - 端口被占用：`PORT=8081` 改端口
       - 手机改不了设置：设 `ADMIN_TOKEN`
       - 后台被杀：电池优化白名单 + 关闭"自适应电池" + 锁定 Termux 后台
       - 二维码扫不出：手输 URL，或设 `PUBLIC_BASE_URL=http://192.168.1.10:8080`
       - `node:sqlite` 不可用：升级到 Node 24+
    10. **已知限制**：Termux 长时间运行需 wake-lock；Android 后台策略可能导致服务端被杀；建议聚会时手机接电源

- [x] Task 2: 更新 `README.md` 指向 Termux 文档（在 m5-settings-finish Task 4 中一并完成）
  - 在 README 「技术栈」段后新增「部署」段，列出两种部署方式：
    - 桌面/笔记本：直接 `npm install && npm run build && npm run dev:server`
    - Android 手机（Termux）：参见 [packages/server/docs/termux.md](packages/server/docs/termux.md)

- [x] Task 3: 验证（已通过子代理读回文档确认章节齐全、与代码核对一致）
  - 文档章节齐全（前置条件、环境安装、首次启动、后台运行、自启动、备份恢复、环境变量、常见问题、已知限制）
  - 文档中所有命令在 Windows PowerShell 下也能理解（注明 Termux 专用命令）
  - README 链接正确指向
  - 文档不引用未实现的功能（如未实现的设置项）
