# UNO、斗地主、狼人杀构建准备

本文件记录三款新游戏的规则、页面和开源借鉴方向。当前策略是：先完成规则状态机和专用页面骨架，再把游戏从 `coming_soon` 切换到 `playable`。

## 总体接入原则

- 服务端权威：洗牌、身份分配、胜负结算都在服务端完成。
- 私有视图脱敏：手牌、身份、夜晚行动结果只下发给对应玩家。
- 前端按游戏拆专用页面：UNO/斗地主重点是手牌交互，狼人杀重点是身份、夜晚行动、发言和投票。
- 不直接复制开源代码：只借鉴规则拆分、状态机和界面流程，避免许可证和质量风险。

## 推荐实现顺序

1. **UNO**：卡牌规则相对独立，能先打通“手牌私有视图 + 回合制出牌 + 行动牌结算”。
2. **斗地主**：复用卡牌渲染经验，但牌型识别更复杂，应先写纯函数测试。
3. **狼人杀**：复用谁是卧底的发言/投票体验，重点新增角色、夜晚行动和阵营胜负。

## 开源参考记录

### UNO

- [guilhermebkel/uno-game](https://github.com/guilhermebkel/uno-game)：TypeScript UNO 项目，可参考牌面结构、行动牌处理。
- [danguilherme/uno](https://github.com/danguilherme/uno)：偏 UNO 规则逻辑，可参考纯函数拆分。
- [Merlin-Chest/UNO](https://github.com/Merlin-Chest/UNO)：中文网页联机 UNO，可参考移动端联机体验。

### 斗地主

- [CardsMP/cardsmp.github.io](https://github.com/CardsMP/cardsmp.github.io)：GitHub 搜索到的 TypeScript + Vite + Express + Socket.IO 斗地主项目，可参考实时多人牌局结构。

### 狼人杀

- [xiong35/werewolf](https://github.com/xiong35/werewolf)：中文线下狼人杀网页，可参考无上帝流程。
- [liziye627-design/hxlr](https://github.com/liziye627-design/hxlr)：React + TypeScript + Socket.IO 多人社交推理游戏平台，可参考房间与多人体验。
- [nshun/react-werewolf](https://github.com/nshun/react-werewolf)：React 狼人杀项目，可参考基础页面拆分。

## 已落地到代码的准备项

- `packages/games/uno`：UNO 模块骨架、manifest、占位状态、基础测试。
- `packages/games/landlord`：斗地主模块骨架、manifest、占位状态、基础测试。
- `packages/games/werewolf`：狼人杀模块骨架、manifest、占位状态、基础测试。
- `packages/shared/src/game/preparation.ts`：三款游戏的规则阶段、动作、页面组件、开源参考和里程碑。
- `packages/client/src/game/preparation/GamePreparationPreview.tsx`：前端准备预览组件，可后续挂到首页或开发者入口。

## 下一步可执行任务

1. 先做 UNO：实现牌堆、手牌、弃牌堆、可出牌判断、跳过/反转/+2/万能牌。
2. 为 UNO 接入 `GamePage` 分流：根据 `game.view.gameId` 渲染 UNO 专用页面。
3. 做斗地主牌型识别库：只写纯函数和测试，不急着接 UI。
4. 做狼人杀 MVP 角色表：6-8 人局角色配置、夜晚行动顺序、胜负条件。
