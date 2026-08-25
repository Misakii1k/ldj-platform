/**
 * 游戏视口合约（七档常用尺寸适配 · 验收门）。
 *
 * 范围内 12 款游戏 × 七档验收视口：
 *   320×568（小屏下限）/ 360×800（超长安卓）/ 390×844（手机竖屏首要）/
 *   412×915（超长全面屏）/ 844×390（手机横屏）/ 768×1024（平板）/ 1280×800（桌面）
 *
 * 硬性断言（每款游戏每档）：
 * - 根文档无横向溢出：documentElement.scrollWidth <= clientWidth + 1（uno-house 先例）；
 * - 未被 overflow 裁剪容器掩埋的越界元素清单为空。
 *
 * 诊断输出（写入报告 JSON + 控制台，不阻断）：
 * - <44×44px 的可见触控目标清单（SPEC §7.1：主要点击目标 ≥44×44）；
 * - 主导动作（.tabletop-action--primary / .card-fan-play-btn）首屏可见性与尺寸。
 *
 * 严格模式：VIEWPORT_STRICT_TOUCH=1 时，主要操作按钮尺寸不足 44px 即失败。
 *
 * 每款游戏在 390×844 与 1280×800 各存档一张基线截图（docs/superpowers/reports/
 * 2026-08-15-game-ui-refresh/baseline/），供质感升级前后对比。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const REPORT_DIR = path.resolve(process.cwd(), 'docs/superpowers/reports/2026-08-15-game-ui-refresh');
const SHOTS_DIR = path.join(REPORT_DIR, 'baseline');
const STRICT_TOUCH = process.env.VIEWPORT_STRICT_TOUCH === '1';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
  { name: '844x390', width: 844, height: 390 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;

interface GameCase {
  id: string;
  label: string;
  count: number;
  config: Record<string, unknown>;
  readySelector: string;
  /** 覆盖等待文本（selector 之外的兜底） */
}

const DURIAN_ORDER_DECK = ['one', 'two', 'three', 'four'].map((id) => ({
  id,
  options: [
    { fruit: 'amber_pear', quantity: 1 },
    { fruit: 'cloud_berry', quantity: 1 },
  ],
  staffEvent: 'mixed_crate',
}));

/** 长计时开局，保证测量窗口内阶段不翻转。 */
const GAME_CASES: GameCase[] = [
  {
    id: 'bell-clash',
    label: '铃铛对决',
    count: 3,
    config: { rulesetId: 'bell_clash_v1', handSize: 3, turnSeconds: 60, bellSeconds: 60 },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'durian',
    label: 'Durian 榴莲店长',
    count: 2,
    config: { rulesetId: 'durian_orchard_v1', orderDeck: DURIAN_ORDER_DECK },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'echo-judge',
    label: '伪人测试',
    count: 4,
    config: { rulesetId: 'echo_judge_v1', answerSeconds: 60, judgmentSeconds: 60 },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'goose-relay',
    label: '以鹅传鹅',
    count: 5,
    config: {
      rulesetId: 'goose_relay_classic_v1',
      relaySeconds: 60,
      discussionSeconds: 60,
      accuseSeconds: 60,
      voteSeconds: 60,
    },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'cheese-thief',
    label: '奶酪大盗',
    count: 5,
    config: {
      rulesetId: 'cheese_thief_classic_v1',
      nightHourSeconds: 60,
      discussionSeconds: 60,
      voteSeconds: 60,
    },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'loveletter',
    label: '情书',
    count: 2,
    config: { rulesetId: 'loveletter_classic16_v1' },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'night-testimony',
    label: '暗夜证词',
    count: 4,
    config: {
      rulesetId: 'night_testimony_v1',
      questionSeconds: 60,
      deductionSeconds: 60,
      voteSeconds: 60,
      questionLimit: 4,
    },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'uno',
    label: 'UNO house',
    count: 3,
    config: { rulesetId: 'uno_platform_house_v1', mode: 'individual', roundCount: 1 },
    readySelector: '.uno-house-stage, .tabletop-shell',
  },
  {
    id: 'landlord',
    label: '斗地主',
    count: 3,
    config: { rulesetId: 'landlord_platform_v1', variant: 'standard' },
    readySelector: '.tabletop-shell, .landlord-stage',
  },
  {
    id: 'undercover',
    label: '谁是卧底',
    count: 6,
    config: {},
    readySelector: '.tabletop-shell, .uc-stage, .game-phase',
  },
  {
    id: 'werewolf',
    label: '狼人杀',
    count: 8,
    config: {},
    readySelector: '.tabletop-shell, .werewolf-arena, .werewolf-wing, .seat-ring',
  },
  {
    id: 'party-sandbox',
    label: '创意工坊',
    count: 3,
    config: { rulesetId: 'party_sandbox_v1' },
    readySelector: '.tabletop-shell, .sandbox-arena',
  },
];

interface ViewportEntry {
  viewport: string;
  overflowX: number;
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
  smallTargets: string[];
  primaryActions: string[];
  seatCollisions: string[];
  bottomFit: string[];
}

interface GameReport {
  game: string;
  entries: ViewportEntry[];
}

const REPORT: GameReport[] = [];

test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
});

test.afterAll(() => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'viewport-baseline.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), strictTouch: STRICT_TOUCH, games: REPORT }, null, 2),
  );
});

/** 页面几何测量：横向溢出、越界元素（排除被裁剪/隐藏）、小触控目标、主导动作。 */
function measureGeometry() {
  const docEl = document.documentElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const describe = (el: Element): string => {
    const cls = Array.from(el.classList).slice(0, 2).join('.');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 18);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${text}"`;
  };

  const isHidden = (el: Element, cs: CSSStyleDeclaration): boolean => {
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    return el.closest('[aria-hidden="true"]') !== null;
  };

  const isClippedByAncestor = (el: Element): boolean => {
    let node = el.parentElement;
    while (node) {
      const pcs = getComputedStyle(node);
      if (pcs.overflowX === 'hidden' || pcs.overflowX === 'clip' || pcs.overflow === 'hidden' || pcs.overflow === 'clip') {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  };

  const offenders: string[] = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (isHidden(el, cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 2 || r.left < -2) {
      if (isClippedByAncestor(el)) continue;
      offenders.push(`${describe(el)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`);
      if (offenders.length >= 15) break;
    }
  }

  const smallTargets: string[] = [];
  const interactives = document.querySelectorAll('button, a[href], input, [role="button"]');
  for (const el of interactives) {
    const cs = getComputedStyle(el);
    if (isHidden(el, cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 43.5 || r.height < 43.5) {
      smallTargets.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (smallTargets.length >= 15) break;
    }
  }

  const primaryActions: string[] = [];
  const primaries = document.querySelectorAll('.tabletop-action--primary, .card-fan-play-btn');
  for (const el of primaries) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const inViewport = r.top >= 0 && r.bottom <= vh;
    primaryActions.push(
      `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)} ${inViewport ? '首屏可见' : `不在首屏(top=${Math.round(r.top)})`}`,
    );
  }

  // 座位环碰撞：中心内容/阶段通知条不得覆盖任何座位（含徽标层的几何交叠）。
  const rectsOverlap = (a: DOMRect, b: DOMRect): boolean =>
    !(a.right <= b.left + 2 || b.right <= a.left + 2 || a.bottom <= b.top + 2 || b.bottom <= a.top + 2);
  const seatCollisions: string[] = [];
  const seats = Array.from(document.querySelectorAll('.tabletop-seat'));
  for (const zoneSel of ['.tabletop-center-content', '.tabletop-phase-banner']) {
    const zone = document.querySelector(zoneSel);
    if (!zone) continue;
    const zr = zone.getBoundingClientRect();
    for (const seat of seats) {
      const sr = seat.getBoundingClientRect();
      if (sr.width === 0 || sr.height === 0) continue;
      if (rectsOverlap(zr, sr)) {
        seatCollisions.push(`${zoneSel} × 座位 "${(seat.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 12)}"`);
        if (seatCollisions.length >= 8) break;
      }
    }
  }

  // 底部栏与扇形手牌不得沉到首屏视口外（主导动作首屏可见的空间保障）。
  const bottomFit: string[] = [];
  const bottomBar = document.querySelector('.tabletop-bottom-bar');
  if (bottomBar) {
    const r = bottomBar.getBoundingClientRect();
    if (r.height > 0 && r.bottom > vh + 1) bottomFit.push(`bottom-bar 底边 ${Math.round(r.bottom)} > 视口高 ${vh}`);
  }
  const fanDeck = document.querySelector('.card-fan-deck');
  if (fanDeck) {
    const r = fanDeck.getBoundingClientRect();
    if (r.height > 0 && r.bottom > vh + 1) bottomFit.push(`card-fan-deck 底边 ${Math.round(r.bottom)} > 视口高 ${vh}`);
  }

  return {
    overflowX: docEl.scrollWidth - docEl.clientWidth,
    scrollWidth: docEl.scrollWidth,
    clientWidth: docEl.clientWidth,
    offenders,
    smallTargets,
    primaryActions,
    seatCollisions,
    bottomFit,
  };
}

async function preparePlayerPage(
  browser: Browser,
  me: Record<string, unknown>,
): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me })],
  );
  return page;
}

test.describe('G3-B 游戏视口合约（七档常用尺寸）', () => {
  for (const game of GAME_CASES) {
    test(`${game.id} ${game.label}：7 档视口无横向溢出`, async ({ browser }) => {
      test.setTimeout(120_000);

      const seeded = seedRoom(DB_PATH, { gameId: game.id, count: game.count, ready: true, config: game.config });
      const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      try {
        const readyAck = await host.ready();
        expect(readyAck.type).toBe('ack');
        const startAck = await host.startGame(game.config);
        expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

        const viewer = seeded.players[1] ?? seeded.players[0]!;
        const page = await preparePlayerPage(browser, {
          playerId: viewer.playerId,
          resumeToken: viewer.resumeToken,
          roomCode: seeded.roomCode,
          nickname: '测量员',
        });
        try {
          await page.goto(BASE_URL);
          await expect(page.locator(game.readySelector).first()).toBeVisible({ timeout: 25_000 });
          await page.waitForTimeout(600);

          const entries: ViewportEntry[] = [];
          const failures: string[] = [];
          for (const vp of VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(700);
            const m = await page.evaluate(measureGeometry);
            const entry: ViewportEntry = { viewport: vp.name, ...m };
            entries.push(entry);

            if (entry.overflowX > 1) {
              failures.push(`[${vp.name}] 横向溢出 ${entry.overflowX}px（scrollWidth=${entry.scrollWidth} clientWidth=${entry.clientWidth}）`);
            }
            if (entry.offenders.length > 0) {
              failures.push(`[${vp.name}] 越界元素：${entry.offenders.join(' | ')}`);
            }
            if (entry.seatCollisions.length > 0) {
              failures.push(`[${vp.name}] 座位环碰撞：${entry.seatCollisions.join(' | ')}`);
            }
            if (entry.bottomFit.length > 0) {
              failures.push(`[${vp.name}] 底部溢出：${entry.bottomFit.join(' | ')}`);
            }
            if (game.id === 'werewolf' && (vp.name === '390x844' || vp.name === '360x800' || vp.name === '412x915')) {
              const wingCount = await page.locator('.werewolf-wing').count();
              const ringVisible = await page.locator('.werewolf-desktop-seat-ring, .seat-ring').first().isVisible().catch(() => false);
              if (wingCount === 0 && !ringVisible) {
                failures.push(`[${vp.name}] 狼人杀席位缺失：左右翼与马蹄环均不可见`);
              }
            }
            if (STRICT_TOUCH) {
              for (const action of entry.primaryActions) {
                const sizeMatch = /(\d+)x(\d+)/.exec(action);
                if (sizeMatch && (Number(sizeMatch[1]) < 44 || Number(sizeMatch[2]) < 44)) {
                  failures.push(`[${vp.name}] 主导动作 <44px：${action}`);
                }
              }
            }

            if (vp.name === '390x844' || vp.name === '1280x800') {
              await page.screenshot({ path: path.join(SHOTS_DIR, `${game.id}-${vp.name}.png`), fullPage: false });
            }
          }
          REPORT.push({ game: `${game.id} ${game.label}`, entries });

          expect(failures, `${game.label} 七档视口几何违例：\n${failures.join('\n')}`).toEqual([]);
        } finally {
          await page.context().close();
        }
      } finally {
        host.client.close();
      }
    });
  }
});
