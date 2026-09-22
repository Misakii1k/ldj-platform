import type { ReactNode } from 'react';

export interface TestimonyNoteProps {
  /** 题号；null 表示这是待定的当前题（还没归档） */
  readonly index: number | null;
  readonly question: string;
  /** 本题的 YES 数；null 表示还没答完，不显示图钉 */
  readonly yesCount: number | null;
  /** 参与人数，用于把图钉画成「N 个里 M 个是」 */
  readonly total?: number;
  /** 正在钉入：驱动图钉敲入动效 */
  readonly pinning?: boolean;
  /** 焦点态：当前题摊在板中央，比归档的便签大一号 */
  readonly focus?: boolean;
  readonly children?: ReactNode;
}

/**
 * 审讯便签。
 *
 * 一道题的问答被写在便签上钉到证词板；YES 数用红色图钉表示，
 * 「几个人说了是」一眼可数，不需要读数字。
 */
export function TestimonyNote({
  index,
  question,
  yesCount,
  total,
  pinning = false,
  focus = false,
  children,
}: TestimonyNoteProps) {
  const pins = total ?? 0;
  return (
    <article
      className="nt-note"
      data-focus={focus ? 'true' : undefined}
      data-pinning={pinning ? 'true' : undefined}
      aria-label={
        index === null
          ? `当前审讯题：${question}`
          : `第 ${index} 题：${question}${yesCount === null ? '' : `，${yesCount} 人回答是`}`
      }
    >
      <span className="nt-note__tack" aria-hidden="true" />
      <header className="nt-note__head">
        {index === null ? (
          <span className="nt-note__seal">待定</span>
        ) : (
          <span className="nt-note__num">#{index}</span>
        )}
        {yesCount !== null && pins > 0 && (
          <span className="nt-note__pins" aria-hidden="true">
            {Array.from({ length: pins }, (_, i) => (
              <span key={i} className="nt-note__pin" data-on={i < yesCount ? 'true' : undefined} />
            ))}
          </span>
        )}
      </header>
      <p className="nt-note__text">「{question}」</p>
      {children}
    </article>
  );
}
