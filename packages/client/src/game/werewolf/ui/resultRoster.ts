import type { WerewolfPresentationModel } from '../presentation.ts';
import { resolveMemberAvatar } from '../../../user/avatar.ts';

type Reveal = NonNullable<WerewolfPresentationModel['reveal']>;

/** Only builds rows from the server's public end-game reveal, never private role data. */
export function buildResultRoster(reveal: Reveal, seats: WerewolfPresentationModel['seats'] = []) {
  return reveal.rows.map((row, index) => {
    const seat = row.playerId
      ? seats.find(candidate => candidate.playerId === row.playerId)
      : seats.find(candidate => candidate.name === row.name);
    const alive = row.alive ?? seat?.alive;
    return {
      ...row,
      key: row.playerId || `${row.name}-${index}`,
      seatLabel: seat?.seatLabel ?? '席位未知',
      seatOrder: Number(seat?.seatLabel.replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER,
      avatar: row.avatar ?? seat?.avatar ?? resolveMemberAvatar(null, { playerId: row.playerId || row.name }),
      status: alive === true ? 'alive' : alive === false ? 'out' : 'unknown',
      statusLabel: alive === true ? '存活' : alive === false ? '已出局' : '状态未知',
      roleKind: row.roleLabel === '狼人' ? 'wolf' : row.roleLabel === '村民' ? 'villager' : ['预言家', '女巫', '猎人', '守卫', '白痴'].includes(row.roleLabel) ? 'god' : 'unknown',
    };
  }).sort((a, b) => a.seatOrder - b.seatOrder);
}
