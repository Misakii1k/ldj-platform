# 局域网桌游游戏平台

局域网优先、单机可运行的网页桌游平台。聚会时一台电脑或安卓设备（Termux）充当主机，
其他玩家扫码即玩。首发游戏：谁是卧底。

- **规格基线**：[docs/SPEC.md](docs/SPEC.md)（v1.1 + 实施前补遗）
- **实施计划**：[task_plan.md](task_plan.md)（里程碑 M0–M5）
- **调研记录**：[findings.md](findings.md) · **进度日志**：[progress.md](progress.md)
- **M0 可行性 PoC**：[poc/m0/README.md](poc/m0/README.md)（Termux 真机验证清单）

## 技术栈（MVP）

TypeScript（严格模式）· Node.js ≥ 24 LTS · `node:sqlite` · `ws` · React + Vite · npm workspaces

## 部署

### 桌面/笔记本（推荐聚会主机）
```sh
npm install
npm run build -w @ldj/client
npm run dev:server
```
浏览器访问 `http://<本机IP>:8080`，启动日志会打印局域网地址与二维码。

### Android 手机（Termux）
参见 [packages/server/docs/termux.md](packages/server/docs/termux.md)。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8080` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | 数据目录 |
| `DB_PATH` | `<DATA_DIR>/platform.db` | SQLite 数据库路径 |
| `PUBLIC_BASE_URL` | 自动检测 | 显式覆盖二维码地址 |
| `LOG_LEVEL` | `info` | `debug / info / warn / error` |
| `ALLOWED_ORIGINS` | 空 | 额外允许的 Origin，逗号分隔 |
| `LLM_PROVIDER` | `openai` | `openai` 或 `anthropic` 协议 |
| `LLM_BASE_URL` | 无 | OpenAI 兼容端点。不设则 AI 玩家不可用 |
| `LLM_API_KEY` | 无 | 端点密钥 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_THINKING_DEPTH` | `off` | 思考深度：`off / low / medium / high / max` |
| `LLM_TIMEOUT_MS` | `20000` | 单次决策超时，范围 1000–120000 |
| `LLM_ALLOW_PRIVATE_NETWORK` | `false` | 是否允许 LLM 上游访问私网地址；本地模型需显式设为 `true` |
| `ADMIN_TOKEN` | 无 | 设置写入口令。不设则只有本机能改设置 |

## 怎么开 AI 玩家

两种方式：

1. **环境变量**：设 `LLM_BASE_URL`（与可选的 `LLM_API_KEY`、`LLM_MODEL`）后启动服务端。
2. **运行期设置面板**：首页点"AI 设置"按钮，填入端点/密钥/模型名/超时。改完即时生效，不重启服务端。

不设则只能用规则机器人（合法随机动作）。

### 已知限制

- **清空 ≠ 关闭**：在面板里清空 baseUrl 或密钥，会回落到环境变量里的值，而不是变成空。如果部署时设了 `LLM_BASE_URL`，面板上关不掉 AI 玩家。UI 文案写"清空（回到启动配置）"而不是"删除"。
- **手机上默认改不了设置**：没设 `ADMIN_TOKEN` 时只放行 127.0.0.1，手机访问会拿 403。开发时 vite 代理过来的请求算本机，所以本地开发无感；真机聚会要在手机上改就得设口令。

## 当前状态

Phase 5 进行中（M5 发布候选）。Termux 部署与运维文档已写入 `packages/server/docs/termux.md`，但 ARM64 Termux 真机 PoC/部署回填仍待用户完成。机器人陪练、AI 大模型玩家与运行期设置面板已有实现；设置专项测试于 2026-08-02 单独运行 61/61 通过。

性能与安全尚未完成发布验收：`perf.smoke.test.ts` 已通过受准入测试夹具完成 1 局 4 人 + 2 机器人短时对局，生产 `create_room` 仍严格拒绝未准入游戏；但三局长压测尚无报告，服务端内存/CPU 指标尚未补齐。`docs/security-audit.md` 是 2026-07-29 历史时点审计，当前工作树仍需完整复审。当前游戏目录均为内部原型或权利阻断状态，不能把测试通过当作 `playable` 准入。
