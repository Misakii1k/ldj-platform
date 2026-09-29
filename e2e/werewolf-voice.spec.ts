import { DatabaseSync } from 'node:sqlite';
import { test, expect, type Page, type Browser } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';
const config={rulesetId:'werewolf_moderator_v1'};
async function open(browser:Browser,session:Record<string,unknown>) {
 const context=await browser.newContext({viewport:{width:1280,height:800}}); const page=await context.newPage();
 await skipPcHostConsole(page);
 await page.addInitScript(([key,value])=>{localStorage.setItem(key,value);localStorage.setItem('ldj_werewolf_narration_enabled','true');},[ME_STORAGE_KEY,JSON.stringify(session)]);
 // Observe actual HTML audio playback; retain the browser's native play implementation.
 await page.addInitScript(()=>{
  const played:string[]=[];Object.defineProperty(window,'__voicePlayed',{value:played});
  const started:string[]=[];Object.defineProperty(window,'__voiceStarted',{value:started});
  const offsets:number[]=[];Object.defineProperty(window,'__voiceOffsets',{value:offsets});
  const original=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){played.push(decodeURI(this.src));offsets.push(this.currentTime);if((window as unknown as {__voiceBlocked?:boolean}).__voiceBlocked)return Promise.reject(new DOMException('Blocked','NotAllowedError'));const promise=original.call(this);void promise.then(()=>started.push(decodeURI(this.src)),()=>{});return promise;};
 });
 await page.goto(BASE_URL);return page;
}
async function played(page:Page,match:string){return page.evaluate(m=>(window as unknown as {__voicePlayed:string[]}).__voicePlayed.filter(x=>x.includes(m)).length,match);}
test('voice board: local/room, real seats, pause, private exclusions, mute, stop and mobile layouts',async({browser})=>{
 test.setTimeout(120000);
 const seeded=seedRoom(DB_PATH,{gameId:'werewolf',count:7,ready:true,config});
 const host=await RoomDriver.resume(WS_URL,seeded.roomCode,seeded.hostId,seeded.hostResumeToken);
 let hostPage:Page|undefined,playerPage:Page|undefined;
 try {
  expect((await host.ready()).type).toBe('ack');expect((await host.startGame(config)).type).toBe('ack');
  await host.waitGameState(v=>v.isModerator===true);
  host.client.close();
  const p=seeded.players[1]!;
  playerPage=await open(browser,{playerId:p.playerId,resumeToken:p.resumeToken,roomCode:seeded.roomCode,nickname:'玩家2',seatRole:'player'});
  hostPage=await open(browser,{playerId:seeded.hostId,resumeToken:seeded.hostResumeToken,roomCode:seeded.roomCode,nickname:'主持人',seatRole:'player'});
  await expect(hostPage.getByRole('button',{name:'语音点播',exact:true})).toBeVisible();
  // User gesture unlocks native browser audio on both devices.
  await playerPage.locator('body').click({position:{x:15,y:15}});
  await hostPage.getByRole('button',{name:'语音点播',exact:true}).click();
  const panel=hostPage.getByRole('dialog',{name:'主持语音点播'});
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('出声位置')).toHaveValue('local');
  await expect(panel.getByLabel('玩家号码').locator('option').first()).toHaveText(/2号/);
  await expect(panel.getByText('身份是好人',{exact:false})).toHaveCount(0);
  await panel.getByRole('button',{name:'白天与发言',exact:true}).click();
  await panel.getByRole('button',{name:/白天 · 天亮了/}).click();
  await expect.poll(()=>played(hostPage!,'01_白天_天亮了')).toBeGreaterThan(0);
  expect(await played(playerPage,'01_白天_天亮了')).toBe(0);
  await panel.getByLabel('出声位置').selectOption('room');
  await panel.getByRole('button',{name:/发言 · 请2号玩家发言/}).click();
  await expect.poll(()=>played(playerPage!,'请2号玩家发言')).toBeGreaterThan(0);
  await expect.poll(()=>playerPage!.evaluate(()=>(window as unknown as {__voiceStarted:string[]}).__voiceStarted.some(x=>x.includes('请2号玩家发言')))).toBe(true);
  await expect(panel.getByText(/正在播放：发言/)).toBeVisible();
  await panel.getByRole('button',{name:'停止',exact:true}).click();
  await expect(panel.getByText('当前没有播报')).toBeVisible();
  // Explicit mute must not be overridden by a room command.
  await playerPage.evaluate(()=>localStorage.setItem('ldj_werewolf_narration_enabled','false'));
  const count=await played(playerPage,'请2号玩家发言');
  await panel.getByRole('button',{name:'重播',exact:true}).click();
  await expect(panel.getByText(/正在播放：发言/)).toBeVisible();
  expect(await played(playerPage,'请2号玩家发言')).toBe(count);
  await panel.getByRole('button',{name:'停止',exact:true}).click();
  await panel.getByRole('button',{name:/死亡 · 昨晚死亡玩家2号/}).click();
  await expect(hostPage.getByRole('alertdialog',{name:'确认公开结果'})).toBeVisible();
  await hostPage.getByRole('button',{name:'取消',exact:true}).click();
  // Validate representative portrait, low-height landscape and desktop without hidden controls.
  for(const [width,height] of [[390,844],[844,390],[1280,800]]) {
   await hostPage.setViewportSize({width:width!,height:height!});
   await expect(panel.getByLabel('出声位置')).toBeVisible();
   expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
   const lowContrast=await panel.evaluate(root=>{
    const rgb=(value:string)=>value.match(/[\d.]+/g)?.slice(0,3).map(Number)??[0,0,0];
    const luminance=(c:number[])=>c.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
    return Array.from(root.querySelectorAll('h2,p,label,button,select,input[type="search"],small,strong')).flatMap(el=>{
     const fg=getComputedStyle(el).color;let parent:Element|null=el,bg='';
     while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}
     const a=luminance(rgb(fg)),b=luminance(rgb(bg)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
     return ratio<4.5?[{text:el.textContent?.slice(0,30),ratio,fg,bg}]:[];
    });
   });
   expect(lowContrast).toEqual([]);
   await hostPage.screenshot({path:`output/werewolf-voice-${width}x${height}.png`});
  }
  await panel.getByRole('button',{name:'关闭',exact:true}).click();
  await hostPage.getByRole('button',{name:'确认结果并进入白天',exact:true}).click();
  await hostPage.getByRole('button',{name:'切为自动辅助',exact:true}).click();
  await hostPage.getByRole('button',{name:'语音点播',exact:true}).click();
  await panel.getByRole('button',{name:'夜晚',exact:true}).click();
  const night=panel.getByRole('button',{name:/开场 · 天黑请闭眼/});
  await expect(night).toBeEnabled();await night.click();
  await panel.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(hostPage.getByRole('button',{name:/恢复/})).toBeVisible();
 } finally {host.client.close();await hostPage?.context().close();await playerPage?.context().close();}
});

test('moderator voice over WS: forged requests rejected and finished game replay does not duplicate settlement',async()=>{
 const seeded=seedRoom(DB_PATH,{gameId:'werewolf',count:7,ready:true,config});
 const host=await RoomDriver.resume(WS_URL,seeded.roomCode,seeded.hostId,seeded.hostResumeToken);
 const p=seeded.players[1]!;const player=await RoomDriver.resume(WS_URL,seeded.roomCode,p.playerId,p.resumeToken);
 try {
  await host.ready();expect((await host.startGame(config)).type).toBe('ack');
  const envelope=await host.waitGameState(v=>v.isModerator===true);
  const view=envelope.payload.view as {timeline:{id:string}};
  const command={type:'moderator_voice_play',cues:['dawn'],output:'room',timelineId:view.timeline.id,confirmed:false};
  expect((await player.gameAction(command)).type).toBe('error');
  expect((await host.gameAction({...command,cues:['seer_good']})).type).toBe('error');
  expect((await host.gameAction(command)).type).toBe('ack');
  expect((await host.gameAction({type:'end_game'})).type).toBe('ack');
  const ended=await host.waitGameState(v=>v.gameEnded===true);
  const endView=ended.payload.view as {timeline:{id:string}};
  const db=new DatabaseSync(DB_PATH,{readOnly:true});
  try {
   const resultCount=()=>db.prepare('SELECT COUNT(*) AS n FROM game_results r JOIN game_sessions s ON s.id=r.session_id WHERE s.room_id=?').get(seeded.roomId)?.n;
   expect(resultCount()).toBe(1);
   expect((await host.gameAction({...command,timelineId:endView.timeline.id})).type).toBe('ack');
   const replay=await player.waitGameState(v=>v.gameEnded===true && Boolean((v.announcement as {source?:string}|null)?.source==='moderator'));
   expect((replay.payload.view as {announcement:{cues:string[]}}).announcement.cues).toEqual(['dawn']);
   expect(resultCount()).toBe(1);
   expect(db.prepare('SELECT status FROM rooms WHERE id=?').get(seeded.roomId)?.status).toBe('POST_GAME');
  } finally {db.close();}
  expect((await host.gameAction({type:'end_game'})).type).toBe('error');
 } finally {host.client.close();player.client.close();}
});

test('room audio recovers from autoplay denial, ignores duplicate snapshots, seeks on reconnect and drops expired clips',async({browser})=>{
 test.setTimeout(60000);
 const seeded=seedRoom(DB_PATH,{gameId:'werewolf',count:7,ready:true,config});
 const host=await RoomDriver.resume(WS_URL,seeded.roomCode,seeded.hostId,seeded.hostResumeToken);
 let page:Page|undefined;
 try {
  await host.ready();expect((await host.startGame(config)).type).toBe('ack');
  const envelope=await host.waitGameState(v=>v.isModerator===true);
  const timelineId=(envelope.payload.view as {timeline:{id:string}}).timeline.id;
  const p=seeded.players[1]!;
  page=await open(browser,{playerId:p.playerId,resumeToken:p.resumeToken,roomCode:seeded.roomCode,nickname:'玩家',seatRole:'player'});
  await expect(page.locator('.mod-player-arena')).toBeVisible();
  await page.evaluate(()=>(window as unknown as {__voiceBlocked:boolean}).__voiceBlocked=true);
  expect((await host.gameAction({type:'moderator_voice_play',cues:['speak_normal_2','speak_normal_3','speak_normal_4'],output:'room',timelineId,confirmed:false})).type).toBe('ack');
  const unlock=page.getByRole('button',{name:'点击开启声音',exact:true});
  await expect(unlock).toBeVisible();
  await page.evaluate(()=>(window as unknown as {__voiceBlocked:boolean}).__voiceBlocked=false);
  await unlock.click();
  await expect.poll(()=>page!.evaluate(()=>(window as unknown as {__voiceStarted:string[]}).__voiceStarted.length)).toBeGreaterThan(0);
  const calls=await played(page,'请2号玩家发言');
  expect((await host.gameAction({type:'eliminate_player',targetPlayerId:seeded.players[6]!.playerId})).type).toBe('ack');
  await expect(page.getByText(/出局/).first()).toBeVisible();
  expect(await played(page,'请2号玩家发言')).toBe(calls);
  await page.reload();
  await expect.poll(()=>page!.evaluate(()=>(window as unknown as {__voiceOffsets:number[]}).__voiceOffsets.length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as unknown as {__voiceOffsets:number[]}).__voiceOffsets[0])).toBeGreaterThan(0);
  // All three real audio files last less than 8 seconds; wait beyond server expiry before reconnecting.
  await page.waitForTimeout(8500);
  await page.reload();await expect(page.locator('.mod-player-arena')).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {__voicePlayed:string[]}).__voicePlayed)).toEqual([]);
 } finally {host.client.close();await page?.context().close();}
});
