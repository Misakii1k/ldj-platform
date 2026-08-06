/**
 * D4-T：版本化封闭能力枚举。
 * 能力是每 ruleset 封闭的版本化枚举；未知能力按契约错误处理。
 * 能力只描述"当前能做什么"，不暴露完整规则状态。
 * 各 ruleset 的投影器只输出本集合中的能力 ID。
 */
export const TABLETOP_CAPABILITY_IDS = [
  'canPlayCard',
  'canDraw',
  'canPassAfterDraw',
  'canCallUno',
  'canCatchMissedUno',
  'canStackPenalty',
  'canChallenge',
  'canAcceptPenalty',
  'canConfirmWord',
  'canSpeak',
  'canFinishSpeech',
  'canVote',
  'canGuessWord',
  'canSkipFinalGuess',
  'canAcknowledge',
] as const;
export type TabletopCapabilityId = (typeof TABLETOP_CAPABILITY_IDS)[number];

const ID_SET: ReadonlySet<string> = new Set<string>(TABLETOP_CAPABILITY_IDS);

/** 未知能力 ID 属于契约错误：返回 false，调用方按失败关闭处理。 */
export function isKnownTabletopCapability(id: string): boolean {
  return ID_SET.has(id);
}
