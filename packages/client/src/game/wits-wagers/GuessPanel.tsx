import { useState, useEffect } from 'react';
import type { QuestionBrief, GuessView } from './types.ts';
import { MIN_GUESS, MAX_GUESS } from './types.ts';

export interface GuessPanelProps {
  question: QuestionBrief | null;
  submittedGuess: GuessView | null;
  canGuess: boolean;
  onSubmit: (value: number) => void;
  submitting?: boolean;
  /** 输入获得/失去焦点时通知舞台，驱动握笔动作 */
}

export function GuessPanel({
  question,
  submittedGuess,
  canGuess,
  onSubmit,
  submitting = false,
}: GuessPanelProps) {
  const [valStr, setValStr] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (submittedGuess) {
      setValStr(String(submittedGuess.value));
    }
  }, [submittedGuess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = valStr.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) {
      setErrorMsg('请输入大于 0 的有效正整数（不可输入小数或符号）');
      return;
    }

    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < MIN_GUESS || num > MAX_GUESS) {
      setErrorMsg(`数值必须在 ${MIN_GUESS} 至 ${MAX_GUESS.toLocaleString()} 之间`);
      return;
    }

    onSubmit(num);
  };

  return (
    <div className="ww-guess-panel">
      {/* 题面由舞台桌沿统一呈现，这里只负责输入，避免同一道题出现两处 */}
      {submittedGuess && (
        <div className="ww-guess-panel__submitted-alert">
          已提交估数：<strong>{submittedGuess.value.toLocaleString()}</strong>（全员提交前可再次修改）
        </div>
      )}

      <form onSubmit={handleSubmit} className="ww-guess-panel__form">
        <label className="ww-guess-panel__label" htmlFor="ww-guess-input">
          我的估数（单位：{question?.unit ?? '无'}）
        </label>
        <div className="ww-guess-panel__input-row">
          <input
            id="ww-guess-input"
            className="ww-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={valStr}
            onChange={(e) => {
              setValStr(e.target.value);
              setErrorMsg(null);
            }}
            placeholder="输入正整数，例如 100"
            disabled={!canGuess || submitting}
            autoComplete="off"
          />
          <button
            type="submit"
            className="ww-btn ww-btn--primary"
            disabled={!canGuess || submitting || !valStr.trim()}
          >
            {submitting ? '提交中…' : submittedGuess ? '修改估数' : '提交估数'}
          </button>
        </div>
        {errorMsg && <div className="ww-guess-panel__error ww-diff-neg">{errorMsg}</div>}
        <div className="ww-guess-panel__hint">
          提示：所有参赛者提交后将立即揭晓并开始下注，请尽快作答。
        </div>
      </form>
    </div>
  );
}
