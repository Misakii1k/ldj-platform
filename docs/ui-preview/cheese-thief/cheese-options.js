(() => {
  const $=id=>document.getElementById(id); const names=['芝士月','花生米','长尾巴','奶糖','小面包','灰灰','松果','阿布']; const left=[0,1,2,3],right=[4,5,6,7]; let hour=3;
  const copy={
    'moon-table':['NIGHT TABLE','月色落在木桌边','深蓝夜桌 · 立体奶酪盘'],
    'paper-detective':['PAPER DETECTIVE','一张纸牌，一桩小案','暖纸侦探 · 线索卡片'],
    'crimson-stage':['THE CRIMSON STAGE','幕布落下前，谁醒着？','赤幕剧场 · 聚光灯证词'],
    'evidence-board':['CASE FILE 03','把每个时刻钉在墙上','案发档案 · 线索板']};
  function players(){const card=i=>`<button class="player ${i===2?'active':''} ${i===5?'out':''}" data-player="${i}" aria-label="${i+1}号 ${names[i]}，${i===5?'已出局':i===2?'当前时刻':'已选时刻'}"><b>${String(i+1).padStart(2,'0')}</b><strong>${names[i]}</strong><small>${i===5?'— 已出局':i===2?'● 第 03 时刻':'◌ 已选时刻'}</small></button>`;$('players-left').innerHTML=left.map(card).join('');$('players-right').innerHTML=right.map(card).join('')}
  function setScheme(s){document.body.dataset.scheme=s;document.querySelectorAll('[data-scheme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scheme===s)));const c=copy[s];$('phase-label').textContent=s==='crimson-stage'?'午夜剧场':'夜间时刻';$('focal-kicker').textContent=`${c[0]} · HOUR 0${hour}`;$('focal-title').textContent=c[1];$('focal-description').textContent=s==='paper-detective'?'把每一次醒来都当成一条线索。只有独醒，才有机会改变结局。':'轮到 03 号时刻。只有独醒且奶酪仍在场时，才可以伸手取走它。';$('bottom-note').textContent=c[2]}
  document.querySelectorAll('.scheme-tabs button').forEach(b=>b.onclick=()=>setScheme(b.dataset.scheme));
  document.querySelectorAll('.hour-rail button').forEach(b=>b.onclick=()=>{hour=Number(b.dataset.hour);document.querySelectorAll('.hour-rail button').forEach(x=>x.removeAttribute('aria-current'));b.setAttribute('aria-current','step');setScheme(document.body.dataset.scheme)});
  $('steal').onclick=()=>$('action-dialog').showModal();$('dialog-steal').onclick=()=>{ $('cheese-state').textContent='奶酪已被取走 · 案发';$('focal-status').textContent='你已成为本局怪盗';$('action-dialog').close();};$('sleep').onclick=()=>{$('focal-status').textContent='你保持安静';};$('dialog-sleep').onclick=()=>{$('action-dialog').close();$('focal-status').textContent='你保持安静';};$('vote').onclick=()=>{hour=6;$('phase-label').textContent='天亮讨论';$('focal-title').textContent='奶酪不见了。';$('focal-description').textContent='大家开始盘问每个时刻的动静，找出真正的怪盗。';$('focal-status').textContent='自由讨论 · 尚未投票';};$('rules').onclick=()=>$('rules-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('hide-tools').onclick=()=>{$('.preview-bar').hidden=true;$('show-tools').hidden=false};$('show-tools').onclick=()=>{$('.preview-bar').hidden=false;$('show-tools').hidden=true};
  players();setScheme('moon-table');
})();
