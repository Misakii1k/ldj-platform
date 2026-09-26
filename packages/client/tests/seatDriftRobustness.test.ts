/**
 * 对抗性实证测试：席位状态漂移与边界场景健壮性验证
 *
 * 验证目标：
 * 1. 当 view.me === null（公共大屏或旁观席）时，稳定渲染大屏中央展示，绝不发生 me.xxx 崩溃。
 * 2. 当 isSpectator === false 时，手牌区与个人操作抽屉正常挂载。
 * 3. 验证《榴莲》在 view.mode === 'simulator' 与标准对战模式下，不同席位正确分流。
 * 4. 极端席位状态漂移测试（网络延迟下 view.me 与 room.seatRole 不一致等边界）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

interface GlobalShim {
  React?: typeof React;
  localStorage?: Storage;
  window?: unknown;
  document?: unknown;
  navigator?: unknown;
}
const globalShim = globalThis as unknown as GlobalShim;
globalShim.React = React;

// Node.js SSR 环境 Shim
if (typeof globalShim.localStorage === 'undefined') {
  globalShim.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  };
}
if (typeof globalShim.window === 'undefined') {
  globalShim.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: globalShim.localStorage,
    devicePixelRatio: 1,
  };
}
if (typeof globalShim.document === 'undefined') {
  const fakeElement = { nodeType: 1 };
  globalShim.document = {
    hidden: false,
    body: fakeElement,
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: { dataset: {} },
    createElement: () => ({ getContext: () => null }),
  };
}
if (typeof globalShim.navigator === 'undefined') {
  globalShim.navigator = {
    hardwareConcurrency: 4,
  };
}

import { renderToStaticMarkup } from 'react-dom/server';
import ReactDOM from 'react-dom';
(ReactDOM as unknown as { createPortal: (children: React.ReactNode) => React.ReactNode }).createPortal = (children: React.ReactNode) => children;
import { ConnectionContext } from '../src/connection/ConnectionContext.tsx';
import type { ConnectionApi, ConnectionSnapshot, Me } from '../src/connection/types.ts';
import { UserProfileProvider } from '../src/user/UserProfileContext.tsx';
import { MotionProvider } from '../src/motion/MotionContext.tsx';
import { DurianGamePage } from '../src/game/durian/DurianGamePage.tsx';
import { CheeseThiefGamePage } from '../src/game/cheese-thief/CheeseThiefGamePage.tsx';
import type { DurianPlayerView } from '../src/game/durian/types.ts';
import type { CheeseThiefPlayerView } from '../src/game/cheese-thief/types.ts';

function createMockConnection(options: {
  seatRole?: 'player' | 'spectator';
  playerId?: string;
  gameRole?: string;
  members?: Array<{ playerId: string; nickname: string; seatRole?: 'player' | 'spectator' }>;
}): ConnectionApi {
  const playerId = options.playerId ?? 'p1';
  const seatRole = options.seatRole ?? 'player';
  const members = options.members ?? [
    { playerId: 'p1', nickname: '玩家1', seatRole },
    { playerId: 'p2', nickname: '玩家2', seatRole: 'player' },
    { playerId: 'p3', nickname: '玩家3', seatRole: 'player' },
  ];

  const state: ConnectionSnapshot = {
    connState: 'synced',
    isRefreshing: false,
    isRecovering: false,
    serverVersion: '1.0.0',
    connectionId: 'conn-1',
    room: {
      roomCode: 'ROOM01',
      title: '测试房间',
      hostPlayerId: 'p1',
      status: 'playing',
      seatLimit: 8,
      members: members.map((m, idx) => ({
        playerId: m.playerId,
        nickname: m.nickname,
        seat: idx,
        seatRole: m.seatRole ?? 'player',
        ready: true,
        connected: true,
      })),
      gameId: 'durian',
    },
    roomSeq: 1,
    chat: [],
    chatCursor: null,
    game: options.gameRole ? ({ role: options.gameRole } as unknown as ConnectionSnapshot['game']) : null,
    lastError: null,
    closeReason: null,
    llmAvailable: false,
  };

  const me: Me = {
    playerId,
    nickname: '我',
    roomCode: 'ROOM01',
    resumeToken: 'token-1',
    seatRole,
  };

  return {
    state,
    me,
    isViewingHome: false,
    setViewingHome: () => {},
    send: async () => ({}) as unknown as ReturnType<ConnectionApi['send']>,
    resync: () => {},
    setMe: () => {},
    clearMe: () => {},
    reset: () => {},
  };
}

function renderGame(element: React.ReactElement, conn: ConnectionApi): string {
  return renderToStaticMarkup(
    React.createElement(
      UserProfileProvider,
      null,
      React.createElement(
        MotionProvider,
        null,
        React.createElement(
          ConnectionContext.Provider,
          { value: conn },
          element,
        ),
      ),
    ),
  );
}

function makeDurianView(overrides: Partial<DurianPlayerView> = {}): DurianPlayerView {
  return {
    gameId: 'durian',
    rulesetId: 'durian_orchard_v1',
    schemaVersion: 1,
    phase: 'turn_action',
    players: ['p1', 'p2', 'p3'],
    round: 1,
    maxRounds: 7,
    mode: 'standard',
    deckCount: 15,
    tablePlacements: [],
    currentPlayerId: 'p1',
    previousPlayerId: null,
    lastChallenge: null,
    penalties: { p1: 0, p2: 0, p3: 0 },
    eliminatedPlayers: [],
    winners: [],
    activeTableTotals: { apple: 0, banana: 0, grape: 0, lemon: 0, strawberry: 0 },
    voidThreeActive: false,
    voidBananaActive: false,
    me: {
      playerId: 'p1',
      ownForeheadHidden: true,
      drawnCard: null,
      visibleForeheadCards: [
        { playerId: 'p2', card: { kind: 'fruit', left: { fruit: 'apple', quantity: 2 }, right: { fruit: 'banana', quantity: 1 } } },
        { playerId: 'p3', card: { kind: 'fruit', left: { fruit: 'lemon', quantity: 3 }, right: { fruit: 'grape', quantity: 1 } } },
      ],
    },
    ...overrides,
  };
}

function makeCheeseThiefView(overrides: Partial<CheeseThiefPlayerView> = {}): CheeseThiefPlayerView {
  return {
    gameId: 'cheese_thief_classic_v1',
    rulesetId: 'cheese_thief_ruleset_v1',
    schemaVersion: 1,
    phase: 'hour_choice',
    players: ['p1', 'p2', 'p3'],
    cheeseStolen: false,
    mode: 'standard',
    currentHour: 0,
    roleCardsEnabled: true,
    revealedCat: null,
    revealedDog: null,
    dogFirstVoter: null,
    thiefCaught: null,
    winners: [],
    deadlineAt: null,
    votes: {},
    reveal: null,
    me: {
      playerId: 'p1',
      wakeHour: 2,
      hourChoices: [2, 5],
      coWakers: [],
      cheeseWasMissing: false,
      isThief: false,
      isAccomplice: false,
      knownAccomplices: [],
      roleCard: 'none',
      canPeek: false,
      peekedHour: null,
      catPeekedHour: null,
      hasVoted: false,
    },
    ...overrides,
  };
}

// ============================================================================
// 1. view.me === null 边界测试（公共大屏或旁观席）
// ============================================================================

test('【奶酪大盗】view.me === null 时稳定渲染大屏案发中央舞台，不崩溃且无角色切换按钮', () => {
  // 运行态阶段（hour_choice, night, accomplice_select, dawn, vote）
  const phases: CheeseThiefPlayerView['phase'][] = [
    'hour_choice',
    'night',
    'accomplice_select',
    'dawn',
    'vote',
  ];

  for (const phase of phases) {
    const view = makeCheeseThiefView({
      phase,
      currentHour: phase === 'night' ? 3 : 0,
      me: null,
    });

    const conn = createMockConnection({
      seatRole: 'spectator',
      playerId: 'spec-1',
      members: [
        { playerId: 'spec-1', nickname: '大屏观战', seatRole: 'spectator' },
        { playerId: 'p1', nickname: '玩家1', seatRole: 'player' },
      ],
    });

    let html = '';
    assert.doesNotThrow(() => {
      html = renderGame(React.createElement(CheeseThiefGamePage, { view }), conn);
    }, `在 phase=${phase} 下 view.me===null 渲染抛出异常`);

    // 验证渲染出大屏中央案发舞台
    assert.ok(html.includes('cheese-tabletop-arena'), `phase=${phase} 应渲染 cheese-tabletop-arena`);
    // 验证渲染出公共大屏高对比度 Badge
    assert.ok(html.includes('cheese-screen-badge'), `phase=${phase} 应包含公共大屏角标`);
    assert.ok(html.includes('公共大屏'), `phase=${phase} 必须展示公共大屏明确文案`);
    // 验证绝不残留过时的角色切换按钮
    assert.ok(!html.includes('cheese-role-switch'), `phase=${phase} 不应残留 cheese-role-switch 控件`);
    assert.ok(!html.includes('桌面端'), `phase=${phase} 不应出现过时的桌面端切换按钮文案`);
  }
});

test('【榴莲】view.me === null 时稳定渲染大屏中央果摊与看板，不崩溃且无角色切换按钮', () => {
  const phases: DurianPlayerView['phase'][] = [
    'turn_action',
    'choose_placement',
    'choose_flip',
    'challenge_result',
    'game_over',
  ];

  for (const phase of phases) {
    const view = makeDurianView({
      phase,
      mode: 'standard',
      me: null,
    });

    const conn = createMockConnection({
      seatRole: 'spectator',
      playerId: 'spec-1',
      members: [
        { playerId: 'spec-1', nickname: '公屏', seatRole: 'spectator' },
        { playerId: 'p1', nickname: '玩家1', seatRole: 'player' },
      ],
    });

    let html = '';
    assert.doesNotThrow(() => {
      html = renderGame(React.createElement(DurianGamePage, { view }), conn);
    }, `在 phase=${phase} 下 view.me===null 渲染抛出异常`);

    // 验证渲染出桌面中央展示舞台
    assert.ok(html.includes('durian-tabletop-arena'), `phase=${phase} 应渲染 durian-tabletop-arena`);
    // 验证渲染出公共大屏 Badge
    assert.ok(html.includes('tabletop-screen-badge'), `phase=${phase} 应包含 tabletop-screen-badge`);
    assert.ok(html.includes('📺 公共大屏'), `phase=${phase} 必须展示公共大屏明确文案`);
    // 验证绝不残留过时的角色切换按钮
    assert.ok(!html.includes('durian-role-switch'), `phase=${phase} 不应残留 durian-role-switch 控件`);
    assert.ok(!html.includes('durian-role-pill'), `phase=${phase} 不应残留 durian-role-pill 控件`);
    // 验证不挂载玩家单手持牌支架
    assert.ok(!html.includes('durian-player-fullscreen-stand'), `大屏端不应挂载个人手牌立牌`);
  }
});

// ============================================================================
// 2. isSpectator === false 时手牌与个人操作抽屉挂载测试
// ============================================================================

test('【奶酪大盗】isSpectator === false 时正确挂载手牌操作区与规则抽屉', () => {
  const view = makeCheeseThiefView({
    phase: 'hour_choice',
    me: {
      playerId: 'p1',
      wakeHour: 0,
      hourChoices: [2, 4],
      coWakers: [],
      cheeseWasMissing: false,
      isThief: false,
      isAccomplice: false,
      knownAccomplices: [],
      roleCard: 'none',
      canPeek: false,
      peekedHour: null,
      catPeekedHour: null,
      hasVoted: false,
    },
  });

  const conn = createMockConnection({
    seatRole: 'player',
    playerId: 'p1',
  });

  const html = renderGame(React.createElement(CheeseThiefGamePage, { view }), conn);

  // 参局玩家不应展示公共大屏 badge
  assert.ok(!html.includes('cheese-screen-badge'), '参局玩家端不应展示 cheese-screen-badge');
  // 必须展示手牌选骰面板
  assert.ok(html.includes('cheese-hour-choice-panel'), '开局阶段应挂载时刻自选面板');
  assert.ok(html.includes('选定 2 点醒来'), '应挂载选定 2 点醒来的操作');
  assert.ok(html.includes('选定 4 点醒来'), '应挂载选定 4 点醒来的操作');
});

test('【榴莲】isSpectator === false 标准模式下正确挂载个人手牌区与 ActionDock', () => {
  const view = makeDurianView({
    phase: 'turn_action',
    currentPlayerId: 'p1',
    mode: 'standard',
    me: {
      playerId: 'p1',
      ownForeheadHidden: true,
      drawnCard: null,
      visibleForeheadCards: [
        { playerId: 'p2', card: { kind: 'fruit', left: { fruit: 'apple', quantity: 1 }, right: { fruit: 'banana', quantity: 2 } } },
      ],
    },
  });

  const conn = createMockConnection({
    seatRole: 'player',
    playerId: 'p1',
  });

  const html = renderGame(React.createElement(DurianGamePage, { view }), conn);

  // 参局玩家不应出现大屏角标
  assert.ok(!html.includes('tabletop-screen-badge'), '标准参局玩家端不应有大屏 badge');
  // 参局玩家必须展示头顶牌条与中心牌区
  assert.ok(html.includes('durian-forehead-bar'), '标准玩家端必须展示头顶牌栏');
  assert.ok(html.includes('durian-center-board'), '标准玩家端必须展示中央看板');
  // 轮到自己必须展示 ActionDock 摸牌按钮
  assert.ok(html.includes('从牌堆摸一张牌'), '轮到当前玩家摸牌时必须展示摸牌按钮');
});

// ============================================================================
// 3. 榴莲 mode === 'simulator' 与标准模式席位分流矩阵验证
// ============================================================================

test('【榴莲分流矩阵】view.mode === "simulator" 与 "standard" 下不同席位行为准确分流', () => {
  // 分流场景 1：模拟器模式 + 公共大屏席位 (isSpectator === true)
  {
    const view = makeDurianView({ mode: 'simulator', me: null });
    const conn = createMockConnection({ seatRole: 'spectator', playerId: 'tv' });
    const html = renderGame(React.createElement(DurianGamePage, { view }), conn);
    assert.ok(html.includes('durian-tabletop-arena'), '模拟器大屏应挂载 tabletop-arena');
    assert.ok(html.includes('tabletop-screen-badge'), '模拟器大屏应有大屏 badge');
    assert.ok(!html.includes('durian-player-fullscreen-stand'), '模拟器大屏绝不能挂载个人立牌');
  }

  // 分流场景 2：模拟器模式 + 参局玩家席位 (isSpectator === false)
  {
    const view = makeDurianView({
      mode: 'simulator',
      me: {
        playerId: 'p1',
        ownForeheadHidden: false,
        drawnCard: null,
        visibleForeheadCards: [
          { playerId: 'p1', card: { kind: 'fruit', left: { fruit: 'strawberry', quantity: 2 }, right: { fruit: 'banana', quantity: 1 } } },
        ],
      },
    });
    const conn = createMockConnection({ seatRole: 'player', playerId: 'p1' });
    const html = renderGame(React.createElement(DurianGamePage, { view }), conn);
    assert.ok(!html.includes('tabletop-screen-badge'), '模拟器玩家端不应有大屏 badge');
    assert.ok(!html.includes('durian-tabletop-arena'), '模拟器玩家端不应挂载 tabletop-arena');
    assert.ok(html.includes('durian-player-arena'), '模拟器玩家端必须渲染 player-arena');
    assert.ok(html.includes('durian-player-fullscreen-stand'), '模拟器玩家端必须渲染全屏立牌');
  }

  // 分流场景 3：标准对战模式 + 参局玩家席位 (isSpectator === false)
  {
    const view = makeDurianView({
      mode: 'standard',
      me: {
        playerId: 'p1',
        ownForeheadHidden: true,
        drawnCard: null,
        visibleForeheadCards: [],
      },
    });
    const conn = createMockConnection({ seatRole: 'player', playerId: 'p1' });
    const html = renderGame(React.createElement(DurianGamePage, { view }), conn);
    assert.ok(html.includes('durian-forehead-bar'), '标准玩家端必须渲染头顶手牌栏');
    assert.ok(html.includes('durian-center-board'), '标准玩家端必须渲染中央看板');
    assert.ok(!html.includes('durian-player-fullscreen-stand'), '标准玩家端不能渲染模拟器立牌');
    assert.ok(!html.includes('tabletop-screen-badge'), '标准玩家端不能有大屏 badge');
  }

  // 分流场景 4：标准对战模式 + 公共大屏/观战席位 (isSpectator === true)
  {
    const view = makeDurianView({ mode: 'standard', me: null });
    const conn = createMockConnection({ seatRole: 'spectator', playerId: 'tv' });
    const html = renderGame(React.createElement(DurianGamePage, { view }), conn);
    assert.ok(html.includes('tabletop-screen-badge'), '标准模式大屏端必须展示大屏 badge');
    assert.ok(html.includes('durian-tabletop-arena'), '标准模式大屏端展示大屏中央舞台');
    assert.ok(!html.includes('durian-player-fullscreen-stand'), '标准模式大屏端不能展示立牌');
  }
});

// ============================================================================
// 4. 席位状态漂移（Seat State Drift）极端异常鲁棒性测试
// ============================================================================

test('【状态漂移防御】当 payload 中 view.me 存在但房间权威席位漂移为 spectator 时，安全锁定为大屏视角', () => {
  // 模拟客户端收到带有残留 me 字段的 view，但房间成员列表中该玩家已被调整为 spectator
  const view = makeCheeseThiefView({
    phase: 'night',
    currentHour: 2,
    me: {
      playerId: 'p1',
      wakeHour: 2,
      hourChoices: [2, 4],
      coWakers: [],
      cheeseWasMissing: false,
      isThief: true,
      isAccomplice: false,
      knownAccomplices: [],
      roleCard: 'none',
      canPeek: false,
      peekedHour: null,
      catPeekedHour: null,
      hasVoted: false,
    },
  });

  const conn = createMockConnection({
    seatRole: 'spectator',
    playerId: 'p1',
    members: [
      { playerId: 'p1', nickname: '玩家1已转为公屏', seatRole: 'spectator' },
      { playerId: 'p2', nickname: '玩家2', seatRole: 'player' },
    ],
  });

  let html = '';
  assert.doesNotThrow(() => {
    html = renderGame(React.createElement(CheeseThiefGamePage, { view }), conn);
  });

  // 此时即使 view.me 有值，因 myMember.seatRole === 'spectator'，isSpectator 应判定为 true！
  assert.ok(html.includes('cheese-screen-badge'), '席位漂移为 spectator 时必须以大屏状态渲染');
  assert.ok(html.includes('cheese-tabletop-arena'), '必须挂载中央案发大屏');
  // 不应泄露个人窃取主操作栏
  assert.ok(!html.includes('伸手偷走奶酪'), '公屏模式绝对不能挂载偷奶酪个人操作');
});

test('【状态漂移防御】当 connMe 缺失且 myMember 未能匹配时，以 view.me === null 作为最终兜底防线', () => {
  const view = makeDurianView({
    phase: 'turn_action',
    me: null,
  });

  // 构造未就绪的空连接快照
  const conn: ConnectionApi = {
    state: {
      connState: 'synced',
      isRefreshing: false,
      isRecovering: false,
      serverVersion: '1.0.0',
      connectionId: 'conn-drift',
      room: {
        roomCode: 'EMPTY',
        title: '空房间',
        hostPlayerId: 'x',
        status: 'playing',
        seatLimit: 8,
        members: [],
        gameId: 'durian',
      },
      roomSeq: 1,
      chat: [],
      chatCursor: null,
      game: null,
      lastError: null,
      closeReason: null,
      llmAvailable: false,
    },
    me: null,
    isViewingHome: false,
    setViewingHome: () => {},
    send: async () => ({}) as unknown as ReturnType<ConnectionApi['send']>,
    resync: () => {},
    setMe: () => {},
    clearMe: () => {},
    reset: () => {},
  };

  let html = '';
  assert.doesNotThrow(() => {
    html = renderGame(React.createElement(DurianGamePage, { view }), conn);
  });

  assert.ok(html.includes('tabletop-screen-badge'), 'connMe 缺失但 view.me===null 时正确兜底为大屏');
  assert.ok(html.includes('durian-tabletop-arena'), '正确挂载 tabletop-arena');
});

// ============================================================================
// 5. 对抗性模糊测试与随机生成器（Stress & Fuzzing Harness）
// ============================================================================

test('【模糊对抗】Durian 在 50 次全随机边界生成组合下 100% 渲染稳定且零崩溃', () => {
  const phases: DurianPlayerView['phase'][] = [
    'turn_action',
    'choose_placement',
    'choose_flip',
    'challenge_result',
    'game_over',
  ];
  const modes: ('standard' | 'simulator')[] = ['standard', 'simulator'];
  const playerIds = ['p1', 'p2', 'p3', 'p_rogue', null];

  for (let i = 0; i < 50; i++) {
    const phase = phases[i % phases.length]!;
    const mode = modes[i % modes.length]!;
    const currentPlayerId = playerIds[i % playerIds.length];
    const isMeNull = i % 3 === 0;
    const seatRole = i % 2 === 0 ? 'player' : 'spectator';

    const view = makeDurianView({
      phase,
      mode,
      currentPlayerId: currentPlayerId ?? undefined,
      me: isMeNull
        ? null
        : {
            playerId: 'p1',
            ownForeheadHidden: true,
            drawnCard: phase === 'choose_placement'
              ? { kind: 'fruit', left: { fruit: 'apple', quantity: 1 }, right: { fruit: 'lemon', quantity: 2 } }
              : null,
            visibleForeheadCards: [],
          },
      deckCount: i % 5 === 0 ? 0 : 10,
      tablePlacements: i % 2 === 0 ? [] : [
        { kind: 'fruit', data: { placementId: 'tp-1', card: { kind: 'fruit', left: { fruit: 'banana', quantity: 1 }, right: { fruit: 'grape', quantity: 2 } }, checkHalf: 'right', placedBy: 'p2' } },
      ],
      lastChallenge: phase === 'challenge_result'
        ? {
            challengerId: 'p1',
            accusedId: 'p2',
            success: i % 2 === 0,
            loserId: 'p2',
            penaltyPoints: 2,
            tableTotals: { apple: 3, banana: 1, grape: 0, lemon: 0, strawberry: 0 },
            stockTotals: { apple: 2, banana: 2, grape: 0, lemon: 0, strawberry: 0 },
            oversoldFruits: ['apple'],
          }
        : null,
    });

    const conn = createMockConnection({
      seatRole,
      playerId: 'p1',
    });

    let html = '';
    assert.doesNotThrow(() => {
      html = renderGame(React.createElement(DurianGamePage, { view }), conn);
    }, `模糊迭代 #${i} (phase=${phase}, mode=${mode}, isMeNull=${isMeNull}, seatRole=${seatRole}) 渲染崩溃`);

    // 绝对防线：任何场景下都不应出现旧版角色切换按钮
    assert.ok(!html.includes('durian-role-switch'), `模糊迭代 #${i} 出现残留 durian-role-switch`);
    assert.ok(!html.includes('durian-role-pill'), `模糊迭代 #${i} 出现残留 durian-role-pill`);
  }
});

test('【模糊对抗】CheeseThief 在 50 次全随机边界生成组合下 100% 渲染稳定且零崩溃', () => {
  const phases: CheeseThiefPlayerView['phase'][] = [
    'hour_choice',
    'night',
    'accomplice_select',
    'dawn',
    'vote',
  ];
  const seatRoles: ('player' | 'spectator')[] = ['player', 'spectator'];

  for (let i = 0; i < 50; i++) {
    const phase = phases[i % phases.length]!;
    const seatRole = seatRoles[i % seatRoles.length]!;
    const isMeNull = i % 2 === 0;

    const view = makeCheeseThiefView({
      phase,
      currentHour: phase === 'night' ? (i % 6) + 1 : 0,
      cheeseStolen: i % 3 === 0,
      me: isMeNull
        ? null
        : {
            playerId: 'p1',
            wakeHour: (i % 6) + 1,
            hourChoices: [1, 4],
            coWakers: i % 4 === 0 ? ['p2'] : [],
            cheeseWasMissing: false,
            isThief: i % 5 === 0,
            isAccomplice: i % 7 === 0,
            knownAccomplices: [],
            roleCard: 'none',
            canPeek: i % 3 === 0,
            peekedHour: null,
            catPeekedHour: null,
            hasVoted: i % 2 === 0,
          },
    });

    const conn = createMockConnection({
      seatRole,
      playerId: 'p1',
    });

    let html = '';
    assert.doesNotThrow(() => {
      html = renderGame(React.createElement(CheeseThiefGamePage, { view }), conn);
    }, `CheeseThief 模糊迭代 #${i} (phase=${phase}, isMeNull=${isMeNull}, seatRole=${seatRole}) 渲染崩溃`);

    // 绝对防线：任何场景下都不应出现旧版角色切换按钮
    assert.ok(!html.includes('cheese-role-switch'), `CheeseThief 模糊迭代 #${i} 出现残留 cheese-role-switch`);
    assert.ok(!html.includes('ldj_cheese_device_role'), `CheeseThief 模糊迭代 #${i} 出现残留 storage key`);
  }
});
