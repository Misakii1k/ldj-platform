/**
 * 一智千金桌面模拟模式页面（wits_wagers_sim_v1）。
 *
 * 系统只管：抽题、收秘密猜测、亮牌后排版图算赔率、翻面公开答案。
 * 筹码摆放与钞票加减是自由道具，不校验、不结算、不判胜负。
 */
import { useEffect, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { WitsAnswerCard } from './stage/WitsAnswerCard.tsx';
import { WitsNoteStack } from './stage/WitsNoteStack.tsx';
import { formatMoney, MAX_GUESS, MIN_GUESS, targetLabel, type ChipId, type TargetId } from './types.ts';
import type { WitsWagersSimPlayerView } from './simTypes.ts';
import './wits-wagers.css';

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
    score: formatMoney(view.money[id] ?? 0),
    status: view.revealed
      ? (view.guesses?.[id] !== undefined ? `猜 ${view.guesses[id]!.toLocaleString('zh-CN')}` : '未交')
      : view.submittedIds.includes(id) ? '已交' : '写数字中',
  }));

  const logs = [...view.activityLogs].slice(-6).reverse();
  const { dice, bell, timer } = view.props;
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

  /** 每张牌上有谁的哪枚筹码 */
  const chipsOn = (targetId: TargetId) => {
    const out: Array<{ playerId: string; chipId: ChipId }> = [];
    for (const [pid, pair] of Object.entries(view.chips)) {
      for (const c of pair) if (c.targetId === targetId) out.push({ playerId: pid, chipId: c.chipId });
    }
    return out;
  };

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
      <div className="sim-board ww-sim">
        {/* 题目 + 答案牌 */}
        <section className="sim-panel">
          <div className="sim-panel__head">
            <span>❓</span>
            <h3>第 {view.questionNumber} 题</h3>
          </div>
          <div className="sim-board__row ww-sim__question-row">
            <div className="ww-sim__prompt">
              {question ? (
                <>
                  <p className="ww-sim__prompt-text">{question.prompt}</p>
                  <small className="sim-hint">单位：{question.unit}</small>
                </>
              ) : <span className="sim-empty">还没有题目</span>}
            </div>
            <div className="ww-sim__answer-card">
              <WitsAnswerCard target={answerTarget} faceUp={answerTarget !== null} />
              <small className="sim-hint">{view.answerRevealed ? '标准答案' : '答案背面'}</small>
            </div>
          </div>
        </section>

        {/* 版图 */}
        <section className="sim-panel">
          <div className="sim-panel__head">
            <span>🃏</span>
            <h3>{view.revealed ? '版图 · 点牌摆筹码' : `版图 · 已交 ${view.submittedIds.length}/${view.players.length}`}</h3>
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
          </div>
          {view.revealed ? (
            <div className="sim-board__row ww-sim__board">
              {view.board.map((target, idx) => {
                const placed = chipsOn(target.id);
                const mine = placed.some((p) => p.playerId === myId);
                return (
                  <WitsAnswerCard
                    key={target.id}
                    target={target}
                    members={members}
                    faceUp
                    revealIndex={idx}
                    isSelected={mine}
                    interactive={!isSpectator && !busy}
                    onActivate={() => placeChip(target.id)}
                  >
                    {placed.length > 0 && (
                      <div className="ww-sim__chips">
                        {placed.map((p) => (
                          <span key={`${p.playerId}:${p.chipId}`} className="ww-sim__chip" title={`${nameFor(members, p.playerId)} 的筹码 ${p.chipId}`}>
                            <WitsNoteStack badge={p.chipId} noteWidth={22} />
                            <small>{nameFor(members, p.playerId)}</small>
                          </span>
                        ))}
                      </div>
                    )}
                  </WitsAnswerCard>
                );
              })}
            </div>
          ) : (
            <p className="sim-hint">大家写完数字后点「亮牌排版图」，系统会去重、升序并按查表给出赔率。</p>
          )}
        </section>

        {/* 我的猜测 + 我的钱 */}
        {me && (
          <section className="sim-panel">
            <div className="sim-panel__head">
              <span>✍️</span>
              <h3>我的猜测与钞票</h3>
            </div>
            <div className="sim-board__row ww-sim__me-row">
              <div className="sim-tool">
                {view.revealed ? (
                  <span className="sim-tool__value">{me.myGuess === null ? '本题未交' : me.myGuess.toLocaleString('zh-CN')}</span>
                ) : (
                  <div className="sim-tool__row">
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
                <div className="ww-sim__money">
                  <WitsNoteStack extraStake={myMoney} noteWidth={34} />
                  <span className="sim-tool__value">{formatMoney(myMoney)}</span>
                </div>
                <div className="sim-tool__row">
                  <button type="button" className="sim-tool__btn" disabled={busy || myMoney < 5} onClick={() => adjustMoney(-5)}>−5</button>
                  <button type="button" className="sim-tool__btn" disabled={busy || myMoney < 1} onClick={() => adjustMoney(-1)}>−1</button>
                  <button type="button" className="sim-tool__btn" disabled={busy} onClick={() => adjustMoney(1)}>+1</button>
                  <button type="button" className="sim-tool__btn" disabled={busy} onClick={() => adjustMoney(5)}>+5</button>
                </div>
                <small className="sim-hint">1 分 = ¥100，输赢自己算自己记</small>
              </div>
            </div>
          </section>
        )}

        {/* 道具 */}
        <section className="sim-panel">
          <div className="sim-panel__head"><h3>自由道具</h3></div>
          <div className="sim-board__row sim-tools">
            <div className="sim-tool">
              <button type="button" className="sim-tool__btn" disabled={busy || isSpectator}
                onClick={() => myId && (webAudio.playDiceShake(), void act({ type: 'sim:roll_dice', playerId: myId }))}>
                掷骰
              </button>
              <span className="sim-tool__value">{dice?.values.length ? dice.values.join(' · ') : '—'}</span>
              {dice?.lastRollBy && <small>{nameFor(members, dice.lastRollBy)} 掷</small>}
            </div>
            <div className="sim-tool">
              <div className="sim-tool__row">
                <button type="button" className="sim-tool__btn" disabled={busy || isSpectator || timer?.isRunning}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'start' })}>开始</button>
                <button type="button" className="sim-tool__btn" disabled={busy || isSpectator || !timer?.isRunning}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'pause' })}>暂停</button>
                <button type="button" className="sim-tool__btn" disabled={busy || isSpectator}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'reset' })}>重置</button>
                <button type="button" className="sim-tool__btn" disabled={busy || isSpectator}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'set', durationSeconds: 30 })}>30s</button>
              </div>
              <span className={`sim-tool__value ${timer?.isExploded ? 'is-exploded' : ''}`}>
                {timer ? (timer.isExploded ? '到点！' : `${timer.remainingSeconds}s`) : '未启用'}
              </span>
            </div>
            <button
              type="button"
              className={`sim-bell-btn ${bell?.rungBy ? 'sim-bell-btn--rung' : ''}`}
              disabled={busy || isSpectator}
              onClick={() => myId && (webAudio.playUnoShout(), void act({ type: 'sim:ring_bell', playerId: myId }))}
              title={`拍铃（首响：${bell?.rungBy ? nameFor(members, bell.rungBy) : '无人'} · 共 ${bell?.ringCount ?? 0} 次）`}
            >
              按铃
              {bell?.rungBy && <small>{nameFor(members, bell.rungBy)} 首响</small>}
            </button>
          </div>
        </section>

        {/* 活动日志 */}
        <section className="sim-panel">
          <div className="sim-panel__head"><h3>活动记录</h3></div>
          <ul className="sim-logs">
            {logs.map((log, i) => (
              <li key={i} className="sim-logs__item">{log.text}</li>
            ))}
            {logs.length === 0 && <li className="sim-logs__item sim-empty">暂无记录</li>}
          </ul>
        </section>
      </div>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>一智千金 桌面模拟模式</h4>
          <p>系统只负责出题、收秘密猜测、亮牌后自动排版图算赔率，以及翻面公开标准答案。<strong>不判胜负、不记分</strong>，谁赢谁赔、赔多少，由大家按线下规则自己对账。</p>
          <ul>
            <li>写数字：亮牌前只有自己能看到，可以反复改。</li>
            <li>亮牌排版图：去重、升序，按 1~7 个不同值查表给赔率；最左一张「更低」固定 6 倍，右边没有对应卡。</li>
            <li>摆筹码：先选 A 或 B，再点牌；再点一次收回。想押多少钱口头说。</li>
            <li>钞票：± 按钮自己加减，1 分 = ¥100。</li>
            <li>翻开答案：主持人翻面公开，可以再盖回去。</li>
          </ul>
        </div>
      )}
    </TabletopShell>
  );
}
