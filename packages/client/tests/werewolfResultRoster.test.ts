import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultRoster } from '../src/game/werewolf/ui/resultRoster.ts';
import type { WerewolfSeatModel } from '../src/game/werewolf/presentation.ts';

function seat(playerId: string, seatLabel: string, name = '同名玩家'): WerewolfSeatModel {
  return { playerId, seatLabel, name, alive: false, statusLabel: '出局', isSelf: false,
    isSpeaking: false, isWolfTeammate: false, idiotRevealed: false,
    revealedRoleLabel: null, targetActions: [], avatar: 'preset:fox' };
}

test('result roster uses player identity and numeric seat order, not ambiguous nickname matching', () => {
  const seats = [seat('a', '10 号'), seat('b', '2 号')];
  const rows = buildResultRoster({ headline: '狼人阵营获胜', rows: [
    { playerId: 'a', name: '同名玩家', roleLabel: '狼人', alive: true },
    { playerId: 'b', name: '同名玩家', roleLabel: '预言家', alive: false },
    { playerId: 'missing', name: '同名玩家', roleLabel: '村民' },
  ] }, seats);
  assert.deepEqual(rows.map(row => row.seatLabel), ['2 号', '10 号', '席位未知']);
  assert.deepEqual(rows.map(row => row.statusLabel), ['已出局', '存活', '状态未知']);
  assert.deepEqual(rows.map(row => row.roleKind), ['god', 'wolf', 'villager']);
  assert.equal(rows[1]!.alive, true);
});

test('result roster never invents public roles from hidden seats and handles empty results', () => {
  const seats = [seat('a', '1 号')];
  assert.deepEqual(buildResultRoster({ headline: '本局已中止', rows: [] }, seats), []);
  const row = buildResultRoster({ headline: '对局已结束', rows: [{ playerId: 'a', name: '玩家', roleLabel: '未知身份' }] }, seats)[0]!;
  assert.equal(row.roleLabel, '未知身份');
  assert.equal(row.roleKind, 'unknown');
  assert.equal(row.statusLabel, '已出局');
});
