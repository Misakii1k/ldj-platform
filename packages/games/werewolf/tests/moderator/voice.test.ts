import test from 'node:test';
import assert from 'node:assert/strict';
import { createWerewolfAnnouncement } from '@ldj/shared';
import type { GameContext, WerewolfModeratorAction } from '@ldj/shared';
import { werewolfModeratorModule as mod } from '../../server/moderator/module.ts';
import type { ModeratorState } from '../../server/moderator/types.ts';
const ctx: GameContext={now:10000,random:{nextInt:()=>0,shuffle:<T>(items:readonly T[])=>[...items]}};
const ids=['host','a','b','c','d','e','f'];
const actor={kind:'player' as const,playerId:'host'};
function initial(){return mod.createInitialState(ctx,ids,mod.parseConfig({moderatorPlayerId:'host',seatNumbers:{a:2,b:4,c:5,d:6,e:7,f:8}}));}
function run(state:ModeratorState,action:WerewolfModeratorAction){const r=mod.reduce(ctx,state,actor,action);assert.ok(r.ok,r.ok?'':r.message);return r;}
function play(state:ModeratorState,cue='dawn',output:'local'|'room'='local',confirmed=false){return {type:'moderator_voice_play' as const,cues:[cue],output,timelineId:state.timelineState?.current.id??null,confirmed};}
test('local and room commands are scoped and replay gets a new id; stop never resumes',()=>{
 const state=initial();const local=run(state,play(state)).nextState;
 assert.ok(mod.getPlayerView(local,'host').announcement);
 assert.equal(mod.getPlayerView(local,'a').announcement,null);
 assert.equal(mod.getSpectatorView(local).announcement,null);
 const room=run(local,play(local,'dawn','room')).nextState;
 assert.ok(mod.getPlayerView(room,'a').announcement);
 assert.notEqual(room.announcement!.id,local.announcement!.id);
 const stop=run(room,{type:'moderator_voice_stop',announcementId:room.announcement!.id}).nextState;
 assert.equal(stop.announcement,null);assert.equal(stop.timelineState?.current.mode,'manual');
 assert.equal(mod.reduce(ctx,room,actor,{type:'moderator_voice_stop',announcementId:'old'}).ok,false);
});
test('forged actor, private audio, unsupported scenes, stale timeline and wrong seats are denied without mutation',()=>{
 const state=initial(),before=JSON.stringify(state);
 assert.equal(mod.reduce(ctx,state,{kind:'player',playerId:'a'},play(state)).ok,false);
 for(const cue of ['seer_good','witch_save_generic','police_vote','speak_normal_1','speak_normal_13'])assert.equal(mod.reduce(ctx,state,actor,play(state,cue)).ok,false,cue);
 assert.equal(mod.reduce(ctx,state,actor,{...play(state),timelineId:'stale'}).ok,false);
 assert.equal(mod.reduce(ctx,state,actor,play(state,'day_death_2')).ok,false);
 assert.equal(run(state,play(state,'day_death_2','room',true)).nextState.eliminatedPlayerIds.length,0);
 assert.equal(mod.getPlayerView(state,'host').players[0]?.seat,2);
 assert.equal(JSON.stringify(state),before);
});
test('auto helper is atomically paused with timer cancellation before manual clip; old timer cannot advance',()=>{
 let state=initial();state=run(state,{type:'moderator_next',timelineId:state.timelineState!.current.id}).nextState;
 state=run(state,{type:'moderator_set_mode',mode:'auto',timelineId:state.timelineState!.current.id}).nextState;
 const old=state.timelineState!;
 const result=run(state,play(state,'night_start','room'));
 assert.equal(result.nextState.timelineState!.current.paused,true);
 assert.ok(result.effects.some(e=>e.type==='cancel_timer'&&e.timerId===`werewolf:moderator:timeline:${old.activeTimerToken}`));
 assert.equal(mod.reduce(ctx,result.nextState,actor,play(result.nextState,'day_death_2','room',true)).ok,false);
 const timer=mod.reduce({...ctx,now:100000},result.nextState,{kind:'system',source:'timer'},{type:'timeline_timeout',timelineId:old.current.id,token:old.activeTimerToken!});
 assert.ok(timer.ok);assert.equal(timer.nextState.timelineState!.current.paused,true);
 const stopped=run(result.nextState,{type:'moderator_voice_stop',announcementId:result.nextState.announcement!.id}).nextState;
 assert.equal(stopped.timelineState!.current.paused,true);
 const resumed=run(stopped,{type:'moderator_resume',timelineId:stopped.timelineState!.current.id});
 assert.equal(resumed.nextState.announcement,null);assert.equal(resumed.nextState.timelineState!.current.paused,false);
});
test('stored old snapshots default safely and explicit winner playback is checked',()=>{
 const state=initial();assert.equal(mod.parseState(JSON.parse(JSON.stringify(state))).announcement,undefined);
 const ended={...state,gameEnded:true,winner:'good' as const};
 assert.equal(run(ended,play(ended,'game_over_good','room')).nextState.announcement?.cues[0],'game_over_good');
 assert.equal(mod.reduce(ctx,ended,actor,play(ended,'game_over_wolf')).ok,false);
});

test('stopping an automatic announcement also freezes the assisted timeline',()=>{
 let state=initial();state=run(state,{type:'moderator_next',timelineId:state.timelineState!.current.id}).nextState;
 state=run(state,{type:'moderator_set_mode',mode:'auto',timelineId:state.timelineState!.current.id}).nextState;
 state={...state,announcement:createWerewolfAnnouncement('automatic-test',['night_start'],ctx.now)};
 const result=run(state,{type:'moderator_voice_stop',announcementId:'automatic-test'});
 assert.equal(result.nextState.announcement,null);
 assert.equal(result.nextState.timelineState!.current.paused,true);
 assert.ok(result.effects.some(e=>e.type==='cancel_timer'));
});

test('old snapshots without trustworthy seat mappings reject numbered playback',()=>{
 const state=initial();const old={...state,config:{...state.config,seatNumbers:undefined}};
 assert.equal(mod.reduce(ctx,old,actor,play(old,'speak_normal_2')).ok,false);
 assert.ok(run(old,play(old,'dawn')).ok);
});
