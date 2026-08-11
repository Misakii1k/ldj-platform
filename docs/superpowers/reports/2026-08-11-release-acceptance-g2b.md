# 发布验收报告：G2-B 五款游戏上架 + 收尾工程加固

## 结论
**通过。** 本轮完成：5 款剩余游戏按原版规则全部上架（平台 playable 达 10 款）、修复 `player_forfeited` 通用缺陷、NFR-006 30 分钟长跑达标、安全复审取证完成、全部改动已提交。

## 提交记录
| commit | 内容 |
|---|---|
| `ffdc01c` | G2-B 五款原版规则游戏上架 + player_forfeited 支持（187 文件，+15016/-860） |
| `2cc7b94` | perf.mjs NFR-006 长跑全局超时修复（GLOBAL_TIMEOUT_MS 动态计算） |

## 一、上架游戏（本轮）
| 游戏 | ruleset | 原版身份 |
|---|---|---|
| 奶酪大盗 | cheese_thief_classic_v1 | 《Cheese Thief》栢龙玩具 |
| 以鹅传鹅 | goose_relay_classic_v1 | 地核桌游 |
| 暗夜证词 | night_testimony_v1 | 《囚徒之夜》台湾嘴嘴出版社 |
| 铃铛对决 | bell_clash_v1 | 《Ding! 眼急脑快》HUCH |
| 伪人测试 | echo_judge_v1 | 摩点「易溶Studio」 |

平台 playable 共 10 款；uno 仍 blocked_rights；大富翁禁入。

## 二、缺陷修复

### 1. player_forfeited 缺失（reservation_sweep Invalid discriminator）
- **现象**：服务器日志 `reservation_sweep_failed: Invalid discriminator`——对局中断线玩家保留期超时，`forfeitPlayers` 投递 `player_forfeited` 系统动作，5 款新游戏模块的 discriminatedUnion schema 不含该动作 → 解析失败。
- **修复**：5 款游戏全部补齐 `player_forfeited` 支持（types + schemas + rules）：退出玩家从局内移除、关键角色（大盗/狱警/判官/头鹅）退出或人数不足时中局结束、剩余玩家获胜；invariant 在终局态放宽缩员校验。
- **验证**：gameSession.test.ts 新增集成测试「echo-judge 对局中退出能被模块处理」，直接经 `forfeitPlayers`（sweep 入口）驱动，不再抛错。

### 2. NFR-006 长跑全局超时
- **现象**：`--long-run-minutes 30` 在 20 分钟被强制终止（GLOBAL_TIMEOUT_MS 固定 20 分钟）。
- **修复**：`GLOBAL_TIMEOUT_MS` 改为长跑模式 = 长跑时长 + 5 分钟缓冲。
- **验证**：完整 30.4 分钟长跑通过（13 局）。

## 三、发布验收

### NFR-006 30 分钟长跑（参考机 = 本机）
| 指标 | 结果 | 标准 | 达标 |
|---|---|---|---|
| 时长 | 30.4 分钟（13 局连续开局/结束） | ≥30 分钟 | ✓ |
| 稳定期 RSS 增长 | **+8.47 MB** | ≤30 MB | ✓ |
| 服务端 RSS 峰值 | 99.66 MB | ≤200 MB（NFR-005） | ✓ |
| 服务端 RSS 结束 | 97.36 MB | — | — |
| CPU 平均占用 | 1.53% | — | — |
| 延迟 p50/p95/p99 | 11 / 41 / 54 ms | p95 ≤200ms | ✓ |
| 失败标准 | 全部 false，无失败原因 | — | ✓ |

结论：30 分钟重复开局/结束无内存泄漏、无崩溃，RSS 稳定。

### 性能（3 局长压测基线，D8 1a 已产出）
- 12 连接 + 8 机器人 × 3 局：服务端 RSS 结束 96.2MB（≤200 ✓）、p95 36ms。
- 本轮长跑进一步确认峰值 99.66MB，多轮压力下稳定。

### 安全复审十项（SPEC §14.1，D8 1b + 本轮新代码面取证）
| 项 | 结论 | 本轮取证 |
|---|---|---|
| 1. 输入校验 | 通过 | 5 款新游戏 schema 均 `discriminatedUnion + .strict`，非法字段拒绝 |
| 2. CORS | 通过 | 未开 CORS（同源策略生效） |
| 3. 密码哈希 | 通过 | `hashRoomPassword`（createRoom.ts:63） |
| 4. 日志脱敏 | 通过 | `redact` 过滤敏感键 |
| 5. WS 鉴权 | 通过 | 5 款新游戏 `playerMatches` 强绑定：`actor.playerId === action.playerId`（防越权操作他人座位） |
| 6. 限流 | 通过 | `#gameActionLimiter`（ws.ts:139）+ `settingsWrite`（http.ts:240）每 IP |
| 7. SQL 注入 | 通过 | 全部参数化 prepared statements |
| 8. XSS | 通过 | 客户端无 `dangerouslySetInnerHTML` |
| 9. 目录穿越 | 通过 | 路径白名单校验 |
| 10. 错误泄漏 | 通过 | 外部错误脱敏 |

> 注：Mimosa 提交门禁提示「扫描未得完整结论（scanner_enobufs）」，按兼容策略放行；建议尽快重跑完整安全审计（mimosa 工具）。

## 四、质量门
typecheck ✓ · lint ✓ · test 68/68 ✓（新增 5 款 119 项 + gameSession 10 项）· compliance:d1 PASS · build ✓ · 全量 E2E 22/23（唯一失败为既有 undercover-blank 全量时序 flaky，单独重跑 4/4 全绿）

## 五、平台状态
- **playable 10 款**：undercover / landlord / werewolf / durian / loveletter / cheese-thief / goose-relay / night-testimony / bell-clash / echo-judge
- **blocked_rights 1 款**：uno（权利证据未完成，另行解封）
- **禁入**：大富翁、骗子酒馆

## 遗留/建议
1. Mimosa 完整安全审计重跑（提交门禁提示）。
2. 全量 E2E 的 undercover-blank 时序 flaky 优化（既有，非本轮引入）。
3. 伪人测试高分/团队模式扩展（原版三模式另两个）。
4. Termux ARM64 真机部署 PoC（D 系列遗留）。
