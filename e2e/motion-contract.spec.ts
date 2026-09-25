/**
 * 动效合约（Motion Contract · 验收门）。
 *
 * 覆盖三件事：
 * 1. 档位解析：用户偏好 full/reduced/off 与系统 prefers-reduced-motion 各自落到
 *    正确的 html[data-motion-level]，并且时长令牌随档位缩放；
 * 2. reduced 档位真正生效：环境循环动效（src/motion/ambientMotion.ts）必须停下，
 *    必要反馈（回合/倒计时/紧迫）仍保留；
 * 3. 系统级无障碍偏好优先：开启 OS「减少动态效果」时，任何档位下动画时长都 ≈0，
 *    不被 html[data-motion-level="minimal"] * 的 140ms 规则压过。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, PC_HOST_ENTERED_KEY } from './helpers/serverEnv.ts';
import {
  AMBIENT_MOTION_SELECTORS,
  ESSENTIAL_FEEDBACK_SELECTORS,
} from '../packages/client/src/motion/ambientMotion.ts';

const MOTION_STORAGE_KEY = 'ldj_motion_preference';

interface GameCase {
  id: string;
  label: string;
  count: number;
  config: Record<string, unknown>;
  readySelector: string;
}

/** 全部 11 款游戏：动效门控必须逐款生效，不能只抽查代表样本。 */
const GAME_CASES: GameCase[] = [
  { id: 'undercover', label: '谁是卧底', count: 6, config: {}, readySelector: '.tabletop-shell' },
  // 狼人杀 / 榴莲的新版页面自带外壳，根节点不再是 .tabletop-shell
  { id: 'werewolf', label: '狼人杀', count: 8, config: {}, readySelector: '.tabletop-shell, .werewolf-native-page' },
  { id: 'loveletter', label: '情书', count: 2, config: { rulesetId: 'loveletter_classic16_v1' }, readySelector: '.tabletop-shell' },
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
    config: { rulesetId: 'goose_relay_classic_v1', relaySeconds: 60, discussionSeconds: 60, accuseSeconds: 60, voteSeconds: 60 },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'bell-clash',
    label: 'Ding',
    count: 3,
    config: { rulesetId: 'bell_clash_v1', handSize: 3, turnSeconds: 60, bellSeconds: 60 },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'landlord',
    label: '斗地主',
    count: 3,
    config: { rulesetId: 'landlord_platform_v1', variant: 'standard' },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'uno',
    label: 'UNO house',
    count: 3,
    config: { rulesetId: 'uno_platform_house_v1', mode: 'individual', roundCount: 1 },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'night-testimony',
    label: '囚徒之夜',
    count: 4,
    config: { rulesetId: 'night_testimony_v1', questionSeconds: 60, deductionSeconds: 60, voteSeconds: 60, questionLimit: 4 },
    readySelector: '.tabletop-shell',
  },
  {
    id: 'cheese-thief',
    label: '奶酪大盗',
    count: 5,
    config: { rulesetId: 'cheese_thief_classic_v1', nightHourSeconds: 60, discussionSeconds: 60, voteSeconds: 60 },
    readySelector: '.tabletop-shell',
  },
  { id: 'durian', label: 'DURING', count: 2, config: { rulesetId: 'durian_orchard_v1' }, readySelector: '.tabletop-shell, .durian-native-page' },
];

type MotionLevel = 'full' | 'reduced' | 'minimal' | 'off';

async function openPage(
  browser: Browser,
  me: Record<string, unknown> | null,
  preference: string | null,
  reducedMotion: 'reduce' | 'no-preference',
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion,
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([meKey, motionKey, meValue, motionValue, hostKey]) => {
      if (meValue) localStorage.setItem(meKey as string, meValue as string);
      if (motionValue) localStorage.setItem(motionKey as string, motionValue as string);
      else localStorage.removeItem(motionKey as string);
      // 跳过电脑主机控制台大屏，直接进入应用本体
      sessionStorage.setItem(hostKey as string, 'true');
    },
    [ME_STORAGE_KEY, MOTION_STORAGE_KEY, me ? JSON.stringify({ seatRole: 'player', ...me }) : '', preference, PC_HOST_ENTERED_KEY],
  );
  return page;
}

/** 收集当前页面上仍在跑的环境循环动效选择器。 */
const collectRunningAmbient = (selectors: readonly string[]) => {
  const running: string[] = [];
  for (const selector of selectors) {
    const pseudoIndex = selector.indexOf('::');
    const base = pseudoIndex === -1 ? selector : selector.slice(0, pseudoIndex);
    const pseudo = pseudoIndex === -1 ? null : selector.slice(pseudoIndex);
    let nodes: Element[];
    try {
      nodes = Array.from(document.querySelectorAll(base));
    } catch {
      continue;
    }
    for (const node of nodes) {
      const style = getComputedStyle(node, pseudo);
      const name = style.animationName;
      const duration = parseFloat(style.animationDuration) || 0;
      if (name !== 'none' && duration > 0.5) {
        running.push(selector);
        break;
      }
    }
  }
  return running;
};

test.describe('动效合约 · 档位与令牌', () => {
  const cases: { name: string; preference: string | null; reducedMotion: 'reduce' | 'no-preference'; level: MotionLevel; standard: number }[] = [
    { name: 'full', preference: 'full', reducedMotion: 'no-preference', level: 'full', standard: 220 },
    { name: 'reduced', preference: 'reduced', reducedMotion: 'no-preference', level: 'reduced', standard: 160 },
    { name: 'off', preference: 'off', reducedMotion: 'no-preference', level: 'off', standard: 0 },
    { name: '系统减少动态效果', preference: null, reducedMotion: 'reduce', level: 'minimal', standard: 1 },
  ];

  for (const item of cases) {
    test(`首页：${item.name} → data-motion-level=${item.level}`, async ({ browser }) => {
      const page = await openPage(browser, null, item.preference, item.reducedMotion);
      try {
        await page.goto(BASE_URL);
        await expect(page.locator('.game-home-page')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('html')).toHaveAttribute('data-motion-level', item.level);

        const standard = await page.evaluate(() =>
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gp-dur-standard')) || 0,
        );
        expect(standard, `${item.name} 档位下 --gp-dur-standard 应缩放`).toBeLessThanOrEqual(item.standard);
      } finally {
        await page.context().close();
      }
    });
  }

  test('系统减少动态效果优先于 minimal 档的 140ms 全局规则', async ({ browser }) => {
    const page = await openPage(browser, null, null, 'reduce');
    try {
      await page.goto(BASE_URL);
      await expect(page.locator('.game-home-page')).toBeVisible({ timeout: 20_000 });

      const worst = await page.evaluate(() => {
        let max = 0;
        for (const node of Array.from(document.querySelectorAll('.home-motion-layer, .game-card, .game-home-page *'))) {
          const duration = parseFloat(getComputedStyle(node).animationDuration) || 0;
          if (duration > max) max = duration;
        }
        return max;
      });
      expect(
        worst,
        '开启系统「减少动态效果」后，任何元素的 animation-duration 都应 ≈0，不能被 140ms 覆盖',
      ).toBeLessThanOrEqual(1);
    } finally {
      await page.context().close();
    }
  });
});

test.describe('动效合约 · 游戏页门控', () => {
  for (const game of GAME_CASES) {
    test(`${game.id} ${game.label}：reduced 停装饰、保留必要反馈`, async ({ browser }) => {
      test.setTimeout(120_000);

      const seeded = seedRoom(DB_PATH, {
        gameId: game.id,
        count: game.count,
        ready: true,
        config: game.config,
      });
      const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      try {
        expect((await host.ready()).type).toBe('ack');
        expect((await host.startGame(game.config)).type).toBe('ack');

        const viewer = seeded.players[1] ?? seeded.players[0]!;
        const page = await openPage(
          browser,
          { playerId: viewer.playerId, resumeToken: viewer.resumeToken, roomCode: seeded.roomCode, nickname: '动效验收' },
          'reduced',
          'no-preference',
        );
        try {
          await page.goto(BASE_URL);
          await expect(page.locator(game.readySelector).first()).toBeVisible({ timeout: 25_000 });
          await page.waitForTimeout(800);

          // 用户偏好必须落到 reduced；运行时帧采样只允许继续降级到 minimal/off。
          await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'reduced');
          const liveLevel = await page.getAttribute('html', 'data-motion-level');
          expect(['reduced', 'minimal', 'off'], `reduced 偏好下实际档位为 ${liveLevel}`).toContain(liveLevel);

          // 真实档位下装饰循环必须停（minimal/off 由全局规则兜底）。
          const runningAmbient = await page.evaluate(collectRunningAmbient, AMBIENT_MOTION_SELECTORS as unknown as string[]);
          expect(runningAmbient, `档位 ${liveLevel} 下这些装饰循环仍在运行：${runningAmbient.join(', ')}`).toEqual([]);

          // 确定性验证 reduced 门控本身（不受运行时采样降级影响）：临时把档位钉到 reduced 后复测。
          const reducedGate = await page.evaluate(
            ({ selectors, rootSelector }: { selectors: string[]; rootSelector: string }) => {
              const root = document.documentElement;
              const previous = root.dataset.motionLevel;
              root.dataset.motionLevel = 'reduced';
              const offenders: string[] = [];
              for (const selector of selectors) {
                const pseudoIndex = selector.indexOf('::');
                const base = pseudoIndex === -1 ? selector : selector.slice(0, pseudoIndex);
                const pseudo = pseudoIndex === -1 ? null : selector.slice(pseudoIndex);
                for (const node of Array.from(document.querySelectorAll(base))) {
                  const style = getComputedStyle(node, pseudo);
                  if (style.animationName !== 'none' && (parseFloat(style.animationDuration) || 0) > 0.5) {
                    offenders.push(selector);
                    break;
                  }
                }
              }
              // 在游戏真正的根节点上测：自带外壳的页面（狼人杀/榴莲）根节点不是 .tabletop-shell
              const shell = document.querySelector(rootSelector);
              const phaseDuration = shell
                ? parseFloat(getComputedStyle(shell).getPropertyValue('--game-motion-phase-duration')) || 0
                : 0;
              root.dataset.motionLevel = previous ?? 'reduced';
              return { offenders, phaseDuration };
            },
            { selectors: AMBIENT_MOTION_SELECTORS as unknown as string[], rootSelector: game.readySelector },
          );
          expect(
            reducedGate.offenders,
            `reduced 档位下这些装饰循环仍在运行：${reducedGate.offenders.join(', ')}`,
          ).toEqual([]);
          expect(reducedGate.phaseDuration, 'reduced 档位必须保留正的阶段过渡时长（必要反馈不被关闭）').toBeGreaterThan(0);
        } finally {
          await page.context().close();
        }
      } finally {
        host.client.close();
      }
    });

    test(`${game.id} ${game.label}：off 档位全部动效关闭`, async ({ browser }) => {
      test.setTimeout(120_000);

      const seeded = seedRoom(DB_PATH, {
        gameId: game.id,
        count: game.count,
        ready: true,
        config: game.config,
      });
      const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      try {
        expect((await host.ready()).type).toBe('ack');
        expect((await host.startGame(game.config)).type).toBe('ack');

        const viewer = seeded.players[1] ?? seeded.players[0]!;
        const page = await openPage(
          browser,
          { playerId: viewer.playerId, resumeToken: viewer.resumeToken, roomCode: seeded.roomCode, nickname: '动效验收' },
          'off',
          'no-preference',
        );
        try {
          await page.goto(BASE_URL);
          await expect(page.locator(game.readySelector).first()).toBeVisible({ timeout: 25_000 });
          await page.waitForTimeout(600);
          await expect(page.locator('html')).toHaveAttribute('data-motion-level', 'off');

          const stillRunning = await page.evaluate(
            (selectors: string[]) => {
              const offenders: string[] = [];
              for (const selector of selectors) {
                for (const node of Array.from(document.querySelectorAll(selector))) {
                  const style = getComputedStyle(node);
                  if (style.animationName !== 'none' && (parseFloat(style.animationDuration) || 0) > 0.5) {
                    offenders.push(selector);
                    break;
                  }
                }
              }
              return offenders;
            },
            [...(AMBIENT_MOTION_SELECTORS as unknown as string[]), ...(ESSENTIAL_FEEDBACK_SELECTORS as unknown as string[])],
          );
          expect(stillRunning, `off 档位下仍有动效在跑：${stillRunning.join(', ')}`).toEqual([]);
        } finally {
          await page.context().close();
        }
      } finally {
        host.client.close();
      }
    });
  }
});
