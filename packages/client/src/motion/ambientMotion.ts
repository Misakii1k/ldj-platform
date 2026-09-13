/**
 * 环境循环动效（装饰性无限循环）清单 —— 单一权威来源。
 *
 * 用途：
 * 1. `shared-ui/game-ui.css` 的 `html[data-motion-level="reduced"] :is(...)` 门控块
 *    逐条登记这些选择器（reduced 档位下 `animation: none`）；
 * 2. `packages/client/tests/ambientMotion.test.ts` 校验 CSS 中的清单与本文件一致，
 *    防止两边漂移；
 * 3. `e2e/motion-contract.spec.ts` 用它断言 reduced 档位下这些元素确实不动。
 *
 * 判定标准：**不承载回合/紧迫/可出牌信息**的无限循环动效。承载这些信息的反馈
 * （.tabletop-turn-halo、.tabletop-speech-wave、.game-motion-countdown-pulse、
 * .uno-house-draw-pile.is-my-turn-playable、.ding-uno-card.is-playable、
 * .bell-draw-pile.is-playable、.countdown.urgent、.moon-header__timer.is-urgent、
 * .testimony-meter-card.is-warning）不在清单内，reduced 档位只降时长。
 */
export const AMBIENT_MOTION_SELECTORS = [
  '.home-local-badge::before',
  '.auto-start-banner',
  '.auto-start-pulse',
  '.home-connection.is-connected .home-connection__dot',
  '.home-party-scene__character.is-visible',
  '.home-party-scene__garland--one',
  '.home-party-scene__garland--two',
  '.home-party-scene__glow',
  '.home-party-scene__lamp-light',
  '.home-party-scene__person.is-visible',
  '.home-party-scene__plant-wrap',
  '.home-party-scene__spark',
  '.home-hero h1 span',
  '.player-filter__thumb-tooltip',
  '.home-active-room-pulse',
  '.post-game-dock__auto-hint',
  '.sim-tool__value',
  '.tip-press',
  '.badge-ready',
  '.cheese-icon-bounce',
  '.cheese-model-emoji',
  '.ding-bell-stage-text',
  '.echo-rank-score',
  '.host-status-dot',
  '.werewolf-dawn-glow',
  '.werewolf-fog-drift',
  '.werewolf-night-stars',
  '.werewolf-day-sunbeams',
  '.werewolf-actions__waiting-dot',
  '.werewolf-spotlight__img',
  '.winner-rays',
  '.goose-modal-card-item',
  '.bell-floating-bell-btn',
] as const;

/** reduced 档位下仍必须保留动效的必要反馈（只降时长，不关闭）。 */
export const ESSENTIAL_FEEDBACK_SELECTORS = [
  '.tabletop-turn-halo',
  '.tabletop-speech-wave',
  '.game-motion-countdown-pulse',
  '.countdown.urgent',
  '.moon-header__timer.is-urgent',
  '.testimony-meter-card.is-warning',
  '.uno-house-draw-pile.is-my-turn-playable',
  '.ding-uno-card.is-playable',
  '.bell-draw-pile.is-playable',
] as const;

/** 动效时长档位令牌（与 game-ui.css :root 一一对应，供测试断言）。 */
export const MOTION_DURATION_TOKENS = [
  '--gp-dur-instant',
  '--gp-dur-fast',
  '--gp-dur-standard',
  '--gp-dur-emphasis',
  '--gp-dur-phase',
  '--gp-dur-slow',
] as const;

export type MotionDurationToken = (typeof MOTION_DURATION_TOKENS)[number];
