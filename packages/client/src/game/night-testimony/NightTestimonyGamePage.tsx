/**
 * night_testimony_v1 客户端主页面（C 牛皮纸档案室 · 视觉落地）。
 * 只消费严格解析后的囚徒之夜视角（night-testimony/types.ts）。
 *
 * 视觉：监狱档案室的办公桌（俯视）——中央夹板审讯单、右上旧审讯单一叠、
 * 底部一排牛皮纸档案袋席位；回答 = 盖章，投票 = 贴封条，开票 = 拆档案袋。
 * 像素参照：docs/ui-preview/night-testimony/directions/（C-kraft-archive 定稿 + S1–S4）
 * 交接计划：docs/plans/2026-09-26-night-testimony-visual/README.md
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { StageCountdownRing } from '../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer, type StageFlight } from '../../shared-ui/stage/FlightLayer.tsx';
import { measure, type Rect } from '../../shared-ui/stage/flip.ts';
import { TestimonyBoard } from './stage/TestimonyBoard.tsx';
import { TestimonyNote } from './stage/TestimonyNote.tsx';
import { ArchiveFiles, publicWardenId } from './stage/ArchiveFiles.tsx';
import {
  buildAnswerCells,
  buildGuessBoard,
  crimeLabel,
  NoticeBoard,
  seatColor,
} from './stage/ArchiveProps.tsx';
import { useNightTestimonyStage } from './stage/useNightTestimonyStage.tsx';
import { CRIME_META } from './types.ts';
import type { CrimeId, NightTestimonyPlayerView } from './types.ts';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';
import { usePhaseEventOverlay } from '../../shared-ui/usePhaseEventOverlay.tsx';

/** 阶段标签（deduction 是死值：服务端 rules.ts 从未赋过它）。 */
function phaseLabel(view: NightTestimonyPlayerView): string {
  if (view.guessingInProgress) return '狱警猜罪';
  switch (view.phase) {
    case 'question': return '审讯问答';
    case 'vote': return '票选狱警';
    case 'game_over': return '对局结束';
    default: return view.phase;
  }
}

interface Props {
  view: NightTestimonyPlayerView;
}

export function NightTestimonyGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;

  const stage = useNightTestimonyStage(view);

  // ── 本地交互状态（都不是游戏事实：事实一律以服务端视角为准） ──
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [exposeConfirmOpen, setExposeConfirmOpen] = useState(false);
  const [secretHidden, setSecretHidden] = useState(false);
  const [pickingCardId, setPickingCardId] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  /** 我自己贴出去的封条（只有我自己的屏幕看得见） */
  const [mySealTargetId, setMySealTargetId] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<Record<string, CrimeId>>({});
  const [chosenCrime, setChosenCrime] = useState<CrimeId | null>(null);
  const [guessFocusId, setGuessFocusId] = useState<string | null>(null);
  const [localFlights, setLocalFlights] = useState<readonly StageFlight[]>([]);

  // 阶段切换时清掉上一阶段的本地交互残留
  useEffect(() => {
    setVoteTarget(null);
    setMySealTargetId(null);
    setGuesses({});
    setChosenCrime(null);
    setGuessFocusId(null);
    setPickingCardId(null);
  }, [view.phase, view.guessingInProgress]);

  // 屏震：shakeTick 变化时抖一下桌面（≤4px，240ms）
  useEffect(() => {
    if (stage.shakeTick === 0) return;
    stage.stageRef.current?.animate(
      [{ translate: '0 0' }, { translate: '-4px 2px' }, { translate: '3px -2px' }, { translate: '0 0' }],
      { duration: 240 },
    );
  }, [stage.shakeTick, stage.stageRef]);

  /** 本地操作反馈飞行（自己盖章 / 贴封条 / 贴标签）：不等服务端确认的先手反馈。 */
  const flyLocal = useCallback((flight: StageFlight) => {
    setLocalFlights((fs) => [...fs, flight]);
    window.setTimeout(
      () => setLocalFlights((fs) => fs.filter((f) => f.id !== flight.id)),
      flight.durationMs + flight.delayMs + 150,
    );
  }, []);

  const rectOf = useCallback((selector: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(selector));
  }, []);

  const flyBetween = useCallback(
    (fromSel: string, toSel: string, piece: StageFlight['pieces'][number], id: string, arc: number, durationMs: number) => {
      const from = rectOf(fromSel);
      const to = rectOf(toSel);
      if (!from || !to) return;
      flyLocal({ id, from, to, arc, durationMs, delayMs: 0, motion: 'toss', pieces: [piece] });
    },
    [flyLocal, rectOf],
  );

  // ── 派生状态 ──
  const hasSelfExposed = Boolean(myId && view.revealedIdentities[myId]);
  const isMyTurnToPickCard =
    view.phase === 'question' && view.currentQuestion === null && view.currentQuestionerId === myId && !hasSelfExposed;
  const isQuestionActive = view.phase === 'question' && view.currentQuestion !== null;
  const wardenId = publicWardenId(view);
  const hasVoted = (me?.hasVoted ?? false) || mySealTargetId !== null;
  const slipNo = view.currentQuestion?.questionIndex ?? Math.min(view.history.length + 1, view.questionLimit);

  // YES 余量只从已归档的 history 推导：作答期间 playerYesCounts 实时下发，
  // 直接渲染会把「谁刚用了 YES」泄露给所有人（隐私红线）。归档时才进 pip，
  // 恰好与红章飞回档案袋的演出台点一致。
  const archivedYesCounts: Record<string, number> = {};
  for (const record of view.history) {
    for (const [pid, ans] of Object.entries(record.answers)) {
      if (ans === 'yes') archivedYesCounts[pid] = (archivedYesCounts[pid] ?? 0) + 1;
    }
  }

  // 阶段切换全屏盖印：投票 / 猜罪
  const { overlay: phaseOverlay } = usePhaseEventOverlay(
    `${view.phase}:${view.guessingInProgress ? 'guessing' : 'normal'}`,
    (key) => {
      if (key.startsWith('vote:normal')) return { label: '投票指认狱警', variant: 'warning' };
      if (key.endsWith(':guessing')) return { label: '狱警猜罪', sublabel: '猜中全部罪行即可翻盘', variant: 'reveal' };
      return null;
    },
  );

  // ── 操作 ──
  const answer = (ans: 'yes' | 'no') => {
    if (!myId || busy) return;
    flyBetween(
      `[data-player-id="${CSS.escape(myId)}"]`,
      `[data-nt-chip="${CSS.escape(myId)}"]`,
      { key: 'my-stamp', width: 90, height: 64, paper: false, className: 'nt-chip-ghost', node: <span className={`nt-chip-fly nt-chip-fly--${ans}`} aria-hidden="true" /> },
      `my-stamp:${view.currentQuestion?.questionIndex ?? 0}`,
      90,
      520,
    );
    void act({ type: 'answer_question', playerId: myId, answer: ans });
  };

  const pickCard = (cardId: string) => {
    if (!myId || busy || pickingCardId) return;
    setPickingCardId(cardId);
    void act({ type: 'pick_question_card', playerId: myId, cardId });
  };

  const castVote = () => {
    if (!myId || !voteTarget || busy || hasVoted) return;
    const target = voteTarget;
    flyBetween(
      `[data-player-id="${CSS.escape(myId)}"]`,
      `[data-player-id="${CSS.escape(target)}"]`,
      { key: 'my-tape', width: 120, height: 26, paper: false, className: 'nt-tape-ghost', node: <span className="nt-tape-fly" aria-hidden="true" /> },
      `my-tape:${target}`,
      140,
      560,
    );
    setMySealTargetId(target);
    void act({ type: 'cast_vote', playerId: myId, targetPlayerId: target });
  };

  const placeCrime = useCallback(
    (folderId: string, crime: CrimeId) => {
      flyBetween(
        `[data-nt-label="${CSS.escape(crime)}"]`,
        `[data-player-id="${CSS.escape(folderId)}"]`,
        { key: 'label', width: 96, height: 36, paper: false, className: 'nt-label-ghost', node: <span className="nt-label-fly">{crimeLabel(crime)}</span> },
        `label:${folderId}:${crime}`,
        70,
        440,
      );
      setGuesses((prev) => ({ ...prev, [folderId]: crime }));
      setChosenCrime(null);
      setGuessFocusId(null);
    },
    [flyBetween],
  );

  const pickLabel = (crime: CrimeId) => {
    if (chosenCrime === crime) {
      setChosenCrime(null);
      return;
    }
    setChosenCrime(crime);
    if (guessFocusId) placeCrime(guessFocusId, crime);
  };

  const pickFolder = (folderId: string) => {
    if (chosenCrime) {
      placeCrime(folderId, chosenCrime);
    } else {
      setGuessFocusId((prev) => (prev === folderId ? null : folderId));
    }
  };

  // ── 猜罪模型（纯函数，隐私红线在里面） ──
  const guessBoard = buildGuessBoard(view, wardenId, guesses, stage.checkProgress, Boolean(me?.isWarden));
  const guessComplete = guessBoard.filledCount >= guessBoard.inmateCount && guessBoard.inmateCount > 0;

  const submitGuesses = () => {
    if (!myId || busy || !guessComplete) return;
    const payload: Record<string, CrimeId> = {};
    for (const id of view.players) {
      if (id === wardenId) continue;
      const locked = view.revealedIdentities[id];
      const crime = locked && locked !== 'warden' ? locked : guesses[id];
      if (crime) payload[id] = crime;
    }
    void act({ type: 'submit_guesses', playerId: myId, guesses: payload });
  };

  // ── 底栏文案 ──
  const myCrimeName = me?.crime ? CRIME_META[me.crime]?.name ?? '' : '';
  const dockText = ((): { title: string; sub: string } => {
    if (stage.revealPlay) return { title: '开票中……', sub: '' };
    if (view.guessingInProgress) {
      return me?.isWarden
        ? { title: '最后的翻盘机会', sub: '先点标签再点档案袋；点已贴的袋子可以换' }
        : { title: `等狱警猜罪`, sub: '你的罪行只有你自己知道——希望你答题时没暴露太多' };
    }
    if (view.phase === 'vote') {
      return hasVoted
        ? { title: `已投 · ${view.votedPlayerIds.length} / ${view.players.length}`, sub: '只有你知道投了谁；全员投完立刻开票' }
        : { title: '点一只档案袋，指认狱警', sub: '狱警没有罪行，只能靠猜答题——找出 YES 最不像真话的人' };
    }
    if (view.phase === 'game_over') {
      return { title: '游戏结束', sub: '案卷已定，真相大白' };
    }
    if (isMyTurnToPickCard) {
      return { title: '轮到你出题', sub: '挑一个能让狱警露馅的问题——他没有罪行，只能靠猜着答' };
    }
    if (isQuestionActive) {
      if (hasSelfExposed) return { title: '你已自告，排除嫌疑', sub: '本轮无需作答，等其他人盖章' };
      if (me?.hasAnsweredCurrent) return { title: '已作答，等其他人亮牌', sub: '所有人答完会同时翻牌' };
      return {
        title: '轮到你回答',
        sub: me?.isWarden ? '你是潜伏狱警，回答可真可假' : `你是囚犯，罪行「${myCrimeName}」——按你的理解作答即可`,
      };
    }
    return { title: `${nameFor(members, view.currentQuestionerId)} 在出题`, sub: '等审讯单下来，按你的罪行如实回答' };
  })();

  // ── 底栏按钮 ──
  const dockButtons: ReactNode = (() => {
    // 注意：猜罪期间 phase 已是 game_over（guessingInProgress=true），不能在这里拦掉
    if (isSpectator || (view.phase === 'game_over' && !view.guessingInProgress)) return null;
    if (stage.revealPlay) return null; // 开票演出中不出按钮
    const exposeBtn = !hasSelfExposed && !view.guessingInProgress && myId && (
      <button
        key="expose"
        type="button"
        className="nt-btn nt-btn--expose"
        disabled={busy}
        onClick={() => setExposeConfirmOpen(true)}
      >
        自告罪行<span className="nt-btn__long">（排除嫌疑）</span>
      </button>
    );
    if (view.guessingInProgress) {
      if (!me?.isWarden) return null;
      return (
        <button
          type="button"
          className="nt-btn nt-btn--primary"
          disabled={busy || !guessComplete}
          onClick={submitGuesses}
        >
          {busy ? '提交中…' : `提交猜罪（${guessBoard.filledCount}/${guessBoard.inmateCount}）`}
        </button>
      );
    }
    if (view.phase === 'vote' && myId) {
      return (
        <>
          {exposeBtn}
          <button
            type="button"
            className="nt-btn nt-btn--coral"
            disabled={busy || hasVoted || !voteTarget}
            onClick={castVote}
          >
            {hasVoted ? '已贴封条' : voteTarget ? `给 ${nameFor(members, voteTarget)} 贴封条` : '贴封条'}
          </button>
        </>
      );
    }
    if (view.phase === 'question' && isQuestionActive && me && !me.hasAnsweredCurrent && !hasSelfExposed) {
      return (
        <>
          {exposeBtn}
          <button type="button" className="nt-btn nt-btn--no" disabled={busy} onClick={() => answer('no')}>
            盖 NO
          </button>
          <button type="button" className="nt-btn nt-btn--yes" disabled={busy} onClick={() => answer('yes')}>
            盖 YES
          </button>
        </>
      );
    }
    if (view.phase === 'question' && !isQuestionActive) {
      // 出题等待期仍允许自告
      return exposeBtn;
    }
    return exposeBtn;
  })();

  /** 三张问题卡便签 */
  const renderSlips = () => (
    <div className="nt-slips">
      {me?.pendingCardChoices?.map((card, index) => (
        <button
          key={card.id}
          type="button"
          className={`nt-slip${pickingCardId === card.id ? ' nt-slip--picked' : ''}${pickingCardId && pickingCardId !== card.id ? ' nt-slip--gone' : ''}`}
          disabled={busy || pickingCardId !== null}
          onClick={() => pickCard(card.id)}
        >
          <span className="nt-slip__cat">{card.categoryLabel}</span>
          <span className="nt-slip__txt">{card.text}</span>
          <span className="nt-slip__no">
            No.{String(slipNo).padStart(3, '0')}-{'ABC'[index] ?? index}
          </span>
        </button>
      ))}
    </div>
  );

  // ── 中央内容（同一时刻只有一种） ──
  const centerContent = ((): ReactNode => {
    // 1. 全员答完：翻开演出（答案此刻已随归档公开）
    if (stage.flipRecord) {
      const record = stage.flipRecord;
      return (
        <TestimonyBoard
          no={record.questionIndex}
          askerName={nameFor(members, record.questionerId)}
          question={record.question}
          cells={buildAnswerCells(view, record)}
          members={members}
          maxYes={view.maxYesPerPlayer}
          flipping
        />
      );
    }

    // 2. 开票演出
    if (stage.revealPlay) {
      const rp = stage.revealPlay;
      const torn = rp.step === 'torn' || rp.step === 'result';
      const showPulled = rp.accusedId !== null && rp.step !== 'ballots';
      const accusedName = rp.accusedId ? nameFor(members, rp.accusedId) : '';
      const wardenName = rp.wardenId ? nameFor(members, rp.wardenId) : '';
      const accusedCrime =
        rp.accusedId && view.phase === 'game_over' ? view.reveal?.crimes[rp.accusedId] : undefined;
      return (
        <div className="nt-table-center" data-step={rp.step}>
          {rp.reason === 'vote' && (
            <div className="nt-tallies">
              {rp.voterIds.map((id, i) => (
                <div
                  key={id}
                  className="nt-tally"
                  style={{ '--seat-c': seatColor(view.players.indexOf(id)), '--d': `${i * 240}ms` } as CSSProperties}
                >
                  <b>票</b>
                  <span>{nameFor(members, id)}</span>
                </div>
              ))}
            </div>
          )}
          {showPulled && (
            <div className={`nt-pulled${torn ? ' nt-pulled--torn' : ''}`}>
              <div className="nt-folder" data-name={`${accusedName} 的档案`} />
              <div className={`nt-idcard${rp.isWarden ? ' nt-idcard--warden' : ''}`}>
                <span className="nt-idcard__k">{rp.isWarden ? '监狱工作证' : '囚犯档案'}</span>
                <span className="nt-idcard__v">
                  {rp.isWarden ? `狱警 · ${accusedName}` : `${accusedName} · ${accusedCrime ? crimeLabel(accusedCrime) : ''}`}
                </span>
                <span className="nt-idcard__x">{rp.isWarden ? '潜伏在囚犯里' : '不是狱警'}</span>
              </div>
              {/* 前袋：盖住证件下半截，读出"从袋里抽出来"的层次 */}
              <div className="nt-folder__front" aria-hidden="true" />
              <span className="nt-pulled__tape">嫌 疑</span>
            </div>
          )}
          {rp.step === 'result' && (
            rp.reason === 'self-expose' ? (
              <NoticeBoard tone="danger" title={`狱警 ${wardenName} 自曝！`} sub="进入猜罪：他要猜中全部囚犯的罪行才能翻盘" />
            ) : rp.reason === 'timeout' ? (
              <NoticeBoard tone="warden" title={`狱警 ${wardenName} 独胜`} sub="无人投票，潜伏到底" />
            ) : rp.isWarden ? (
              <NoticeBoard tone="danger" title="抓到狱警了！" sub="但他还有一次翻盘：猜中全部囚犯的罪行就反杀" />
            ) : (
              <NoticeBoard tone="warden" title={`狱警 ${wardenName} 独胜`} sub={`你们抓的是 ${accusedName}（${accusedCrime ? crimeLabel(accusedCrime) : '囚犯'}）`} />
            )
          )}
        </div>
      );
    }

    // 3. 猜罪（狱警操作 / 囚犯围观）
    if (view.guessingInProgress) {
      if (me?.isWarden) {
        return (
          <section className="nt-labels-area">
            <NoticeBoard title="给每只档案袋贴上罪行" sub="全贴对你就翻盘独胜；有一张是多出来的干扰项" />
            <div className="nt-labels">
              {guessBoard.pool.map((crime) => (
                <button
                  key={crime}
                  type="button"
                  className="nt-label"
                  data-nt-label={crime}
                  aria-pressed={chosenCrime === crime}
                  disabled={busy || guessBoard.used.has(crime)}
                  onClick={() => pickLabel(crime)}
                >
                  {crimeLabel(crime)}
                </button>
              ))}
            </div>
          </section>
        );
      }
      return (
        <section className="nt-labels-area">
          <div className="nt-watch">
            狱警 {nameFor(members, wardenId)} 正在给大家的档案袋贴罪行……只要他贴错一张，囚犯就赢
          </div>
        </section>
      );
    }

    // 4. 终局（开票演出已毕）
    if (view.phase === 'game_over' && view.reveal) {
      const reveal = view.reveal;
      const wardenWon = !reveal.wardenRevealed || reveal.crimesAllGuessed;
      const wrongCount = reveal.wardenGuesses
        ? view.players.filter((id) => id !== reveal.wardenId && reveal.wardenGuesses?.[id] !== reveal.crimes[id]).length
        : 0;
      return (
        <div className="nt-over">
          <NoticeBoard
            tone={wardenWon ? 'warden' : 'ok'}
            title={wardenWon ? `狱警 ${nameFor(members, reveal.wardenId)} ${reveal.wardenRevealed ? '翻盘独胜！' : '独胜'}` : '囚犯联盟胜！'}
            sub={
              reveal.wardenGuesses
                ? wardenWon
                  ? '每一只档案袋都贴对了'
                  : `狱警贴错了 ${wrongCount} 张`
                : reveal.wardenRevealed
                  ? '猜罪环节落幕'
                  : '狱警潜伏到了最后一刻'
            }
          />
          <div className="testimony-dossier-grid nt-over__grid">
            {view.players.map((playerId) => {
              const isWarden = playerId === reveal.wardenId;
              const crime = isWarden ? null : reveal.crimes[playerId];
              const wardenGuess = reveal.wardenGuesses?.[playerId];
              const isGuessCorrect = Boolean(wardenGuess && crime && wardenGuess === crime);
              return (
                <div key={playerId} className={`testimony-dossier-card ${isWarden ? 'is-warden' : ''}`}>
                  <div className="testimony-dossier-card__head">
                    <strong>{nameFor(members, playerId)}</strong>
                    <span className={`nt-dossier-tag ${isWarden ? 'nt-dossier-tag--warden' : ''}`}>
                      {isWarden ? '狱警' : '囚犯'}
                    </span>
                  </div>
                  {!isWarden && crime && (
                    <div className="testimony-dossier-card__crime">
                      <span>真实罪行：</span>
                      <strong>{crimeLabel(crime)}</strong>
                    </div>
                  )}
                  {!isWarden && wardenGuess && (
                    <div className={`testimony-dossier-card__guess ${isGuessCorrect ? 'is-correct' : 'is-wrong'}`}>
                      <span>狱警猜测：</span>
                      <strong>{crimeLabel(wardenGuess)}</strong>
                      <span>{isGuessCorrect ? '✔ 对' : '✘ 错'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 5. 投票：结案汇总表
    if (view.phase === 'vote') {
      return (
        <section className="nt-board-summary" data-stage-anchor="board">
          <div className="nt-summary">
            <div className="nt-summary__row">
              <span>结案汇总 · {view.history.length} 份审讯单</span>
              <span>YES 满 {view.maxYesPerPlayer} 章 → 提前结束</span>
            </div>
            <h2>谁的 YES 和罪行对不上？</h2>
            <div className="nt-summary__scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>问题</th>
                    {view.players.map((id) => {
                      const n = nameFor(members, id);
                      return <th key={id} className="c">{n.length > 4 ? `${n.slice(0, 3)}…` : n}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {view.history.map((record) => (
                    <tr key={record.questionIndex}>
                      <td>Q{record.questionIndex}</td>
                      <td className="nt-summary__qcol">{record.question}</td>
                      {view.players.map((id) => (
                        <td key={id} className={record.answers[id] === 'yes' ? 'y' : 'n'}>
                          {record.answers[id] === 'yes' ? 'YES' : 'NO'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    // 6. 问答盖章（主画面）
    if (isQuestionActive && view.currentQuestion) {
      return (
        <TestimonyBoard
          no={view.currentQuestion.questionIndex}
          askerName={nameFor(members, view.currentQuestion.questionerId)}
          question={view.currentQuestion.text}
          cells={buildAnswerCells(view, null)}
          members={members}
          maxYes={view.maxYesPerPlayer}
        />
      );
    }

    // 7. 出题
    if (isMyTurnToPickCard && me?.pendingCardChoices) {
      return (
        <section className="nt-picker">
          <h2>挑一张审讯单 · 全员按各自理解作答 YES / NO</h2>
          {renderSlips()}
        </section>
      );
    }

    return (
      <section className="nt-picker">
        <div className="nt-waiting">
          <div className="nt-waiting__pen" aria-hidden="true" />
          <div>
            <b>{nameFor(members, view.currentQuestionerId)}</b> 正在挑审讯单……
          </div>
        </div>
      </section>
    );
  })();

  // 旧审讯单一叠：翻开演出期间，正在翻的那张先不进叠（演出结束落进去）
  const stackRecords = stage.flipRecord
    ? view.history.filter((h) => h.questionIndex !== stage.flipRecord!.questionIndex)
    : view.history;
  const newestIndex = stackRecords.length > 0 ? stackRecords[stackRecords.length - 1]!.questionIndex : null;
  const showStack = view.phase === 'question' || (view.phase === 'game_over' && !stage.revealPlay && !view.guessingInProgress);

  // 档案袋的演出状态透传
  const revealUi = stage.revealPlay
    ? {
        pulledId: stage.revealPlay.accusedId,
        wardenShownId:
          stage.revealPlay.step === 'result'
            ? stage.revealPlay.isWarden
              ? stage.revealPlay.accusedId ?? stage.revealPlay.wardenId
              : stage.revealPlay.wardenId
            : null,
      }
    : null;
  // 开票演出期间不进入猜罪 UI（标签位/标签池等开票告示牌落定后再出现）
  const guessUi = !stage.revealPlay && (view.guessingInProgress || (view.phase === 'game_over' && view.reveal?.wardenGuesses))
    ? {
        slots: guessBoard.slots,
        focusId: guessFocusId,
        interactive: Boolean(view.guessingInProgress && me?.isWarden && !busy),
        onPickFolder: pickFolder,
      }
    : null;

  const eyebrow = view.guessingInProgress
    ? '狱警猜罪 · 翻盘'
    : view.phase === 'vote'
      ? '审讯结束 · 指认狱警'
      : view.phase === 'game_over'
        ? '结案'
        : `第 ${slipNo} / ${view.questionLimit} 份审讯单${view.currentQuestion === null ? ' · 出题' : ''}`;

  return (
    <TabletopShell
      title="谁是狱警？"
      phase={phaseLabel(view)}
      gameId="night-testimony"
      phaseKey={`${view.phase}:${view.currentQuestionerId}:${view.questionIndex}:${view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : view.guessingInProgress ? 'guessing' : isQuestionActive ? 'answering' : 'picking'}`}
      spectator={isSpectator}
      players={[]}
      hideSeats
      theme="mystery"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          审讯规则
        </button>
      )}
      actions={(
        <div className="nt-dock">
          {me && (
            /* 类名 testimony-private 被 e2e 断言（night-testimony-tabletop.spec.ts），不要改 */
            <button
              type="button"
              className={`testimony-private nt-secret${secretHidden ? ' nt-secret--hidden' : ''}`}
              title="点击遮挡 / 显示"
              onClick={() => setSecretHidden((v) => !v)}
            >
              <span className="nt-secret__lead">
                <span className="nt-secret__tag">{me.isWarden ? '你的身份' : '你的罪行'}</span>
                <span className="nt-secret__hint">点击遮挡</span>
              </span>
              <span className="nt-secret__word">{me.isWarden ? '你是狱警' : myCrimeName || '囚犯'}</span>
            </button>
          )}
          <div className="nt-dock__info">
            <strong>{dockText.title}</strong>
            <span>{dockText.sub}</span>
          </div>
          {dockButtons}
        </div>
      )}
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="谁是狱警 · 案卷规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>核心机制</h4>
          <p>1. <strong>狱警潜伏</strong>：一名狱警伪装成囚犯潜伏其中，回答可真可假；其余囚犯各有专属罪行卡，按各自对罪行的理解作答即可，系统不评判对错。</p>
          <p>2. <strong>广播提问与全员作答</strong>：顺时针轮流 3 选 1 挑题向全场提问，全员（含出题者与狱警）共同提交「是」或「否」。</p>
          <p>3. <strong>停止提问条件</strong>：任意一人累计回答 <strong>3 个「是」</strong> 或 <strong>全局提满 5 题</strong>后，立即停止询问，进入投票！</p>
          <p>4. <strong>自告/自曝机制</strong>：囚犯自告可公开罪行排除狱警嫌疑；狱警自告则直接进入终局猜罪！</p>
          <p>5. <strong>投票与终局猜罪</strong>：票出囚犯则狱警直胜；票出狱警则狱警需猜中全部囚犯罪行方能独胜，否则囚犯全胜！</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      <div
        className="nt-desk"
        ref={stage.stageRef}
        data-phase={view.phase}
        data-count={view.players.length}
        data-guessing={view.guessingInProgress ? 'true' : undefined}
        data-vignette={stage.vignette ? 'true' : undefined}
      >
        <header className="nt-head">
          <h1 className="nt-head__title">谁是狱警？</h1>
          <p className="nt-head__eyebrow">{eyebrow}</p>
        </header>

        <div className="nt-ring">
          <StageCountdownRing
            deadlineAt={view.deadlineAt}
            phaseKey={`${view.phase}:${view.questionIndex}`}
            active={!view.guessingInProgress && view.phase !== 'game_over'}
            className="nt-countdown"
          />
        </div>

        {showStack && stackRecords.length > 0 && (
          <aside className="nt-stack" aria-label="已归档审讯单">
            <h3>已归档</h3>
            {stackRecords.map((record) => (
              <TestimonyNote
                key={record.questionIndex}
                record={record}
                members={members}
                players={view.players}
                newest={record.questionIndex === newestIndex}
              />
            ))}
          </aside>
        )}

        <div className="nt-center">{centerContent}</div>

        <ArchiveFiles
          view={view}
          members={members}
          myId={myId}
          yesCounts={archivedYesCounts}
          flipYesIds={stage.flipYesIds}
          vote={view.phase === 'vote' && myId && !view.guessingInProgress
            ? { targetId: voteTarget, mySealTargetId, onPick: (id) => setVoteTarget((prev) => (prev === id ? null : id)) }
            : null}
          guess={guessUi}
          reveal={revealUi}
          over={view.phase === 'game_over' && !view.guessingInProgress && stage.revealDone && !stage.revealPlay}
        />
      </div>

      {/* 飞行层必须挂在舞台之外：舞台内若有 transform 祖先，
          position:fixed 会退化为相对定位，实测的屏幕坐标会全部失效。 */}
      <FlightLayer flights={[...stage.flights, ...localFlights]} simplified={stage.simplifiedFlights} />

      {/* 游戏内风格自告身份确认弹窗 */}
      {exposeConfirmOpen && (
        <div className="sg-modal-backdrop" onClick={() => setExposeConfirmOpen(false)}>
          <div
            className="sg-modal-dialog nt-expose-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="expose-modal-title"
          >
            <div className="nt-expose-modal__header">
              <div className="nt-expose-modal__title-group">
                <h3 id="expose-modal-title">{me?.isWarden ? '主动自曝狱警身份' : '主动自告罪名身份'}</h3>
                <span className="nt-expose-modal__sub">{me?.isWarden ? '终局决胜大转折' : '公开真实罪名 · 排除嫌疑'}</span>
              </div>
            </div>
            <div className="nt-expose-modal__body">
              {me?.isWarden ? (
                <div className="nt-expose-modal__desc">
                  <p>确定要<strong>主动自曝潜伏狱警身份</strong>吗？</p>
                  <p>
                    自曝后将立即中断问答与投票流程，<strong>直接开启全员终局猜罪大舞台</strong>！若你能猜对场上全部囚犯与罪行的对应关系，你将<strong>直接独享胜利</strong>！
                  </p>
                </div>
              ) : (
                <div className="nt-expose-modal__desc">
                  <p>
                    确定要向全场公开你身为囚犯的真实罪名【<strong>{myCrimeName}</strong>】吗？
                  </p>
                  <p>
                    公开后你的罪名将公之于众，全场玩家将<strong>100% 确信你是真实囚犯</strong>并彻底洗清狱警嫌疑，为囚犯阵营排除干扰！
                  </p>
                </div>
              )}
              <div className="nt-expose-modal__caution">
                <span>每局游戏仅限自告一次，确认后无法撤销！</span>
              </div>
            </div>
            <div className="nt-expose-modal__actions">
              <button
                type="button"
                className="sg-btn nt-expose-btn nt-expose-btn--cancel"
                onClick={() => setExposeConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className={`sg-btn nt-expose-btn ${me?.isWarden ? 'nt-expose-btn--danger' : 'nt-expose-btn--confirm'}`}
                onClick={() => {
                  setExposeConfirmOpen(false);
                  if (myId) void act({ type: 'self_expose', playerId: myId });
                }}
              >
                {me?.isWarden ? '确认自曝（进猜罪）' : '确认公开罪犯身份'}
              </button>
            </div>
          </div>
        </div>
      )}
      {phaseOverlay}
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over' && !view.guessingInProgress}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={view.reveal && (!view.reveal.wardenRevealed || view.reveal.crimesAllGuessed) ? '狱警胜利' : '囚犯联盟胜利'}
        sublabel={`获胜玩家：${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}`}
      />
    </TabletopShell>
  );
}
