import { evalJs } from './cdp.ts';

const FIX = [
  '(() => {',
  '  const style = document.getElementById("audit-fix-probe") ?? document.createElement("style");',
  '  style.id = "audit-fix-probe";',
  '  style.textContent = "',
  '    .werewolf-actions__group { flex-wrap: wrap; min-width: 0; max-width: 100%; }',
  '    .werewolf-actions__hint { white-space: normal; }',
  '    .werewolf-action-btn { white-space: normal; text-align: center; min-width: 0; }',
  '  ";',
  '  document.head.appendChild(style);',
  '  const btns = [...document.querySelectorAll("button")].filter(b => b.textContent.includes("投票击杀"));',
  '  if (!btns.length) return "no";',
  '  const vw = document.documentElement.clientWidth;',
  '  const rights = btns.map(b => Math.round(b.getBoundingClientRect().right));',
  '  return JSON.stringify({ vw, maxRight: Math.max(...rights), over: Math.max(...rights) > vw });',
  '})()',
].join('\n');

export const FIX_EXPR = FIX;

for (let i = 0; i < 90; i += 1) {
  const r = await evalJs(FIX).catch((e) => 'ERR ' + e.message);
  if (r !== 'no' && r !== '' && !r.startsWith('ERR')) {
    console.log(r);
    break;
  }
  await new Promise((res) => setTimeout(res, 3000));
}
