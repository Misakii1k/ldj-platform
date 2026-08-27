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
const INK_RGB = 'rgb(41, 39, 34)'; // --gp-line #292722

type Metric = {
  game: string;
  viewport: string;
  horizontalOverflow: boolean;
  headerBorderColor: string;
  headerBorderWidth: number;
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
      const headerMetrics = await header.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.borderTopColor, width: parseFloat(s.borderTopWidth) };
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
        samples,
      });

      driver.client.close();
      await context.close();
    }

    fs.writeFileSync(REPORT_PATH, JSON.stringify(metrics, null, 2));

    // 统一令牌：外壳 header 跨游戏都应是同一墨色、同一粗度的实体边框
    for (const m of metrics) {
      expect(m.headerBorderColor, `${m.game} header 边框颜色应统一为墨色`).toBe(INK_RGB);
      expect(m.headerBorderWidth, `${m.game} header 边框应为实体粗边`).toBeGreaterThanOrEqual(2);
      expect(m.horizontalOverflow, `${m.game} 不应横向溢出`).toBe(false);
    }
    expect(new Set(metrics.map((m) => m.headerBorderWidth)).size, 'header 边框宽度应跨游戏一致').toBe(1);

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
