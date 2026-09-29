/**
 * 一智千金桌面模拟模式页面（wits_wagers_sim_v1）。
 *
 * 系统只管：抽题、收秘密猜测、亮牌后排版图算赔率、翻面公开答案。
 * 筹码摆放与分数加减是自由道具，不校验、不结算、不判胜负。
 */
import { useEffect, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { SimBoard, SimPanelHead, SimToolsPanel, useSimTimerDeadline } from '../tabletop/SimBoard.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { WitsLoungeScene } from './stage/WitsLoungeScene.tsx';
import { WitsPokerCard } from './stage/WitsPokerCard.tsx';
import { WitsChip } from './stage/WitsChip.tsx';
import { WitsTableStage } from './stage/WitsTableStage.tsx';
import { playerColorFor, PLAYER_COLORS } from './seats.ts';
import { formatPoints, MAX_GUESS, MIN_GUESS, targetLabel, type BetPairView, type BoardTargetView, type ChipId, type TargetId } from './types.ts';
import type { WitsWagersSimPlayerView } from './simTypes.ts';
import './wits-wagers.css';
import './stage/wits-lounge.css';

/**
 * 版图上离答案最近的牌（与服务端 board.ts 的 pickWinningTargets 同一口径）：
 * 答案低于全部猜测 → 「更低」；否则取绝对差最小者，等距两张都算。
 * sim 不判胜负，这里只用来给桌面高亮一个提示。
 */
function pickClosestTargets(board: readonly BoardTargetView[], answer: number): TargetId[] {
  const valued = board.filter((t): t is BoardTargetView & { value: number } => t.value !== null);
  if (valued.length === 0) return [];
  if (answer < Math.min(...valued.map((t) => t.value))) return board.some((t) => t.id === 'lower') ? ['lower'] : [];
  const best = Math.min(...valued.map((t) => Math.abs(t.value - answer)));
  return valued.filter((t) => Math.abs(t.value - answer) === best).map((t) => t.id);
}

interface Props {
  view: WitsWagersSimPlayerView;
}

export function WitsWagersSimStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;

  const [guessInput, setGuessInput] = useState('');
  const [activeChip, setActiveChip] = useState<ChipId>('A');
  const [rulesOpen, setRulesOpen] = useState(false);

  // 换题或重来后，输入框跟着服务端清空
  useEffect(() => {
    if (me?.myGuess === null) setGuessInput('');
  }, [view.questionNumber, view.revealed, me?.myGuess]);

  // 计时器滴答驱动：running 时每秒投递一次（服务端不自走）
  useEffect(() => {
    const timer = view.props.timer;
    if (!timer || !timer.isRunning) return;
    const interval = setInterval(() => {
      void act({ type: 'sim:tick_timer' }).catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [view.props.timer?.isRunning, view.props.timer?.remainingSeconds, act]);

  const players = view.players.map((id) => ({
    id,
    name: nameFor(members, id),
    score: formatPoints(view.money[id] ?? 0),
    status: view.revealed
      ? (view.guesses?.[id] !== undefined ? `猜 ${view.guesses[id]!.toLocaleString('zh-CN')}` : '未交')
      : view.submittedIds.includes(id) ? '已交' : '写数字中',
  }));

  const logs = [...view.activityLogs].slice(-6).reverse();
  const question = view.question;
  const myChips = myId ? view.chips[myId] : undefined;
  const myMoney = myId ? view.money[myId] ?? 0 : 0;

  const parsedGuess = Number(guessInput);
  const guessValid = guessInput.trim() !== '' && Number.isSafeInteger(parsedGuess) && parsedGuess >= MIN_GUESS && parsedGuess <= MAX_GUESS;

  const submitGuess = () => {
    if (!myId || !guessValid) return;
    void act({ type: 'sim:submit_guess', playerId: myId, value: parsedGuess });
  };

  const placeChip = (targetId: TargetId) => {
    if (!myId || !myChips) return;
    const current = myChips.find((c) => c.chipId === activeChip)?.targetId ?? null;
    webAudio.playCardPlay();
    // 再点一次同一张牌就是收回
    void act({ type: 'sim:place_chip', playerId: myId, chipId: activeChip, targetId: current === targetId ? null : targetId });
  };

  const adjustMoney = (delta: number) => {
    if (!myId) return;
    void act({ type: 'sim:adjust_money', playerId: myId, delta });
  };

  /** 桌上所有已摆出的筹码（谁的哪枚、押在哪张牌），桌脚按人列出 */
  const placedChips: Array<{ playerId: string; chipId: ChipId; targetId: TargetId }> = [];
  for (const [pid, pair] of Object.entries(view.chips)) {
    for (const c of pair) if (c.targetId) placedChips.push({ playerId: pid, chipId: c.chipId, targetId: c.targetId });
  }

  /** 我的两枚筹码折成完整版的下注形状，桌面上就能画出同款筹码摞（sim 不押附加注） */
  const myBets: BetPairView | null = myChips
    ? [
        { chipId: myChips[0].chipId, targetId: myChips[0].targetId, extraStake: 0 },
        { chipId: myChips[1].chipId, targetId: myChips[1].targetId, extraStake: 0 },
      ]
    : null;

  // 答案翻开后，在版图上高亮最接近的牌——纯展示提示，不结算
  const winningTargetIds = view.revealed && view.answerRevealed && question?.answer !== undefined
    ? pickClosestTargets(view.board, question.answer)
    : [];

  // sim 计时器 → 桌上的倒计时环
  const timerDeadline = useSimTimerDeadline(view.props.timer);

  const answerTarget = question && view.answerRevealed && question.answer !== undefined
    ? { id: `g:${question.answer}` as TargetId, value: question.answer, slot: 'C' as const, odds: 0, authors: [] }
    : null;

  return (
    <TabletopShell
      title="一智千金 · 桌面模拟"
      phase="自由道具 · 无判定"
      gameId="wits-wagers"
      phaseKey={`sim:${view.questionNumber}:${view.revealed ? 'r' : 'w'}:${view.answerRevealed ? 'a' : '-'}`}
      spectator={isSpectator}
      players={players}
      theme="sunset"
      stageFit="arena"
      rulesButton={
        <button type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn sim-toolbar__btn--primary" disabled={busy || view.revealed || view.submittedIds.length === 0}
            onClick={() => void act({ type: 'sim:reveal_guesses' })}>
            亮牌排版图
          </button>
          <button type="button" className="sim-toolbar__btn" disabled={busy || !question}
            onClick={() => void act({ type: 'sim:reveal_answer' })}>
            {view.answerRevealed ? '盖回答案' : '翻开答案'}
          </button>
          <button type="button" className="sim-toolbar__btn" disabled={busy}
            onClick={() => void act({ type: 'sim:reset_round' })}>
            本题重来
          </button>
          <button type="button" className="sim-toolbar__btn" disabled={busy}
            onClick={() => void act({ type: 'sim:next_question' })}>
            下一题
          </button>
        </div>
      }
    >
      <SimBoard
        className="ww-sim"
        felt={false}
        logs={logs}
        tools={
          <>
            {/* 我的猜测 + 我的筹码：只有在座玩家才有 */}
            {me && (
              <section className="sim-panel">
                <SimPanelHead icon="pointer" title="我的猜测与筹码" />
                <div className="sim-board__row sim-tools ww-sim__me-row">
                  <div className="sim-tool">
                    <span className="stage-eyebrow">我的猜测</span>
                    {view.revealed ? (
                      <span className="sim-tool__value stage-numeral">{me.myGuess === null ? '本题未交' : me.myGuess.toLocaleString('zh-CN')}</span>
                    ) : (
                      <div className="sim-tool__row ww-sim__guess-row">
                        <input
                          className="ww-sim__guess-input"
                          type="number"
                          inputMode="numeric"
                          min={MIN_GUESS}
                          max={MAX_GUESS}
                          placeholder={me.myGuess === null ? '写一个正整数' : String(me.myGuess)}
                          value={guessInput}
                          onChange={(e) => setGuessInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitGuess(); }}
                          aria-label="我的猜测"
                        />
                        <button type="button" className="sim-tool__btn" disabled={busy || !guessValid} onClick={submitGuess}>
                          {me.myGuess === null ? '交卷' : '改一下'}
                        </button>
                      </div>
                    )}
                    <small className="sim-hint">{view.revealed ? '已亮牌，本题不能再改' : me.myGuess === null ? '只有自己能看到' : `已交：${me.myGuess.toLocaleString('zh-CN')}，亮牌前可改`}</small>
                  </div>
                  <div className="sim-tool">
                    <span className="stage-eyebrow">我的筹码</span>
                    <div className="ww-sim__money">
                      <WitsChip color={myId ? playerColorFor(myId) : PLAYER_COLORS[0]} label="" size={34} />
                      <span className="sim-tool__value stage-numeral">{formatPoints(myMoney)}</span>
                    </div>
                    <div className="sim-tool__row">
                      <button type="button" className="sim-tool__btn" disabled={busy || myMoney < 5} onClick={() => adjustMoney(-5)}>−5</button>
                      <button type="button" className="sim-tool__btn" disabled={busy || myMoney < 1} onClick={() => adjustMoney(-1)}>−1</button>
                      <button type="button" className="sim-tool__btn" disabled={busy} onClick={() => adjustMoney(1)}>+1</button>
                      <button type="button" className="sim-tool__btn" disabled={busy} onClick={() => adjustMoney(5)}>+5</button>
                    </div>
                    <small className="sim-hint">输赢自己算自己记</small>
                  </div>
                </div>
              </section>
            )}
            <SimToolsPanel props={view.props} members={members} myId={myId} busy={busy} act={act} timerPreset={30} />
          </>
        }
      >
        {/* 中央桌面：与联机版同款的贵宾厅场景 + 正视毡面牌桌（倒计时环 + 题目 + 版图 / 背面悬念扇） */}
        <div className="ww-game ww-sim__table" data-ww-theme="felt-green">
          <WitsLoungeScene compact />
          <WitsTableStage
            phase={view.revealed ? 'betting' : 'answering'}
            question={question ? { prompt: question.prompt, unit: question.unit } : null}
            board={view.revealed ? view.board : []}
            members={members}
            faceDownCount={view.players.length}
            submittedCount={view.submittedIds.length}
            winningTargetIds={winningTargetIds}
            myAcceptedBets={myBets}
            activeChipId={view.revealed && me ? activeChip : null}
            onSelectTarget={placeChip}
            interactive={view.revealed && !isSpectator && !busy}
            deadlineAt={timerDeadline.deadlineAt}
            phaseKey={`sim-timer:${timerDeadline.epoch}`}
          >
            {/* 桌脚：标准答案牌 + 筹码分布 */}
            <section className="sim-panel ww-sim__foot">
              <div className="ww-sim__answer-card">
                <span className="stage-eyebrow">{view.answerRevealed ? '标准答案' : '答案背面'}</span>
                <WitsPokerCard target={answerTarget} size="compact" />
              </div>

              <div className="ww-sim__chip-area">
                <SimPanelHead
                  icon="cards_deck"
                  title={view.revealed ? '版图 · 点牌摆筹码' : <>第 <span className="stage-numeral">{view.questionNumber}</span> 题 · 已交 {view.submittedIds.length}/{view.players.length}</>}
                >
                  {view.revealed && me && myChips && (
                    <div className="sim-tool__row" role="radiogroup" aria-label="选择要摆的筹码">
                      {myChips.map((c) => (
                        <button
                          key={c.chipId}
                          type="button"
                          role="radio"
                          aria-checked={activeChip === c.chipId}
                          className={`sim-tool__btn ${activeChip === c.chipId ? 'is-active' : ''}`}
                          onClick={() => setActiveChip(c.chipId)}
                        >
                          筹码 {c.chipId}{c.targetId ? ` · 在 ${targetLabel(view.board.find((t) => t.id === c.targetId))}` : ' · 在手'}
                        </button>
                      ))}
                    </div>
                  )}
                </SimPanelHead>
                {view.revealed ? (
                  placedChips.length > 0 ? (
                    <div className="ww-sim__chips">
                      {placedChips.map((p) => (
                        <span key={`${p.playerId}:${p.chipId}`} className="ww-sim__chip" title={`${nameFor(members, p.playerId)} 的筹码 ${p.chipId}`}>
                          <WitsChip color={playerColorFor(p.playerId)} label={p.chipId} size={26} />
                          <small>{nameFor(members, p.playerId)} → {targetLabel(view.board.find((t) => t.id === p.targetId))}</small>
                        </span>
                      ))}
                    </div>
                  ) : <p className="sim-hint">还没有人摆筹码。先选 A 或 B，再点桌上的牌；再点一次收回。</p>
                ) : (
                  <p className="sim-hint">大家写完数字后点「亮牌排版图」，系统会去重、升序并按查表给出赔率。</p>
                )}
              </div>
            </section>
          </WitsTableStage>
        </div>
      </SimBoard>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>一智千金 桌面模拟模式</h4>
          <p>系统只负责出题、收秘密猜测、亮牌后自动排版图算赔率，以及翻面公开标准答案。<strong>不判胜负、不记分</strong>，谁赢谁赔、赔多少，由大家按线下规则自己对账。</p>
          <ul>
            <li>写数字：亮牌前只有自己能看到，可以反复改。</li>
            <li>亮牌排版图：去重、升序，按 1~7 个不同值查表给赔率；最左一张「更低」固定 6 倍，右边没有对应卡。</li>
            <li>摆筹码：先选 A 或 B，再点牌；再点一次收回。想押多少分口头说。</li>
            <li>筹码：± 按钮自己加减。</li>
            <li>翻开答案：主持人翻面公开，可以再盖回去。</li>
          </ul>
        </div>
      )}
    </TabletopShell>
  );
}
