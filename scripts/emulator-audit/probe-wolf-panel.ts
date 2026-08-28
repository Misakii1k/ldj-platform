import { evalJs } from './cdp.ts';
for (let i = 0; i < 80; i += 1) {
  const r = await evalJs(`(()=>{
    const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('投票击杀'));
    if(!btns.length) return 'no';
    const chain=[]; let el=btns[0];
    while(el && el!==document.body){ const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
      chain.push(el.className.toString().slice(0,40)+' w='+Math.round(r.width)+' left='+Math.round(r.left)+' right='+Math.round(r.right)+' disp='+cs.display+'/'+cs.gridTemplateColumns.slice(0,20)+'/'+cs.flexDirection||'');
      el=el.parentElement; }
    return JSON.stringify({vw:document.documentElement.clientWidth, chain},null,0);
  })()`, ).catch((e)=>'ERR '+e.message);
  if (r !== 'no' && r !== '' && !r.startsWith('ERR')) { console.log(r); break; }
  await new Promise(res=>setTimeout(res, 3000));
}
