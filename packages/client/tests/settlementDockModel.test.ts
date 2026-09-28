import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSettlementDockModel,
  type SettlementDockPlayer,
} from '../src/game/settlementDockModel.ts';

const pMe: SettlementDockPlayer = {
  playerId: 'p1',
  nickname: '我',
  ready: false,
  isMe: true,
  isHost: false,
};
const pHost: SettlementDockPlayer = {
  playerId: 'p2',
  nickname: '老周',
  ready: true,
  isMe: false,
  isHost: true,
};
const p3: SettlementDockPlayer = {
  playerId: 'p3',
  nickname: '阿May',
  ready: true,
  isMe: false,
  isHost: false,
};
const p4: SettlementDockPlayer = {
  playerId: 'p4',
  nickname: '豆豆',
  ready: false,
  isMe: false,
  isHost: false,
};

test('settlementDockModel: handles row 1 - unready non-spectator', () => {
  const res = computeSettlementDockModel({
    players: [pMe, pHost, p3, p4],
    isHost: false,
    isSpectator: false,
    meReady: false,
    allReady: false,
    isWerewolf: false,
    countdown: null,
  });
  assert.equal(res.statusLine, '对局结束 · 再来一局？');
  assert.equal(res.primary, 'again');
  assert.equal(res.secondary, 'none');
  assert.equal(res.readyCount, 2);
  assert.equal(res.totalCount, 4);
});

test('settlementDockModel: handles row 2 - me ready, waiting for 1 other', () => {
  const meReadyPlayer = { ...pMe, ready: true };
  const res = computeSettlementDockModel({
    players: [meReadyPlayer, pHost, p3, p4], // p4 is the only unready one
    isHost: false,
    isSpectator: false,
    meReady: true,
    allReady: false,
    isWerewolf: false,
    countdown: null,
  });
  assert.equal(res.statusLine, '就等 豆豆 了');
  assert.equal(res.primary, 'none');
  assert.equal(res.secondary, 'readyCancel');
});

test('settlementDockModel: handles me ready, waiting for multiple others', () => {
  const meReadyPlayer = { ...pMe, ready: true };
  const p3Unready = { ...p3, ready: false };
  const res = computeSettlementDockModel({
    players: [meReadyPlayer, pHost, p3Unready, p4],
    isHost: false,
    isSpectator: false,
    meReady: true,
    allReady: false,
    isWerewolf: false,
    countdown: null,
  });
  assert.equal(res.statusLine, '还在等 2 人');
  assert.equal(res.primary, 'none');
  assert.equal(res.secondary, 'readyCancel');
});

test('settlementDockModel: handles row 3 - countdown for host', () => {
  const res = computeSettlementDockModel({
    players: [pMe, pHost, p3, p4],
    isHost: true,
    isSpectator: false,
    meReady: true,
    allReady: true,
    isWerewolf: false,
    countdown: 3,
  });
  assert.equal(res.statusLine, '全员就绪 · 即将开局');
  assert.equal(res.primary, 'start');
  assert.equal(res.secondary, 'cancelReady');
});

test('settlementDockModel: handles row 4 - countdown for non-host', () => {
  const res = computeSettlementDockModel({
    players: [pMe, pHost, p3, p4],
    isHost: false,
    isSpectator: false,
    meReady: true,
    allReady: true,
    isWerewolf: false,
    countdown: 2,
  });
  assert.equal(res.statusLine, '全员就绪 · 即将开局');
  assert.equal(res.primary, 'none');
  assert.equal(res.secondary, 'cancelReady');
});

test('settlementDockModel: handles row 5 - werewolf all ready for host', () => {
  const res = computeSettlementDockModel({
    players: [pMe, pHost, p3, p4],
    isHost: true,
    isSpectator: false,
    meReady: true,
    allReady: true,
    isWerewolf: true,
    countdown: null,
  });
  assert.equal(res.statusLine, '全员就绪 · 复盘完了就开');
  assert.equal(res.primary, 'start');
  assert.equal(res.secondary, 'none');
});

test('settlementDockModel: handles row 6 - werewolf all ready for non-host', () => {
  const res = computeSettlementDockModel({
    players: [pMe, pHost, p3, p4],
    isHost: false,
    isSpectator: false,
    meReady: true,
    allReady: true,
    isWerewolf: true,
    countdown: null,
  });
  assert.equal(res.statusLine, '全员就绪 · 等房主开局');
  assert.equal(res.primary, 'none');
  assert.equal(res.secondary, 'cancelReady');
});

test('settlementDockModel: handles row 7 - spectator', () => {
  const res = computeSettlementDockModel({
    players: [pMe, pHost, p3, p4],
    isHost: false,
    isSpectator: true,
    meReady: false,
    allReady: false,
    isWerewolf: false,
    countdown: null,
  });
  assert.equal(res.statusLine, '观战中 · 等玩家准备');
  assert.equal(res.primary, 'none');
  assert.equal(res.secondary, 'none');
});
