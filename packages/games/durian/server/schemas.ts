import type { DurianAction, DurianConfig, OrderCard } from './types.ts';
import { DURIAN_FRUITS, type DurianFruit, type StaffEvent } from './types.ts';

const EVENTS: readonly StaffEvent[] = ['double_check', 'extra_basket', 'mixed_crate'];

function object(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error(`${label} 必须是对象`);
  return input as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 字段无效`);
  }
}

function playerId(input: unknown): string {
  if (typeof input !== 'string' || input.length < 1 || input.length > 64) throw new Error('玩家 ID 无效');
  return input;
}

function fruit(input: unknown): DurianFruit {
  if (typeof input !== 'string' || !DURIAN_FRUITS.includes(input as DurianFruit)) throw new Error('水果无效');
  return input as DurianFruit;
}

function parseOrderCard(input: unknown): OrderCard {
  const value = object(input, '订单');
  exactKeys(value, ['id', 'options', 'staffEvent'], '订单');
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 64) throw new Error('订单 ID 无效');
  if (!Array.isArray(value.options) || value.options.length !== 2) throw new Error('订单必须有两个选项');
  const options = value.options.map((entry) => {
    const option = object(entry, '订单选项');
    exactKeys(option, ['fruit', 'quantity'], '订单选项');
    if (option.quantity !== 1 && option.quantity !== 2) throw new Error('订单数量无效');
    return { fruit: fruit(option.fruit), quantity: option.quantity };
  }) as [OrderCard['options'][0], OrderCard['options'][1]];
  if (typeof value.staffEvent !== 'string' || !EVENTS.includes(value.staffEvent as StaffEvent)) throw new Error('店员事件无效');
  return { id: value.id, options, staffEvent: value.staffEvent as StaffEvent };
}

export function parseDurianConfig(input: unknown): DurianConfig {
  if (input === undefined) return {};
  const value = object(input, '配置');
  if (Object.keys(value).some((key) => key !== 'rulesetId' && key !== 'orderDeck')) throw new Error('配置 字段无效');
  if (value.rulesetId !== undefined && value.rulesetId !== 'durian_orchard_v1') throw new Error('规则集无效');
  if (value.orderDeck === undefined) return value.rulesetId === undefined ? {} : { rulesetId: value.rulesetId };
  if (!Array.isArray(value.orderDeck) || value.orderDeck.length === 0) throw new Error('订单牌堆不能为空');
  const orderDeck = value.orderDeck.map(parseOrderCard);
  if (new Set(orderDeck.map((card) => card.id)).size !== orderDeck.length) throw new Error('订单 ID 重复');
  return { ...(value.rulesetId === undefined ? {} : { rulesetId: value.rulesetId }), orderDeck };
}

export function parseDurianAction(input: unknown): DurianAction {
  const value = object(input, '动作');
  if (value.type === 'submit_order') {
    exactKeys(value, ['type', 'playerId', 'optionIndex'], '动作');
    if (value.optionIndex !== 0 && value.optionIndex !== 1) throw new Error('订单选项无效');
    return { type: value.type, playerId: playerId(value.playerId), optionIndex: value.optionIndex };
  }
  if (value.type === 'ring_bell' || value.type === 'resolve_bell' || value.type === 'close_bell') {
    exactKeys(value, ['type', 'playerId'], '动作');
    return { type: value.type, playerId: playerId(value.playerId) };
  }
  throw new Error('动作类型无效');
}
