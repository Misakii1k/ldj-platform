import test from 'node:test';
import assert from 'node:assert/strict';
import type { BotPromptContext } from '@ldj/shared';
import { openDb, closeDb } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { BotRunner } from '../src/core/game/botRunner.ts';
import { LlmClient } from '../src/core/game/llmClient.ts';
import { createSnapshotEnvelope, type SnapshotEnvelopeV2 } from '../src/core/game/snapshotEnvelope.ts';
import { getActiveSession } from '../src/core/game/session.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { V2State } from '../../games/werewolf/server/v2/types.ts';

const logger = createLogger('error', {}, () => {});

for (const phase of ['discussion', 'night'] as const) {
  test(`BotRunner ${phase}：真实玩家提示词到公屏链路的披露边界`, async () => {
    const db = openDb({ path: ':memory:' });
    migrate(db);
    const executor = new RoomCommandExecutor(db);
    const { roomId, hostId } = seedRoom(db, { ready: true, gameId: 'werewolf', config: { gameConfig: { rulesetId: 'werewolf_platform_open_kill_v1' } } });
    let runner: BotRunner | undefined;
    try {
      let request = 0;
      async function command(payload: unknown) {
        await executor.executeOnRoom({
          roomId, actorScope: 'conn:host', requestId: `prompt-chain-${++request}`,
          handler: (tx) => applyRoomCommand(tx, roomId, hostId, payload as never, { llmAvailable: true }),
        });
      }
      for (let i = 0; i < 5; i++) await command({ command: 'add_bot', kind: 'llm' });
      await command({ command: 'start_game' });
      const session = getActiveSession(db, roomId)!;
      const envelope = JSON.parse(session.snapshot_json) as SnapshotEnvelopeV2<V2State>;
      const state = envelope.state;
      const botId = Object.keys(state.players).find((id) => id !== hostId)!;
      // 将一个合法快照定格在有历史查验的 AI 预言家回合，不等待真实计时器/语音。
      const originalSeer = Object.keys(state.players).find((id) => state.players[id]!.role === 'seer')!;
      [state.players[botId]!.role, state.players[originalSeer]!.role] = [state.players[originalSeer]!.role, state.players[botId]!.role];
      const wolfId = Object.keys(state.players).find((id) => state.players[id]!.role === 'wolf')!;
      const wolfSeat = state.players[wolfId]!.seat + 1;
      state.phase = phase;
      state.day = 2;
      state.timelineState = null;
      state.seerHistory = [{ night: 1, playerId: wolfId, team: 'wolves' }];
      state.speakingOrder = [botId, hostId];
      state.currentSpeakerIndex = 0;
      state.confirmedRolePlayerIds = Object.keys(state.players);
      state.night.seerChecked = false;
      state.night.guardDecided = true;
      state.night.witchSaveDecision = false;
      state.night.witchPoisonDecided = true;
      state.night.wolfVotes = Object.fromEntries(Object.entries(state.players).filter(([, p]) => p.role === 'wolf').map(([id]) => [id, hostId]));
      db.prepare('UPDATE game_sessions SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(createSnapshotEnvelope({ ...envelope, state })), session.id);
      const speech = `我是预言家，昨夜查验${wolfSeat}号是狼人。我主张放逐${wolfSeat}号，请他回应这条查杀。`;
      const prompts: BotPromptContext<unknown>[] = [];
      // 只替换模型推理，玩家投影、装饰、过滤、聊天落库和动作提交全部用真实实现。
      const client = new LlmClient({ provider: 'openai', baseUrl: 'http://127.0.0.1:1', apiKey: '', model: 'mock', thinkingDepth: 'off', timeoutMs: 1000 }, logger);
      client.decide = async <A>(prompt: BotPromptContext<A>) => {
        prompts.push(prompt);
        return { option: prompt.options[0]!, speech, reason: 'PRIVATE_REASON_MUST_NOT_APPEAR' };
      };
      const broadcasts: string[] = [];
      runner = new BotRunner({
        db, executor, logger, thinkDelayMs: 0, llm: () => client,
        onChat: (_id, messages) => broadcasts.push(...messages.map((m) => m.text)),
        onOutcome: () => runner!.stop(),
      });
      await runner.triggerAndWait(roomId);
      assert.equal(prompts.length, 1);
      assert.match(prompts[0]!.situation, new RegExp(`第 1 夜 ${wolfSeat} 号=狼人`));
      assert.match(prompts[0]!.roleBrief, /应主动跳预言家/);
      const rows = db.prepare('SELECT text FROM chat_messages WHERE room_id = ? AND kind = ?').all(roomId, 'player') as { text: string }[];
      if (phase === 'discussion') {
        assert.deepEqual(rows.map((r) => r.text), [speech]);
        assert.deepEqual(broadcasts, [speech]);
      } else {
        assert.equal(prompts[0]!.speech, undefined);
        assert.deepEqual(rows, []);
        assert.deepEqual(broadcasts, []);
      }
      assert.ok(getActiveSession(db, roomId)!.last_seq > session.last_seq, '模型候选必须通过权威入口落库');
    } finally {
      runner?.stop();
      closeDb(db);
    }
  });
}
