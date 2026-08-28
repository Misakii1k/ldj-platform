/**
 * 向模拟器 WebView 注入会话（ldj:session）并刷新，使手机直接以指定玩家身份进房。
 * 用法：npx tsx scripts/emulator-audit/inject.ts <roomCode> <playerId> <resumeToken> <nickname> [player|table]
 */
import { evalJs } from './cdp.ts';

const [roomCode, playerId, resumeToken, nickname, seatRole = 'player'] = process.argv.slice(2);
if (!roomCode || !playerId || !resumeToken || !nickname) {
  console.error('usage: inject.ts <roomCode> <playerId> <resumeToken> <nickname> [player|table]');
  process.exit(1);
}
const session = { playerId, resumeToken, roomCode, nickname, seatRole };
const script = `localStorage.setItem('ldj:session', ${JSON.stringify(JSON.stringify(session))}); location.reload(); 'injected'`;
console.log(await evalJs(script));
