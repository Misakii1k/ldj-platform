/**
 * 手机端自动摸牌循环：看到「摸一张牌」按钮就点（我的回合自动摸牌过牌），直至出现结算。
 * 用法：npx tsx scripts/emulator-audit/auto-draw.ts [最大秒数=300]
 */
import { evalJs } from './cdp.ts';

const maxMs = (Number(process.argv[2] ?? 300)) * 1000;
const start = Date.now();
let clicks = 0;
while (Date.now() - start < maxMs) {
  const r = await evalJs("(()=>{const done=/胜利|胜|冠军|再来一局|积分/.test(document.body.innerText)&&!document.querySelector('button[class*=floating]'); if(done) return 'OVER'; const b=[...document.querySelectorAll('button')].find(x=>/摸一张牌|过牌结束/.test(x.textContent)&&!x.disabled); if(b){b.click(); return 'act:'+b.textContent.trim().slice(0,6)} return 'wait'})()").catch(() => 'ERR');
  if (r === 'OVER') { console.log('OVER'); break; }
  if (r.startsWith('act:')) { clicks += 1; console.log(`act#${clicks}:${r.slice(4)}`); await new Promise(res => setTimeout(res, 1500)); }
  else await new Promise(res => setTimeout(res, 2500));
}
console.log('end clicks=' + clicks);
