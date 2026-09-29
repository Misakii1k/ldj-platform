# T06 报告：题库内容与独立审校

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T04 / T05 已通过。

---

## 1. 目标与实现概述

根据 01 §5、02 §7 与 04 §T06 要求，扩展并严格审校中文题库：
- 题库位于 `packages/games/wits-wagers/server/question-bank.zh-CN.ts`；
- 扩充至 35 道首期高质量事实题目，覆盖地理、历史、航天航空、自然科学、体育、工程、艺术等领域；
- 每题具备唯一合法 ID（如 `ww-geo-001` 等）、无歧义中文题面、正整数单位与数值答案（1..999,999,999,999）、公开发布年份、说明及权威公开参考网址；
- 所有题目均经人工审校核实并标记 `reviewed: true`；
- 在 `docs/game-library/wits-wagers/question-review.md` 建立逐条审校记录清单。

---

## 2. 改动路径

**新增**：
- `docs/game-library/wits-wagers/question-review.md`

**修改**：
- `packages/games/wits-wagers/server/question-bank.zh-CN.ts`（从 10 题扩充至 35 题精审题目）

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/games/wits-wagers/tests/questions.test.ts` | **0** | **3 tests 全部通过** |
| `npm run typecheck` | **0** | 通过 |
| `npx eslint packages/games/wits-wagers/server/question-bank.zh-CN.ts` | **0** | **0 error, 0 warning** |

---

## 4. 遗留与下一任务

- 下一张任务卡：**T07（前端组件与固定样例界面）**。
- 无常驻进程，无需清理 PID。
