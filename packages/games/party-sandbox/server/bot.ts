import type { PartySandboxAction, PartySandboxPlayerView } from './types.ts';

export function decidePartySandboxBotAction(
  view: PartySandboxPlayerView,
  me: string | null,
): PartySandboxAction | null {
  if (!me || !view.players.includes(me)) return null;

  // 如果有铃铛且尚未有人拍，Bot 可拍铃
  const bell = Object.values(view.props).find((p) => p.kind === 'bell');
  if (bell && bell.kind === 'bell' && bell.rungBy === null) {
    return {
      type: 'operate_bell',
      playerId: me,
      propId: bell.id,
      subAction: 'ring',
    };
  }

  // 如果有骰子且从未掷过，Bot 可掷骰
  const dice = Object.values(view.props).find((p) => p.kind === 'dice');
  if (dice && dice.kind === 'dice' && dice.lastRollBy === null) {
    return {
      type: 'operate_dice',
      playerId: me,
      propId: dice.id,
      subAction: 'roll',
    };
  }

  return null;
}
