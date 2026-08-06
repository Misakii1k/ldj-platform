export type TurnDirection = 1 | -1;

export interface TurnOptions<Participant extends string> {
  readonly direction?: TurnDirection;
  readonly isEligible?: (participant: Participant) => boolean;
}

export interface NextTurnOptions<Participant extends string> extends TurnOptions<Participant> {
  readonly steps?: number;
}

export function nextTurnParticipant<Participant extends string>(
  order: readonly Participant[],
  current: Participant,
  options: NextTurnOptions<Participant> = {},
): Participant {
  validateOrder(order);
  const currentIndex = order.indexOf(current);
  if (currentIndex < 0) throw new RangeError('当前参与者不在顺序中');

  const direction = options.direction ?? 1;
  validateDirection(direction);
  const steps = options.steps ?? 1;
  if (!Number.isSafeInteger(steps) || steps <= 0) throw new RangeError('步数必须是正安全整数');

  const eligible = eligibleParticipants(order, options.isEligible);
  if (eligible.size === 0) throw new RangeError('没有合格参与者');
  const targetSteps = ((steps - 1) % eligible.size) + 1;
  let passed = 0;
  let index = currentIndex;
  while (passed < targetSteps) {
    index = wrapIndex(index + direction, order.length);
    const participant = order[index]!;
    if (eligible.has(participant)) passed += 1;
  }
  return order[index]!;
}

export function rotateTurnOrder<Participant extends string>(
  order: readonly Participant[],
  first: Participant,
  options: TurnOptions<Participant> = {},
): Participant[] {
  validateOrder(order);
  const firstIndex = order.indexOf(first);
  if (firstIndex < 0) throw new RangeError('起始参与者不在顺序中');

  const direction = options.direction ?? 1;
  validateDirection(direction);
  const eligible = eligibleParticipants(order, options.isEligible);
  if (eligible.size === 0) throw new RangeError('没有合格参与者');
  if (!eligible.has(first)) throw new RangeError('起始参与者不在合格集合中');

  return Array.from({ length: order.length }, (_, offset) => (
    order[wrapIndex(firstIndex + offset * direction, order.length)]!
  )).filter((participant) => eligible.has(participant));
}

function validateOrder<Participant extends string>(order: readonly Participant[]): void {
  if (order.length === 0) throw new RangeError('参与者顺序不能为空');
  if (new Set(order).size !== order.length) throw new RangeError('参与者顺序不能重复');
}

function validateDirection(direction: number): asserts direction is TurnDirection {
  if (direction !== 1 && direction !== -1) throw new RangeError('方向必须是 1 或 -1');
}

function eligibleParticipants<Participant extends string>(
  order: readonly Participant[],
  isEligible: ((participant: Participant) => boolean) | undefined,
): ReadonlySet<Participant> {
  return new Set(isEligible ? order.filter(isEligible) : order);
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
