import { useEffect, useMemo, useState, useRef } from 'react';
import { WEREWOLF_VOICE_CATALOG, getModeratorVoiceError, locateWerewolfAnnouncement, resolveWerewolfVoiceCue, type RoomMemberView, type WerewolfModeratorView } from '@ldj/shared';
import { useScopedAction } from '../../useScopedAction.ts';
import { ConfirmDialog } from '../../../shared-ui/ConfirmDialog.tsx';
import { useConnection } from '../../../connection/useConnection.ts';
import { calculateAdjustedNow } from '../../../shared-ui/serverClock.ts';
import { NARRATION_SETTINGS_EVENT, readNarrationSettings } from '../ui/narrationSettings.ts';
import './moderator-voice.css';

const GROUPS = [['recommended','当前环节推荐'],['night','夜晚'],['day','白天与发言'],['vote','投票与遗言'],['ending','技能与终局']] as const;
export function ModeratorVoicePanel({view,members,autoplayBlocked,onEnableAudio}: {view: WerewolfModeratorView; members: readonly RoomMemberView[]; autoplayBlocked?: boolean; onEnableAudio?: () => void}) {
  const dialogRef = useRef<HTMLElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const { act } = useScopedAction();
  const { state } = useConnection();
  const [open,setOpen] = useState(false);
  const [group,setGroup] = useState('recommended');
  const [query,setQuery] = useState('');
  const numberedPlayers = useMemo(() => view.players.filter(p => members.some(m => m.playerId === p.playerId && m.seat === p.seat)),[view.players,members]);
  const [seat,setSeat] = useState(numberedPlayers[0]?.seat ?? 0);
  const [output,setOutput] = useState<'local'|'room'>('local');
  const [volume,setVolume] = useState(() => readNarrationSettings().volume);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [pending,setPending] = useState<string | null>(null);
  const [lastCue,setLastCue] = useState<string | null>(null);
  const [now,setNow] = useState(() => calculateAdjustedNow(state.clockSample));
  useEffect(() => {
    if (!open || !view.announcement) return;
    const timer = window.setInterval(() => setNow(calculateAdjustedNow(state.clockSample)),250);
    return () => window.clearInterval(timer);
  },[open,view.announcement?.id,state.clockSample]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || pending || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
      const first=nodes[0], last=nodes[nodes.length-1];
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',onKey);
    return () => {document.removeEventListener('keydown',onKey); launchRef.current?.focus();};
  },[open,pending]);
  const context = useMemo(() => ({period: view.gameEnded ? 'day' as const : view.timeline?.period ?? 'night',
    seats: numberedPlayers.map(p=>p.seat), roles: [...new Set(view.players.flatMap(p=>p.role ? [p.role] : []))],
    confirmed: true, gameEnded: view.gameEnded, winner: view.winner}),[view,numberedPlayers]);
  const entries = Object.values(WEREWOLF_VOICE_CATALOG).filter(e => e.availability === 'public'
    && (!e.seat || e.seat === seat) && e.label.includes(query)
    && (group === 'recommended' ? !getModeratorVoiceError([e.cue],context) && (!e.role || e.role === view.timeline?.role) : e.category === group));
  const current = view.announcement ? locateWerewolfAnnouncement(view.announcement,now) : null;
  const playingLabel = current ? resolveWerewolfVoiceCue(current.cue)?.label : null;
  const changeVolume = (value: number) => {
    setVolume(value);
    try { localStorage.setItem('ldj_werewolf_narration_volume',String(value)); localStorage.setItem('ldj_werewolf_narration_enabled',String(value > 0)); } catch { /* optional storage */ }
    window.dispatchEvent(new Event(NARRATION_SETTINGS_EVENT));
  };
  const play = async (cue: string,confirmed = false) => {
    if (busy) return;
    const entry = resolveWerewolfVoiceCue(cue);
    if (cue === 'day_death_intro' && (seat < 1 || seat > 12 || !numberedPlayers.some(p => p.seat === seat))) {setError('当前没有可用的号码录音');return;}
    if (entry?.confirmation && !confirmed) {setPending(cue);return;}
    setBusy(true);setError('');
    try {
      const ok = await act({action:'moderator_voice_play',object:'voice'}, {type:'moderator_voice_play',cues:cue==='day_death_intro' ? [cue,`day_death_number_${seat}`] : [cue],output,timelineId:view.timeline?.id ?? null,confirmed});
      if (!ok) setError('播放请求失败，环节可能已改变，请重试。');
      else {setLastCue(cue);setPending(null);setNow(calculateAdjustedNow(state.clockSample));}
    } finally {setBusy(false);}
  };
  const stop = async () => {
    if (!view.announcement || busy) return;
    setBusy(true);setError('');
    try { const ok = await act({action:'moderator_voice_stop',object:'voice'},{type:'moderator_voice_stop',announcementId:view.announcement.id}); if(!ok)setError('停止失败，请重试。'); }
    finally {setBusy(false);}
  };
  return <>
    <button ref={launchRef} className="mod-voice-launch" type="button" onClick={()=>setOpen(true)}>语音点播</button>
    {open && <div className="mod-voice-backdrop" onClick={()=>setOpen(false)}>
      <section ref={dialogRef} className="mod-voice-panel" role="dialog" aria-modal="true" aria-label="主持语音点播" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
        <header><h2>主持语音点播</h2><button autoFocus type="button" onClick={()=>setOpen(false)}>关闭</button></header>
        {autoplayBlocked && <button type="button" onClick={onEnableAudio}>点击开启声音</button>}
        <p>只提供现有规则的公开语音。点播会暂停自动辅助，播完请手动恢复。</p>
        <div className="mod-voice-controls">
          <label>出声位置<select value={output} onChange={e=>setOutput(e.target.value as 'local'|'room')}><option value="local">仅本机播放</option><option value="room">全房间播放</option></select></label>
          <label>玩家号码<select value={seat} onChange={e=>setSeat(Number(e.target.value))}>{!numberedPlayers.length && <option value={0}>旧对局号码未同步，请重新开局后使用叫号</option>}{numberedPlayers.map(p=><option key={p.playerId} value={p.seat}>{p.seat}号 · {members.find(m=>m.playerId===p.playerId)?.nickname ?? '玩家'}{p.seat>12?'（无此号码录音）':''}</option>)}</select></label>
          <label>本机音量 {Math.round(volume*100)}%<input aria-label="本机音量" type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>changeVolume(Number(e.target.value))}/></label>
          <label>查找语音<input type="search" placeholder="搜索台词" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        </div>
        {output==='room' && <p>同场外放可能产生回声。已静音的设备不会出声；未解锁音频的玩家需点按开启。</p>}
        <nav aria-label="语音分类">{GROUPS.map(([key,label])=><button type="button" key={key} aria-pressed={group===key} onClick={()=>setGroup(key)}>{label}</button>)}</nav>
        <div className="mod-voice-status" aria-live="polite"><strong>{playingLabel ? `正在播放：${playingLabel}` : '当前没有播报'}</strong><div><button type="button" disabled={busy||!current} onClick={()=>void stop()}>停止</button><button type="button" disabled={busy||!lastCue||Boolean(lastCue&&getModeratorVoiceError([lastCue],context))} onClick={()=>lastCue&&void play(lastCue)}>重播</button></div></div>
        {error && <p role="alert">{error}</p>}
        <div className="mod-voice-list">{entries.map(entry=>{const reason=getModeratorVoiceError([entry.cue],context);return <button type="button" key={entry.cue} disabled={busy||Boolean(reason)} title={reason??entry.label} onClick={()=>void play(entry.cue)}><span>{entry.label}</span><small>{reason??`${(entry.durationMs/1000).toFixed(1)} 秒${entry.confirmation?' · 需确认公开结果':''}`}</small></button>;})}{!entries.length&&<p>没有匹配的语音。可切换分类或号码。</p>}</div>
      </section>
    </div>}
    {pending && <ConfirmDialog title="确认公开结果" message={`即将播放「${resolveWerewolfVoiceCue(pending)?.label}${pending === 'day_death_intro' ? ` · ${seat}号 · ${members.find(m=>m.seat===seat)?.nickname ?? '玩家'}` : ''}」。请确认号码和结果已可向全场公开；此操作不会修改玩家出局状态。`} confirmLabel="确认并播放" busy={busy} onConfirm={()=>void play(pending,true)} onCancel={()=>setPending(null)}/>}
  </>;
}
