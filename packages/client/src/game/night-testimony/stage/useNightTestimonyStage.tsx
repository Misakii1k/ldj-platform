import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { measure, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { NightTestimonyPlayerView, QuestionRecord } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor } from './audioCues.ts';

/** 红章从答题格飞回档案袋的基准时长 */
const PIN_FLIGHT_MS = 560;
/** 红章之间的错峰间隔 */
const PIN_STAGGER_MS = 90;
/** 翻开后到归档之间的停顿：让玩家看清谁说了 YES */
const FLIP_HOLD_MS = 900;
/** 选票逐张落下的间隔 */
const BALLOT_STAGGER_MS = 240;
/** 抓出狱警后停留多久再进猜罪（生产无按钮，2 秒自动进入） */
const REVEAL_HOLD_MS = 2000;
/** 猜罪核对：每只袋子的间隔 */
const CHECK_STAGGER_MS = 360;

export interface RevealPlayState {
  /** 被抽出的档案袋；无人投票 / 自曝分支为 null（直接翻狱警袋） */
  readonly accusedId: string | null;
  /** 抽出来的是不是狱警 */
  readonly isWarden: boolean;
  /** 真狱警（抓错人分支翻开用） */
  readonly wardenId: string | null;
  /** 开票成因：投票 / 超时无人投票 / 狱警自曝 */
  readonly reason: 'vote' | 'timeout' | 'self-expose';
  readonly voterIds: readonly string[];
  readonly step: 'ballots' | 'pulled' | 'torn' | 'result';
}

export interface NightStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 正在做「全员答完同时翻开」演出的那张已归档审讯单 */
  readonly flipRecord: QuestionRecord | null;
  /** flipRecord 里答 YES 的人（档案袋上浮 + 盖章用） */
  readonly flipYesIds: readonly string[];
  /** 屏震触发计数：每次 +1 重放一次抖动（仅 full 档） */
  readonly shakeTick: number;
  /** 开票演出状态；null = 不在开票 */
  readonly revealPlay: RevealPlayState | null;
  /** 开票演出已完毕（含刷新重连直接落终态） */
  readonly revealDone: boolean;
  /** 猜罪核对进度（已核对只数）；null = 不在核对 / 一次性全显 */
  readonly checkProgress: number | null;
  /** 暗角开启：投票与猜罪阶段 */
  readonly vignette: boolean;
}

/**
 * 囚徒之夜演出编排（档案室版）。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useNightTestimonyStage(view: NightTestimonyPlayerView): NightStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [flipRecord, setFlipRecord] = useState<QuestionRecord | null>(null);
  const [shakeTick, setShakeTick] = useState(0);
  const [revealPlay, setRevealPlay] = useState<RevealPlayState | null>(null);
  const [revealDone, setRevealDone] = useState(view.phase === 'game_over');
  const [checkProgress, setCheckProgress] = useState<number | null>(null);

  // 舞台根节点：.nt-desk。锚点查找限定在这棵子树内。
  const stageRef = useRef<HTMLDivElement | null>(null);
  // play 回调需要在机器构造前读到最新 view（开票分支判断、猜罪名单）
  const viewRef = useRef(view);
  viewRef.current = view;

  const shake = useCallback(() => setShakeTick((t) => t + 1), []);

  /** 席位矩形：档案袋由本页自绘（hideSeats），带 data-player-id。 */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const chipRect = useCallback((playerId: string): Rect | null => {
    const root = stageRef.current;
    if (!root) return null;
    return measure(root.querySelector(`[data-nt-chip="${CSS.escape(playerId)}"]`));
  }, []);

  const playDocketPinned = useCallback(
    async (record: QuestionRecord, ctx: StagePlayContext) => {
      // 低动效档：不翻开不飞章，旧单直接落进档案叠（CSS 淡入）
      if (!ctx.softAnimated) return;

      const yesIds = Object.keys(record.answers).filter((id) => record.answers[id] === 'yes');
      setFlipRecord(record);
      if (ctx.animated) shake();

      // 等盖章格翻开（CSS 380ms），再让 YES 的红章依次飞回档案袋
      await wait(420, ctx.signal);
      if (ctx.signal.aborted) return;

      if (ctx.animated) {
        const legs = yesIds
          .map((pid, index) => {
            const from = chipRect(pid);
            const to = seatRect(pid);
            if (!from || !to) return null;
            return { pid, from, to, index };
          })
          .filter((x): x is { pid: string; from: Rect; to: Rect; index: number } => x !== null);

        if (legs.length > 0) {
          setFlights(
            legs.map(({ pid, from, to, index }) => ({
              id: `pin:${record.questionIndex}:${pid}`,
              motion: 'toss' as const,
              from,
              to,
              arc: 120,
              durationMs: PIN_FLIGHT_MS,
              delayMs: index * PIN_STAGGER_MS,
              pieces: [
                {
                  key: `pin-${pid}`,
                  width: 34,
                  height: 22,
                  paper: false,
                  className: 'nt-pin-ghost',
                  node: <span className="nt-pin-fly" aria-hidden="true" />,
                },
              ],
            })),
          );
          await wait(PIN_FLIGHT_MS + legs.length * PIN_STAGGER_MS, ctx.signal);
          if (ctx.signal.aborted) return;
          setFlights([]);
        }
      }

      await wait(FLIP_HOLD_MS, ctx.signal);
      if (!ctx.signal.aborted) setFlipRecord(null);
    },
    [chipRect, seatRect, shake],
  );

  const playVoteResolved = useCallback(
    async (accusedId: string, voterIds: readonly string[], ctx: StagePlayContext) => {
      const v = viewRef.current;
      const isWarden = v.wardenRevealed === true;
      const wardenId = v.reveal?.wardenId ?? null;

      // 低动效档：直接落终态
      if (!ctx.softAnimated) {
        setRevealDone(true);
        return;
      }

      const orderedVoters = v.players.filter((id) => voterIds.includes(id));

      // 1. 选票按座次逐张落下（只写投票人，没有投向与票数）
      setRevealPlay({ accusedId, isWarden, wardenId, reason: 'vote', voterIds: orderedVoters, step: 'ballots' });
      await wait(orderedVoters.length * BALLOT_STAGGER_MS + 500, ctx.signal);
      if (ctx.signal.aborted) return;

      // 2. 被抽出的档案袋飞到桌面中央
      setRevealPlay({ accusedId, isWarden, wardenId, reason: 'vote', voterIds: orderedVoters, step: 'pulled' });
      if (ctx.animated) shake();
      await wait(620, ctx.signal);
      if (ctx.signal.aborted) return;

      // 3. 撕封条、证件滑出
      setRevealPlay({ accusedId, isWarden, wardenId, reason: 'vote', voterIds: orderedVoters, step: 'torn' });
      if (ctx.animated) shake();
      await wait(560, ctx.signal);
      if (ctx.signal.aborted) return;

      // 4. 告示牌结果；抓到狱警则停留 2 秒后由服务端状态接进猜罪
      setRevealPlay({ accusedId, isWarden, wardenId, reason: 'vote', voterIds: orderedVoters, step: 'result' });
      if (ctx.animated) shake();
      await wait(REVEAL_HOLD_MS, ctx.signal);
      if (ctx.signal.aborted) return;
      setRevealPlay(null);
      setRevealDone(true);
    },
    [shake],
  );

  /** 无选票的进终局分支：投票超时无人投票（狱警直接胜）/ 狱警自曝（进猜罪）。 */
  const playBareGameOver = useCallback(
    async (ctx: StagePlayContext) => {
      const v = viewRef.current;
      if (v.accusedId !== null) return; // 有被告 = voteResolved 已演过
      const wardenId = v.reveal?.wardenId ?? null;
      if (!wardenId) return;
      if (!ctx.softAnimated) {
        setRevealDone(true);
        return;
      }
      const reason = v.guessingInProgress ? 'self-expose' : 'timeout';
      setRevealPlay({ accusedId: null, isWarden: true, wardenId, reason, voterIds: [], step: 'result' });
      if (ctx.animated) shake();
      await wait(1200, ctx.signal);
      if (ctx.signal.aborted) return;
      setRevealPlay(null);
      setRevealDone(true);
    },
    [shake],
  );

  const playGuessesRevealed = useCallback(
    async (ctx: StagePlayContext) => {
      const v = viewRef.current;
      const wardenId = v.reveal?.wardenId ?? v.accusedId ?? null;
      const inmates = v.players.filter((id) => id !== wardenId);
      // 低动效档 / 刷新重连：一次全显
      if (!ctx.softAnimated) {
        setCheckProgress(null);
        return;
      }
      for (let i = 1; i <= inmates.length; i += 1) {
        if (ctx.signal.aborted) return;
        setCheckProgress(i);
        if (ctx.animated) shake();
        await wait(CHECK_STAGGER_MS, ctx.signal);
      }
      if (!ctx.signal.aborted) setCheckProgress(null);
    },
    [shake],
  );

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'docketPinned':
          await playDocketPinned(event.record, ctx);
          return;
        case 'voteResolved':
          await playVoteResolved(event.accusedId, event.voterIds, ctx);
          return;
        case 'guessesRevealed':
          await playGuessesRevealed(ctx);
          return;
        case 'gameOver':
          await playBareGameOver(ctx);
          return;
        // 其余事件只有音效与静态表现（暗角、档案袋换皮由渲染层直接读 view）
        default:
          return;
      }
    },
    [playDocketPinned, playVoteResolved, playGuessesRevealed, playBareGameOver],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setFlipRecord(null);
    setRevealPlay(null);
    setCheckProgress(null);
  }, []);

  const machine = useStageMachine<NightTestimonyPlayerView, StageEvent>({
    view,
    namespace: 'night-testimony',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 终局必须立刻开演：它受服务端展示时长约束，不能排在上一段动画后面等
    isHardCut: (event) => event.kind === 'gameOver',
    applyFinalState: (v) => {
      clear();
      setRevealDone(v.phase === 'game_over');
    },
    onSettle: (v) => {
      clear();
      if (v.phase === 'game_over') setRevealDone(true);
    },
    play: async (event, ctx) => {
      playCueFor(event);
      await playEvent(event, ctx);
    },
  });

  return {
    stageRef,
    flights,
    isPlaying: machine.isPlaying,
    simplifiedFlights: machine.simplifiedFlights,
    flipRecord,
    flipYesIds: flipRecord
      ? Object.keys(flipRecord.answers).filter((id) => flipRecord.answers[id] === 'yes')
      : [],
    shakeTick,
    revealPlay,
    revealDone,
    checkProgress,
    // 投票与狱警猜罪：审讯灯只照桌中央
    vignette: view.phase === 'vote' || view.guessingInProgress,
  };
}
