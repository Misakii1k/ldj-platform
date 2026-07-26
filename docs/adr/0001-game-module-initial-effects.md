# ADR-0001：GameModule 初始化返回持久化 effects

- 状态：已接受
- 日期：2026-07-26
- 影响版本：协议/运行时 R1，`@lan-party/shared` 0.2.0-alpha.2

## 背景

原 `GameModule.createInitialState()` 只返回游戏状态。谁是卧底进入
`word_reveal` 时必须同时创建 30 秒服务端计时器；如果模块只能返回状态，
通用运行时无法知道计时器动作，若在核心层识别具体游戏又会破坏模块边界。

把截止时间写入状态但不产生 `schedule_timer` effect 也不可接受：对局会在
无人确认时永久停留，恢复流程无法从标准契约重建该计时动作。

## 决策

`createInitialState()` 改为返回：

```ts
interface InitialStateResult<S> {
  readonly state: S;
  readonly effects: readonly GameEffect[];
}
```

运行时必须在创建对局的同一事务中持久化初始状态和全部初始 effects。
事务提交成功前不得确认或广播；失败时不得替换内存状态。初始计时器与后续
`reduce()` effects 使用相同的幂等 timer ID、持久化和恢复规则。

## 兼容性与迁移

- 这是 0.x 阶段的源码级破坏性变更；仓库内游戏模块必须同步迁移。
- 尚无已发布的第三方模块或持久化 R1 对局，因此不需要旧插件兼容层。
- 快照 schema 不变；该变更只影响新对局创建调用链。
- 未来如需兼容旧模块，应通过显式 adapter 和模块 API 版本判断，不能静默
  丢弃初始 effects。

## 结果

- 核心执行链继续保持游戏无关。
- 初始化和普通动作具有一致的事务、计时器与恢复语义。
- 游戏模块作者必须把初始化所需的所有外部效果显式返回并接受测试。
