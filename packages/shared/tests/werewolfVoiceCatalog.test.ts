import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WEREWOLF_VOICE_CATALOG, isPublicVoiceCue, getVoiceCueDurationMs } from '../src/game/werewolfVoiceManifest.ts';
import { createWerewolfAnnouncement, getModeratorVoiceError, locateWerewolfAnnouncement, werewolfAnnouncementSchema } from '../src/game/werewolfAnnouncement.ts';

const context = {period:'day' as const,seats:[2,4,7],roles:['wolf','witch','seer','hunter','idiot'],confirmed:true,gameEnded:false,winner:null};
test('all 130 recordings have one catalog entry and measured RIFF hash/duration',()=>{
 const root=new URL('../../client/public/werewolf-voice/',import.meta.url);
 const files=readdirSync(root,{recursive:true}).filter(f=>String(f).endsWith('.wav')).map(String).map(f=>f.replaceAll('\\','/')).sort();
 const entries=Object.values(WEREWOLF_VOICE_CATALOG);
 assert.equal(entries.length,130);
 assert.deepEqual(entries.map(e=>e.file).sort(),files);
 for(const e of entries){
  const b=readFileSync(new URL(e.file,root)); assert.equal(createHash('sha256').update(b).digest('hex'),e.sha256);
  let offset=12,rate=0,size=0;
  while(offset+8<=b.length){const id=b.toString('ascii',offset,offset+4),n=b.readUInt32LE(offset+4),p=offset+8;
   if(id==='fmt ')rate=b.readUInt32LE(p+8);if(id==='data')size=Math.min(n,b.length-p);offset=p+n+n%2;}
  assert.equal(Math.round(size/rate*1000),e.durationMs,e.cue);assert.ok(e.durationMs>0);assert.ok(e.reason);
 }
 assert.equal(entries.filter(e=>e.availability==='public').length,80);
});
test('private and unsupported recordings cannot enter any public announcement',()=>{
 for(const e of Object.values(WEREWOLF_VOICE_CATALOG).filter(e=>e.availability!=='public')){
  assert.equal(isPublicVoiceCue(e.cue),false);
  assert.equal(createWerewolfAnnouncement('x',[e.cue],0),null);
  assert.ok(getModeratorVoiceError([e.cue],context));
 }
 assert.equal(werewolfAnnouncementSchema.safeParse({id:'x',cues:['seer_good'],startedAt:0,endsAt:2000,source:'moderator',output:'room'}).success,false);
});
test('moderator validates day disclosure, real seats, configured roles and confirmed result',()=>{
 assert.equal(getModeratorVoiceError(['day_death_2'],context),null);
 assert.ok(getModeratorVoiceError(['day_death_2'],{...context,period:'night'}));
 assert.ok(getModeratorVoiceError(['day_death_2'],{...context,confirmed:false}));
 assert.ok(getModeratorVoiceError(['speak_normal_1'],context));
 assert.ok(getModeratorVoiceError(['hunter_shoot'],{...context,roles:['wolf']}));
 assert.ok(getModeratorVoiceError(['game_over_good'],context));
 assert.equal(getModeratorVoiceError(['game_over_good'],{...context,gameEnded:true,winner:'good'}),null);
 assert.ok(getModeratorVoiceError(['game_over_wolf'],{...context,gameEnded:true,winner:'good'}));
});
test('sequence seeks into the current sentence and never replays expired clips',()=>{
 const a=createWerewolfAnnouncement('a',['dawn','day_death_intro','day_death_number_2'],1000)!;
 assert.equal(locateWerewolfAnnouncement(a,999),null);
 assert.equal(locateWerewolfAnnouncement(a,1500)?.cue,'dawn');
 assert.equal(locateWerewolfAnnouncement(a,1000+getVoiceCueDurationMs('dawn')+100)?.offsetSeconds,.1);
 assert.equal(locateWerewolfAnnouncement(a,a.endsAt),null);
 assert.equal(locateWerewolfAnnouncement(a,a.endsAt+60000),null);
});

test('each of the 80 public recordings has a reachable moderator scene',()=>{
 for(const entry of Object.values(WEREWOLF_VOICE_CATALOG).filter(e=>e.availability==='public')) {
  const scene={period:entry.period,seats:Array.from({length:12},(_,i)=>i+1),roles:['wolf','witch','seer','guard','hunter','idiot'],confirmed:true,gameEnded:entry.cue.startsWith('game_over_'),winner:entry.cue==='game_over_good'?'good' as const:entry.cue==='game_over_wolf'?'werewolf' as const:null};
  assert.equal(getModeratorVoiceError([entry.cue],scene),null,entry.cue);
  assert.ok(createWerewolfAnnouncement('reachability',[entry.cue],100),entry.cue);
 }
});
