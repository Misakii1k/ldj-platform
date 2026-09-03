/**
 * 法官语音时序钩子：
 * - 夜晚：串行子阶段步进器（天黑请闭眼 → 狼人 → 女巫 → 预言家 → 守卫 → 猎人/白痴确认 → 天亮），
 *   无论全机器人还是人类玩家，均完整按台词播放各个角色语音，防截断；
 * - 视觉锁：向主舞台暴露 isNightVoiceRunning，在夜间语音未读完前锁定暗夜审判桌画面；
 * - 白天：全链路事件驱动（天亮公布死讯导语+号码拼接/平安夜 → 轮流发言直接叫号 → 投票开始 → 平票PK/出局报号 → 技能与终局判定）。
 */
import { useEffect, useRef, useState } from 'react';
import { hasCue, judgeVoice } from './judgeVoice.ts';
import type { WerewolfPresentationModel } from '../presentation.ts';

export type NightActiveRole = 'wolf' | 'witch' | 'seer' | 'guard' | null;

export interface UseJudgeVoiceResult {
  readonly currentNightRole: NightActiveRole;
  readonly isNightVoiceRunning: boolean;
  readonly isDayAnnouncementRunning: boolean;
  readonly roleRemainingSeconds: number | null;
  readonly roleTotalSeconds: number | null;
}

export function useJudgeVoice(model: WerewolfPresentationModel): UseJudgeVoiceResult {
  const [currentNightRole, setCurrentNightRole] = useState<NightActiveRole>(null);
  const [isNightVoiceRunning, setIsNightVoiceRunning] = useState<boolean>(false);
  const [isDayAnnouncementRunning, setIsDayAnnouncementRunning] = useState<boolean>(false);
  const [roleRemainingSeconds, setRoleRemainingSeconds] = useState<number | null>(null);
  const [roleTotalSeconds, setRoleTotalSeconds] = useState<number | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  const prevPhaseRef = useRef<{ phase: string; day: number } | null>(null);
  const prevSpeakerIdRef = useRef<string | null>(null);
  const lastAnnouncedDayDeathRef = useRef<number>(-1);
  const lastAnnouncedExileRef = useRef<string>('');
  const lastHunterShootAnnouncedRef = useRef<boolean>(false);
  const prevIdiotRevealedSeatsRef = useRef<Set<string>>(new Set());
  const isNightRunningRef = useRef<boolean>(false);
  const isDayAnnouncingRef = useRef<boolean>(false);
  const runIdRef = useRef(0);

  const phase = model.phase;
  const day = model.day;

  // 1. 夜晚串行子阶段步进器（沉浸式完整主持，防机器人秒提交导致语音被截断）
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const isNight = phase === 'night';
    const wasNight = prev?.phase === 'night';
    const isNewNight = isNight && (!wasNight || prev?.day !== day);

    // 服务端一旦退出夜晚阶段（进入天亮公布/发言/终局等），立即强制终止旧的夜晚串行任务与夜晚视觉锁
    if (!isNight && isNightRunningRef.current) {
      runIdRef.current += 1;
      isNightRunningRef.current = false;
      setIsNightVoiceRunning(false);
      setCurrentNightRole(null);
      setRoleRemainingSeconds(null);
      setRoleTotalSeconds(null);
      judgeVoice.interrupt();
    }

    if (isNewNight) {
      runIdRef.current += 1;
      const currentRunId = runIdRef.current;
      isNightRunningRef.current = true;
      setIsNightVoiceRunning(true);
      judgeVoice.interrupt();
      setCurrentNightRole(null);
      setRoleRemainingSeconds(null);
      setRoleTotalSeconds(null);

      const isCurrentRun = () => runIdRef.current === currentRunId && modelRef.current.phase === 'night';

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, ms);
          const checkInterval = window.setInterval(() => {
            if (!isCurrentRun()) {
              window.clearTimeout(timer);
              window.clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        });

      const play = async (key: string): Promise<boolean> => {
        if (!isCurrentRun() || !hasCue(key)) return false;
        return judgeVoice.playCue(key);
      };

      const waitForRole = (
        role: 'wolf' | 'witch' | 'seer' | 'guard',
        isSelfAct: () => boolean,
        simulatedMs = 6000,
        maxWaitMs = 15000,
      ) =>
        new Promise<void>((resolve) => {
          const currentSelf = modelRef.current.self;
          const isSelfThisRole = currentSelf?.role === role && currentSelf.alive;
          const targetDurationMs = isSelfThisRole ? maxWaitMs : simulatedMs;
          const start = Date.now();
          const targetEnd = start + targetDurationMs;

          setRoleTotalSeconds(Math.round(targetDurationMs / 1000));
          setRoleRemainingSeconds(Math.round(targetDurationMs / 1000));

          let finished = false;
          let feedbackTimer: number | null = null;
          let interval: number | null = null;

          const cleanup = () => {
            if (finished) return;
            finished = true;
            if (feedbackTimer) window.clearTimeout(feedbackTimer);
            if (interval) window.clearInterval(interval);
            setRoleRemainingSeconds(null);
            setRoleTotalSeconds(null);
            resolve();
          };

          interval = window.setInterval(() => {
            if (!isCurrentRun() || modelRef.current.phase !== 'night') {
              cleanup();
              return;
            }
            const leftMs = Math.max(0, targetEnd - Date.now());
            setRoleRemainingSeconds(Math.ceil(leftMs / 1000));

            const s = modelRef.current.self;
            const selfAliveThisRole = s?.role === role && s.alive;
            if (selfAliveThisRole) {
              if (isSelfAct()) {
                if (!feedbackTimer) {
                  feedbackTimer = window.setTimeout(cleanup, 800);
                }
              } else if (leftMs <= 0) {
                cleanup();
              }
            } else {
              if (leftMs <= 0) {
                cleanup();
              }
            }
          }, 250);
        });

      const runNight = async () => {
        // 1. 开场：天黑请闭眼
        await play('night_start');
        if (!isCurrentRun()) return;
        await sleep(600);
        if (!isCurrentRun()) return;

        // 2. 狼人环节
        setCurrentNightRole('wolf');
        const isFirstNight = day <= 1;
        if (isFirstNight) {
          await play('wolf_open_first');
          if (!isCurrentRun()) return;
          await sleep(400);
          if (!isCurrentRun()) return;
          await play('wolf_kill');
        } else {
          await play('wolf_open_normal');
          if (!isCurrentRun()) return;
          await sleep(400);
          if (!isCurrentRun()) return;
          await play('wolf_kill');
        }
        if (!isCurrentRun()) return;

        await waitForRole('wolf', () => Boolean(modelRef.current.self?.hasNightVoted), 6000, 15000);
        if (!isCurrentRun()) return;

        await play('wolf_close');
        if (!isCurrentRun()) return;
        await sleep(600);
        if (!isCurrentRun()) return;

        // 3. 女巫环节（全套实录音频链）
        setCurrentNightRole('witch');
        await play('witch_open');
        if (!isCurrentRun()) return;
        await sleep(350);
        if (!isCurrentRun()) return;

        const isWitchSaveUsed = Boolean(modelRef.current.self?.witchSaveUsed);
        if (!isWitchSaveUsed) {
          // 解药未用时：全场播报手势指向死者（不报具体几号）并提示解药
          await play('witch_death_point');
          if (!isCurrentRun()) return;
          await sleep(300);
          if (!isCurrentRun()) return;

          await play('witch_cure_prompt');
          if (!isCurrentRun()) return;
          await sleep(300);
          if (!isCurrentRun()) return;
        }

        // 提示毒药
        await play('witch_poison_prompt');
        if (!isCurrentRun()) return;

        await waitForRole(
          'witch',
          () => {
            const s = modelRef.current.self;
            return s ? s.witchSaveDecision !== null || s.witchPoisonDecided : true;
          },
          6000,
          15000,
        );
        if (!isCurrentRun()) return;

        await play('witch_close');
        if (!isCurrentRun()) return;
        await sleep(600);
        if (!isCurrentRun()) return;

        // 4. 预言家环节
        setCurrentNightRole('seer');
        await play('seer_open');
        if (!isCurrentRun()) return;
        await sleep(300);
        if (!isCurrentRun()) return;
        await play('seer_check');
        if (!isCurrentRun()) return;

        const initialSeerCount = modelRef.current.self?.seerResults.length ?? 0;
        await waitForRole(
          'seer',
          () => {
            const results = modelRef.current.self?.seerResults ?? [];
            return results.length > initialSeerCount;
          },
          6000,
          12000,
        );
        if (!isCurrentRun()) return;
        await sleep(400);
        if (!isCurrentRun()) return;

        // 预言家环节全场播放留尾手势音效（不向全场泄露好人/狼人阵营）
        await play('seer_result_generic');
        if (!isCurrentRun()) return;
        await sleep(300);
        if (!isCurrentRun()) return;

        await play('seer_close');
        if (!isCurrentRun()) return;
        await sleep(600);
        if (!isCurrentRun()) return;

        // 5. 守卫环节（若本局角色池配置了守卫）
        if (modelRef.current.rolesConfig.guard) {
          setCurrentNightRole('guard');
          await play('guard_open');
          if (!isCurrentRun()) return;

          await waitForRole('guard', () => Boolean(modelRef.current.self?.guardDecided), 6000, 12000);
          if (!isCurrentRun()) return;

          await play('guard_close');
          if (!isCurrentRun()) return;
          await sleep(600);
          if (!isCurrentRun()) return;
        }

        // 6. 猎人/白痴首夜确认身份（若本局首夜且配置了猎人或白痴）
        if (isFirstNight && (modelRef.current.rolesConfig.hunter || modelRef.current.rolesConfig.idiot)) {
          await play('hunter_idiot_open');
          if (!isCurrentRun()) return;
          await sleep(3000);
          if (!isCurrentRun()) return;

          await play('hunter_idiot_close');
          if (!isCurrentRun()) return;
          await sleep(600);
          if (!isCurrentRun()) return;
        }

        setCurrentNightRole(null);
        setRoleRemainingSeconds(null);
        setRoleTotalSeconds(null);
        isNightRunningRef.current = false;
        setIsNightVoiceRunning(false);
      };

      void runNight();
    }

    prevPhaseRef.current = { phase, day };
  }, [phase, day]);

  // 2. 白天全流程即时事件播报（天亮死讯导语+号码拼接、轮流发言直接叫号、投票放逐、技能与终局）
  useEffect(() => {
    const isNight = phase === 'night';
    if (isNight) return;

    const prev = prevPhaseRef.current;
    const isPhaseChanged = prev === null || prev.phase !== phase || prev.day !== day;

    const playDayAnnouncement = async () => {
      // 确保夜晚流程已终止
      if (isNightRunningRef.current) {
        runIdRef.current += 1;
        isNightRunningRef.current = false;
        setIsNightVoiceRunning(false);
        setCurrentNightRole(null);
        setRoleRemainingSeconds(null);
        setRoleTotalSeconds(null);
      }

      if (lastAnnouncedDayDeathRef.current === day) return;
      lastAnnouncedDayDeathRef.current = day;

      isDayAnnouncingRef.current = true;
      setIsDayAnnouncementRunning(true);

      judgeVoice.interrupt();
      await judgeVoice.playCue('day_start');
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (model.nightDeathSeats.length === 0) {
        await judgeVoice.playCue('day_peaceful');
      } else {
        // 先播放《昨晚死亡的玩家为...》导语
        await judgeVoice.playCue('day_death_intro');
        await new Promise((resolve) => setTimeout(resolve, 200));

        // 逐一播报死者号码《X号》
        for (const seat of model.nightDeathSeats) {
          const numberCue = `day_death_number_${seat + 1}`;
          if (hasCue(numberCue)) {
            await judgeVoice.playCue(numberCue);
            await new Promise((resolve) => setTimeout(resolve, 200));
          } else {
            const oldCue = `day_death_${seat + 1}`;
            if (hasCue(oldCue)) {
              await judgeVoice.playCue(oldCue);
            }
          }
        }

        if (model.day === 1 && hasCue('day_last_words')) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await judgeVoice.playCue('day_last_words');
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
      isDayAnnouncingRef.current = false;
      setIsDayAnnouncementRunning(false);
    };

    const handleDiscussion = async () => {
      // 若尚未播报今日天亮死讯（或正在播报），必须等死讯播报完整结束后再叫号发言
      if (lastAnnouncedDayDeathRef.current !== day) {
        await playDayAnnouncement();
      }
      while (isDayAnnouncingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const activeSpeaker = model.seats.find((s) => s.isSpeaking);
      const speakerId = activeSpeaker?.playerId ?? null;
      if (speakerId && speakerId !== prevSpeakerIdRef.current) {
        prevSpeakerIdRef.current = speakerId;
        judgeVoice.interrupt();
        const seatIndex = model.seats.findIndex((s) => s.playerId === speakerId);
        if (seatIndex >= 0) {
          // 按照用户需求：不播放死左死右等引导词，直接叫号发言
          const normalCue = `speak_normal_${seatIndex + 1}`;
          const cue = hasCue(normalCue) ? normalCue : `speak_${seatIndex + 1}`;
          void judgeVoice.playCue(cue);
        }
      }
    };

    if (phase === 'day_announcement') {
      void playDayAnnouncement();
    } else if (phase === 'discussion') {
      void handleDiscussion();
    } else if (phase === 'runoff_voting' && isPhaseChanged) {
      judgeVoice.interrupt();
      void judgeVoice.playCue('vote_tie_pk');
    } else if (phase === 'voting' && isPhaseChanged) {
      judgeVoice.interrupt();
      void judgeVoice.playCue('vote_start');
    } else if (phase === 'vote_result' && isPhaseChanged) {
      const exiledSeat = model.voteLedger?.exiledSeat ?? null;
      const key = `${day}-${exiledSeat}`;
      if (lastAnnouncedExileRef.current !== key) {
        lastAnnouncedExileRef.current = key;
        judgeVoice.interrupt();
        if (exiledSeat !== null) {
          const cue = `exile_${exiledSeat + 1}`;
          if (hasCue(cue)) void judgeVoice.playCue(cue);
        } else if (model.voteLedger?.outcome === 'no_votes') {
          // 平票/无人出局
          void judgeVoice.playCue('vote_tie_night');
        }
      }
    } else if (phase === 'last_words' && isPhaseChanged) {
      const activeSpeaker = model.seats.find((s) => s.isSpeaking);
      if (activeSpeaker) {
        const seatIndex = model.seats.findIndex((s) => s.playerId === activeSpeaker.playerId);
        if (seatIndex >= 0) {
          const key = `lw-${day}-${seatIndex}`;
          if (lastAnnouncedExileRef.current !== key) {
            lastAnnouncedExileRef.current = key;
            judgeVoice.interrupt();
            const cue = `exile_${seatIndex + 1}`;
            if (hasCue(cue)) void judgeVoice.playCue(cue);
          }
        }
      }
    } else if (phase === 'hunter_shot' && isPhaseChanged) {
      if (!lastHunterShootAnnouncedRef.current) {
        lastHunterShootAnnouncedRef.current = true;
        judgeVoice.interrupt();
        void judgeVoice.playCue('hunter_shoot');
      }
    }

    // 监听白痴翻牌免死
    const currentIdiotRevealed = new Set(
      model.seats.filter((s) => s.idiotRevealed).map((s) => s.playerId),
    );
    for (const playerId of currentIdiotRevealed) {
      if (!prevIdiotRevealedSeatsRef.current.has(playerId)) {
        judgeVoice.interrupt();
        void judgeVoice.playCue('idiot_reveal');
        break;
      }
    }
    prevIdiotRevealedSeatsRef.current = currentIdiotRevealed;
  }, [model, phase, day]);

  // 3. 终局胜负
  useEffect(() => {
    if (phase === 'game_over') {
      runIdRef.current += 1;
      isNightRunningRef.current = false;
      setIsNightVoiceRunning(false);
      judgeVoice.interrupt();
      if (model.winner === 'village') {
        void judgeVoice.playCue('game_over_good');
      } else if (model.winner === 'wolves') {
        void judgeVoice.playCue('game_over_wolf');
      }
      setCurrentNightRole(null);
    }
  }, [model.winner, phase]);

  // 4. 组件卸载清理
  useEffect(() => () => {
    runIdRef.current += 1;
    isNightRunningRef.current = false;
    setIsNightVoiceRunning(false);
    setIsDayAnnouncementRunning(false);
    isDayAnnouncingRef.current = false;
    judgeVoice.stopAll();
  }, []);

  return {
    currentNightRole,
    isNightVoiceRunning,
    isDayAnnouncementRunning,
    roleRemainingSeconds,
    roleTotalSeconds,
  };
}
