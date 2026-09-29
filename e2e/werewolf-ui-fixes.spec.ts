import { test, expect } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, WS_URL, seedBrowserSession } from './helpers/serverEnv.ts';
import { mkdirSync } from 'node:fs';

const shots = 'output/playwright/werewolf-fixes';
const config = { rulesetId: 'werewolf_platform_open_kill_v1', preset: 'classic', pace: 'fast', witchSelfSave: 'first_night', winCondition: 'numbers' };

test('real night: synchronized voice, isolated role entrance, single toolbar and accessible dark settings', async ({ browser }) => {
  test.setTimeout(180_000);
  mkdirSync(shots, { recursive: true });
  const seeded = seedRoom(DB_PATH, { gameId: 'werewolf', count: 6, ready: true, config });
  const drivers: RoomDriver[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const player of seeded.players) drivers.push(await RoomDriver.resume(WS_URL, seeded.roomCode, player.playerId, player.resumeToken));
    expect((await drivers[0]!.startGame(config)).type).toBe('ack');
    expect((await drivers[0]!.gameAction({ type: 'confirm_role' })).type).toBe('ack');
    drivers[0]!.client.close();
    await seedBrowserSession(page, { playerId: seeded.hostId, resumeToken: seeded.hostResumeToken, roomCode: seeded.roomCode, nickname: '房主' });
    await page.addInitScript(() => {
      const records: Array<{ src: string; offset: number; volume: number; stopped: boolean }> = [];
      const animations: string[] = [];
      document.addEventListener('animationstart', event => animations.push(event.animationName));
      Object.assign(window, { __voiceRecords: records, __roleAnimations: animations });
      window.Audio = function (src = '') {
        const record = { src, offset: 0, volume: 1, stopped: false };
        return {
          currentTime: 0, volume: 1, onended: null, onerror: null,
          play() { record.offset = this.currentTime; record.volume = this.volume; records.push(record); return Promise.resolve(); },
          pause() { record.stopped = true; },
        } as unknown as HTMLAudioElement;
      } as unknown as typeof Audio;
    });
    await page.goto(BASE_URL);
    await expect(page.locator('.werewolf-native-page')).toBeVisible();
    // A five-minute local clock error must not prevent playback or force a zero offset.
    await page.evaluate(() => { const realNow = Date.now; Date.now = () => realNow() + 300_000; });
    for (const driver of drivers.slice(1)) expect((await driver.gameAction({ type: 'confirm_role' })).type).toBe('ack');
    // W04：夜间中央由 NightWake 接管（原 .ww-role-turn-overlay 已替换；断言意图：夜间职业演出落在
    // 舞台中央、有入场动效、插画就绪、带 data-role 钩子；选择器改 .ww-wake）
    await expect(page.locator('.ww-wake[data-role="wolf"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.ww-wake[data-role="wolf"]')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __roleAnimations: string[] }).__roleAnimations.includes('ww-wake-art-in'))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __voiceRecords: Array<{src: string}> }).__voiceRecords.some(r => decodeURI(r.src).includes('确认队友')))).toBe(true);
    await expect(page.locator('.ww-round-status .chapter')).toContainText('狼人');
    const art = await page.locator('.art').boundingBox();
    const overlay = await page.locator('.ww-wake').boundingBox();
    expect(overlay!.x).toBeGreaterThanOrEqual(art!.x);
    expect(overlay!.y).toBeGreaterThanOrEqual(art!.y);
    expect(overlay!.y + overlay!.height).toBeLessThanOrEqual(art!.y + art!.height + 1);
    await expect(page.getByRole('heading', { name: '狼人杀', exact: true })).toHaveCount(1);
    await expect(page.locator('.ww-topbar')).not.toContainText('聚乐 · 狼人杀');
    const vps = [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }];
    // W01：主题切换器已删除（剧场为唯一主题），原双主题遍历改为单档，检查项不变
    for (const theme of ['双面剧场']) {
      await page.locator('#settings').click();
      for (const vp of vps) {
        await page.setViewportSize(vp);
        const dialog = page.getByRole('dialog', { name: '狼人杀对局设置' });
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
        const contrast = await dialog.locator('.ww-settings-toggle').first().evaluate(el => {
          const css = getComputedStyle(el);
          const lum = (color: string) => {
            const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
            return .2126 * r! + .7152 * g! + .0722 * b!;
          };
          const a = lum(css.color), b = lum(css.backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: `${shots}/${theme}-settings-${vp.width}x${vp.height}.png` });
      }
      await page.keyboard.press('Escape');
      await expect(page.locator('#settings')).toBeFocused();
      for (const vp of vps) {
        await page.setViewportSize(vp);
        for (const id of ['#settings', '#rules', '#werewolf-chat-btn']) {
          const box = await page.locator(id).boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator('.art')).toBeVisible();
        const artBox = await page.locator('.art').boundingBox();
        expect(artBox!.height).toBeGreaterThan(0);
        const footerBox = await page.locator('.werewolf-native-page footer').boundingBox();
        expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(vp.height + 1);
        await page.screenshot({ path: `${shots}/${theme}-stage-${vp.width}x${vp.height}.png` });
      }
    }
    // Settings take effect in the same tab and reflect the correct default 80% volume.
    await page.locator('#settings').click();
    const narration = page.getByRole('button', { name: '法官原声旁白', exact: true });
    await expect(page.getByRole('slider', { name: '法官旁白音量' })).toHaveValue('0.8');
    await narration.click();
    await expect(narration).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ldj_werewolf_narration_enabled'))).toBe('false');
    await narration.click();
    await page.keyboard.press('Escape');
    // Wait through a real server-driven night, not just role reveal screenshots.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __voiceRecords: Array<{src: string}> }).__voiceRecords.some(r => decodeURI(r.src).includes('天亮了'))), { timeout: 180_000 }).toBe(true);
    const records = await page.evaluate(() => (window as unknown as { __voiceRecords: Array<{src: string; offset: number; stopped: boolean}> }).__voiceRecords);
    expect(records.every(r => r.offset >= 0 && r.offset < 5)).toBe(true);
    expect(records.filter(r => decodeURI(r.src).includes('闭眼')).length).toBeGreaterThan(1);
    expect(records.slice(0, -1).every(r => r.stopped)).toBe(true);
    await page.locator('#settings').click();
    await page.getByRole('button', { name: /退出房间 离开牌桌/ }).click();
    await expect(page.getByRole('alertdialog', { name: '确认退出房间？' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    for (const driver of drivers) driver.client.close();
    await context.close();
  }
});
