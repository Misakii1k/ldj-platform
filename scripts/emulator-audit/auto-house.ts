/**
 * 房规 UNO 自动循环：到我回合就摸牌，直到 本局结束/整场结算/胜利 画面。
 */
import { evalJs } from './cdp.ts';

const maxMs = (Number(process.argv[2] ?? 420)) * 1000;
const start = Date.now();
let clicks = 0;
while (Date.now() - start < maxMs) {
  const r = await evalJs("(()=>{const t=document.body.innerText; if(/本局结束|整场结算|冠军|获胜|再来一局/.test(t)) return 'OVER'; const b=[...document.querySelectorAll('button')].find(x=>/摸牌|过牌/.test(x.textContent)&&!x.disabled); if(b){b.click(); return 'act'} return 'wait'})()").catch(() => 'ERR');
  if (r === 'OVER') { console.log('OVER'); break; }
  if (r === 'act') { clicks += 1; if (clicks % 10 === 0) console.log('act#' + clicks); await new Promise(res => setTimeout(res, 1500)); }
  else await new Promise(res => setTimeout(res, 2500));
}
console.log('end clicks=' + clicks);
