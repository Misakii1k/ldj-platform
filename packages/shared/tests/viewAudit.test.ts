import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../src/game/catalog.ts';
import { buildGameStatePayload } from '../../server/src/core/game/views.ts';
import { openDb } from '../../server/src/persistence/db.ts';
import { migrate } from '../../server/src/persistence/migrator.ts';
import { applyRoomCommand } from '../../server/src/core/commands/roomCommand.ts';
import { RoomCommandExecutor } from '../../server/src/core/executor.ts';
import { seedRoom } from '../../server/tests/helpers/seedRoom.ts';
import { parseGameView } from '../../client/src/game/viewRegistry.ts';
import { buildModuleConfig, buildSetupConfig } from '../../client/src/shared-ui/setupState.ts';

const playableGames = GAME_CATALOG.filter((g) => g.availability === 'playable');

for (const game of playableGames) {
  for (const ruleset of game.rulesets) {
    test(`Client-to-Game Full Start Test: ${game.id} (${ruleset.id})`, async () => {
      const db = openDb({ path: ':memory:' });
      migrate(db);
      const executor = new RoomCommandExecutor(db);

      // This is exactly how the client constructs the gameConfig in RoomPage.tsx
      const initialClientSetup = { ...buildSetupConfig(game.setup), rulesetId: ruleset.id };
      const clientGameConfig = buildModuleConfig(game.setup, initialClientSetup);

      const seeded = seedRoom(db, { gameId: game.id, ready: true, config: { gameConfig: clientGameConfig } });
      const { roomId, hostId } = seeded;

      // Add other players to meet minPlayers
      for (let i = 2; i <= game.minPlayers; i += 1) {
        await executor.executeOnRoom({
          roomId,
          actorScope: `conn:addbot-${i}`,
          requestId: `req-addbot-${i}`,
          handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'add_bot', kind: 'rule' }, {}),
        });
      }

      // Start game from RoomPage
      await executor.executeOnRoom({
        roomId,
        actorScope: 'conn:host-start',
        requestId: 'req-start-game',
        handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'start_game', gameConfig: clientGameConfig }, {}),
      });

      const members = db.prepare('SELECT player_id FROM room_members WHERE room_id = ?').all(roomId) as { player_id: string }[];

      // Verify each player view parses
      for (const { player_id: pid } of members) {
        const payload = buildGameStatePayload(db, roomId, pid);
        assert.ok(payload, `[${game.id}:${ruleset.id}] buildGameStatePayload returned null for player ${pid}`);

        const parsed = parseGameView(payload as any);
        if (!parsed.ok) {
          console.error(`FAIL: [${game.id}:${ruleset.id}] parseGameView failed for player ${pid}! Payload:`, JSON.stringify(payload));
        }
        assert.ok(
          parsed.ok,
          `[${game.id}:${ruleset.id}] parseGameView failed for player ${pid}!`,
        );
      }

      // Verify spectator view parses
      const spectatorPayload = buildGameStatePayload(db, roomId, null);
      assert.ok(spectatorPayload, `[${game.id}:${ruleset.id}] buildGameStatePayload returned null for spectator`);
      const parsedSpectator = parseGameView(spectatorPayload as any);
      if (!parsedSpectator.ok) {
        console.error(`FAIL: [${game.id}:${ruleset.id}] parseGameView failed for spectator! Payload:`, JSON.stringify(spectatorPayload));
      }
      assert.ok(
        parsedSpectator.ok,
        `[${game.id}:${ruleset.id}] parseGameView failed for spectator!`,
      );
    });
  }
}
