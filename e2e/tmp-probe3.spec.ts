import { test, expect, type Page, type Browser } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

async function preparePlayerPage(browser: Browser, width: number, height: number, me: Record<string, unknown>): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me })],
  );
  return page;
}

test('probe durian audit-style (no config)', async ({ browser }) => {
  const seeded = seedRoom(DB_PATH, { gameId: 'durian', count: 2, ready: true });
  const hostDriver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const ack = await hostDriver.startGame();
  const p1 = seeded.players[0]!;
  const page = await preparePlayerPage(browser, 1280, 800, { ...p1, roomCode: seeded.roomCode, nickname: '店长' });
  await page.goto(BASE_URL);
  await expect(page.locator('.tabletop-shell')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'screenshots/tmp_durian_probe.png' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/tmp_durian_probe_late.png' });
  const r = await page.evaluate(() => ({
    wh: [window.innerWidth, window.innerHeight],
    shellClass: document.querySelector('.tabletop-shell')?.className,
    hasStrip: document.querySelector('.tabletop-seat-strip') !== null,
    stripChips: document.querySelectorAll('.tabletop-seat-strip .tabletop-seat').length,
    ringSeats: document.querySelectorAll('.tabletop-seats-ring .tabletop-seat').length,
    headerSub: document.querySelector('.tabletop-header__sub')?.textContent,
  }));
  console.log(JSON.stringify(r));
  console.log('startAck:', JSON.stringify(ack).slice(0, 120));
  hostDriver.client.close();
  await page.context().close();
});
