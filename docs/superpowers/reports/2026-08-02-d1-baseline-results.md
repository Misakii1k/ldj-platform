# D1 基线执行结果

## 环境

| 项目 | 结果 |
| --- | --- |
| 日期 | 2026-08-02 |
| HEAD | 21dd000be06486a3dd183990eca2f26eea457ad9 |
| Node | v24.13.1 |
| npm | 11.8.0 |

## 改动前质量门

| 命令 | 退出码 | 结果摘要 |
| --- | ---: | --- |
| npm run typecheck | 2 | packages/server/tests/llmModelCatalog.test.ts(28,18): error TS18046: 'error' is of type 'unknown'. |
| npm run lint | 1 | ✖ 3 problems (3 errors, 0 warnings) |
| npm run test | 1 |   'test failed' |
| npm run build | 0 | ✓ built in 8.94s |

## 固定基线

| 规则集 | 动作数 | 视角时间点 | 随机游标 | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `uno_legacy_platform_v1` | 46 | 47 | 138 | `e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6` |
| `undercover_classic_v1` | 40 | 41 | 8 | `38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68` |

两次连续执行 `npm run baseline:d1` 后，两份 fixture 的 SHA-256 均保持一致。两个基线测试会由当前模块现场重新生成完整对局并深比较 fixture，同时逐步检查玩家与观战视角的私人信息隔离。

## Task 6 禁止范围归因

本仓库在 D1 Task 6 开始前已混合多个独立工作流。原计划命令 `git diff --name-only HEAD` 会把所有未提交主题都归入 D1，因此不能单独证明 Task 6 是否越界。开始 Task 6 前记录到以下既有命中：

- tracked：`packages/games/landlord/server/module.ts`
- tracked：`packages/games/uno/server/module.ts`
- tracked：`packages/games/werewolf/server/module.ts`
- tracked：`packages/server/src/core/game/session.ts`
- tracked：`packages/server/src/persistence/migrations.ts`
- untracked：`packages/shared/src/game/rules/` 下 9 个 D2 规则原语文件

Task 6 完成后逐文件复核内容哈希，以下禁止路径全部与 Task 6 开始时一致：

| 路径 | Task 6 前后内容哈希 |
| --- | --- |
| `packages/shared/src/game/contract.ts` | `2ec25dac60e6654a7babee470e86fce513a119f4` |
| `packages/server/src/core/game/session.ts` | `fb2612a4e698915738a57e0067abcb1a4b6364b3` |
| `packages/server/src/core/executor.ts` | `7db746f38c20f13aabd981b4f68ec4c91323c993` |
| `packages/games/undercover/server/module.ts` | `042fc5d7579f08b10b4f8d4deb7d90869faedd37` |
| `packages/games/uno/server/module.ts` | `d26a6537bff056f325078e02d6ff44063b3097eb` |
| `packages/games/landlord/server/module.ts` | `f63a2d788833f344ea28d1a4cb156c814ec5bbb8` |
| `packages/games/werewolf/server/module.ts` | `5acd2ad202a746bfa13e63a9b2c4eed9475ca2bb` |
| `packages/server/src/persistence/migrations.ts` | `3d510ded30b623822aebddae1f53fb07afccf0ea` |
| `packages/server/src/persistence/db.ts` | `714c2e46096a48f46e0ccc6d60a2bfbd3cb47549` |
| `packages/server/src/persistence/migrator.ts` | `b36a67000983b85463e690aff76108b9711b664f` |

结论：Task 6 没有修改禁止范围；但聚合工作树仍不满足原计划“相对 HEAD 零命中”的字面条件，不能把这一条件记为通过。

## 改动后质量门

| 命令 | 退出码 | 结果摘要 |
| --- | ---: | --- |
| `npm run baseline:d1`（连续两次） | 0 | 两份 fixture 二次生成 SHA-256 一致 |
| D1 两个基线测试 | 0 | 2/2 通过，现场完整重生成并验证私人信息隔离 |
| `npm run typecheck` | 0 | 服务端与客户端 TypeScript 检查通过 |
| `npm run lint` | 0 | 全仓 ESLint 通过 |
| `npm test` | 0 | 包内测试 365/365，扫描器契约测试 4/4，总计 369/369 |
| D1 目录与准入专项测试 | 0 | 38/38；生产建房拒绝四款未准入游戏且不落脏数据 |
| `perf.smoke.test.ts` | 0 | 1/1；受准入测试夹具完成 1 局 4 人 + 2 机器人短时对局 |
| `npm run compliance:d1`（构建前） | 0 | `D1 compliance: PASS` |
| `npm run build` | 0 | Vite 1880 modules transformed，约 5.36s |
| `npm run compliance:d1`（构建后） | 0 | `D1 compliance: PASS` |
| `git diff --check HEAD` | 0 | 无空白错误 |
| 构建产物禁入标识扫描 | 0 | `packages/client/dist` 中 0 命中 |
| 交付文件凭据特征扫描 | 0 | 245 个交付文件中 0 命中 |

## D1 验收结论

- 机器可读台账与目录状态一致；四款现有游戏均不为 `playable`。
- 生产 `create_room` 保持严格准入，未加入内部游戏旁路、环境变量开关或测试后门。
- registry 保留四个模块，只用于模块回归、测试夹具和历史恢复，不代表产品准入。
- UNO 与《谁是卧底》的固定种子、完整动作轨迹、逐步玩家视角、逐步观战视角、最终状态、结果及随机游标均已冻结并可重复生成。
- 自动化质量门、构建前后合规扫描和构建产物扫描均通过。
- D1 自动化实现已完成；聚合工作树在 Task 6 前已有禁止路径变更，原计划的相对 HEAD 零命中条件无法按字面通过，相关归因继续以本报告记录的前后内容哈希为准。
- 四款游戏均没有完整权利证据，也没有权利与规则发布审批。此状态不得解释为任何游戏已获准发布，也不得据此开展 D3/D4 的产品开放工作。

## 2026-08-02 人工批准与当前 HEAD 复验

用户明确批准本报告所记录的保守 D1 基线，批准范围仅限开始内部 D2 重构：

- 接受 Task 6 前后内容哈希所支持的变更归因，同时保留历史聚合工作树无法证明“相对 HEAD 零命中”的例外。
- `undercover`、`landlord`、`werewolf` 继续为 `internal_prototype`，`uno` 继续为 `blocked_rights`；生产目录和默认建房路径不得开放。
- 本批准不构成数字改编授权、规则发布审批或任何游戏、名称、资产和行为的上线许可。
- `uno_legacy_platform_v1` 与 `undercover_classic_v1` 仍仅是迁移兼容基线；不得在 D2 中实现或开放 `uno_platform_house_v1`、`undercover_blank_v1`。
- D2 只能开展最高优先级设计允许的内部低风险原语工作；任何原语仍须按实验、候选、稳定的成熟度门逐级验证。

批准前在 clean `main` 的 `3f7f4b9f73dd56b0a81a6255a330c24f19ac8c75` 上重新执行 `npm run ci && npm run build && npm run compliance:d1`，实际结果如下：

| 命令或门 | 结果 |
| --- | --- |
| `npm run typecheck` | 退出码 0 |
| `npm run lint` | 退出码 0 |
| 包内测试 | 365/365 通过 |
| D1 扫描器契约测试 | 4/4 通过 |
| 构建前 `npm run compliance:d1` | `D1 compliance: PASS` |
| `npm run build` | 退出码 0；Vite 转换 1880 个模块，约 9.39 秒 |
| 构建后 `npm run compliance:d1` | `D1 compliance: PASS` |

因此 D1 的保守冻结基线已获内部 D2 开工批准；权利与产品发布审批继续保持阻塞。
