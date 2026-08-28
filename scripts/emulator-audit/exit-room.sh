#!/usr/bin/env bash
# 退出当前对局：exit-room.sh（菜单→退出→确认→横幅兜底）
set -euo pipefail
CDP="npx tsx scripts/emulator-audit/cdp.ts"
$CDP "(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('菜单'))?.click(); return 'M'})()" >/dev/null
sleep 1.5
$CDP "(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('退出当前房间'))?.click(); return 'E'})()" >/dev/null
sleep 1.5
$CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('彻底退出')); if(b){b.click(); return 'L'} [...document.querySelectorAll('button')].find(x=>x.textContent.includes('暂离返回主页'))?.click(); return 'T'})()" >/dev/null
sleep 2.5
$CDP "(()=>{const d=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('解散原房间')); if(d){d.click(); return 'D'} [...document.querySelectorAll('button')].find(x=>x.textContent.includes('离开原房间'))?.click(); return 'B'})()" >/dev/null
sleep 2.5
$CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('离开原房间')); if(b){b.click(); return 'B2'} return document.body.innerText.includes('进行中房间')?'STILL':'HOME'})()"
