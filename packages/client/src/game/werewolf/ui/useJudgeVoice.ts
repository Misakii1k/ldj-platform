/**
 * 法官语音时序钩子：JudgeVoiceDirector 的 React 薄适配层。
 *
 * - 夜晚：串行子阶段步进器（天黑请闭眼 → 狼人 → 女巫 → 预言家 → 守卫 → 猎人/白痴确认），
 *   完整按台词播放，不被服务端提前结算截断；
 * - 白天：天亮死讯 → 叫号发言 → 投票 → 放逐 → 技能与终局，全部经导演串行队列按序播出；
 * - 视觉锁：向主舞台暴露 isNightVoiceRunning / isDayAnnouncementRunning，
 *   在语音未播完前锁定对应画面。
 * 时序、去重、接管与重连引导逻辑见 judgeVoiceDirector.ts。
 */
import { useEffect, useRef, useState } from 'react';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { JudgeVoiceDirector } from './judgeVoiceDirector.ts';
import type { JudgeVoiceDirectorFlags, NightActiveRole } from './judgeVoiceDirector.ts';

export type { NightActiveRole } from './judgeVoiceDirector.ts';

export interface UseJudgeVoiceResult {
  readonly currentNightRole: NightActiveRole;
  readonly isNightVoiceRunning: boolean;
  readonly isDayAnnouncementRunning: boolean;
  readonly roleRemainingSeconds: number | null;
  readonly roleTotalSeconds: number | null;
}

const INITIAL_FLAGS: JudgeVoiceDirectorFlags = {
  currentNightRole: null,
  isNightVoiceRunning: false,
  isDayAnnouncementRunning: false,
  roleRemainingSeconds: null,
  roleTotalSeconds: null,
};

export function useJudgeVoice(model: WerewolfPresentationModel): UseJudgeVoiceResult {
  const [flags, setFlags] = useState<JudgeVoiceDirectorFlags>(INITIAL_FLAGS);
  const modelRef = useRef(model);
  modelRef.current = model;

  const directorRef = useRef<JudgeVoiceDirector | null>(null);
  if (!directorRef.current) {
    const director = new JudgeVoiceDirector({
      getModel: () => modelRef.current,
      onUpdate: setFlags,
      now: () => Date.now(),
      startTimer: (ms, onFire) => {
        const handle = window.setTimeout(onFire, ms);
        return () => window.clearTimeout(handle);
      },
      startTicker: (ms, onTick) => {
        const handle = window.setInterval(onTick, ms);
        return () => window.clearInterval(handle);
      },
    });
    // 挂载引导：把当前状态视为已播报，重连/重挂载不重放历史语音
    director.bootstrap(model);
    directorRef.current = director;
  }

  const director = directorRef.current;

  // 视图每次快照更新都同步给导演；触发判定与去重全部幂等
  useEffect(() => {
    director.sync(modelRef.current);
  }, [director, model]);

  useEffect(
    () => () => {
      directorRef.current?.dispose();
      directorRef.current = null;
    },
    [],
  );

  return flags;
}
