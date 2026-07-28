import { GAME_PREPARATION_SPECS, type GamePreparationSpec } from '@ldj/shared';

function SpecCard({ spec }: { spec: GamePreparationSpec }) {
  return (
    <article className={`game-prep-card game-prep-card--${spec.gameId}`}>
      <div className="game-prep-card__head">
        <span className="game-prep-card__priority">优先级 {spec.implementationPriority}</span>
        <h3>{spec.displayName}</h3>
        <p>{spec.designGoal}</p>
      </div>

      <section className="game-prep-card__section" aria-label={`${spec.displayName} 规则阶段`}>
        <h4>规则阶段</h4>
        <ol>
          {spec.ruleSteps.map((step) => (
            <li key={step.key}>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="game-prep-card__section" aria-label={`${spec.displayName} 页面组件`}>
        <h4>页面组件</h4>
        <div className="game-prep-panels">
          {spec.uiPanels.map((panel) => (
            <div key={panel.key} className="game-prep-panel">
              <strong>{panel.title}</strong>
              <span>{panel.description}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

/**
 * 新游戏准备预览：后续可挂到开发者入口或首页“即将推出”详情。
 * 当前组件不开放建房，只用于沉淀 UNO、斗地主、狼人杀的页面和规则方案。
 */
export function GamePreparationPreview() {
  return (
    <section className="game-prep-preview" aria-labelledby="game-prep-title">
      <div className="game-prep-preview__intro">
        <p className="game-prep-preview__eyebrow">下一批游戏准备中</p>
        <h2 id="game-prep-title">UNO、斗地主、狼人杀</h2>
        <p>先把规则状态机、玩家私有视图和手机页面拆好，再逐个开放为可建房游戏。</p>
      </div>
      <div className="game-prep-grid">
        {GAME_PREPARATION_SPECS.map((spec) => <SpecCard key={spec.gameId} spec={spec} />)}
      </div>
    </section>
  );
}
