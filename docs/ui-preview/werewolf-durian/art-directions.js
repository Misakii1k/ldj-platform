(() => {
  const $ = id => document.getElementById(id);
  const names = ['阿橙','月亮邮递员','小满','不吃香菜的猫','十一','山间一阵晚风','南瓜','阿白','薄荷','长颈鹿不熬夜','小岛','半夏'];
  const themes = {
    woodcut:['THE FOREST FABLE','CHAPTER III · 林中证词','没有人，能够置身故事之外。','森林记得每一个声音。','TWELVE VOICES'],
    eclipse:['THE ECLIPSE RITUAL','LUNAR III · 月下誓言','月亮隐去的，是谁的秘密。','在月光缺席之前，留下你的判断。','THE CONSTELLATION'],
    curtain:['THE CRIMSON STAGE','ACT III · 人人皆有台词','幕布落下之前，真相还未谢幕。','灯光之下，每句话都有回声。','THE COMPANY']
  };
  const designChoice = $('design-choice');
  const initialDesign = new URLSearchParams(location.search).get('design') === 'current' ? 'current' : 'refined';
  document.body.dataset.design = initialDesign; designChoice.value = initialDesign;
  designChoice.addEventListener('change', () => { document.body.dataset.design = designChoice.value; });
  let speaker = 6, privateOpen = false, dialogTrigger = null;
  function render(){
    const cards = names.map((n,i)=>`<button class="seat ${i+1===speaker?'active':''} ${[3,9].includes(i+1)?'out':''}" data-seat="${i}" aria-label="${i+1}号 ${n}，${[3,9].includes(i+1)?'已出局':i+1===speaker?'正在发言':'存活'}"><b>${String(i+1).padStart(2,'0')}</b><span class="name">${n}</span><small>${[3,9].includes(i+1)?'— 已出局':i+1===speaker?'● 发言中':'· 存活'}</small></button>`);
    $('seats-left').innerHTML = cards.slice(0,6).join('');
    $('seats-right').innerHTML = cards.slice(6).join('');
  }
  function open(title,html,secret=false){privateOpen=secret;dialogTrigger=document.activeElement instanceof HTMLElement?document.activeElement:null;$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('dialog').showModal()}
  // Native modal dialogs let Tab land on <body> once per cycle and never return focus
  // to the trigger, so the shared dialog needs an explicit cycle and focus restore.
  $('dialog').addEventListener('keydown',(event)=>{
    if(event.key!=='Tab')return;
    const dlg=$('dialog');
    const items=Array.from(dlg.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((el)=>!el.disabled&&el.getClientRects().length>0);
    if(!items.length){event.preventDefault();return}
    const first=items[0],last=items[items.length-1],active=document.activeElement;
    if(!dlg.contains(active)){event.preventDefault();first.focus({preventScroll:true});return}
    if(event.shiftKey){if(active===first){event.preventDefault();last.focus({preventScroll:true})}}
    else if(active===last){event.preventDefault();first.focus({preventScroll:true})}
  });
  document.querySelectorAll('.choices button').forEach(b=>b.addEventListener('click',()=>{
    document.body.dataset.theme=b.dataset.theme;
    document.querySelectorAll('.choices button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    ['edition','kicker','art-caption','tagline','table-caption'].forEach((id,i)=>$(id).textContent=themes[b.dataset.theme][i]);
    speaker=6;render();document.querySelector('.speaker-tag').textContent='● 06 号 · 正在发言';document.querySelector('h1').textContent=names[5];$('finish').disabled=false;$('finish').innerHTML='结束发言 <span>→</span>';
    document.querySelector('.next b').textContent='07 号 / 南瓜';
  }));
  document.querySelector('.layout').addEventListener('click',e=>{const b=e.target.closest('[data-seat]');if(b){const i=Number(b.dataset.seat);open(`${i+1} 号 · ${names[i]}`,`<p>${[3,9].includes(i+1)?'已出局':i+1===speaker?'正在发言':'存活'} · 身份未公开</p>`)}});
  $('identity').onclick=()=>open('预言家 · 好人阵营','<img src="assets/seer.png" alt="预言家角色"><p>每晚可以查验一名玩家的阵营。<br>这是固定示例身份，离开页面自动收起。</p>',true);
  $('rules').onclick=()=>open('十二人 · 经典场','<p>4 狼人、4 村民，预言家、女巫、猎人、守卫各 1 名。</p><p>白天依次发言并投票，夜晚秘密行动。本预览只比较艺术方向，不接入真实对局。</p>');
  $('ledger').onclick=()=>open('第二日 · 放逐记录','<p>9 号薄荷：4 票，来自 2、5、8、10 号。<br>2 号月亮邮递员：3 票。<br>5 号十一：2 票。<br>11、12 号弃票。</p><p>9 号出局，身份未公开。</p>');
  $('finish').onclick=()=>{speaker=7;render();document.querySelector('.speaker-tag').textContent='● 07 号 · 正在发言';const heading=document.querySelector('.speaker h1');heading.textContent=names[6];document.querySelector('.next b').textContent='08 号 / 阿白';$('finish').textContent='正在聆听 07 号';$('finish').disabled=true;heading.focus({preventScroll:true});};
  $('close').onclick=()=>$('dialog').close();
  $('dialog').addEventListener('close',()=>{privateOpen=false;$('dialog-body').replaceChildren();const trigger=dialogTrigger;dialogTrigger=null;if(trigger&&trigger.isConnected&&!trigger.disabled)trigger.focus({preventScroll:true})});
  $('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close()}});
  const conceal=()=>{if(privateOpen)$('dialog').close()};addEventListener('blur',conceal);document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal()});
  $('hide').onclick=()=>{document.querySelector('.tools').hidden=true;$('show').hidden=false;$('show').focus()};
  $('show').onclick=()=>{document.querySelector('.tools').hidden=false;$('show').hidden=true;$('hide').focus()};
  render();
})();
