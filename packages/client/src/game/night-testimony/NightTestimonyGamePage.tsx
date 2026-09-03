/**
 * night_testimony_v1 客户端主页面（线下桌游辅助与卡牌/标记道具模拟形态）。
 * 只消费严格解析后的囚徒之夜视角（night-testimony/types.ts）。
 * 视觉：狱审档案——全员广播作答、单人累计3是/5问终止、全员自告、投票与终局猜罪矩阵。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
import type { CrimeId, NightTestimonyPlayerView, QuestionCardView } from './types.ts';

const CRIME_META: Record<CrimeId, { name: string; icon: string; traits: string }> = {
  // 传统恶性与人身侵财
  arson: { name: '恶意纵火犯', icon: '火', traits: '火源、高温、焦黑灰烬、不动产损毁、夜间' },
  theft: { name: '入室盗窃犯', icon: '盗', traits: '撬锁、潜入、手套撬棍、实体财物、无声搜刮' },
  forgery: { name: '公文伪造犯', icon: '印', traits: '虚假公文、篡改印章、假学历假证书、高超摹仿' },
  smuggling: { name: '违禁走私犯', icon: '私', traits: '越境运输、违禁品仓储、集装箱黑市、逃避关税' },
  fraud: { name: '电信诈骗犯', icon: '诈', traits: '杀猪盘、商业骗局、冒充公检法、诱导转账' },
  kidnap: { name: '密室绑架犯', icon: '绑', traits: '人身控制、密室关押、勒索赎金、绳索胶带' },

  // 生活微罪与不文明行为
  littering: { name: '乱扔垃圾犯', icon: '圾', traits: '随手丢弃、果皮纸屑、造假分类、弄脏环境' },
  public_urination: { name: '随地便溺犯', icon: '溺', traits: '绿化带放水、墙角恶臭、避开监控、毫无公德' },
  noise_nuisance: { name: '深夜扰民犯', icon: '噪', traits: '半夜电钻、深夜蹦迪、走廊喧哗、破坏睡眠' },
  graffiti: { name: '乱涂乱画犯', icon: '涂', traits: '景区涂鸦、油漆小广告、刻字到此一游、破坏公物' },
  dine_and_dash: { name: '吃霸王餐犯', icon: '霸', traits: '借口溜走、假装忘带手机、换桌逃单、专挑小店' },
  line_cutting: { name: '恶意插队犯', icon: '塞', traits: '硬挤队伍、假装找朋友、强行加塞、公愤焦点' },
  scalping: { name: '倒卖黄牛犯', icon: '票', traits: '抢空门票、天价加价、黑市倒票、扰乱秩序' },
  public_smoking: { name: '禁烟区吸烟犯', icon: '烟', traits: '电梯吸烟、楼道吐雾、乱弹烟灰、刺鼻烟味' },

  // 职场、网络与数字犯罪
  hacker: { name: '黑客入侵犯', icon: '客', traits: '远程攻破、植入木马、篡改数据、窃取源码' },
  wifi_leeching: { name: '蹭网盗密犯', icon: '网', traits: '万能钥匙、破解密码、偷吃带宽、偷窥流量' },
  scalp_bot: { name: '抢购外挂犯', icon: '挂', traits: '脚本外挂、秒杀显卡、瘫痪服务器、自动化作弊' },
  spoilers: { name: '恶意剧透犯', icon: '剧', traits: '首映剧透凶手、弹幕反转炸弹、毁灭观影体验' },
  water_army: { name: '网络水军犯', icon: '军', traits: '刷好评控评、操控舆论热搜、批量僵尸号' },
  office_theft: { name: '偷吃外卖犯', icon: '食', traits: '偷拿前台外卖、冰箱偷喝奶茶、神不知鬼不觉' },

  // 市井侵财与偷盗
  pickpocket: { name: '公交扒手犯', icon: '扒', traits: '拥挤人群、刀片割袋、顺手牵羊、手法极快' },
  bike_theft: { name: '偷电瓶车犯', icon: '车', traits: '剪断车锁、拔掉电瓶、假装车主、二手倒卖' },
  counterfeiter: { name: '假币制造犯', icon: '钞', traits: '印刷假钞、特制纸张油墨、市面调包、以假乱真' },
  blackmail: { name: '敲诈勒索犯', icon: '索', traits: '私密黑料、匿名威胁、索要封口费、步步紧逼' },
  prison_break: { name: '越狱逃犯', icon: '狱', traits: '挖地道、翻越高墙、换装潜逃、全城通缉' },
  poisoning: { name: '投毒暗害犯', icon: '毒', traits: '无色无味、水杯下毒、伪装意外、化学试剂' },
  grave_robbery: { name: '盗掘古墓犯', icon: '墓', traits: '洛阳铲、深夜探穴、炸开地宫、倒卖出土文物' },

  // 跨国犯罪与超级重案
  transnational_crime: { name: '跨国犯罪头目', icon: '枭', traits: '跨国黑产、多本伪造护照、洗钱网络、国际红通' },
  money_laundering: { name: '地下洗钱犯', icon: '洗', traits: '空壳公司、虚拟货币、海量资金分流、抹去流水' },
  museum_heist: { name: '名画大盗', icon: '画', traits: '闪避红外激光、调包名画、切割防盗玻璃、价值连城' },
  arms_trafficking: { name: '军火走私犯', icon: '火', traits: '秘密军火箱、货轮改装、伪装农机、危险重武器' },
  espionage: { name: '商业间谍犯', icon: '谍', traits: '针孔窃听、窃取芯片源码、高管卧底、高额赏金' },
  poaching: { name: '盗猎珍兽犯', icon: '猎', traits: '深山猎夹、偷猎国家保护动物、剥取角牙皮毛' },
  pyramid_scheme: { name: '传销洗脑犯', icon: '销', traits: '秘密开会、没收手机、拉人头发展下线、精神控制' },
  sea_pirate: { name: '公海海盗犯', icon: '盗', traits: '快艇劫持货轮、武装扣押船员、索要保护费' },
  impersonation: { name: '假冒军警犯', icon: '伪', traits: '假制服假警官证、非法设卡检查、招摇撞骗' },
};

function phaseLabel(phase: NightTestimonyPlayerView['phase']): string {
  switch (phase) {
    case 'question': return '审讯盘问';
    case 'deduction': return '推理辩论';
    case 'vote': return '票选狱警';
    case 'game_over': return '对局结束';
    default: return phase;
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
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  // 移动端身份折叠展开
  const [identityExpandedMobile, setIdentityExpandedMobile] = useState(false);

  // 自告身份游戏内确认弹窗状态
  const [exposeConfirmOpen, setExposeConfirmOpen] = useState(false);

  // 选卡提问状态
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // 投票状态
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // 狱警猜罪状态
  const [guessTarget, setGuessTarget] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<Record<string, CrimeId>>({});

  const hasSelfExposed = Boolean(myId && view.revealedIdentities[myId]);
  const isMyTurnToPickCard = view.phase === 'question' && view.currentQuestion === null && view.currentQuestionerId === myId && !hasSelfExposed;
  const isQuestionActive = view.phase === 'question' && view.currentQuestion !== null;

  const players = view.players.map((playerId) => {
    let status = '';
    const yesCount = view.playerYesCounts[playerId] ?? 0;
    const exposed = view.revealedIdentities[playerId];

    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (exposed) {
      if (exposed === 'warden') {
        status = '已自曝狱警';
      } else {
        const meta = CRIME_META[exposed];
        status = `已自告罪犯: ${meta?.icon ?? ''} ${meta?.name ?? exposed}`;
      }
    } else if (view.phase === 'question' && playerId === view.currentQuestionerId) {
      status = `当前出题 · ${yesCount}/3 是`;
    } else {
      status = `${yesCount}/3 是`;
    }

    const isActive =
      !exposed &&
      ((view.phase === 'question' && view.currentQuestion === null && playerId === view.currentQuestionerId) ||
      (view.phase === 'question' && view.currentQuestion !== null && view.currentQuestion.answers[playerId] === undefined));

    return {
      id: playerId,
      name: nameFor(members, playerId),
      status,
      active: isActive,
    };
  });

  // 主导动作
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'question' && myId) {
    if (hasSelfExposed) {
      primary = {
        id: 'exposed-info',
        label: '你已自告身份排除嫌疑，不参与本轮提问作答',
        disabled: true,
        onAction: () => {},
      };
    } else if (isMyTurnToPickCard) {
      primary = {
        id: 'pick-card',
        label: selectedCardId ? '确定向全员提出该审讯问题' : '请在上方 3 张问题卡中选择 1 张',
        disabled: !selectedCardId,
        onAction: () => {
          if (!selectedCardId) return;
          void act({
            type: 'pick_question_card',
            playerId: myId,
            cardId: selectedCardId,
          });
          setSelectedCardId(null);
        },
      };
    } else if (isQuestionActive && !me?.hasAnsweredCurrent) {
      primary = {
        id: 'answer-yes',
        label: '回答「是」(YES)',
        disabled: false,
        onAction: () => void act({ type: 'answer_question', playerId: myId, answer: 'yes' }),
      };
      secondary = [
        {
          id: 'answer-no',
          label: '回答「否」(NO)',
          disabled: false,
          onAction: () => void act({ type: 'answer_question', playerId: myId, answer: 'no' }),
        },
      ];
    }
  } else if (view.phase === 'vote' && myId) {
    if (hasVoted) {
      primary = {
        id: 'has-voted',
        label: voteTarget ? `已票选 ${nameFor(members, voteTarget)}` : '已投票，等待开票…',
        disabled: true,
        onAction: () => {},
      };
    } else {
      primary = voteTarget
        ? {
            id: 'confirm-vote',
            label: `票选 ${nameFor(members, voteTarget)}`,
            disabled: false,
            onAction: () => {
              void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget });
              setHasVoted(true);
            },
          }
        : { id: 'wait', label: '请点选你怀疑的狱警', disabled: true, onAction: () => {} };
    }
  } else if (view.guessingInProgress && me?.isWarden && myId) {
    const inmates = view.players.filter((id) => id !== myId);
    const guessComplete = inmates.every((id) => guesses[id] !== undefined);
    primary = {
      id: 'submit-guesses',
      label: guessComplete
        ? '提交终局猜罪'
        : `请为每名囚犯匹配罪行（已配对 ${Object.keys(guesses).length}/${inmates.length}）`,
      disabled: !guessComplete,
      onAction: () => {
        if (!guessComplete) return;
        const payload: Record<string, CrimeId> = {};
        for (const id of inmates) payload[id] = guesses[id]!;
        void act({ type: 'submit_guesses', playerId: myId, guesses: payload });
      },
    };
  }

  // 随时自告操作（若尚未自告）
  if (myId && !hasSelfExposed && view.phase !== 'game_over' && !view.guessingInProgress) {
    secondary = [
      ...secondary,
      {
        id: 'self-expose',
        label: me?.isWarden
          ? '自告身份（狱警自曝进猜罪）'
          : me?.crime
            ? `自告身份（出示罪名【${CRIME_META[me.crime]?.name}】）`
            : '自告身份（揭露自身罪名）',
        disabled: false,
        onAction: () => {
          setExposeConfirmOpen(true);
        },
      },
    ];
  }

  const waitingReason =
    view.phase === 'game_over'
      ? null
      : view.phase === 'question'
        ? isMyTurnToPickCard
          ? '轮到你出题：请从 3 张问题卡中挑选 1 张向全员提问'
          : isQuestionActive
            ? me?.hasAnsweredCurrent
              ? `你已作答，等待其他玩家提交作答（${Object.keys(view.currentQuestion?.answers ?? {}).length}/${view.players.length}）…`
              : '当前题目正在全员审讯，请提交你的「是」或「否」！'
            : `等待 ${nameFor(members, view.currentQuestionerId)} 挑选下一道审讯卡…`
        : hasVoted
          ? '你已完成投票，等待其他玩家投票…'
          : '票选阶段——选出你怀疑的潜伏狱警';

  const guessInmate =
    view.guessingInProgress && me?.isWarden
      ? guessTarget ??
        view.players.find((id) => id !== myId && guesses[id] === undefined) ??
        view.players.find((id) => id !== myId) ??
        null
      : null;

  return (
    <TabletopShell
      title="暗夜证词"
      phase={phaseLabel(view.phase)}
      gameId="night-testimony"
      phaseKey={`${view.phase}:${view.currentQuestionerId}:${view.questionIndex}:${view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : view.guessingInProgress ? 'guessing' : isQuestionActive ? 'answering' : 'picking'}`}
      spectator={isSpectator}
      players={players}
      theme="mystery"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          审讯规则
        </button>
      )}
      actions={
        <ActionDock
          primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }}
          secondary={secondary}
          busy={busy}
          waitingReason={waitingReason ?? undefined}
        />
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="暗夜证词 · 案卷规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>核心机制</h4>
          <p>1. <strong>狱警潜伏</strong>：一名狱警伪装成囚犯潜伏其中，可撒谎；其余囚犯各有专属罪行卡，必须如实回答。</p>
          <p>2. <strong>广播提问与全员作答</strong>：顺时针轮流 3 选 1 挑题向全场提问，全员（含出题者与狱警）共同提交「是」或「否」。</p>
          <p>3. <strong>停止提问条件</strong>：任意一人累计回答 <strong>3 个「是」</strong> 或 <strong>全局提满 5 题</strong>后，立即停止询问，进入投票！</p>
          <p>4. <strong>自告/自曝机制</strong>：囚犯自告可公开罪行排除狱警嫌疑；狱警自告则直接进入终局猜罪！</p>
          <p>5. <strong>投票与终局猜罪</strong>：票出囚犯则狱警直胜；票出狱警则狱警需猜中全部囚犯罪行方能独胜，否则囚犯全胜！</p>
          <hr style={{ margin: '12px 0', borderColor: 'var(--game-line, #221e1a)' }} />
          <h4>罪行档案特征参考</h4>
          <ul style={{ paddingLeft: '18px', fontSize: '13px', lineHeight: 1.6 }}>
            {Object.entries(CRIME_META).map(([id, meta]) => (
              <li key={id}>
                <strong>{meta.icon} {meta.name}</strong>：{meta.traits}
              </li>
            ))}
          </ul>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage testimony-stage">
          {/* 移动端快捷身份卡展开/收起横条 */}
          {me && (
            <button
              type="button"
              className="testimony-identity-toggle-btn"
              onClick={() => setIdentityExpandedMobile((prev) => !prev)}
            >
              <span>
                {me.isWarden
                  ? '我的私密身份：潜伏狱警'
                  : me.crime
                    ? `我的私密罪行：${CRIME_META[me.crime].name}`
                    : '我的私密罪证档案'}
              </span>
              <span>{identityExpandedMobile ? '▲ 收起' : '▼ 点击展开防窥卡'}</span>
            </button>
          )}

          <div className="testimony-dual-col">
            {/* 左列：私密档案 + 全员 YES 计数面板 */}
            <div className="testimony-col testimony-col--left">
              {me && (
                <section
                  className={`sg-panel testimony-private ${!identityExpandedMobile ? 'is-collapsed-mobile' : ''}`}
                  aria-label="我的私密身份"
                >
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      
                      <h3>我的私密罪证（按住翻开）</h3>
                    </div>
                    {hasSelfExposed ? (
                      <span className="sg-badge sg-badge--highlight">已自告公开</span>
                    ) : (
                      <span className="sg-badge sg-badge--dark">防窥遮罩</span>
                    )}
                  </div>

                  <IdentityFlipCard
                    theme="prison"
                    variant="compact"
                    roleName={me.isWarden ? '狱警（潜伏卧底）' : me.crime ? `${CRIME_META[me.crime].icon} ${CRIME_META[me.crime].name}` : '囚犯'}
                    roleSubtitle={me.isWarden ? '卧底潜伏 · 可撒谎误导' : '嫌疑囚犯 · 须如实应答'}
                    roleCamp={me.isWarden ? 'evil' : 'good'}
                    secretHints={
                      me.isWarden
                        ? [
                            '【绝密】你是潜伏在囚犯中的狱警！',
                            '面对盘问时可以随意撒谎以隐藏身份。若被票出，准确猜出所有囚犯的罪行即可逆转独胜！',
                          ]
                        : [
                            `【真实罪行】你是「${me.crime ? CRIME_META[me.crime].name : ''}」！`,
                            `特征线索：${me.crime ? CRIME_META[me.crime].traits : ''}`,
                            '被提问时，你必须根据自己的真实罪行如实回答 YES 或 NO！',
                          ]
                    }
                  />
                </section>
              )}

              {/* 全员「是」计数监视器 */}
              <section className="sg-panel testimony-meters-panel" aria-label="全员累计YES监控">
                <div className="sg-panel__head">
                  <div className="sg-panel__title-group">
                    
                    <h3>全员「是」(YES) 累计看板</h3>
                  </div>
                  <span className="sg-badge">满 3 次触发投票</span>
                </div>
                <div className="testimony-meters-grid">
                  {view.players.map((id) => {
                    const yesCount = view.playerYesCounts[id] ?? 0;
                    const isSelf = id === myId;
                    const exposed = view.revealedIdentities[id];
                    const isWarning = yesCount === 2;
                    const isMax = yesCount >= 3;

                    return (
                      <div
                        key={id}
                        className={`testimony-meter-card ${isMax ? 'is-max' : isWarning ? 'is-warning' : ''}`}
                      >
                        <div className="testimony-meter-head">
                          <strong>{nameFor(members, id)} {isSelf ? '（我）' : ''}</strong>
                          {exposed && (
                            <span className="sg-tag sg-tag--good">
                              {exposed === 'warden' ? '狱警' : CRIME_META[exposed].name}
                            </span>
                          )}
                          <span className={`testimony-meter-count ${isMax ? 'is-max' : isWarning ? 'is-warning' : ''}`}>
                            {yesCount} / 3
                          </span>
                        </div>
                        <div className="testimony-chips-display">
                          {Array.from({ length: 3 }, (_, i) => (
                            <span
                              key={i}
                              className={`testimony-chip-token testimony-chip-token--yes ${i < yesCount ? 'is-active' : 'is-spent'}`}
                            >
                              YES
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* 右列：出题 3 选 1 / 当前广播题目与作答 / 公开案卷历史 */}
            <div className="testimony-col testimony-col--right">
              {/* 1. 轮到我出题：3 选 1 卡牌选择器 */}
              {isMyTurnToPickCard && me?.pendingCardChoices && (
                <section className="sg-panel testimony-picker-panel" aria-label="抽选审讯问题卡">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      
                      <h3>轮到你出题 · 抽选 1 张向全员提问</h3>
                    </div>
                    <span className="sg-badge sg-badge--highlight">3 选 1</span>
                  </div>

                  <div className="testimony-card-choices" role="radiogroup" aria-label="3张候选问题卡">
                    {me.pendingCardChoices.map((card: QuestionCardView) => {
                      const isSelected = selectedCardId === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          className={`testimony-topic-card ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedCardId(card.id)}
                          aria-checked={isSelected}
                          role="radio"
                        >
                          <div className="testimony-topic-card__header">
                            <span className="testimony-topic-card__tag">{card.categoryLabel}</span>
                            {isSelected && <span className="testimony-topic-card__check">✓ 已选</span>}
                          </div>
                          <p className="testimony-topic-card__text">「{card.text}」</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 2. 轮到他人出题等待中 */}
              {view.phase === 'question' && view.currentQuestion === null && !isMyTurnToPickCard && (
                <div className="testimony-waiting-banner">
                  <span className="testimony-waiting-icon">⏳</span>
                  <div>
                    <strong>等待 {nameFor(members, view.currentQuestionerId)} 挑选第 {view.questionIndex + 1} 题…</strong>
                    <span>顺时针轮流出题，出题后全员共同提交答案</span>
                  </div>
                </div>
              )}

              {/* 3. 当前广播题目与全员作答台 */}
              {isQuestionActive && view.currentQuestion && (
                <section className="sg-panel testimony-active-q-panel" aria-label="当前审讯题目">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      
                      <h3>第 {view.currentQuestion.questionIndex} 题 · 出题人：{nameFor(members, view.currentQuestion.questionerId)}</h3>
                    </div>
                    <span className="sg-badge">
                      作答进度 {Object.keys(view.currentQuestion.answers).length} / {view.players.length}
                    </span>
                  </div>

                  <div className="testimony-pending-box">
                    <div className="testimony-pending-seal">待定</div>
                    <div className="testimony-pending-content">
                      <strong className="testimony-pending-text">「{view.currentQuestion.text}」</strong>
                      <span className="testimony-pending-tip">
                        {me?.hasAnsweredCurrent
                          ? `✓ 你已提交回答：【${view.currentQuestion.answers[myId!] === 'yes' ? '是 (YES)' : '否 (NO)'}】`
                          : me?.isWarden
                            ? '你是潜伏狱警，可以撒谎！'
                            : '你是囚犯，必须如实回答！'}
                      </span>
                    </div>
                  </div>

                  {/* 全员当前题答题指示灯 */}
                  <div className="testimony-q-answers-status">
                    {view.players.map((id) => {
                      const ans = view.currentQuestion?.answers[id];
                      return (
                        <div key={id} className={`testimony-q-player-chip ${ans ? 'is-answered' : 'is-pending'}`}>
                          <span className="testimony-chip-name">{nameFor(members, id)}</span>
                          <span className={`testimony-chip-mark ${ans ? `is-${ans}` : ''}`}>
                            {ans ? (ans === 'yes' ? 'YES' : 'NO') : '作答中…'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 4. 历史案卷轨迹 */}
              <section className="sg-panel testimony-docket-panel" aria-label="案卷公开历史">
                <div className="sg-panel__head">
                  <div className="sg-panel__title-group">
                    
                    <h3>案卷全员问答历史（公开）</h3>
                  </div>
                  <span className="sg-badge">
                    已审讯 {view.history.length} / {view.questionLimit} 题
                  </span>
                </div>

                {view.history.length === 0 ? (
                  <p className="sg-hint">尚无历史问答。每道题全员作答完毕后将永久留存供全员推理。</p>
                ) : (
                  <ol className="testimony-track-list">
                    {view.history.map((record) => (
                      <li key={record.questionIndex} className="testimony-track-item">
                        <span className="testimony-track-num">#{record.questionIndex}</span>
                        <div className="testimony-track-body">
                          <strong className="testimony-name-ask">由 {nameFor(members, record.questionerId)} 提出：</strong>
                          <p className="testimony-track-q">「{record.question}」</p>
                          <div className="testimony-answers-row">
                            {view.players.map((pid) => (
                              <span key={pid} className={`testimony-ans-pill ${record.answers[pid] === 'yes' ? 'is-yes' : 'is-no'}`}>
                                {nameFor(members, pid)}: {record.answers[pid] === 'yes' ? 'YES' : 'NO'}
                              </span>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>

          {/* 票选阶段面板 */}
          {view.phase === 'vote' && myId && (
            <section className="sg-panel testimony-vote-panel" aria-label="票选狱警">
              <div className="sg-panel__head">
                <div className="sg-panel__title-group">
                  
                  <h3>{hasVoted ? '✓ 你的投票已提交' : '全员票选潜伏狱警'}</h3>
                </div>
                <span>{hasVoted ? '等待其他玩家完成投票…' : '点选你怀疑的嫌疑人'}</span>
              </div>
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => {
                  const exposed = view.revealedIdentities[id];
                  const isSelected = voteTarget === id;
                  const isExposedCriminal = Boolean(exposed && exposed !== 'warden');

                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={hasVoted || isExposedCriminal}
                      className={`sg-chip sg-chip--btn ${isSelected ? 'sg-chip--selected' : ''} ${isExposedCriminal ? 'is-disabled-exposed' : ''}`}
                      onClick={() => !hasVoted && !isExposedCriminal && setVoteTarget(id)}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? '✓ ' : ''}{nameFor(members, id)}
                      {exposed ? `（${exposed === 'warden' ? '狱警' : `${CRIME_META[exposed]?.name ?? exposed} · 排除狱警`}）` : ''}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 狱警终局猜罪大舞台 */}
          {view.guessingInProgress && me?.isWarden && guessInmate && (
            <section className="sg-panel testimony-guess-matrix" aria-label="狱警终局猜罪">
              <div className="sg-panel__head">
                <div className="sg-panel__title-group">
                  
                  <h3>狱警终局翻盘 · 猜出全员罪行</h3>
                </div>
                <span className="sg-badge sg-badge--warning">全对单独获胜</span>
              </div>
              <p className="sg-hint">案台已摆出所有囚犯真实罪行与 1 张干扰罪行卡。为每位囚犯一一匹配指定罪行：</p>

              <div className="testimony-inmate-select-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`sg-chip sg-chip--btn ${guessInmate === id ? 'sg-chip--selected' : ''}`}
                    onClick={() => setGuessTarget(id)}
                    aria-pressed={guessInmate === id}
                  >
                    {nameFor(members, id)}
                    {guesses[id] ? `：${CRIME_META[guesses[id]!].name}` : '（未指定）'}
                  </button>
                ))}
              </div>

              <div className="testimony-crime-options-grid">
                {(view.availableGuessCrimes ?? (Object.keys(CRIME_META) as CrimeId[])).map((crime) => (
                  <button
                    key={crime}
                    type="button"
                    className={`testimony-crime-btn ${guesses[guessInmate] === crime ? 'is-active' : ''}`}
                    onClick={() => setGuesses((prev) => ({ ...prev, [guessInmate]: crime }))}
                  >
                    <span className="testimony-crime-btn__icon">{CRIME_META[crime].icon}</span>
                    <span className="testimony-crime-btn__name">{CRIME_META[crime].name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* 终局结算复盘大殿 */
        view.reveal && (() => {
          const reveal = view.reveal;
          const isWardenVictory = !reveal.wardenRevealed || (reveal.wardenRevealed && reveal.crimesAllGuessed);

          return (
            <div className="sg-stage testimony-over-stage">
              <div className={`winner-hero ${isWardenVictory ? 'winner-hero--warden' : 'winner-hero--inmates'}`}>
                <span className="winner-rays" aria-hidden="true" />
                <h2 className="winner-title">
                  {!reveal.wardenRevealed
                    ? '狱警成功潜伏，未被票出！'
                    : reveal.crimesAllGuessed
                      ? '狱警猜中了全部囚犯罪行，惊天翻盘！'
                      : '狱警猜罪失败，囚犯联盟赢得胜利！'}
                </h2>
                <p className="winner-names">
                  {isWardenVictory
                    ? `潜伏狱警 ${nameFor(members, reveal.wardenId)} 独享胜利！`
                    : `囚犯联盟（${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}）获胜！`}
                </p>
              </div>

              <section className="sg-panel testimony-dossier-reveal">
                <div className="sg-panel__head">
                  <div className="sg-panel__title-group">
                    
                    <h3>本局全员真实案卷与猜测对照</h3>
                  </div>
                  <span className="sg-badge">真相大白</span>
                </div>

                <div className="testimony-dossier-grid">
                  {view.players.map((playerId) => {
                    const isWarden = playerId === reveal.wardenId;
                    const crime = isWarden ? null : reveal.crimes[playerId];
                    const wardenGuess = reveal.wardenGuesses?.[playerId];
                    const isGuessCorrect = wardenGuess && crime && wardenGuess === crime;

                    return (
                      <div key={playerId} className={`testimony-dossier-card ${isWarden ? 'is-warden' : ''}`}>
                        <div className="testimony-dossier-card__head">
                          <strong>{nameFor(members, playerId)}</strong>
                          <span className={`sg-tag ${isWarden ? 'sg-tag--warden' : 'sg-tag--prisoner'}`}>
                            {isWarden ? '狱警' : '囚犯'}
                          </span>
                        </div>

                        {!isWarden && crime && (
                          <div className="testimony-dossier-card__crime">
                            <span>真实罪行：</span>
                            <strong>{CRIME_META[crime].icon} {CRIME_META[crime].name}</strong>
                          </div>
                        )}

                        {!isWarden && wardenGuess && (
                          <div className={`testimony-dossier-card__guess ${isGuessCorrect ? 'is-correct' : 'is-wrong'}`}>
                            <span>狱警猜测：</span>
                            <strong>{CRIME_META[wardenGuess].icon} {CRIME_META[wardenGuess].name}</strong>
                            <span>{isGuessCorrect ? '✓ 对' : '✗ 错'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          );
        })()
      )}

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
                <h3 id="expose-modal-title">{me?.isWarden ? '主动自曝狱警身份' : '主动自告罪犯身份'}</h3>
                <span className="nt-expose-modal__sub">{me?.isWarden ? '终局决胜大转折' : '公开真实罪名 · 排除嫌疑'}</span>
              </div>
            </div>
            <div className="nt-expose-modal__body">
              {me?.isWarden ? (
                <div className="nt-expose-modal__desc">
                  <p>
                    确定要<strong>主动自曝潜伏狱警身份</strong>吗？
                  </p>
                  <p>
                    自曝后将立即中断问答与投票流程，<strong>直接开启全员终局猜罪大舞台</strong>！若你能猜对场上全部囚犯与罪行的对应关系，你将<strong>直接独享胜利</strong>！
                  </p>
                </div>
              ) : (
                <div className="nt-expose-modal__desc">
                  <p>
                    确定要向全场公开你身为罪犯的真实罪名【<strong>{me?.crime ? `${CRIME_META[me.crime]?.icon} ${CRIME_META[me.crime]?.name}` : ''}</strong>】吗？
                  </p>
                  <p>
                    公开后你的罪行将公之于众，全场玩家将<strong>100% 确信你是真实罪犯</strong>并彻底洗清狱警嫌疑，为罪犯阵营排除干扰！
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
    </TabletopShell>
  );
}
