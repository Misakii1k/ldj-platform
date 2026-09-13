/**
 * undercover 驱动 v3：手机=席位7；PC 席位2-6。
 * 变更：chat/vote 的 ack/error 全部打印；投票目标选存活席；投票阶段先停 22s 等截图再投。
 */
import { setupRoom, resumeAs } from './lib.ts';
import { RoomDriver, type Envelope } from '../../e2e/helpers/wsClient.ts';

const SPEECHES = [
  '我觉得这个词日常挺常见的，大家应该都听过。',
  '这个东西和吃的有点关系，我说完了。',
  '我平时经常见到它，感觉很生活化。',
  '它可以在商店里买到，挺普通的。',
  '反正我不是卧底，大家认真想想谁最可疑。',
];

function log(msg: string): void {
  console.log(`[uc3] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

function _dump(kind: string, ack: Envelope): void {
  if (ack.type !== 'ack') log(`${kind} 被拒：${JSON.stringify(ack.payload).slice(0, 160)}`);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 串行执行（避免触发服务端操作限流），RATE_LIMITED 按 retryAfterMs 重试 */
async function paced(kind: string, fn: () => Promise<Envelope>): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ack = await fn();
    if (ack.type === 'ack') return;
    const retryAfter = (ack.payload as { retryAfterMs?: number }).retryAfterMs;
    const code = String((ack.payload as { code?: string }).code ?? '');
    if (code === 'RATE_LIMITED' && attempt < 3) {
      await sleep((retryAfter ?? 600) + 120);
      continue;
    }
    log(`${kind} 被拒：${JSON.stringify(ack.payload).slice(0, 160)}`);
    return;
  }
}

const setup = await setupRoom({
  gameId: 'undercover',
  count: 7,
  config: { rulesetId: 'undercover_classic_v1', speechSeconds: 30, voteSeconds: 30 },
});
const phone = setup.seeded.players[6]!;
log(`房间码 ${setup.seeded.roomCode}`);
log(`手机注入: npx tsx scripts/emulator-audit/inject.ts ${setup.seeded.roomCode} ${phone.playerId} ${phone.resumeToken} 星际旅人`);

const drivers: RoomDriver[] = [];
for (let seat = 2; seat <= 6; seat += 1) {
  const p = setup.seeded.players[seat - 1]!;
  drivers.push(await resumeAs(setup.seeded.roomCode, p.playerId, p.resumeToken));
}
log('PC 席就绪，10s 后开局（等手机注入与截图）');
await new Promise((r) => setTimeout(r, 10000));

const startAck = await setup.host.startGame({ rulesetId: 'undercover_classic_v1', speechSeconds: 30, voteSeconds: 30 });
if (startAck.type !== 'ack') {
  log(`开局被拒：${JSON.stringify(startAck.payload)}`);
  process.exit(1);
}
log('已开局');
const players = setup.seeded.players;
const seatOf = (pid: string): number => players.findIndex((p) => p.playerId === pid) + 1;
const isDriver = (pid: string): boolean => seatOf(pid) >= 2 && seatOf(pid) <= 6;
const aliveDrivers = new Set(drivers.map((d) => d.playerId));
const PHONE_ID = phone.playerId;
log('词条窗口 18s（供手机截图），随后 PC 席统一确认');
await new Promise((r) => setTimeout(r, 18000));
for (const d of drivers) await paced(`confirm@${seatOf(d.playerId)}`, () => d.gameAction({ type: 'confirm_word' }));
log('word_reveal：PC 席已确认');

// 只消费最新帧：等任意新帧后跳到队列里最新的 game_state，避免拿陈旧状态决策
for (;;) {
  let env;
  try {
    env = await setup.host.waitGameState(() => true, 150_000);
  } catch {
    log('150s 无新状态，退出');
    break;
  }
  for (;;) {
    const newer = setup.host.client.latestGameState(() => true);
    // latestGameState 不消费最新帧：引用相同说明已到最新，跳出
    if (!newer || newer === env) break;
    env = newer;
  }
  const state = env!.payload.view as Record<string, unknown>;
  const phase = String(state.phase ?? '?');
  const round = Number(state.round ?? 0);
  const aliveList = Array.isArray(state.alivePlayerIds) ? (state.alivePlayerIds as string[]) : null;

  if (phase === 'word_reveal') {
    log('word_reveal：先停 18s 供手机截图词条卡，再确认');
    await new Promise((r) => setTimeout(r, 18000));
    for (const d of drivers) await paced(`confirm@${seatOf(d.playerId)}`, () => d.gameAction({ type: 'confirm_word' }));
    log('word_reveal：PC 席已确认');
  } else if (phase === 'speaking') {
    const speaker = String(state.speakingOrder?.[Number(state.currentSpeakerIndex)] ?? '');
    if (isDriver(speaker) && aliveDrivers.has(speaker)) {
      const d = drivers[seatOf(speaker) - 2]!;
      await paced(`chat@${seatOf(speaker)}`, () => d.client.request('chat_send', { text: SPEECHES[(round - 1 + seatOf(speaker)) % SPEECHES.length] }));
      await sleep(300);
      await paced(`finish@${seatOf(speaker)}`, () => d.gameAction({ type: 'finish_speech' }));
      log(`speaking r${round}：席位${seatOf(speaker)} 发言完成`);
    } else if (speaker === PHONE_ID) {
      log(`speaking r${round}：手机发言窗口（28s）`);
      await new Promise((r) => setTimeout(r, 28000));
    }
  } else if (phase === 'voting' || phase === 'runoff_voting') {
    log(`${phase} r${round}：先停 22s 供截图，PC 再投票`);
    await new Promise((r) => setTimeout(r, 22000));
    const pool = (aliveList ?? players.map((p) => p.playerId)).filter((id) => id !== PHONE_ID && aliveDrivers.has(id));
    const target = pool[0] ?? players[1]!.playerId;
    for (const d of drivers) {
      if (!aliveDrivers.has(d.playerId)) continue;
      await paced(`vote@${seatOf(d.playerId)}`, () => d.gameAction({ type: 'cast_vote', targetPlayerId: target }));
      await sleep(250);
    }
    log(`${phase}：PC 席已投席位${seatOf(target)}`);
    await new Promise((r) => setTimeout(r, 6000));
  } else if (phase === 'vote_result') {
    const ousted = state.oustedPlayerId ?? state.eliminatedPlayerId;
    log(`vote_result r${round}：出局=${ousted ? seatOf(String(ousted)) : '?'}`);
    if (ousted) aliveDrivers.delete(String(ousted));
    await new Promise((r) => setTimeout(r, 6000));
  } else if (phase === 'game_over') {
    log(`game_over：胜者=${JSON.stringify(state.winner ?? state.winningTeam ?? '?')}`);
    await new Promise((r) => setTimeout(r, 8000));
    break;
  }
}
drivers.forEach((d) => d.client.close());
setup.host.client.close();
process.exit(0);
