# Termux 部署与运维文档

本指南介绍如何在 Android 手机上通过 Termux 部署局域网桌游平台服务端，让手机充当主机，供同一 Wi-Fi 下的其他玩家浏览器加入。

---

## 1. 前置条件

- Android 8 及以上
- Termux 0.118 及以上（**必须**从 F-Droid 或 GitHub releases 安装；Google Play Store 旧版已停更，不能用）
- Termux:Boot 应用（可选，用于开机自启动）
- 同一 Wi-Fi 下其他玩家的浏览器

> ⚠️ 不要使用 Google Play Store 版本的 Termux，该版本早已停止更新，存在兼容性问题。请务必从 F-Droid 或 Termux 官方 GitHub releases 下载。

---

## 2. 环境安装

```sh
pkg update && pkg upgrade
pkg install nodejs-lts git
node --version  # 应 ≥ 24
```

验证 `node:sqlite` 原生模块可用：

```sh
node -e "const {DatabaseSync}=require('node:sqlite'); new DatabaseSync(':memory:').exec('CREATE TABLE t(x)')"
```

如果报错，说明 Node 版本不够，需 `pkg upgrade nodejs-lts` 升级到 24+。

---

## 3. 获取代码

```sh
git clone <仓库地址>
cd 项目根目录
```

---

## 4. 首次启动

```sh
npm install                    # workspaces 自动链接子包
npm run build -w @ldj/client   # 构建前端
npm run dev:server             # 启动服务端
```

启动后日志会打印：

- 监听地址（通常是 `0.0.0.0:8080`）
- 检测到的局域网地址（例如 `192.168.1.10:8080`）
- 二维码（其他玩家扫码即可加入）

浏览器访问 `http://<手机IP>:8080` 验证。

---

## 5. 后台运行

Termux 关闭后服务端会被杀，需要：

```sh
termux-wake-lock              # 防止 CPU 休眠
nohup npm run dev:server > server.log 2>&1 &
```

或用 tmux：

```sh
pkg install tmux
tmux new -s ldj
npm run dev:server
# 按 Ctrl+B 然后 D 脱离会话
# 重新连接：tmux attach -t ldj
```

解锁 CPU：

```sh
termux-wake-unlock
```

---

## 6. 自启动（可选）

1. 安装 Termux:Boot 应用（F-Droid 或 GitHub releases）
2. 创建启动脚本：

```sh
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-ldj.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd <项目根目录绝对路径>
npm run dev:server > server.log 2>&1 &
EOF
chmod +x ~/.termux/boot/start-ldj.sh
```

3. 重启手机验证（Termux:Boot 在开机后自动执行 `~/.termux/boot/` 下的脚本）

---

## 7. 备份与恢复

### 在线备份（服务运行中）

```sh
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('data/platform.db'); db.exec(\"VACUUM INTO 'data/platform.db.bak'\"); console.log('备份完成')"
```

### 离线备份（停止服务后）

```sh
npm run dev:server  # Ctrl+C 停止
cp data/platform.db data/platform.db.bak
```

### 恢复

```sh
# 停止服务端
cp data/platform.db.bak data/platform.db
npm run dev:server
```

### 迁移到新设备

- 复制整个项目目录（含 `data/`）到新设备
- 或只复制 `data/` 目录到已 clone 的项目里

---

## 8. 环境变量

可通过 `.env` 文件（用 `node --env-file=.env packages/server/src/index.ts` 启动）或直接 `export` 设置：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8080` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 监听地址，默认所有网卡 |
| `DATA_DIR` | `./data` | 数据目录 |
| `DB_PATH` | `<DATA_DIR>/platform.db` | SQLite 数据库路径 |
| `PUBLIC_BASE_URL` | 自动检测 | 显式覆盖二维码地址，例如 `http://192.168.1.10:8080` |
| `LOG_LEVEL` | `info` | `debug / info / warn / error` |
| `ALLOWED_ORIGINS` | 空 | 额外允许的 Origin（开发模式例外），逗号分隔 |
| `LLM_BASE_URL` | 无 | OpenAI 兼容端点。不设则 AI 玩家不可用，已加入房间的 AI 机器人退化为规则策略 |
| `LLM_API_KEY` | 无 | 端点密钥。本地模型通常留空 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_TIMEOUT_MS` | `20000` | 单次决策超时，范围 1000–120000 |
| `ADMIN_TOKEN` | 无 | 设置写入口令。不设则只有本机能改设置；想在手机上改设置就设这个 |

示例 `.env` 文件：

```env
PORT=8080
DATA_DIR=./data
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=qwen2.5:7b
ADMIN_TOKEN=my-secret-token
```

启动：

```sh
node --env-file=.env packages/server/src/index.ts
```

---

## 9. 常见问题

### 端口被占用

```sh
PORT=8081 npm run dev:server
```

### 手机改不了 AI 设置

默认只允许本机（`127.0.0.1`）改设置。要在手机上改，设 `ADMIN_TOKEN`，然后请求时在请求头带 `x-admin-token`。前端设置弹层会自动处理。

### 后台被杀

- 设置 → 电池 → 关闭"自适应电池"
- 设置 → 应用 → Termux → 电池 → 不限制
- 最近任务里锁定 Termux（下拉锁定）
- 使用 `termux-wake-lock`

### 二维码扫不出

- 手输 URL（启动日志会打印）
- 或设 `PUBLIC_BASE_URL=http://192.168.1.10:8080`

### `node:sqlite` 不可用

- Node 版本不够，需升级到 24+
- `pkg upgrade nodejs-lts`

### 服务启动报"非法端口"

- 检查 `PORT` 环境变量是否是数字、是否在 1–65535 范围

---

## 10. 已知限制

- Termux 长时间运行需要 wake-lock，否则 CPU 休眠后服务端会卡住
- Android 后台策略可能在低内存时杀掉 Termux，建议聚会时手机接电源
- 不支持 IPv6 局域网（部分老 Android 设备）
- 大量并发（>20 连接）可能触发 Android 文件描述符限制
