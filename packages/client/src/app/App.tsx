import { useGatewayConnection } from '../connection/use-gateway-connection';
import { ConnectionBadge } from '../shared-ui/ConnectionBadge';

export function App() {
  const connectionState = useGatewayConnection();
  const isConnected = connectionState === 'connected' || connectionState === 'restored';

  return (
    <main className="party-shell">
      <div className="confetti confetti--one" aria-hidden="true" />
      <div className="confetti confetti--two" aria-hidden="true" />

      <header className="masthead">
        <a className="brand" href="/" aria-label="闹一桌首页">
          <span className="brand__stamp" aria-hidden="true">闹</span>
          <span>闹一桌</span>
        </a>
        <span className="lan-tag">局域网限定</span>
      </header>

      <section className="hero" aria-labelledby="welcome-title">
        <p className="eyebrow">手机就是你的手牌</p>
        <h1 id="welcome-title">人到齐，<br /><em>就开局。</em></h1>
        <p className="hero__lede">不用下载，不用注册。连上同一个 Wi-Fi，和身边的朋友面对面玩。</p>
      </section>

      <section className="table-card" aria-labelledby="game-title">
        <div className="table-card__marker" aria-hidden="true">01</div>
        <div className="game-art" aria-hidden="true">
          <span className="game-art__card game-art__card--back">?</span>
          <span className="game-art__card game-art__card--front">谁</span>
        </div>
        <div className="table-card__copy">
          <p className="kicker">首发游戏</p>
          <h2 id="game-title">谁是卧底</h2>
          <p>4–12 人 · 同桌推理 · 一台主机</p>
        </div>
        <button className="primary-action" type="button" disabled={!isConnected}>
          {isConnected ? '创建房间' : '等待连接'}
          <span aria-hidden="true">→</span>
        </button>
        <p className="milestone-note">
          <span aria-hidden="true">✦</span> 工程骨架已就位，房间功能将在下一里程碑开放。
        </p>
      </section>

      <ConnectionBadge state={connectionState} />

      <footer>
        <span>β R1</span>
        <span>·</span>
        <span>只在这张网里玩</span>
      </footer>
    </main>
  );
}
