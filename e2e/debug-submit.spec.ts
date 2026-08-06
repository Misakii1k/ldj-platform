/**
 * TEMP DEBUG（用完即删）：纯 Node WS 终局猜词提交 → 判定本地精确匹配。
 */
import { test, expect } from '@playwright/test';
import { blankModule } from '../packages/games/undercover/server/blank/module.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { seedActiveSession } from './support/sessionSeeder.ts';
import { DB_PATH, WS_URL } from './helpers/serverEnv.ts';

test('debug: submit exact word via Node WS', async () => {
  let target: ReturnType<typeof seedActiveSession> | null = null;
  for (let i = 0; i < 12; i += 1) {
    const s = seedActiveSession(DB_PATH, { module: blankModule, count: 4, config: { speechSeconds: 30, voteSeconds: 30 } });
    const st = s.state as { players: Record<string, { role: string }> };
    if (st.players[s.players[1]!.playerId]?.role === 'blank') { target = s; break; }
  }
  expect(target).not.toBeNull();
  const seeded = target!;
  const blankId = seeded.players[1]!.playerId;
  const word = (seeded.state as { civilianWord: string }).civilianWord;
  console.log('[DBG] room', seeded.roomCode, 'word', word);

  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const civ2 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[2]!.playerId, seeded.players[2]!.resumeToken);
  const civ3 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[3]!.playerId, seeded.players[3]!.resumeToken);
  const blank = await RoomDriver.resume(WS_URL, seeded.roomCode, blankId, seeded.players[1]!.resumeToken);
  const civilians = [host, civ2, civ3];

  for (const c of civilians) {
    const a = await c.gameAction({ type: 'confirm_word' });
    console.log('[DBG] confirm', c.playerId.slice(0, 6), a.type, a.payload.code ?? '');
  }
  const ba = await blank.gameAction({ type: 'confirm_word' });
  console.log('[DBG] confirm blank', ba.type, ba.payload.code ?? '');
  await host.waitGameState((v) => v.phase === 'speaking', 20000);
  while (true) {
    const frame = await host.waitGameState((v) => ['speaking', 'voting', 'runoff_voting'].includes(v.phase as string), 20000);
    const view = frame.payload.view as { phase: string; currentSpeakerId?: string | null };
    if (view.phase !== 'speaking') break;
    const civ = civilians.find((c) => c.playerId === view.currentSpeakerId);
    if (civ) await civ.gameAction({ type: 'finish_speech' });
    else if (view.currentSpeakerId === blankId) await blank.gameAction({ type: 'finish_speech' });
  }
  for (const c of civilians) await c.gameAction({ type: 'cast_vote', targetPlayerId: blankId });
  await blank.gameAction({ type: 'cast_vote', targetPlayerId: host.playerId });
  await host.waitGameState((v) => v.phase === 'final_guess', 20000);
  console.log('[DBG] final_guess reached');
  const ack = await blank.gameAction({ type: 'submit_final_guess', guess: word });
  console.log('[DBG] submit ack:', ack.type, JSON.stringify(ack.payload).slice(0, 100));
  const over = await host.waitGameState((v) => v.phase === 'game_over', 25000);
  console.log('[DBG] winner:', (over.payload.view as { winner?: string }).winner, 'guessPending:', (over.payload.view as { guessPending?: boolean }).guessPending);
  host.client.close(); civ2.client.close(); civ3.client.close(); blank.client.close();
  expect((over.payload.view as { winner?: string }).winner).toBe('blank');
});
