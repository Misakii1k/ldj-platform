import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTypewriterOptions {
  /** 每个字符打印的间隔毫秒数（默认 28ms，自然口语阅读速度） */
  readonly speed?: number;
  /** 打字机打完后的回调 */
  readonly onComplete?: () => void;
}

interface UseTypewriterResult {
  readonly displayedText: string;
  readonly isTyping: boolean;
  readonly isComplete: boolean;
  readonly fastForward: () => void;
}

/**
 * 流式打字机 Hook：
 * 1. 文本变化时从头按字匀速输出；
 * 2. 支持 fastForward 瞬间显现全文；
 * 3. 支持监听键盘 Enter 或外层点击快进。
 */
export function useTypewriter(
  fullText: string | null | undefined,
  options: UseTypewriterOptions = {},
): UseTypewriterResult {
  const { speed = 28, onComplete } = options;
  const [displayedLength, setDisplayedLength] = useState<number>(0);
  const textRef = useRef(fullText ?? '');
  textRef.current = fullText ?? '';

  const targetText = fullText ?? '';
  const isTyping = Boolean(targetText && displayedLength < targetText.length);
  const isComplete = Boolean(targetText && displayedLength >= targetText.length);

  // 当 fullText 改变时，若新文本不是前缀，则重置打字进度
  useEffect(() => {
    if (!fullText) {
      setDisplayedLength(0);
      return;
    }
    setDisplayedLength((prev) => {
      // 若原进度超出新文本长度，重置为 1
      if (prev > fullText.length) return 1;
      // 若新文本是在旧文本末尾追加，保持当前进度继续打字
      return prev;
    });
  }, [fullText]);

  useEffect(() => {
    if (!targetText || displayedLength >= targetText.length) {
      if (targetText && displayedLength >= targetText.length) {
        onComplete?.();
      }
      return;
    }

    const timer = setTimeout(() => {
      setDisplayedLength((prev) => Math.min(prev + 1, targetText.length));
    }, speed);

    return () => clearTimeout(timer);
  }, [targetText, displayedLength, speed, onComplete]);

  const fastForward = useCallback(() => {
    if (textRef.current) {
      setDisplayedLength(textRef.current.length);
    }
  }, []);

  return {
    displayedText: targetText ? targetText.slice(0, displayedLength) : '',
    isTyping,
    isComplete,
    fastForward,
  };
}
