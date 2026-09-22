/**
 * 谁是卧底（classic）主舞台。
 *
 * U06 收编：原先 word_reveal / speaking / voting / vote_result / game_over
 * 五个视图散在 game/ 根目录，由 GamePage 直接 switch 分流；现在收进本目录，
 * 由这里统一持有演出层（发言聚光、票数飞行、淘汰翻身份）与共享倒计时环。
 */
import type { UndercoverPlayerView } from '../../types.ts';
import { GamePhaseRail } from '../../../GameChrome.tsx';
import { StageCountdownRing } from '../../../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../../../shared-ui/stage/FlightLayer.tsx';
import { WordRevealView } from './WordRevealView.tsx';
import { SpeakingView } from './SpeakingView.tsx';
import { VotingView } from './VotingView.tsx';
import { VoteResultView } from './VoteResultView.tsx';
import { GameOverView } from './GameOverView.tsx';
import { useUndercoverStage, type UndercoverStageApi } from './useUndercoverStage.tsx';

export interface UndercoverTableStageProps {
  readonly view: UndercoverPlayerView;
}

/** 供外壳读取演出态（席位淘汰翻面等）。 */
export type { UndercoverStageApi };

export function UndercoverTableStage({ view }: UndercoverTableStageProps) {
  const stage = useUndercoverStage(view);

  let phaseView;
  switch (view.phase) {
    case 'word_reveal':
      phaseView = <WordRevealView view={view} />;
      break;
    case 'speaking':
      phaseView = <SpeakingView view={view} />;
      break;
    case 'voting':
    case 'runoff_voting':
      phaseView = <VotingView view={view} />;
      break;
    case 'vote_result':
      phaseView = <VoteResultView view={view} />;
      break;
    case 'game_over':
      phaseView = <GameOverView view={view} />;
      break;
    default:
      phaseView = <div className="game-loading-card">未知阶段</div>;
  }

  const counting =
    view.phase === 'speaking' || view.phase === 'voting' || view.phase === 'runoff_voting';

  return (
    <div className="uc-stage" data-uc-phase={view.phase} ref={stage.stageRef}>
      {view.phase !== 'game_over' && <GamePhaseRail phase={view.phase} />}

      {/* 只在需要玩家行动的阶段催时间；揭词与开票是纯展示 */}
      <StageCountdownRing
        deadlineAt={view.deadlineAt}
        phaseKey={`${view.phase}:${view.round}:${view.currentSpeakerId ?? 'idle'}`}
        active={counting}
        className="uc-countdown"
      />

      {phaseView}

      {/* 飞行层必须挂在舞台之外的定位上下文里：这里舞台本身没有 transform，
          共享层自己是 fixed，所以放在末尾即可。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
    </div>
  );
}
