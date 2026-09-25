import { z } from 'zod';
import { getVoiceCueDurationMs, isPublicVoiceCue, resolveWerewolfVoiceCue } from './werewolfVoiceManifest.ts';

export const werewolfAnnouncementSchema = z.object({
  id: z.string().min(1), cues: z.array(z.string().refine(isPublicVoiceCue)).min(1).max(16),
  startedAt: z.number().nonnegative(), endsAt: z.number().nonnegative(),
  source: z.enum(['automatic', 'moderator']), output: z.enum(['local', 'room']),
}).strict().refine(v => v.endsAt >= v.startedAt);
export type WerewolfAnnouncement = z.infer<typeof werewolfAnnouncementSchema>;

export function createWerewolfAnnouncement(id: string, cues: readonly string[], now: number,
  source: WerewolfAnnouncement['source'] = 'automatic', output: WerewolfAnnouncement['output'] = 'room'): WerewolfAnnouncement | null {
  if (!cues.length || cues.some(cue => !isPublicVoiceCue(cue))) return null;
  return { id, cues: [...cues], startedAt: now,
    endsAt: now + cues.reduce((ms, cue) => ms + getVoiceCueDurationMs(cue), 0), source, output };
}

/** Seek across a sequence without replaying completed sentences after reconnect. */
export function locateWerewolfAnnouncement(value: WerewolfAnnouncement, now: number) {
  let elapsed = Math.max(0, now - value.startedAt);
  if (now < value.startedAt || now >= value.endsAt) return null;
  for (let index = 0; index < value.cues.length; index++) {
    const cue = value.cues[index]!;
    const duration = getVoiceCueDurationMs(cue);
    if (elapsed < duration) return { cue, index, offsetSeconds: elapsed / 1000 };
    elapsed -= duration;
  }
  return null;
}

export function getModeratorVoiceError(cues: readonly string[], context: {
  period: 'night' | 'day'; seats: readonly number[]; roles: readonly string[]; confirmed: boolean;
  gameEnded: boolean; winner: 'good' | 'werewolf' | null;
}): string | null {
  if (!cues.length || cues.length > 16) return '请选择语音';
  for (const cue of cues) {
    const entry = resolveWerewolfVoiceCue(cue);
    if (!entry || entry.availability !== 'public') return '该语音不允许公放';
    if (entry.period !== context.period) return '该语音不适用于当前昼夜环节';
    if (entry.seat && !context.seats.includes(entry.seat)) return '座位不存在';
    if (entry.role === 'hunter_idiot' && !(context.roles.includes('hunter') && context.roles.includes('idiot'))) return '本局未同时配置猎人与白痴';
    if (entry.role && entry.role !== 'hunter_idiot' && !context.roles.includes(entry.role)) return '本局未配置该角色';
    if (entry.confirmation && !context.confirmed) return '请先确认这是已公开的结果';
    if (cue.startsWith('game_over_') && (!context.gameEnded || cue !== (context.winner === 'good' ? 'game_over_good' : context.winner === 'werewolf' ? 'game_over_wolf' : ''))) return '只能播报已确认的胜负';
  }
  return null;
}
