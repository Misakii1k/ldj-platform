#!/usr/bin/env bash
# 快速开局链：quick-game.sh <卡片标题精确文本> <bot数> [模式pill关键词]
set -euo pipefail
TITLE="$1"; BOTS="$2"; PILL="${3:-}"
CDP="npx tsx scripts/emulator-audit/cdp.ts"

$CDP "(()=>{const cards=[...document.querySelectorAll('article,section,div[class*=card]')].filter(e=>{const t=e.querySelector('h1,h2,h3,h4,strong,[class*=title]'); return t&&t.textContent.trim()==='$TITLE'&&e.textContent.includes('创建房间')}); if(!cards.length) return 'NO_CARD'; const btn=[...cards[0].querySelectorAll('button')].find(b=>b.textContent.includes('创建房间')); btn?.click(); return 'SHEET'})()"
sleep 2
if [ -n "$PILL" ]; then
  $CDP "(()=>{const p=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('$PILL')); p?.click(); return p?'PILL':'NO_PILL'})()"
  sleep 0.6
fi
$CDP "(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('创建并进入房间'))?.click(); return 'C'})()"
sleep 3
for i in $(seq 1 "$BOTS"); do
  $CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/添加机器人/.test(x.textContent)); b?.click(); return 'B'})()" >/dev/null
  sleep 0.9
done
$CDP "(()=>{[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='准备')?.click(); return 'R'})()" >/dev/null
sleep 1.2
$CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('开始游戏')&&!x.disabled); b?.click(); return b?'S':'X'})()"
sleep 5
$CDP "(()=>{const t=document.body.innerText; if(t.includes('大厅筹备中')){location.reload(); return 'LOBBY_RELOADED'} return 'IN:'+t.slice(0,50).replace(/\n+/g,'|')})()"
sleep 5
$CDP "(()=>{const t=document.body.innerText; return (t.includes('大厅筹备中')?'STILL_LOBBY':'OK:'+t.slice(0,60).replace(/\n+/g,'|'))})()"
