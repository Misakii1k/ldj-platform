import { LOVELETTER_ROLES, type LoveLetterAction, type LoveLetterCard, type LoveLetterConfig, type LoveLetterRole } from './types.ts';

const ROLE_VALUES: Record<LoveLetterRole, LoveLetterCard['value']> = {
  guard: 1, priest: 2, baron: 3, handmaid: 4, prince: 5, king: 6, countess: 7, princess: 8,
};

function object(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error(`${label} 必须是对象`);
  return input as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !(key in value))) {
    throw new Error(`${label} 字段无效`);
  }
}

function playerId(input: unknown): string {
  if (typeof input !== 'string' || input.length < 1 || input.length > 64) throw new Error('玩家 ID 无效');
  return input;
}

function role(input: unknown): LoveLetterRole {
  if (typeof input !== 'string' || !LOVELETTER_ROLES.includes(input as LoveLetterRole)) throw new Error('角色无效');
  return input as LoveLetterRole;
}

function card(input: unknown): LoveLetterCard {
  const value = object(input, '角色牌');
  exactKeys(value, ['id', 'role', 'value'], ['id', 'role', 'value'], '角色牌');
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 64) throw new Error('角色牌 ID 无效');
  const parsedRole = role(value.role);
  if (value.value !== ROLE_VALUES[parsedRole]) throw new Error('角色牌点数无效');
  return { id: value.id, role: parsedRole, value: ROLE_VALUES[parsedRole] };
}

function deck(input: unknown): LoveLetterCard[] {
  if (!Array.isArray(input) || input.length !== 16) throw new Error('牌序必须包含 16 张牌');
  const cards = input.map(card);
  if (new Set(cards.map((entry) => entry.id)).size !== cards.length) throw new Error('角色牌 ID 重复');
  return cards;
}

export function parseLoveLetterConfig(input: unknown): LoveLetterConfig {
  if (input === undefined) return {};
  const value = object(input, '配置');
  exactKeys(value, ['rulesetId', 'deckOrder', 'futureDeckOrders'], [], '配置');
  if (value.rulesetId !== undefined && value.rulesetId !== 'loveletter_classic16_v1') throw new Error('规则集无效');
  const deckOrder = value.deckOrder === undefined ? undefined : deck(value.deckOrder);
  let futureDeckOrders: LoveLetterCard[][] | undefined;
  if (value.futureDeckOrders !== undefined) {
    if (!Array.isArray(value.futureDeckOrders)) throw new Error('后续牌序无效');
    futureDeckOrders = value.futureDeckOrders.map(deck);
  }
  return {
    ...(value.rulesetId === undefined ? {} : { rulesetId: value.rulesetId }),
    ...(deckOrder ? { deckOrder } : {}),
    ...(futureDeckOrders ? { futureDeckOrders } : {}),
  };
}

export function parseLoveLetterAction(input: unknown): LoveLetterAction {
  const value = object(input, '动作');
  exactKeys(value, ['type', 'playerId', 'cardId', 'targetPlayerId', 'guessedRole'], ['type', 'playerId', 'cardId'], '动作');
  if (value.type !== 'play_card') throw new Error('动作类型无效');
  if (typeof value.cardId !== 'string' || value.cardId.length < 1 || value.cardId.length > 64) throw new Error('角色牌 ID 无效');
  return {
    type: value.type,
    playerId: playerId(value.playerId),
    cardId: value.cardId,
    ...(value.targetPlayerId === undefined ? {} : { targetPlayerId: playerId(value.targetPlayerId) }),
    ...(value.guessedRole === undefined ? {} : { guessedRole: role(value.guessedRole) }),
  };
}
