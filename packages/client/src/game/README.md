# 谁是卧底游戏界面切片

`UndercoverGameScreen` 是浏览器安全、移动端优先的纯展示/交互组件。它覆盖看词、发言、普通投票、加赛投票、投票结果和游戏结束，并区分存活玩家、已淘汰玩家与观战者视角。

当前组件**没有伪造 WebSocket 集成**。后续接入 `game_state` 路由时，适配层必须：

1. 用 `parseUndercoverGameView` 严格解析服务端白名单 DTO；
2. 从房间公开快照提供 `playerDisplayNames`，不得把完整词库、随机种子或服务端状态带入客户端；
3. 将三个回调分别封装成 `confirm_word`、`finish_speech`、`lock_vote` 的 `game_action`；
4. 用已确认动作/事件维护 `interactionState.wordConfirmed` 与 `interactionState.voteLocked`，并在新阶段清空；
5. 将连接状态、重同步状态与请求 pending 状态原样传入，状态未同步时不要发送动作。

秘密词默认遮挡，仅在鼠标、触控或键盘持续按住时显示。失焦、切后台、指针取消/离开、窗口缩放和屏幕旋转都会重新遮挡。秘密内容没有写入 `aria-label` 或 `title`。

