/**
 * 桌面模拟模式（*_sim_v1）共享骨架。
 *
 * sim 也是一张桌，只是没有裁判：左侧工具栏（骰子 / 按铃 / 计时器）、
 * 中央毡面桌面、右侧活动日志，三栏铺满舞台；768 以下折成上下三段。
 * 六款 sim 页面只往中央塞各自的桌面内容，工具与日志统一由这里渲染。
 */
import { useRef, type ReactNode } from 'react';
import { GameIcon, type GameIconName } from '../../shared-ui/GameIcon.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { nameFor, type MemberLike } from '../useGameAction.ts';

/** 各游戏 simTypes 里同形的道具状态（结构化类型，免得跨游戏互相导入） */
export interface SimTimerLike {
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isExploded: boolean;
}

export interface SimDiceLike {
  values: number[];
  lastRollBy: string | null;
}

export interface SimBellLike {
  rungBy: string | null;
  ringCount: number;
}

export interface SimPropsLike {
  timer: SimTimerLike | null;
  dice: SimDiceLike | null;
  bell: SimBellLike | null;
}

export interface SimLogLike {
  text: string;
}

/** 面板标题：GameIcon + 中文标题，替换原先的 emoji 图标 */
export function SimPanelHead({ icon, title, children }: { icon?: GameIconName; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="sim-panel__head">
      {icon && <GameIcon name={icon} size={20} className="sim-panel__icon" alt="" aria-hidden="true" />}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

interface SimToolsPanelProps {
  props: SimPropsLike;
  members: readonly MemberLike[];
  myId: string | null;
  busy: boolean;
  act: (payload: unknown) => Promise<void>;
  /** 「预设」按钮的秒数 */
  timerPreset?: number;
  /** Ding 的铃在中央桌案上，工具栏里就不再重复 */
  showBell?: boolean;
}

/** 左栏：骰子 / 按铃 / 计时器三件自由道具，实体贴纸卡 + 衬线大数字 */
export function SimToolsPanel({ props, members, myId, busy, act, timerPreset = 60, showBell = true }: SimToolsPanelProps) {
  const { dice, bell, timer } = props;
  // 大屏（观战）没有自己的座位，道具按钮一律禁用而不是点了没反应
  const locked = busy || !myId;

  return (
    <section className="sim-panel sim-panel--tools">
      <SimPanelHead icon="star" title="自由道具" />
      <div className="sim-board__row sim-tools">
        <div className="sim-tool">
          <span className="stage-eyebrow">骰子</span>
          <span className="sim-tool__value stage-numeral">{dice?.values.length ? dice.values.join(' · ') : '—'}</span>
          {dice?.lastRollBy && <small className="sim-tool__meta">{nameFor(members, dice.lastRollBy)} 掷</small>}
          <button
            type="button"
            className="sim-tool__btn"
            disabled={locked}
            onClick={() => myId && (webAudio.playDiceShake(), void act({ type: 'sim:roll_dice', playerId: myId }))}
          >
            掷骰
          </button>
        </div>

        {showBell && (
          <div className="sim-tool">
            <span className="stage-eyebrow">按铃</span>
            <span className="sim-tool__value sim-tool__value--text">
              {bell?.rungBy ? `${nameFor(members, bell.rungBy)} 首响 · ${bell.ringCount} 次` : '未按'}
            </span>
            <button
              type="button"
              className="sim-tool__btn sim-tool__btn--bell"
              disabled={locked}
              onClick={() => myId && (webAudio.playUnoShout(), void act({ type: 'sim:ring_bell', playerId: myId }))}
            >
              <GameIcon name="horn" size={16} alt="" aria-hidden="true" /> 按铃
            </button>
          </div>
        )}

        <div className="sim-tool">
          <span className="stage-eyebrow">
            <GameIcon name="hourglass" size={12} alt="" aria-hidden="true" /> 计时器
          </span>
          <span className={`sim-tool__value stage-numeral ${timer?.isExploded ? 'is-exploded' : ''}`}>
            {timer ? (timer.isExploded ? '到点！' : `${timer.remainingSeconds}s`) : '未启用'}
          </span>
          <div className="sim-tool__row">
            <button type="button" className="sim-tool__btn" disabled={locked || timer?.isRunning}
              onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'start' })}>开始</button>
            <button type="button" className="sim-tool__btn" disabled={locked || !timer?.isRunning}
              onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'pause' })}>暂停</button>
            <button type="button" className="sim-tool__btn" disabled={locked}
              onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'reset' })}>重置</button>
            <button type="button" className="sim-tool__btn" disabled={locked}
              onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'set', durationSeconds: timerPreset })}>{timerPreset}s</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 右栏：活动日志（最新在上） */
export function SimLogPanel({ logs }: { logs: readonly SimLogLike[] }) {
  return (
    <section className="sim-panel sim-panel--log">
      <SimPanelHead icon="cards_deck" title="活动记录" />
      <ul className="sim-logs">
        {logs.map((log, i) => (
          <li key={i} className="sim-logs__item">{log.text}</li>
        ))}
        {logs.length === 0 && <li className="sim-logs__item sim-empty">暂无记录</li>}
      </ul>
    </section>
  );
}

interface SimBoardProps {
  /** 左栏内容（一般是 SimToolsPanel，可在其上方追加游戏专属工具） */
  tools: ReactNode;
  logs: readonly SimLogLike[];
  /** 中央是否包一层共享 3D 毡面；自带毡面的游戏（一智千金）传 false */
  felt?: boolean;
  className?: string;
  children: ReactNode;
}

/** 三栏骨架：左工具栏 / 中央桌面 / 右活动日志 */
export function SimBoard({ tools, logs, felt = true, className, children }: SimBoardProps) {
  return (
    <div className={`sim-board ${className ?? ''}`.trim()}>
      <aside className="sim-board__tools" aria-label="自由道具">
        {tools}
      </aside>
      <div className={`sim-board__table ${felt ? 'sim-board__table--felt stage-felt-3d' : ''}`.trim()}>
        {children}
      </div>
      <aside className="sim-board__log" aria-label="活动记录">
        <SimLogPanel logs={logs} />
      </aside>
    </div>
  );
}

/**
 * 把 sim 计时器（服务端只存剩余秒数、由客户端每秒投递 tick）换算成一个
 * 稳定的截止时刻，喂给 StageCountdownRing。
 *
 * 每次 tick 剩余秒数都会变，如果直接 now + remaining 算，截止时刻每秒抖一次，
 * 进度环会把每一秒都当成新阶段重新测满格。这里只在偏差超过 1.5 秒（暂停后
 * 继续、重置、改时长）时才重新定锚。
 */
export function useSimTimerDeadline(timer: SimTimerLike | null): { deadlineAt: number | null; epoch: number } {
  const anchorRef = useRef<{ deadlineAt: number; epoch: number } | null>(null);
  const epochRef = useRef(0);

  if (!timer || !timer.isRunning || timer.isExploded) {
    anchorRef.current = null;
    return { deadlineAt: null, epoch: epochRef.current };
  }

  const estimate = Date.now() + timer.remainingSeconds * 1000;
  const anchor = anchorRef.current;
  if (!anchor || Math.abs(anchor.deadlineAt - estimate) > 1500) {
    epochRef.current += 1;
    anchorRef.current = { deadlineAt: estimate, epoch: epochRef.current };
  }
  return { deadlineAt: anchorRef.current!.deadlineAt, epoch: anchorRef.current!.epoch };
}
