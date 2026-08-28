/**
 * werewolf 驱动 v2：seed 仅房主（PC）→ 手机经 UI 输码加入并点准备 → PC 加 10 bot → 等全员就绪 → 开局。
 */
import { setupRoom } from './lib.ts';

function log(msg: string): void {
  console.log(`[wolf] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

const CONFIG = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'relaxed',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
};

const setup = await setupRoom({ gameId: 'werewolf', count: 1, config: CONFIG });
log(`房间码 ${setup.seeded.roomCode}（手机经 UI 加入并点准备）`);

// 等手机加入：快照出现 >=2 名成员
const joinedSnap = await setup.host.client
  .waitFor((e) => e.type === 'room_snapshot' && Array.isArray(e.payload.members) && e.payload.members.length >= 2, 120_000)
  .catch(() => null);
if (!joinedSnap) {
  log('120s 内未见手机加入，退出');
  process.exit(1);
}
log('手机已加入，添加机器人…');

for (let i = 0; i < 10; i += 1) {
  const kind = i < 4 ? 'llm' : 'rule';
  const ack = await setup.host.client.request('room_command', { command: 'add_bot', kind });
  if (ack.type !== 'ack') log(`add_bot ${kind} 被拒：${JSON.stringify(ack.payload).slice(0, 120)}`);
}
log('10 bot 已加（4 llm + 6 rule）。等待全员就绪（手机需点准备）…');

const readySnap = await setup.host.client
  .waitFor(
    (e) =>
      e.type === 'room_snapshot'
      && Array.isArray(e.payload.members)
      && e.payload.members.length >= 12
      && (e.payload.members as { isBot?: boolean; ready?: boolean }[]).every((m) => m.isBot === true || m.ready === true),
    180_000,
  )
  .catch(() => null);
if (!readySnap) {
  log('180s 内未全员就绪，退出');
  process.exit(1);
}
log('全员就绪，开局');
await new Promise((r) => setTimeout(r, 1200));

const startAck = await setup.host.startGame(CONFIG);
if (startAck.type !== 'ack') {
  log(`开局被拒：${JSON.stringify(startAck.payload)}`);
  process.exit(1);
}
log('已开局，bot 自动推进。监听阶段…');

for (;;) {
  const view = await setup.host.waitGameState(() => true, 240_000).then((e) => e.payload.view as Record<string, unknown>).catch(() => null);
  if (!view) {
    log('240s 无新状态，退出');
    break;
  }
  const phase = String(view.phase ?? '?');
  log(`phase=${phase}`);
  if (phase === 'game_over') {
    await new Promise((r) => setTimeout(r, 8000));
    break;
  }
}
setup.host.client.close();
process.exit(0);
