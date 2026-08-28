/**
 * 通用 bot 局驱动：seed 仅房主（PC）→ 手机经 UI 加入并点准备 → PC 加 bot → 全员就绪 → 开局。
 * 用法：npx tsx scripts/emulator-audit/botgame-drive.ts --game uno --bots 3 --config '{"rulesetId":"uno_classic_v1"}' [--tag uno]
 * bot 由服务端规则引擎自动行动；手机作为被验收端。
 */
import { setupRoom } from './lib.ts';

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def ?? '') : (def ?? '');
}

const gameId = arg('game', 'uno');
const botCount = Number(arg('bots', '3'));
const config = JSON.parse(arg('config', '{}')) as Record<string, unknown>;
const tag = arg('tag', gameId);

function log(msg: string): void {
  console.log(`[${tag}] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

const setup = await setupRoom({ gameId, count: 1, config });
log(`房间码 ${setup.seeded.roomCode}（手机经 UI 加入并点准备）`);

const joinedSnap = await setup.host.client
  .waitFor((e) => e.type === 'room_snapshot' && Array.isArray(e.payload.members) && e.payload.members.length >= 2, 120_000)
  .catch(() => null);
if (!joinedSnap) {
  log('120s 内未见手机加入，退出');
  process.exit(1);
}
log('手机已加入，添加机器人…');

for (let i = 0; i < botCount; i += 1) {
  const ack = await setup.host.client.request('room_command', { command: 'add_bot', kind: 'rule' });
  if (ack.type !== 'ack') log(`add_bot 被拒：${JSON.stringify(ack.payload).slice(0, 120)}`);
}
log(`${botCount} bot 已加。等待全员就绪…`);

const readySnap = await setup.host.client
  .waitFor(
    (e) =>
      e.type === 'room_snapshot'
      && Array.isArray(e.payload.members)
      && e.payload.members.length >= botCount + 2
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

const startAck = await setup.host.startGame(config);
if (startAck.type !== 'ack') {
  log(`开局被拒：${JSON.stringify(startAck.payload)}`);
  process.exit(1);
}
log('已开局。监听 240s 或 game_over…');

for (;;) {
  const view = await setup.host.waitGameState(() => true, 240_000).then((e) => e.payload.view as Record<string, unknown>).catch(() => null);
  if (!view) {
    log('240s 无新状态，退出');
    break;
  }
  const phase = String(view.phase ?? '?');
  log(`phase=${phase}`);
  if (phase === 'game_over' || phase === 'match_over') {
    await new Promise((r) => setTimeout(r, 8000));
    break;
  }
}
setup.host.client.close();
process.exit(0);
