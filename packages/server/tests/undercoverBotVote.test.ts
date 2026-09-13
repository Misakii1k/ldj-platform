/* eslint-disable @typescript-eslint/no-explicit-any -- 测试需直接探查引擎内部状态 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb, closeDb } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { BotRunner } from '../src/core/game/botRunner.ts';
import {
  applySessionAction,
  getActiveSession,
  loadSessionState,
} from '../src/core/game/session.ts';
import { getSessionGameModule } from '../src/core/game/registry.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { UndercoverState } from '@ldj/game-undercover/server';
import { LlmClient, extractChoice } from '../src/core/game/llmClient.ts';

const silentLogger = createLogger('error', {}, () => {});

test('undercover bot voting with rule and llm bots in real game session', async () => {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { ready: true, gameId: 'undercover' });
  const { roomId, hostId } = seeded;

  let reqId = 0;
  const hostCmd = async (payload: unknown) => {
    await executor.executeOnRoom({
      roomId,
      actorScope: 'conn:host',
      requestId: `r-${++reqId}`,
      handler: (tx) =>
        applyRoomCommand(tx, roomId, hostId, payload as never, { llmAvailable: true }),
    });
  };

  // Add 2 rule bots and 1 llm bot (total 4 players: host, 2 rule bots, 1 llm bot)
  await hostCmd({ command: 'add_bot', kind: 'rule' });
  await hostCmd({ command: 'add_bot', kind: 'rule' });
  await hostCmd({ command: 'add_bot', kind: 'llm' });
  await hostCmd({ command: 'start_game' });

  let capturedPrompt: any = null;
  let llmVotedOption: any = null;

  // Mock LLM client: in voting phase, chooses candidate 2 (2 号玩家)
  const mockLlm: LlmClient = {
    decide: async (prompt: any, _meta: any) => {
      capturedPrompt = prompt;
      if (prompt.speech) {
        // Speaking phase
        return {
          option: prompt.options[0],
          reason: '发言完毕',
          speech: '我是一个平民，日常可见',
        };
      }
      // Voting phase: pick the second candidate if available, else first
      const chosen = prompt.options.length > 1 ? prompt.options[1] : prompt.options[0];
      llmVotedOption = chosen;
      return {
        option: chosen,
        reason: '对比发言后决定投票',
        speech: null,
      };
    },
  } as unknown as LlmClient;

  const runner = new BotRunner({
    db,
    executor,
    logger: silentLogger,
    thinkDelayMs: 0,
    llm: () => mockLlm,
    onOutcome: () => {},
  });

  // Step 1: Word reveal - bots confirm
  await runner.triggerAndWait(roomId);

  // Host confirms word
  await executor.executeInternal({
    roomId,
    handler: (tx) => {
      const s = getActiveSession(tx.db, roomId)!;
      return applySessionAction(tx, s, { kind: 'player', playerId: hostId }, { type: 'confirm_word' }, null);
    },
  });

  // Step 2: Drive speaking phase
  let session = getActiveSession(db, roomId)!;
  const mod = getSessionGameModule(session)!;
  let state = loadSessionState(session, mod).state as UndercoverState;

  for (let step = 0; step < 20; step++) {
    await runner.triggerAndWait(roomId);
    session = getActiveSession(db, roomId)!;
    state = loadSessionState(session, mod).state as UndercoverState;
    if (state.phase !== 'speaking') break;

    const currentSpeaker = state.speakingOrder[state.currentSpeakerIndex];
    if (currentSpeaker === hostId) {
      await executor.executeInternal({
        roomId,
        handler: (tx) => {
          const s = getActiveSession(tx.db, roomId)!;
          return applySessionAction(tx, s, { kind: 'player', playerId: hostId }, { type: 'finish_speech' }, null);
        },
      });
    }
  }

  session = getActiveSession(db, roomId)!;
  state = loadSessionState(session, mod).state as UndercoverState;
  assert.equal(state.phase, 'voting', 'Should have entered voting phase');

  // Step 3: Trigger bots to vote!
  await runner.triggerAndWait(roomId);

  session = getActiveSession(db, roomId)!;
  state = loadSessionState(session, mod).state as UndercoverState;

  // Verify prompt generated for LLM bot in voting phase uses seat numbers
  assert.ok(capturedPrompt, 'LLM bot should have received a prompt during voting');
  assert.ok(capturedPrompt.options.length >= 2, 'Should have multiple vote options');
  for (const opt of capturedPrompt.options) {
    assert.match(opt.id, /^\d+$/, `Option id must be numeric seat string, got: ${opt.id}`);
    assert.match(opt.label, /投票淘汰 \d+ 号玩家/);
    assert.equal(opt.action.type, 'cast_vote');
    assert.ok(opt.action.targetPlayerId.startsWith('p_'));
  }

  // Find LLM bot's vote in state
  assert.ok(llmVotedOption, 'LLM bot should have made a voting decision');
  const votes = Object.values(state.votes);
  assert.ok(votes.includes(llmVotedOption.action.targetPlayerId), 'State must contain LLM bot vote target');

  closeDb(db);
});

test('LlmClient parsing real undercover vote responses correctly and robustly', async () => {
  const options = [
    {
      id: '1',
      label: '投票淘汰 1 号玩家',
      action: { type: 'cast_vote' as const, targetPlayerId: 'p_11111111-1111-1111-1111-111111111111' },
    },
    {
      id: '2',
      label: '投票淘汰 2 号玩家',
      action: { type: 'cast_vote' as const, targetPlayerId: 'p_22222222-2222-2222-2222-222222222222' },
    },
  ];

  const prompt = {
    roleBrief: 'brief',
    situation: 'situation',
    options,
  };

  const testCases: Array<{ reply: string; expectedId: string | null; desc: string }> = [
    // Standard and variations for option 1
    { reply: '{"choice": "1", "reason": "1号发言可疑"}', expectedId: '1', desc: 'string "1"' },
    { reply: '{"choice": 1, "reason": "1号发言可疑"}', expectedId: '1', desc: 'number 1' },
    { reply: '{"choice": "1号", "reason": "1号发言可疑"}', expectedId: '1', desc: 'suffix "1号"' },
    { reply: '{"choice": "1号玩家", "reason": "1号发言可疑"}', expectedId: '1', desc: '"1号玩家"' },
    { reply: '{"choice": "第1号", "reason": "1号发言可疑"}', expectedId: '1', desc: '"第1号"' },
    { reply: '{"choice": "投票淘汰 1 号玩家", "reason": "1号发言可疑"}', expectedId: '1', desc: 'full label' },
    { reply: '{"choice": "1. 投票淘汰 1 号玩家", "reason": "1号发言可疑"}', expectedId: '1', desc: 'dot prefix' },
    { reply: '{"choice": "p_11111111-1111-1111-1111-111111111111", "reason": "1号发言可疑"}', expectedId: '1', desc: 'targetPlayerId' },

    // Choosing option 2 when reason mentions 1 (anti-confusion test)
    { reply: '{"choice": "2", "reason": "1号说的很诚恳，2号绝对是卧底"}', expectedId: '2', desc: 'choice 2 with 1 in reason' },
    { reply: '{"choice": 2, "reason": "1号说的很诚恳，2号绝对是卧底"}', expectedId: '2', desc: 'number 2 with 1 in reason' },
    { reply: '{"choice": "2号玩家", "reason": "1号说的很诚恳，2号绝对是卧底"}', expectedId: '2', desc: 'choice 2号玩家 with 1 in reason' },
    { reply: '{"choice": "投票淘汰 2 号玩家", "reason": "1号说的很诚恳，2号绝对是卧底"}', expectedId: '2', desc: 'label 2 with 1 in reason' },

    // Non-JSON responses
    { reply: '我决定投票淘汰 2 号玩家。', expectedId: '2', desc: 'plain text label match' },
    { reply: '我投 2 号', expectedId: '2', desc: 'plain text seat match' },
    { reply: '1号是好人，我投 2 号', expectedId: '2', desc: 'reason mentions 1, decision votes 2' },
    { reply: '我认为1号发言很好，2号是卧底，所以我投2号', expectedId: '2', desc: 'reason with multiple seats' },
    { reply: '我不投 1 号，投 2 号', expectedId: '2', desc: 'negated 1, positive 2' },
    { reply: '投二号', expectedId: '2', desc: 'Chinese numeral 二号' },
    { reply: '思考：1号是平民。\n{"choice": "2", "reason": "2号是卧底"}', expectedId: '2', desc: 'text before json' },
    { reply: '<think>1号好人，2号明显卧底</think>\n{"choice": "2", "reason": "2号是卧底"}', expectedId: '2', desc: 'think tag before json' },
    { reply: '{"choice": "1、投票淘汰 1 号玩家", "reason": "1号可疑"}', expectedId: '1', desc: 'choice with Chinese punctuation' },
    { reply: '{"choice": "二号", "reason": "二号可疑"}', expectedId: '2', desc: 'choice with Chinese numeral in json' },
    { reply: '{"choice": "二", "reason": "二号可疑"}', expectedId: '2', desc: 'choice with single Chinese numeral in json' },

    // Generic words must not falsely match option 1
    { reply: '{"choice": "投票", "reason": "随便投"}', expectedId: null, desc: 'generic choice 投票' },
    { reply: '{"choice": "玩家", "reason": "随便投"}', expectedId: null, desc: 'generic choice 玩家' },
    { reply: '{"choice": "淘汰", "reason": "随便投"}', expectedId: null, desc: 'generic choice 淘汰' },

    // Invalid choice must return null and not falsely match
    { reply: '{"choice": "999", "reason": "随便投"}', expectedId: null, desc: 'invalid choice 999' },
    { reply: '{"choice": "unknown", "reason": "随便投"}', expectedId: null, desc: 'invalid string' },
  ];

  for (const tc of testCases) {
    let server: any;
    let url: string = '';
    await new Promise<void>((resolve) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: tc.reply } }],
        }));
      });
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const client = new LlmClient({
      baseUrl: url,
      provider: 'openai',
      model: 'test',
      apiKey: 'k',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    }, silentLogger, { allowPrivateNetwork: true });

    try {
      const res = await client.decide(prompt, { roomId: 'r', botId: 'b', moduleId: 'undercover' });
      assert.equal(
        res ? res.option.id : null,
        tc.expectedId,
        `Failed for test case [${tc.desc}]: raw reply '${tc.reply}'`,
      );
    } finally {
      server.close();
    }
  }
});

test('LlmClient handles options with UUID ids (e.g. Werewolf) via seat labels', async () => {
  const options = [
    {
      id: 'p_wolf_11111111',
      label: '投票放逐 1 号玩家',
      action: { type: 'day_vote' as const, targetPlayerId: 'p_wolf_11111111' as string | null },
    },
    {
      id: 'p_wolf_22222222',
      label: '投票放逐 2 号玩家',
      action: { type: 'day_vote' as const, targetPlayerId: 'p_wolf_22222222' as string | null },
    },
    {
      id: 'abstain',
      label: '弃票',
      action: { type: 'day_vote' as const, targetPlayerId: null as string | null },
    },
  ];

  const prompt = {
    roleBrief: 'brief',
    situation: 'situation',
    options,
  };

  const testCases: Array<{ reply: string; expectedId: string | null }> = [
    { reply: '{"choice": "1", "reason": "1号是狼"}', expectedId: 'p_wolf_11111111' },
    { reply: '{"choice": "2号玩家", "reason": "2号是狼"}', expectedId: 'p_wolf_22222222' },
    { reply: '{"choice": "投票放逐 1 号玩家", "reason": "1号是狼"}', expectedId: 'p_wolf_11111111' },
    { reply: '{"choice": "abstain", "reason": "弃票观望"}', expectedId: 'abstain' },
    { reply: '{"choice": "弃票", "reason": "弃票观望"}', expectedId: 'abstain' },
  ];

  for (const tc of testCases) {
    let server: any;
    let url: string = '';
    await new Promise<void>((resolve) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: tc.reply } }],
        }));
      });
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const client = new LlmClient({
      baseUrl: url,
      provider: 'openai',
      model: 'test',
      apiKey: 'k',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    }, silentLogger, { allowPrivateNetwork: true });

    try {
      const res = await client.decide(prompt, { roomId: 'r', botId: 'b', moduleId: 'werewolf' });
      assert.equal(res ? res.option.id : null, tc.expectedId);
    } finally {
      server.close();
    }
  }
});

test('extractChoice disambiguates multi-seat cross mentions in large 12-player games', () => {
  const options = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1),
    label: `投票淘汰 ${i + 1} 号玩家`,
    action: { type: 'cast_vote' as const, targetPlayerId: `p_${i + 1}` },
  }));

  // 1. Mentions both 1 and 10, decides 10
  const r1 = extractChoice('1号玩家说的挺好，我最终决定投 10 号玩家。', options);
  assert.equal(r1?.id, '10');

  // 2. Mentions both 10 and 1, decides 1
  const r2 = extractChoice('10号玩家发言比较做作，但1号破绽最大，投1号', options);
  assert.equal(r2?.id, '1');

  // 3. Negation of 1, voting 11
  const r3 = extractChoice('我不投 1 号，这把投 11 号位', options);
  assert.equal(r3?.id, '11');

  // 4. Chinese numeral for 12
  const r4 = extractChoice('我决定出十二号', options);
  assert.equal(r4?.id, '12');

  // 5. Reasoning with JSON where reasoning mentions 1, 2, 10, choice is 10
  const r5 = extractChoice('综合1号、2号与10号的发言，10号嫌疑最大。\n{"choice": 10, "reason": "10号嫌疑最大"}', options);
  assert.equal(r5?.id, '10');
  assert.equal(r5?.reason, '10号嫌疑最大');

  // 6. DeepSeek style reasoning with think tags and double digits
  const r6 = extractChoice('<think>\n比较1号和12号：1号平民，12号是卧底。\n</think>\n{"choice": "12", "reason": "12号拿到不同词"}', options);
  assert.equal(r6?.id, '12');

  // 7. Generic ambiguous word without target should safely return null (triggering safe fallback)
  const r7 = extractChoice('我觉得大家都有嫌疑，投票。', options);
  assert.equal(r7, null);
});

