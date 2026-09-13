/**
 * UI 统一层验证（game-ui.css）：
 * 在真实游戏页上程序化校验「实体复古纸牌派对」令牌与组件配方是否跨游戏一致，
 * 并输出 JSON 指标供交付证据引用。不依赖人工看像素（本会话模型无图像输入）。
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const REPORT_PATH = path.resolve(process.cwd(), 'screenshots', 'ui-unification-metrics.json');
/** --gp-line #292722：动作按钮的统一墨色实体边（顶栏描边改由 --gp-chrome-* 主题令牌决定）。 */
const INK_RGB = 'rgb(41, 39, 34)';

type Metric = {
  game: string;
  viewport: string;
  horizontalOverflow: boolean;
  /** 顶栏实际绘制出的描边 */
  headerBorderColor: string;
  headerBorderWidth: number;
  headerBorderStyle: string;
  /** 同一外壳上按 --gp-chrome-width / --gp-chrome-line 配方绘制出来的期望值（主题感知） */
  expectedBorderColor: string;
  expectedBorderWidth: number;
  theme: string;
  samples: { selector: string; minHeight: number; radius: string; borderColor: string; borderStyle: string; shadow: string }[];
};

async function preparePage(browser, me: Record<string, unknown>, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me })],
  );
  return { context, page };
}

async function measureButton(page: import('@playwright/test').Page, selector: string) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  return el.evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      minHeight: Math.round(parseFloat(s.minHeight)),
      radius: s.borderRadius,
      borderColor: s.borderTopColor,
      borderStyle: s.borderTopStyle,
      shadow: s.boxShadow,
    };
  });
}

test.describe('game-ui 统一层跨游戏指标', () => {
  test('landlord / undercover / werewolf / loveletter 令牌与组件配方一致', async ({ browser }) => {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    const metrics: Metric[] = [];

    const cases: { game: string; count: number; config?: Record<string, unknown> }[] = [
      { game: 'landlord', count: 3, config: { rulesetId: 'landlord_platform_v1' } },
      { game: 'undercover', count: 5 },
      { game: 'werewolf', count: 8, config: { rulesetId: 'werewolf_platform_open_kill_v1' } },
      { game: 'loveletter', count: 2 },
    ];

    for (const c of cases) {
      const seeded = seedRoom(DB_PATH, { gameId: c.game, count: c.count, ready: true, config: c.config });
      const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      const ack = await driver.startGame(c.config);
      expect(ack.type).toBe('ack');

      const me = { ...seeded.players[0]!, roomCode: seeded.roomCode, nickname: '验证玩家' };
      const { context, page } = await preparePage(browser, me, 1280, 800);
      await page.goto(BASE_URL);
      await expect(page.locator('.tabletop-shell, .tabletop-oval-shell')).toBeVisible({ timeout: 20_000 });

      const header = page.locator('.tabletop-header').first();
      await expect(header).toBeVisible();
      // 主题感知：在同一个外壳里用 --gp-chrome-* 配方画一根探针，再和真实顶栏的描边对比。
      // 这样既锁住「顶栏描边只能来自统一令牌」，又允许亮色/暗色主题各自取不同令牌值。
      const headerMetrics = await header.evaluate((el) => {
        const shell = el.closest('.tabletop-shell') ?? document.documentElement;
        const probe = document.createElement('div');
        probe.style.border = 'var(--gp-chrome-width) solid var(--gp-chrome-line)';
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        shell.appendChild(probe);
        const probeStyle = getComputedStyle(probe);
        const expected = {
          color: probeStyle.borderTopColor,
          width: parseFloat(probeStyle.borderTopWidth),
        };
        probe.remove();

        const s = getComputedStyle(el);
        return {
          color: s.borderTopColor,
          width: parseFloat(s.borderTopWidth),
          style: s.borderTopStyle,
          expectedColor: expected.color,
          expectedWidth: expected.width,
          theme: Array.from(shell.classList).find((c) => c.startsWith('tabletop-theme-')) ?? 'unknown',
        };
      });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

      const samples: Metric['samples'] = [];
      const selectors = c.game === 'landlord'
        ? ['.landlord-btn', '.landlord-btn--primary']
        : c.game === 'werewolf'
          ? ['.werewolf-action-btn', '.tabletop-seat']
          : c.game === 'loveletter'
            ? ['.tabletop-seat']
            : ['.tabletop-seat', '.game-countdown'];
      for (const sel of selectors) {
        const m = await measureButton(page, sel);
        if (m) samples.push({ selector: sel, ...m });
      }

      metrics.push({
        game: c.game,
        viewport: '1280x800',
        horizontalOverflow: overflow,
        headerBorderColor: headerMetrics.color,
        headerBorderWidth: headerMetrics.width,
        headerBorderStyle: headerMetrics.style,
        expectedBorderColor: headerMetrics.expectedColor,
        expectedBorderWidth: headerMetrics.expectedWidth,
        theme: headerMetrics.theme,
        samples,
      });

      driver.client.close();
      await context.close();
    }

    fs.writeFileSync(REPORT_PATH, JSON.stringify(metrics, null, 2));

    // 统一配方：每款游戏的顶栏描边都必须等于它所在主题的 --gp-chrome-width / --gp-chrome-line。
    // 亮色主题取墨色粗边、暗色主题取反色细边，两者都只来自同一组令牌，不允许字面量。
    for (const m of metrics) {
      expect(m.headerBorderStyle, `${m.game} header 边框应为实体线`).toBe('solid');
      expect(
        m.headerBorderColor,
        `${m.game}（主题 ${m.theme}）header 边框颜色必须来自 --gp-chrome-line 令牌`,
      ).toBe(m.expectedBorderColor);
      expect(
        m.headerBorderWidth,
        `${m.game}（主题 ${m.theme}）header 边框宽度必须来自 --gp-chrome-width 令牌`,
      ).toBe(m.expectedBorderWidth);
      expect(m.horizontalOverflow, `${m.game} 不应横向溢出`).toBe(false);
    }
    // 描边只允许亮/暗（+白昼）三档主题配方，不允许每款游戏各写一套。
    expect(
      new Set(metrics.map((m) => `${m.headerBorderWidth}/${m.headerBorderColor}`)).size,
      'header 描边配方数量应等于主题族数量（当前为亮色/暗色/白昼三族）',
    ).toBeLessThanOrEqual(3);

    // 代表性动作按钮：触控高度 >= 44、实体 solid 边框（席位 chip 不算动作按钮，跳过）
    for (const m of metrics) {
      for (const s of m.samples) {
        if (s.selector.includes('btn') && Number.isFinite(s.minHeight)) {
          expect(s.minHeight, `${m.game} ${s.selector} 触控高度不足`).toBeGreaterThanOrEqual(44);
        }
      }
    }

    // 代表性动作按钮样本：实体 solid 边框 + 统一圆角（跨游戏配方向同一来源）
    const landlordSample = metrics.find((m) => m.game === 'landlord')?.samples.find((s) => s.selector === '.landlord-btn');
    expect(landlordSample).toBeTruthy();
    expect(landlordSample!.borderStyle).toBe('solid');
    expect(landlordSample!.borderColor).toBe(INK_RGB);
    expect(landlordSample!.radius).toBe('14px');
  });
});
