#!/usr/bin/env bash
# 手机端 UI 加入房间并点准备：join-ui.sh <房间码>
set -euo pipefail
CODE="$1"
CDP="npx tsx scripts/emulator-audit/cdp.ts"

# 1. 打开加入弹层（若已在房间内先不处理——调用方保证在主页）
$CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('输入房间码')); b?.click(); return b?'sheet-open':'no-home-btn'})()"

sleep 1.2

# 2. 填房间码（按 placeholder 精确匹配）+ 修正昵称
$CDP "(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))}; const code=[...document.querySelectorAll('input')].find(x=>(x.placeholder||'').includes('房间码')); if(!code) return 'no-code-input'; set(code,'$CODE'); const nick=[...document.querySelectorAll('input')].find(x=>(x.placeholder||'').includes('大头')); if(nick && nick.value.length===0) set(nick,'星际旅人'); return 'code='+code.value})()"

sleep 0.8

# 3. 确认加入
$CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('确认加入房间')&&!x.disabled); b?.click(); return b?'joining':'btn-disabled'})()"

sleep 2.5

# 4. 点准备（若存在）
$CDP "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='准备'||x.textContent.includes('准备')); b?.click(); return b?'ready':'no-ready-btn'})()"
