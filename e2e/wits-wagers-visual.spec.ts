import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BASE_URL, seedBrowserSession } from './helpers/serverEnv.ts';
import {
  mockV1AnsweringPayload,
  mockV2BettingPayload,
  mockV3SettlementPayload,
} from './fixtures/wits-wagers.ts';

const OUTPUT_DIR = path.resolve(process.cwd(), 'output/wits-wagers-acceptance/T07');

test.beforeAll(() => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
});

test.describe('一智千金 T07 固定样例界面与视觉快照', () => {
  test('V1作答、V2下注与V3结算状态渲染及无横向溢出', async ({ page }) => {
    await seedBrowserSession(page, {
      roomId: 'room-ww-visual',
      roomCode: 'WITS01',
      playerId: 'p1',
      resumeToken: 'test-resume-token',
      nickname: '估数达人',
    });

    let activeWs: { send(data: string): void } | null = null;
    await page.routeWebSocket(/.*\/ws.*/, (ws) => {
      activeWs = ws;

      // 建立连接时立即发送 welcome envelope
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'welcome',
          serverNow: Date.now(),
          payload: {
            protocolVersion: 1,
            connectionId: 'c_mock_01',
            serverVersion: '0.4.0',
            llmAvailable: false,
          },
        }),
      );

      ws.onMessage((msg) => {
        const text = typeof msg === 'string' ? msg : msg.toString();
        try {
          const parsed = JSON.parse(text);
          if (parsed.type === 'resume_room') {
            // 回复 ACK
            ws.send(
              JSON.stringify({
                v: 1,
                type: 'ack',
                requestId: parsed.requestId,
                roomSeq: 1,
                serverNow: Date.now(),
                payload: { ok: true },
              }),
            );

            // 推送 room_snapshot (已在 IN_GAME 状态)
            ws.send(
              JSON.stringify({
                v: 1,
                type: 'room_snapshot',
                roomSeq: 1,
                serverNow: Date.now(),
                payload: {
                  roomCode: 'WITS01',
                  status: 'IN_GAME',
                  seq: 1,
                  gameId: 'wits-wagers',
                  config: { gameConfig: {} },
                  members: [
                    { playerId: 'p1', nickname: '估数达人', seat: 1, connectionStatus: 'CONNECTED', ready: true },
                    { playerId: 'p2', nickname: '下注大师', seat: 2, connectionStatus: 'CONNECTED', ready: true },
                    { playerId: 'p3', nickname: '路人甲', seat: 3, connectionStatus: 'CONNECTED', ready: true },
                  ],
                },
              }),
            );

            // 初始推送 V1 作答阶段
            ws.send(
              JSON.stringify({
                v: 1,
                type: 'game_state',
                roomSeq: 1,
                serverNow: Date.now(),
                payload: mockV1AnsweringPayload,
              }),
            );
          }
        } catch {
          // ignore
        }
      });
    });

    // 1. 测试桌面端 1280x800
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    // 验证进入一智千金游戏界面
    await expect(page.locator('.ww-game')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ww-question-card__prompt')).toContainText('长江的总长度');
    await expect(page.locator('.ww-btn--primary')).toBeVisible();

    // 验证根文档无横向溢出 (SPEC: documentElement.scrollWidth <= clientWidth + 1)
    const isOverflowingDesktop = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(isOverflowingDesktop).toBe(false);

    // 保存 V1 桌面截图
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'v1-answering-desktop.png') });

    // 2. 推送 V2 下注阶段
    if (activeWs) {
      activeWs.send(
        JSON.stringify({
          v: 1,
          type: 'game_state',
          roomSeq: 2,
          serverNow: Date.now(),
          payload: mockV2BettingPayload,
        }),
      );
    }
    await expect(page.locator('.ww-bet-editor')).toBeVisible();
    await expect(page.locator('.ww-target-card')).toHaveCount(5); // lower + 3 values + higher
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'v2-betting-desktop.png') });

    // 3. 推送 V3 结算阶段
    if (activeWs) {
      activeWs.send(
        JSON.stringify({
          v: 1,
          type: 'game_state',
          roomSeq: 3,
          serverNow: Date.now(),
          payload: mockV3SettlementPayload,
        }),
      );
    }
    await expect(page.locator('.ww-result-panel')).toBeVisible();
    await expect(page.locator('.ww-result-panel__correct-box')).toContainText('6,300');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'v3-settlement-desktop.png') });

    // 4. 测试移动端 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    const isOverflowingMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(isOverflowingMobile).toBe(false);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'v3-settlement-mobile.png') });
  });
});
