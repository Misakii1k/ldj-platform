/**
 * 谁是狱警 · 档案袋席位一排。
 *
 * 每位玩家是一只牛皮纸档案袋：左上页签、圆形座号、Courier 囚号、证件照剪影、
 * 名字、状态行、底部 3 格 YES 余量。按阶段换皮：
 * 出题人淡紫 / 「你」黄框 / 已自告灰 / 被抽出变淡 / 狱警翻开深色 / 猜罪贴标签位。
 */
import type { CSSProperties, ReactNode } from 'react';
import type { MemberLike } from '../../useGameAction.ts';
import { nameFor } from '../../useGameAction.ts';
import { crimeName, type NightTestimonyPlayerView } from '../types.ts';
import { BustSvg, inmateNo, seatColor, SealTape, type GuessSlotModel } from './ArchiveProps.tsx';

export interface ArchiveVoteUi {
  readonly targetId: string | null;
  /** 我已投出（封条只贴在我自己屏幕上） */
  readonly mySealTargetId: string | null;
  readonly onPick: (playerId: string) => void;
}

export interface ArchiveGuessUi {
  readonly slots: Readonly<Record<string, GuessSlotModel>>;
  readonly focusId: string | null;
  /** 狱警本人在操作 = true；囚犯围观 = false */
  readonly interactive: boolean;
  readonly onPickFolder: (playerId: string) => void;
}

export interface ArchiveRevealUi {
  /** 被抽到桌中央的档案袋（原位置变淡） */
  readonly pulledId: string | null;
  /** 已公开翻开的狱警 */
  readonly wardenShownId: string | null;
}

export interface ArchiveFilesProps {
  readonly view: NightTestimonyPlayerView;
  readonly members: readonly MemberLike[];
  readonly myId: string | null;
  /**
   * YES 余量计数：页面传「仅由已归档 history 推导」的计数（作答期间不泄露谁刚用了 YES）；
   * 缺省回落到 view.playerYesCounts。
   */
  readonly yesCounts?: Readonly<Record<string, number>>;
  /** 翻开演出中答 YES 的人：档案袋上浮 + 盖 YES 章 */
  readonly flipYesIds?: readonly string[] | null;
  readonly vote?: ArchiveVoteUi | null;
  readonly guess?: ArchiveGuessUi | null;
  readonly reveal?: ArchiveRevealUi | null;
  /** 终局：公开全部身份 */
  readonly over?: boolean;
}

/** 已公开的狱警 id：被票出（accusedId+wardenRevealed）或自曝（revealedIdentities）。 */
export function publicWardenId(view: NightTestimonyPlayerView): string | null {
  if (view.wardenRevealed && view.accusedId) return view.accusedId;
  const selfExposed = Object.keys(view.revealedIdentities).find(
    (id) => view.revealedIdentities[id] === 'warden',
  );
  if (selfExposed) return selfExposed;
  // 终局才允许读 reveal
  return view.phase === 'game_over' && !view.guessingInProgress ? view.reveal?.wardenId ?? null : null;
}

export function ArchiveFiles({
  view,
  members,
  myId,
  yesCounts,
  flipYesIds = null,
  vote = null,
  guess = null,
  reveal = null,
  over = false,
}: ArchiveFilesProps): ReactNode {
  const isPicking = view.phase === 'question' && view.currentQuestion === null;
  const isAnswering = view.phase === 'question' && view.currentQuestion !== null;
  const wardenId = publicWardenId(view);

  return (
    <div className="nt-files" data-count={view.players.length}>
      {view.players.map((playerId, seatIndex) => {
        const isMe = playerId === myId;
        const isAsker = view.phase === 'question' && playerId === view.currentQuestionerId;
        const exposed = view.revealedIdentities[playerId];
        const isExposed = Boolean(exposed);
        const rawYes = yesCounts ? (yesCounts[playerId] ?? 0) : (view.playerYesCounts[playerId] ?? 0);
        const yesUsed = Math.min(rawYes, view.maxYesPerPlayer);
        const saidYes = flipYesIds?.includes(playerId) ?? false;
        const isWardenShown = reveal?.wardenShownId === playerId || (over && wardenId === playerId);
        const pulled = reveal?.pulledId === playerId;

        // 状态行
        let status: string;
        if (over || isWardenShown) {
          status = wardenId === playerId ? '狱警' : '囚犯';
        } else if (guess) {
          // 猜罪阶段（参照 S4：狱警 · 猜罪中 / 已自告 / 囚犯）
          status = wardenId === playerId
            ? '狱警 · 猜罪中'
            : isExposed
              ? '已自告'
              : '囚犯';
        } else if (isExposed) {
          status = exposed === 'warden' ? '已自曝 · 狱警' : `已自告 · ${crimeName(exposed)}`;
        } else if (isAsker) {
          status = isPicking ? '出题人 · 挑单中 ✎' : '出题人';
        } else if (isAnswering) {
          const answered = view.currentQuestion?.answers[playerId] !== undefined;
          status = answered ? '已盖章' : isMe ? '轮到你' : '思考中';
        } else {
          status = '囚犯?';
        }

        // 投票态
        const hasVoted = view.votedPlayerIds.includes(playerId);
        const castMine = vote?.mySealTargetId != null;
        const votable = vote !== null && !isMe && !isExposed && !castMine;
        const selected = vote?.targetId === playerId;
        const noVote = vote !== null && (isMe || isExposed);

        // 猜罪标签位（狱警自己没有标签位）
        const slot = guess?.slots[playerId] ?? null;
        const guessWarden = guess !== null && wardenId === playerId;

        const classes = [
          'nt-file',
          isMe && 'nt-file--me',
          isAsker && !over && 'nt-file--asker',
          isExposed && !over && exposed !== 'warden' && 'nt-file--exposed',
          saidYes && 'nt-file--said-yes',
          vote && hasVoted && 'nt-file--voted',
          noVote && 'nt-file--no-vote',
          selected && 'nt-file--target',
          pulled && 'nt-file--pulled-out',
          (isWardenShown || guessWarden) && 'nt-file--warden',
          guess?.focusId === playerId && 'nt-file--focus',
        ].filter(Boolean).join(' ');

        const guessPickable = Boolean(
          guess && guess.interactive && slot !== null && slot.state !== 'locked' && slot.mark === null,
        );
        const clickable = (vote !== null && votable) || guessPickable;

        return (
          <div
            key={playerId}
            className={classes}
            style={{ '--seat-c': seatColor(seatIndex) } as CSSProperties}
            data-player-id={playerId}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={clickable && vote ? selected : undefined}
            onClick={clickable ? () => (vote ? vote.onPick(playerId) : guess?.onPickFolder(playerId)) : undefined}
            onKeyDown={clickable ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (vote) vote.onPick(playerId); else guess?.onPickFolder(playerId);
              }
            } : undefined}
          >
            <span className="nt-file__seatno">{seatIndex + 1}</span>
            <span className="nt-file__inmate">#{inmateNo(seatIndex)}</span>
            <div className="nt-file__av"><BustSvg /></div>
            <div className="nt-file__nm">
              {nameFor(members, playerId)}
              {isMe && <em className="nt-file__you">你</em>}
            </div>
            <div className="nt-file__st">{status}</div>
            <div className="nt-file__yes" aria-label={`已用 YES ${yesUsed} / ${view.maxYesPerPlayer}`}>
              {Array.from({ length: view.maxYesPerPlayer }, (_, k) => (
                <i key={k} className={k < yesUsed ? 'used' : undefined} />
              ))}
            </div>
            {slot && (
              <div className={`nt-file__slot nt-file__slot--${slot.state}`}>{slot.text}</div>
            )}
            {slot?.mark && (
              <span className={`nt-file__mark nt-file__mark--${slot.mark}`} aria-hidden="true">
                {slot.mark === 'ok' ? '✔' : '✘'}
              </span>
            )}
            {slot?.truth && <span className="nt-file__truth">实为 {slot.truth}</span>}
            {vote?.mySealTargetId === playerId && <SealTape className="nt-file__tape" />}
          </div>
        );
      })}
    </div>
  );
}
