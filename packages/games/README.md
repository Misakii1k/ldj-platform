# 游戏模块 D1 状态

本目录保留 `undercover`、`uno`、`landlord`、`werewolf` 的服务端模块，用于历史快照恢复和模块级回归。registry 保留模块不代表产品准入；D1 生产目录不允许使用这四款游戏新建房间。

## 冻结状态

| 模块 | D1 目录状态 | 冻结 ruleset ID | 说明 |
| --- | --- | --- | --- |
| `undercover` | `internal_prototype` | `undercover_classic_v1` | 平台经典兼容基线，不代表规则或权利审批完成 |
| `uno` | `blocked_rights` | `uno_legacy_platform_v1` | Legacy 兼容基线，不称为“标准规则” |
| `landlord` | `internal_prototype` | `landlord_legacy_platform_v1` | 仅作 D1 盘点对象，不进入 D2/D3 范围 |
| `werewolf` | `internal_prototype` | `werewolf_legacy_platform_v2` | 仅作 D1 盘点对象，不进入 D2/D3 范围 |

## 准入边界

- 当前四款游戏均不是 `playable`，默认生产建房路径必须拒绝。
- registry 继续保留模块，只服务于历史恢复和模块回归，不构成产品发布结论。
- D1 只冻结当前兼容语义，不修改游戏规则、服务端执行链或模块契约。
- 任何重新开放动作都必须经过独立的权利审批和规则审批，不得在 D1 中完成。
