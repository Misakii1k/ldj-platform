import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../src/game/catalog.ts';
import { buildGameStatePayload } from '../../server/src/core/game/views.ts';
import { openDb, closeDb, type Db } from '../../server/src/persistence/db.ts';
import { migrate } from '../../server/src/persistence/migrator.ts';
import { applyRoomCommand } from '../../server/src/core/commands/roomCommand.ts';
import { RoomCommandExecutor } from '../../server/src/core/executor.ts';
import { seedRoom } from '../../server/tests/helpers/seedRoom.ts';
import { parseGameStatePayload } from '../../client/src/game/types.ts';
import { parseGameView } from '../../client/src/game/viewRegistry.ts';
import { buildModuleConfig, buildSetupConfig } from '../../client/src/shared-ui/setupState.ts';
import { BotRunner } from '../../server/src/core/game/botRunner.ts';
import { createLogger } from '../../server/src/boot/logger.ts';
import { getActiveSession } from '../../server/src/core/game/session.ts';
import { consumeDueTimer } from '../../server/src/core/game/timerRunner.ts';

const silentLogger = createLogger('error', {}, () => {});

function validateAllViews(db: Db, roomId: string, label: string) {
  const members = db.prepare('SELECT player_id FROM room_members WHERE room_id = ?').all(roomId) as { player_id: string }[];
  for (const { player_id: pid } of members) {
    const rawPayload = buildGameStatePayload(db, roomId, pid);
    assert.ok(rawPayload, `[${label}] buildGameStatePayload returned null for player ${pid}`);
    const parsedEnvelope = parseGameStatePayload(rawPayload);
    assert.ok(parsedEnvelope, `[${label}] parseGameStatePayload returned null for player ${pid}`);
    const parsedView = parseGameView(parsedEnvelope);
    assert.ok(parsedView.ok, `[${label}] parseGameView failed for player ${pid}! Payload: ${JSON.stringify(rawPayload)}`);
  }
  const specPayload = buildGameStatePayload(db, roomId, null);
  assert.ok(specPayload, `[${label}] buildGameStatePayload returned null for spectator`);
  const specEnvelope = parseGameStatePayload(specPayload);
  assert.ok(specEnvelope, `[${label}] parseGameStatePayload returned null for spectator`);
  const specView = parseGameView(specEnvelope);
  assert.ok(specView.ok, `[${label}] parseGameView failed for spectator! Payload: ${JSON.stringify(specPayload)}`);
}

const playableGames = GAME_CATALOG.filter((g) => g.availability === 'playable');

for (const game of playableGames) {
  for (const ruleset of game.rulesets) {
    test(`Progression View Audit: ${game.id} (${ruleset.id})`, async () => {
      const db = openDb({ path: ':memory:' });
      migrate(db);
      try {
        const executor = new RoomCommandExecutor(db);
        const initialClientSetup = { ...buildSetupConfig(game.setup), rulesetId: ruleset.id };
        const clientGameConfig = buildModuleConfig(game.setup, initialClientSetup);

        const seeded = seedRoom(db, { gameId: game.id, ready: true, config: { gameConfig: clientGameConfig } });
        const { roomId, hostId } = seeded;

        for (let i = 2; i <= game.minPlayers; i += 1) {
          await executor.executeOnRoom({
            roomId,
            actorScope: `conn:addbot-${i}`,
            requestId: `req-addbot-${i}`,
            handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'add_bot', kind: 'rule' }, {}),
          });
        }

        await executor.executeOnRoom({
          roomId,
          actorScope: 'conn:host-start',
          requestId: 'req-start-game',
          handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'start_game', gameConfig: clientGameConfig }, {}),
        });

        validateAllViews(db, roomId, `${game.id}:${ruleset.id} [start]`);

        const runner = new BotRunner({
          db,
          executor,
          logger: silentLogger,
          thinkDelayMs: 0,
          onOutcome: () => {},
        });

        // Run bot steps and validate views at each step
        for (let step = 0; step < 50; step += 1) {
          const session = getActiveSession(db, roomId);
          if (!session) break;

          await runner.triggerAndWait(roomId);
          validateAllViews(db, roomId, `${game.id}:${ruleset.id} [step ${step} post-bot]`);

          // Advance timers if any
          const timer = db.prepare(
            `SELECT * FROM timers WHERE session_id = ? AND status = 'pending' ORDER BY deadline_at ASC LIMIT 1`,
          ).get(session.id) as { timer_id: string; deadline_at: number } | undefined;
          if (timer) {
            db.prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = ?`).run(Date.now() - 1000, session.id, timer.timer_id);
            await executor.executeOnRoom({
              roomId,
              actorScope: `timer:${timer.timer_id}`,
              requestId: `timer-${Date.now()}`,
              handler: (tx) => consumeDueTimer(tx, session.id, timer.timer_id),
            });
            validateAllViews(db, roomId, `${game.id}:${ruleset.id} [step ${step} post-timer]`);
          }
        }
      } finally {
        closeDb(db);
      }
    });
  }
}
