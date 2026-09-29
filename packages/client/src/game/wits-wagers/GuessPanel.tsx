import { useState, useEffect } from 'react';
import type { QuestionBrief, GuessView } from './types.ts';
import { MIN_GUESS, MAX_GUESS } from './types.ts';

export interface GuessPanelProps {
  question: QuestionBrief | null;
  submittedGuess: GuessView | null;
  canGuess: boolean;
  onSubmit: (value: number) => void;
  submitting?: boolean;
}

/**
 * 作答输入（01-CONTRACT.md §4.2，A2 的 .entry）。
 *
 * 黄铜细边输入框 + 衬线大数字 + 单位；提交逻辑、校验、MIN/MAX_GUESS 一律不动。
 * 主按钮「交出答案」；已交后变为次要样式「已交 · 可修改」。
 */
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
      {submittedGuess && (
        <div className="ww-guess-panel__submitted-alert">
          已交 <strong>{submittedGuess.value.toLocaleString()}</strong> · 全员提交前可再次修改
        </div>
      )}

      <form onSubmit={handleSubmit} className="ww-guess-panel__form">
        <label className="ww-guess-panel__label" htmlFor="ww-guess-input">
          我的估数
        </label>
        <div className="ww-guess-panel__input-row">
          <div className="ww-guess-panel__field">
            <input
              id="ww-guess-input"
              className="ww-input ww-guess-panel__input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={valStr}
              onChange={(e) => {
                setValStr(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="输入正整数"
              disabled={!canGuess || submitting}
              autoComplete="off"
            />
            <span className="ww-guess-panel__unit">{question?.unit ?? ''}</span>
          </div>
          <button
            type="submit"
            className={`ww-btn ${submittedGuess ? 'ww-btn--secondary' : 'ww-btn--primary'}`}
            disabled={!canGuess || submitting || !valStr.trim()}
          >
            {submitting ? '提交中…' : submittedGuess ? '已交 · 可修改' : '交出答案'}
          </button>
        </div>
        {errorMsg && <div className="ww-guess-panel__error ww-diff-neg">{errorMsg}</div>}
        <div className="ww-guess-panel__hint">
          写一个正整数；估得越接近、又不超过越好
        </div>
      </form>
    </div>
  );
}
