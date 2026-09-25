import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSceneCues, applyPublicSceneVoice, type VoiceView } from '../server/publicVoice.ts';
import { buildNightPlan, createInitialTimelineState } from '../server/timeline.ts';
import { createWerewolfAnnouncement, getVoiceCueDurationMs, resolveWerewolfVoiceCue, type WerewolfAnnouncement } from '@ldj/shared';
const base:VoiceView={phase:'night',day:1,players:Array.from({length:12},(_,i)=>({playerId:`p${i+1}`,seat:i})),currentSpeakerId:null,lastWordsPlayerId:null,lastNightDeaths:[],lastVoteSummary:null,winner:null,aborted:false};
test('public scenes map peaceful, single/multiple deaths and all real seat numbers',()=>{
 assert.deepEqual(publicSceneCues(base,{...base,phase:'day_announcement'}),['dawn','day_peaceful']);
 for(let i=1;i<=12;i++){
  assert.deepEqual(publicSceneCues(base,{...base,phase:'day_announcement',lastNightDeaths:[`p${i}`]}),['dawn',`day_death_${i}`]);
  assert.deepEqual(publicSceneCues(base,{...base,phase:'discussion',currentSpeakerId:`p${i}`,players:[...base.players].reverse()}),[`speak_normal_${i}`]);
  assert.deepEqual(publicSceneCues(base,{...base,phase:'last_words',lastWordsPlayerId:`p${i}`,lastVoteSummary:{outcome:'eliminated',eliminatedPlayerId:`p${i}`}}),[`exile_${i}`]);
 }
 assert.deepEqual(publicSceneCues(base,{...base,phase:'day_announcement',lastNightDeaths:['p5','p2']}),['dawn','day_death_intro','day_death_number_2','day_death_number_5']);
});
test('votes, actual skills, last words, winners and abort use only matching lines',()=>{
 for(const phase of ['voting','runoff_voting'])assert.deepEqual(publicSceneCues(base,{...base,phase}),['vote_start']);
 for(const outcome of ['tie','no_votes','eliminated'])assert.deepEqual(publicSceneCues(base,{...base,phase:'vote_result',lastVoteSummary:{outcome,eliminatedPlayerId:null}}),[]);
 for(const [outcome,cue] of [['runoff_tie','vote_tie_night'],['idiot_saved','idiot_reveal']])assert.deepEqual(publicSceneCues(base,{...base,phase:'vote_result',lastVoteSummary:{outcome:outcome!,eliminatedPlayerId:null}}),[cue]);
 assert.deepEqual(publicSceneCues(base,{...base,phase:'hunter_shot'}),['hunter_shoot']);
 assert.deepEqual(publicSceneCues(base,{...base,phase:'last_words',lastWordsPlayerId:'p4'}),['day_last_words','speak_normal_4']);
 for(const winner of ['village','wolves'])assert.deepEqual(publicSceneCues(base,{...base,phase:'game_over',winner}),[winner==='village'?'game_over_good':'game_over_wolf']);
 assert.deepEqual(publicSceneCues(base,{...base,phase:'game_over',winner:'wolves',aborted:true}),[]);
 const same={...base,phase:'discussion',currentSpeakerId:'p4'};assert.deepEqual(publicSceneCues(same,same),[]);
});
test('automatic cue duration extends scheduled timer and stale night clips are cleared',()=>{
 const timelineState=createInitialTimelineState(buildNightPlan({},1),1,'auto',100);
 const before={phase:'night',day:1,deadlineAt:1000,timelineState};
 const after={...before,phase:'discussion',deadlineAt:2000};
 const result=applyPublicSceneVoice(before,after,base,{...base,phase:'discussion',currentSpeakerId:'p1'},100, [{type:'schedule_timer',timerId:'x',deadlineAt:2000,action:{type:'phase_timeout'}}],false);
 assert.equal(result.state.deadlineAt,2000+getVoiceCueDurationMs('speak_normal_1'));
 assert.equal(result.effects[0]?.type,'schedule_timer');
 assert.equal(result.state.timelineState.current.period,'day');assert.equal(result.state.timelineState.current.cue,null);
 const prior={...before,announcement:createWerewolfAnnouncement('old',['dawn'],0)};
 const next={...before,announcement:prior.announcement,timelineState:{...timelineState,current:{...timelineState.current,id:'new'}}};
 assert.equal(applyPublicSceneVoice(prior,next,base,base,100,[],false).state.announcement,null);
});

test('all generated night cues are accurately classified as automatic in the inventory',()=>{
 for(const day of [1,2])for(const step of buildNightPlan({guard:true,hunter:true,idiot:true},day)) {
  if(step.cue)assert.equal(resolveWerewolfVoiceCue(step.cue)?.automatic,true,step.cue);
 }
});

test('private potion states, targets and inspections never change the public witch sequence',()=>{
 const timelineState=createInitialTimelineState(buildNightPlan({},1),1,'auto',100);
 const previous={phase:'night',day:1,deadlineAt:5000,timelineState,announcement:null as WerewolfAnnouncement|null};
 let expected:unknown;
 for(const antidoteUsed of [false,true])for(const poisonUsed of [false,true])for(const wolfTarget of ['p1','p5',null])for(const seerResult of ['village','wolves']) {
  const next={...previous,antidoteUsed,poisonUsed,wolfTarget,seerResult,timelineState:{...timelineState,current:{...timelineState.current,id:'witch-action',role:'witch' as const,segment:'action' as const}}};
  const result=applyPublicSceneVoice(previous,next,base,base,100,[],false);
  const publicOutput={announcement:result.state.announcement,deadlineAt:result.state.deadlineAt,effects:result.effects};
  if(!expected)expected=publicOutput;
  assert.deepEqual(publicOutput,expected);
  assert.deepEqual(result.state.announcement?.cues,['witch_cure_prompt','witch_poison_prompt']);
 }
 assert.deepEqual(publicSceneCues(base,{...base,lastNightDeaths:['p1']}),[]);
});
