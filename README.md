<p align="center">
  <img src="./assets/readme/hero.png" width="100%" alt="聚乐桌游：一台电脑当主机，局域网内其他玩家扫码即玩">
</p>

<p align="center">
  <a href="docs/SPEC.md"><img src="https://img.shields.io/badge/%E8%A7%84%E6%A0%BC%E5%9F%BA%E7%BA%BF-v1.1-8b5cf6" alt="规格基线"></a>
  <a href="#游戏目录"><img src="https://img.shields.io/badge/%E6%B8%B8%E6%88%8F-10%20%E6%AC%BE%E5%8F%AF%E7%8E%A9-10b981" alt="可玩游戏"></a>
  <a href="docs/security-audit.md"><img src="https://img.shields.io/badge/%E5%AE%89%E5%85%A8%E5%AE%A1%E8%AE%A1-10%20%E9%A1%B9%E9%80%9A%E8%BF%87-0ea5e9" alt="安全审计"></a>
</p>

聚会时想开一局桌游，麻烦的从来不是规则，而是「装什么、谁来装、怎么连」。

**聚乐桌游**是一个局域网优先、单机可运行的网页桌游平台。一台笔记本，或者一台装了 Termux 的安卓手机充当主机，其余人扫码进房就能玩。没有公网服务器，也不需要每个人各自安装客户端。

---

## 游戏目录

十款游戏已在生产目录中可玩：

| 游戏 | 人数 | 规则集 |
| :--- | :--- | :--- |
| 谁是卧底 | 4–12 | `undercover_classic_v1` / `undercover_blank_v1`（白板变体） |
| 狼人杀 | 6–12 | `werewolf_legacy_platform_v2` / `werewolf_platform_open_kill_v1` |
| 斗地主 | 3 | `landlord_platform_v1` / `landlord_legacy_platform_v1` |
| Durian：榴莲店长 | 2–7 | `durian_orchard_v1` |
| 情书：密函心意 | 2–4 | `loveletter_classic16_v1` |
| 奶酪大盗：月夜鼠影 | 4–8 | `cheese_thief_classic_v1` |
| 以鹅传鹅：鹅鹅密令 | 5–9 | `goose_relay_classic_v1` |
| 暗夜证词 | 3–6 | `night_testimony_v1` |
| Ding（原铃铛对决） | 2–7 | `bell_clash_v1` |
| 伪人测试 | 3–12 | `echo_judge_v1` |

UNO 暂不开放：权利证据未完成（`blocked_rights`），通过测试也不能解除阻断。

谁是卧底、狼人杀与斗地主同时保留 classic / legacy 兼容基线与平台变体并行注册，新建房间默认走平台变体。

---

## 快速开始

### 桌面 / 笔记本（推荐作为聚会主机）

```sh
npm install
npm run build -w @ldj/client
npm run dev:server
```

浏览器访问 `http://<本机IP>:8080`，启动日志会打印局域网地址与二维码，其他人扫码直接进。

### Android 手机（Termux）

见 [packages/server/docs/termux.md](packages/server/docs/termux.md)。

---

## AI 玩家

不想凑人数时可以给空位补 AI。两种配置方式：

1. **环境变量**：设置 `LLM_BASE_URL`（以及可选的 `LLM_API_KEY`、`LLM_MODEL`）后启动服务端。
2. **运行期设置面板**：首页点「设置」，填端点 / 密钥 / 模型名 / 超时，改完即时生效，不必重启服务端。

不配置就只能用规则机器人（合法随机动作）。

```sh
# 例：接一个 OpenAI 兼容端点
LLM_BASE_URL=https://api.example.com/v1 \
LLM_API_KEY=sk-... \
LLM_MODEL=gpt-4o-mini \
npm run dev:server
```

支持 `openai` 与 `anthropic` 两种协议（`LLM_PROVIDER`）。思考深度可调：`off / low / medium / high / max`，单次决策超时由 `LLM_TIMEOUT_MS` 控制（默认 20 秒）。

---

## 环境变量

| 变量 | 默认 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `8080` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | 数据目录 |
| `DB_PATH` | `<DATA_DIR>/platform.db` | SQLite 数据库路径 |
| `PUBLIC_BASE_URL` | 自动检测 | 显式覆盖二维码地址 |
| `LOG_LEVEL` | `info` | `debug / info / warn / error` |
| `ALLOWED_ORIGINS` | 空 | 额外允许的 Origin，逗号分隔 |
| `LLM_PROVIDER` | `openai` | `openai` 或 `anthropic` 协议 |
| `LLM_BASE_URL` | 无 | OpenAI 兼容端点，不设则 AI 玩家不可用 |
| `LLM_API_KEY` | 无 | 端点密钥 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_THINKING_DEPTH` | `off` | 思考深度 |
| `LLM_TIMEOUT_MS` | `20000` | 单次决策超时，1000–120000 |
| `LLM_ALLOW_PRIVATE_NETWORK` | `false` | 是否允许 LLM 上游访问私网地址；本地模型需显式设 `true` |
| `ADMIN_TOKEN` | 无 | 设置写入口令，不设则只有本机能改设置 |

---

## 已知限制

- **清空 ≠ 关闭**：在面板里清空 baseUrl 或密钥，会回落到环境变量里的值，而不是变成空。如果部署时设了 `LLM_BASE_URL`，面板上关不掉 AI 玩家。UI 文案写的是「清空（回到启动配置）」而不是「删除」。
- **手机上默认改不了设置**：没设 `ADMIN_TOKEN` 时只放行 `127.0.0.1`，手机访问会拿 403。开发时 vite 代理过来的请求算本机，所以本地开发无感；真机聚会要在手机上改设置就得先设口令。

---

## 技术栈

TypeScript（严格模式）· Node.js ≥ 24 LTS · `node:sqlite` · `ws` · React + Vite · npm workspaces

---

## 状态与验收

### 里程碑

- **D4**：平台化完成——共享规则集注册表、外部 LLM 裁判、机器人陪练 + AI 大模型玩家 + 运行期设置面板（v0.4.0）。
- **D5**：稳定原语 v1 声明完成——目录 / 规则集一致性校验、版本化游戏模块契约。
- **D6**：斗地主平台规则集 + 客户端产品闭环——叫分/抢庄、出牌校验、扇形手牌引擎。
- **D8**：`room_status` 只读心跳查询端到端落地——客户端 15s 轮询，服务端绑定校验 + 限流。

### 验收记录

- **安全**：`docs/security-audit.md` 于 2026-08-09 完成当前工作树完整复审，10 项全部通过、无 P0（含 SSRF 面复核、设置写接口每 IP 限流、历史观察 B-1 确认解决）。
- **性能**：`perf-report.json`（2026-08-11）30 分钟长跑通过——13 局完成、延迟 p50=11ms / p95=41ms / p99=54ms、服务端 RSS 峰值 99.7MB（限 200MB）、稳定期增长 8.5MB（限 30MB）、CPU 均值 1.5%，failureCriteria 全部 false。

### 待完成

1. **Termux 真机 PoC / 部署回填**：按 [poc/m0/README.md](poc/m0/README.md) 清单在 ARM64 Termux 执行并回填，冻结 DG-01/DG-02。文档已就绪但尚无真机验证记录。
2. **真实聚会验收**：8 人连续 3 局无中断（AC-18）+ 真机 CPU / 内存 / 电量采样（AC-19/20）。
3. **UNO 权利证据**：补齐后解除 `blocked_rights`。
4. **词库人工复核**（DG-04）：谁是卧底 120 组词对，待真实聚会前人工复核。

---

## 文档

- [规格基线](docs/SPEC.md)（v1.1 + 实施前补遗）
- [实施计划](task_plan.md)（里程碑 M0–M5 + 平台演进 D4–D8）
- [调研记录](findings.md) · [进度日志](progress.md)
- [M0 可行性 PoC](poc/m0/README.md)（Termux 真机验证清单）
- [安全审计](docs/security-audit.md)
