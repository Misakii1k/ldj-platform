/**
 * loveletter 驱动：seed 2 席（席位1 PC 驱动 / 席位2 手机注入）。PC 席每回合自动打第一张牌。
 */
import { setupRoom } from './lib.ts';

function log(m: string): void {
  console.log(`[love] ${new Date().toISOString().slice(11, 19)} ${m}`);
}

const setup = await setupRoom({ gameId: 'loveletter', count: 2, config: { rulesetId: 'loveletter_classic16_v1' } });
const phone = setup.seeded.players[1]!;
log(`房间码 ${setup.seeded.roomCode}`);
log(`手机注入: npx tsx scripts/emulator-audit/inject.ts ${setup.seeded.roomCode} ${phone.playerId} ${phone.resumeToken} 星际旅人`);
await new Promise((r) => setTimeout(r, 9000));

const startAck = await setup.host.startGame({ rulesetId: 'loveletter_classic16_v1' });
log(startAck.type === 'ack' ? '已开局' : `开局拒:${JSON.stringify(startAck.payload).slice(0, 120)}`);

const hostId = setup.host.playerId;
const otherId = phone.playerId;

for (;;) {
  const view = await setup.host.waitGameState(() => true, 120_000).then((e) => e.payload.view as Record<string, unknown>).catch(() => null);
  if (!view) { log('timeout'); break; }
  const phase = String(view.phase ?? '?');
  if (phase === 'game_over') { log('game_over'); await new Promise((r) => setTimeout(r, 8000)); break; }
  const cur = String(view.currentPlayerId ?? '');
  if (cur !== hostId) continue;
  const me = view.me as { hand?: { id: string; value: number; role?: string }[] } | null;
  const hand = me?.hand ?? [];
  if (hand.length === 0) continue;
  let played = false;
  for (const card of hand) {
    for (const guess of ['公主', '侍女', '男爵']) {
      const ack = await setup.host.gameAction({ type: 'play_card', playerId: hostId, cardId: card.id, targetPlayerId: otherId, guessedRole: guess }).catch(() => null);
      if (ack && ack.type === 'ack') { played = true; break; }
      const ack2 = await setup.host.gameAction({ type: 'play_card', playerId: hostId, cardId: card.id }).catch(() => null);
      if (ack2 && ack2.type === 'ack') { played = true; break; }
    }
    if (played) break;
  }
  log(played ? 'played' : 'could-not-play');
}
setup.host.client.close();
process.exit(0);
