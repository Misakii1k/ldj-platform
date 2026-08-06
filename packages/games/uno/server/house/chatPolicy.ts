/**
 * uno_platform_house_v1 — 聊天策略（服务端执行）。
 * 团队模式：对局内禁止玩家/观战者发送自由文本，仅系统消息保留。
 */
export const unoHouseChatPolicy = {
  rulesetId: 'uno_platform_house_v1' as const,
  /** 团队模式禁止策略交流（队友手牌隐藏 + 对局内禁聊）。 */
  teamMode: 'no_free_chat' as const,
  /** 团队对局期间观战者聊天同样阻断（观战内容对玩家可见会构成间接交流）。 */
  spectatorChatDuringTeamGame: 'blocked' as const,
} as const;
