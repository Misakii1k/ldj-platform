import { test, expect, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { werewolfV2Module } from '../packages/games/werewolf/server/v2/module.ts';
import { seedActiveSession } from './support/sessionSeeder.ts';
import { BASE_URL, DB_PATH, seedBrowserSession } from './helpers/serverEnv.ts';

const shots = 'output/playwright/werewolf-result';
const sizes = [{ width: 1280, height: 800 }, { width: 750, height: 825 }, { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }];

async function checkResult(page: Page, count: number, name: string) {
  const modal = page.getByRole('dialog', { name: '终局复盘', exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.locator('.ww-result-player')).toHaveCount(count);
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    const overflow = await modal.evaluate(el => [el, ...el.querySelectorAll<HTMLElement>('*')].filter(node => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1).map(node => node.className));
    expect(overflow).toEqual([]);
    const action = await modal.getByRole('button', { name: '返回桌面', exact: true }).boundingBox();
    expect(action!.height).toBeGreaterThanOrEqual(44);
    expect(action!.y + action!.height).toBeLessThanOrEqual(viewport.height);
    // Every text style, including defeated players, must meet AA against its rendered background.
    const failures = await modal.evaluate(root => {
      const rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number);
      const luminance = (c: number[]) => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i]!, 0);
      const failures: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('.ww-result-name, .ww-result-role, .ww-result-status, .ww-result-seat, .ww-result-outcome h3, .ww-result-outcome p, .ww-result-eyebrow, .ww-result-tally, .ww-result-footer p, .ww-result-return')) {
        const fg = luminance(rgb(getComputedStyle(el).color));
        let bgEl: Element | null = el;
        while (bgEl && rgb(getComputedStyle(bgEl).backgroundColor)[3] === 0) bgEl = bgEl.parentElement;
        if (!bgEl) throw Error('No opaque background');
        const bg = luminance(rgb(getComputedStyle(bgEl).backgroundColor));
        const ratio = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
        if (ratio < 4.5) failures.push(`${el.className}: ${ratio.toFixed(2)} fg=${getComputedStyle(el).color} bg=${getComputedStyle(bgEl).backgroundColor}`);
      }
      return failures;
    });
    expect(failures).toEqual([]);
    await modal.locator('.ww-result-roster').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(modal.locator('.ww-result-player').last()).toBeInViewport();
    await modal.locator('.ww-result-roster').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${shots}/${name}-${viewport.width}x${viewport.height}.png` });
  }
  await modal.getByRole('button', { name: '返回桌面', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const trigger = page.getByRole('button', { name: '查看终局复盘', exact: true });
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: '关闭终局复盘' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('.ww-result-modal') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

for (const scenario of [
  { count: 7, winner: 'wolves', headline: '狼人阵营获胜' },
  { count: 12, winner: 'village', headline: '好人阵营获胜' },
  { count: 6, winner: null, headline: '本局已中止' },
] as const) {
  test(`result ${scenario.count} players / ${scenario.winner ?? 'aborted'}: contrast, viewport, all roles and dialog lifecycle`, async ({ browser }) => {
    mkdirSync(shots, { recursive: true });
    // Seed an explicit finished-state fixture through the actual snapshot envelope and WS resume.
    // Rules/winner calculation is not under test here.
    const seeded = seedActiveSession(DB_PATH, {
      module: { ...werewolfV2Module, createInitialState: (ctx, players, config) => {
        const state = werewolfV2Module.createInitialState(ctx, players, config);
        state.phase = 'game_over'; state.winner = scenario.winner; state.aborted = scenario.winner === null;
        state.deadlineAt = null; state.phaseToken = null; state.timelineState = null;
        for (const player of Object.values(state.players)) {
          player.alive = scenario.winner === 'wolves' ? player.role === 'wolf' : scenario.winner === 'village' ? player.role !== 'wolf' : false;
          player.exitReason = player.alive ? null : 'voted_out';
        }
        return state;
      } },
      count: scenario.count, config: { rulesetId: 'werewolf_platform_open_kill_v1', preset: 'classic', pace: 'fast' },
    });
    const db = new DatabaseSync(DB_PATH);
    db.prepare('UPDATE room_members SET nickname = ? WHERE player_id = ?').run('这是一个很长很长的玩家昵称测试', seeded.players[2]!.playerId);
    db.close();
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await seedBrowserSession(page, { playerId: seeded.hostId, resumeToken: seeded.hostResumeToken, roomCode: seeded.roomCode, nickname: '房主' });
      // 主题已收敛为唯一剧场（W01）：旧存储值也必须落到剧场两态之一。
      await page.addInitScript(() => localStorage.setItem('ldj_werewolf_theme_pair_v1', 'forest'));
      await page.goto(BASE_URL);
      // W07：终局揭晓移到中央舞台（FinaleReveal），复盘弹窗不再自动弹出——先点触发钮再进弹窗断言
      await expect(page.locator('.ww-finale__banner')).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: '查看终局复盘', exact: true }).click();
      await expect(page.locator('.ww-result-outcome h3')).toHaveText(scenario.headline);
      await checkResult(page, scenario.count, `theatre-${scenario.count}`);
      if (scenario.count === 7) {
        for (const theme of ['theatre-day', 'theatre-night']) {
          await page.getByRole('button', { name: '查看终局复盘', exact: true }).click();
          // Color-contract exercise only: actual completed games normally resolve to day.
          await page.locator('.ww-result-modal').evaluate((el, theme) => el.setAttribute('data-result-theme', theme), theme);
          await checkResult(page, scenario.count, theme);
        }
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
