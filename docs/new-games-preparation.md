# UNO、斗地主、狼人杀 D1 盘点状态

本文件记录 D1 规则与合规基线下的当前状态，不再将 UNO、斗地主、狼人杀称为已 `playable`。服务端 registry 中保留模块，仅用于历史快照恢复和模块级回归，不等于产品准入。

## D1 冻结结论

| 游戏 | D1 目录状态 | 冻结 ruleset ID | D2/D3 范围 |
| --- | --- | --- | --- |
| UNO | `blocked_rights` | `uno_legacy_platform_v1` | UNO 兼容基线可供后续独立阶段评估 |
| 斗地主 | `internal_prototype` | `landlord_legacy_platform_v1` | 不进入 D2/D3 |
| 狼人杀 | `internal_prototype` | `werewolf_legacy_platform_v2` | 不进入 D2/D3 |

《谁是卧底》另冻结为 `undercover_classic_v1` 平台兼容基线，目录状态为 `internal_prototype`。

## 当前实现盘点

### UNO

- 当前模块实现牌堆、手牌私有视图、出牌、摸牌、UNO 声明和行动牌流程。
- D1 仅将现有行为冻结为 `uno_legacy_platform_v1` Legacy 兼容基线，不宣称“标准规则”。
- 权利证据尚未完成，因此产品目录状态为 `blocked_rights`。

### 斗地主

- 当前模块实现三人发牌、叫地主、牌型识别与比较、出牌、过牌和结算流程。
- D1 冻结 ruleset ID 为 `landlord_legacy_platform_v1`，状态为 `internal_prototype`。
- 本模块不进入 D2/D3 范围。

### 狼人杀

- 当前模块保留 v2 状态机、夜晚行动、白天发言、投票、遗言、胜负和私有视图能力。
- D1 冻结 ruleset ID 为 `werewolf_legacy_platform_v2`，状态为 `internal_prototype`。
- 本模块不进入 D2/D3 范围。

## 准入边界

- 当前四个 registry 模块均不能通过默认生产路径新建房间。
- D1 不修改游戏规则、模块契约、数据库 schema 或服务端执行链，也不增加任何准入旁路。
- 模块测试通过、registry 可发现或历史恢复可用，都不能替代产品准入。
- 任何游戏重新开放都必须经过独立的权利审批和规则审批，不得在 D1 中完成。

## D7-C 新增：Durian 与情书

- `durian`（Durian：榴莲店长）：原创水果卡牌经营——28 张库存、36 张订单、先到先得按铃、超卖判定、怒气 1→7、处罚最低者胜。规则资料 `docs/game-library/桌游平台游戏库资料/08_Durian`；准入 `internal-admission-d7-2026-08-09-d01`。
- `loveletter`（情书：密函心意）：经典 16 张（守卫×5 牧师×2 男爵×2 侍女×2 王子×2 国王×1 伯爵夫人×1 公主×1），摸 1 打 1、伯爵夫人强制、弃公主淘汰、好感阈值 2 人 7 / 3 人 5 / 4 人 4。规则资料 `docs/game-library/桌游平台游戏库资料/06_情书`；准入 `internal-admission-d7-2026-08-09-l01`。
