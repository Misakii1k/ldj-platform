/**
 * 「游戏内悬浮控制坞」截图验收：狼人杀真人主持 · 法官控制台视角。
 *
 * 复用 cards-trio-capture.spec.ts 的 mock WebSocket 模式
 * （routeWebSocket + seedBrowserSession + wrapGameState 信封）：
 * 不依赖真实对局推进，直接以 WerewolfModeratorView（view.isModerator=true）
 * 把法官控制台渲染到「第 1 夜 · 狼人行动」进行态。
 *
 * 机器门断言：
 * - 悬浮坞 .ldj-session-dock 可见；设置按钮（无自带菜单入口 → 常驻）可见；
 * - 点「收起顶栏」后 body.ldj-chrome-collapsed 生效、.mod-header 隐藏、坞仍可见；
 * - 再点「展开顶栏」后一切恢复。
 *
 * 截图目录：docs/superpowers/reports/2026-09-29-immersive-dock/baseline/
 * （可用环境变量 DOCK_SHOTS_OUT 覆盖）。
 * 文件名：werewolf-moderator-dock-<expanded|collapsed>-<宽x高>.png，共 4 张。
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BASE_URL, seedBrowserSession } from './helpers/serverEnv.ts';

const SHOTS_DIR = process.env.DOCK_SHOTS_OUT
  ? path.resolve(process.cwd(), process.env.DOCK_SHOTS_OUT)
  : path.resolve(process.cwd(), 'docs/superpowers/reports/2026-09-29-immersive-dock/baseline');

test.beforeAll(() => {
  if (!fs.existsSync(SHOTS_DIR)) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  }
});

/** 法官（房主，占 1 号位） */
const HOST = { playerId: 'mod1', nickname: '说书人', seat: 1 };

/** 6 名抽卡玩家（2..7 号位），昵称与狼人杀视觉截图 fixture 同风格 */
const PLAYERS = [
  { playerId: 'p2', nickname: '阿澈', seat: 2, role: 'seer' },
  { playerId: 'p3', nickname: '小鹿乱撞', seat: 3, role: 'villager' },
  { playerId: 'p4', nickname: 'Kiki', seat: 4, role: 'wolf' },
  { playerId: 'p5', nickname: '夜行的猫头鹰', seat: 5, role: 'witch' },
  { playerId: 'p6', nickname: '团子', seat: 6, role: 'hunter' },
  { playerId: 'p7', nickname: '老周', seat: 7, role: 'wolf' },
] as const;

/** 身份底牌信息（形状对齐 @ldj/shared WerewolfRoleInfo / WEREWOLF_ROLE_DEFS） */
const ROLE_INFO: Record<string, {
  role: string;
  name: string;
  camp: 'wolves' | 'village';
  campName: '狼人阵营' | '好人阵营';
  description: string;
  artUrl: string;
}> = {
  wolf: {
    role: 'wolf',
    name: '狼人',
    camp: 'wolves',
    campName: '狼人阵营',
    description: '夜间与狼同伴商讨并袭击村民，白天隐藏身份混淆视听，消灭所有神职或平民即获胜。',
    artUrl: '/assets/roles/werewolf.png',
  },
  seer: {
    role: 'seer',
    name: '预言家',
    camp: 'village',
    campName: '好人阵营',
    description: '每晚可查验一名存活玩家的真实阵营（狼人或好人），带领好人找出潜伏的狼人。',
    artUrl: '/assets/roles/seer.png',
  },
  witch: {
    role: 'witch',
    name: '女巫',
    camp: 'village',
    campName: '好人阵营',
    description: '拥有一瓶解药与一瓶毒药。解药可在夜间救治被袭击者，毒药可在夜间毒杀一人。',
    artUrl: '/assets/roles/witch.png',
  },
  hunter: {
    role: 'hunter',
    name: '猎人',
    camp: 'village',
    campName: '好人阵营',
    description: '出局时可翻开身份牌发动技能开枪带走任意一名存活玩家（被毒杀出局除外）。',
    artUrl: '/assets/roles/hunter.png',
  },
  villager: {
    role: 'villager',
    name: '普通村民',
    camp: 'village',
    campName: '好人阵营',
    description: '没有特殊技能，依靠白天认真听取发言、逻辑推理与投票保护村庄放逐狼人。',
    artUrl: '/assets/roles/villager.png',
  },
};

/**
 * 法官视角进行态 fixture：第 1 夜 · 狼人行动（手动控场）。
 * timeline 采用 manual 模式：endsAt/actionDeadlineAt/pauseRemainingMs 恒为 null，
 * 满足共享契约 werewolfTimelineSchema 的手动态约束，画面无倒计时、天然静止。
 */
function buildModeratorView() {
  return {
    rulesetId: 'werewolf_moderator_v1',
    isModerator: true,
    moderatorPlayerId: HOST.playerId,
    gameEnded: false,
    winner: null,
    players: PLAYERS.map((p) => ({
      playerId: p.playerId,
      seat: p.seat,
      isEliminated: false,
      role: p.role,
      roleInfo: ROLE_INFO[p.role],
    })),
    statistics: {
      aliveWolves: 2,
      aliveGods: 3,
      aliveVillagers: 1,
      totalAlive: 6,
      totalEliminated: 0,
      totalPlayers: 6,
    },
    suggestedOutcome: null,
    suggestedOutcomeReason: null,
    myRole: null,
    isMeEliminated: false,
    timeline: {
      version: 1,
      id: 'tl_mock_night1_s0',
      day: 1,
      period: 'night',
      role: 'wolf',
      segment: 'action',
      cue: null,
      label: '第 1 夜 · 狼人行动',
      startedAt: Date.now(),
      endsAt: null,
      actionDeadlineAt: null,
      mode: 'manual',
      paused: false,
      pauseRemainingMs: null,
    },
    announcement: null,
  };
}

/** 建立 mock WebSocket：欢迎帧 + resume_room 应答（ack + 房间快照 + 法官视角 game_state）。 */
async function setupMockModeratorGame(page: Page) {
  await seedBrowserSession(page, {
    roomId: 'room-werewolf-dock-shots',
    roomCode: 'DOCK01',
    playerId: HOST.playerId,
    resumeToken: 'test-resume-token',
    nickname: HOST.nickname,
  });

  const wrapGameState = (view: Record<string, unknown>) => ({
    v: 1,
    type: 'game_state',
    roomSeq: 2,
    serverNow: Date.now(),
    payload: {
      sessionId: 'sess_werewolf_dock_1',
      moduleId: 'werewolf',
      status: 'IN_GAME',
      role: 'player',
      rulesetId: 'werewolf_moderator_v1',
      engineContractVersion: 2,
      viewVersion: 1,
      view,
    },
  });

  await page.routeWebSocket(/.*\/ws.*/, (ws) => {
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'welcome',
        serverNow: Date.now(),
        payload: {
          protocolVersion: 1,
          connectionId: 'c_mock_dock',
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
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'room_snapshot',
              roomSeq: 1,
              serverNow: Date.now(),
              payload: {
                roomCode: 'DOCK01',
                status: 'IN_GAME',
                seq: 1,
                gameId: 'werewolf',
                config: { rulesetId: 'werewolf_moderator_v1' },
                members: [HOST, ...PLAYERS].map((m, index) => ({
                  playerId: m.playerId,
                  nickname: m.nickname,
                  seatRole: 'player',
                  seat: m.seat,
                  isHost: index === 0,
                  connectionStatus: 'CONNECTED',
                  botKind: null,
                  ready: false,
                })),
              },
            }),
          );
          ws.send(JSON.stringify(wrapGameState(buildModeratorView())));
        }
      } catch {
        // ignore
      }
    });
  });
}

test.describe('游戏内悬浮控制坞 · 法官控制台截图组', () => {
  test('坞展开/收起顶栏 两态 × 1280x800 与 390x844', async ({ page }) => {
    test.setTimeout(90_000);

    await setupMockModeratorGame(page);
    await page.goto(BASE_URL);

    // 法官控制台完整布局就绪：6 个全知席位 + 真实昵称 + 进行态时间线
    const consoleRoot = page.locator('.mod-console');
    await expect(consoleRoot).toBeVisible({ timeout: 20_000 });
    await expect(consoleRoot).toContainText('席位 1 号');
    await expect(page.locator('.mod-seat')).toHaveCount(6, { timeout: 20_000 });
    await expect(consoleRoot).toContainText('夜行的猫头鹰');
    await expect(consoleRoot).toContainText('当前环节：第 1 夜 · 狼人行动');

    const dock = page.locator('.ldj-session-dock');
    const settingsBtn = page.getByRole('button', { name: '打开设置与房间菜单' });
    const header = page.locator('.mod-header');

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const vpLabel = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // 等布局与动画静止

      // —— (a) 坞展开常态 ——
      // 机器门：坞可见；法官台无自带统一设置入口 → 设置按钮常驻可见
      await expect(dock).toBeVisible();
      await expect(dock).toHaveAttribute('data-collapsed', 'false');
      await expect(settingsBtn).toBeVisible();
      await expect(header).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, `werewolf-moderator-dock-expanded-${vpLabel}.png`),
        fullPage: false,
      });

      // —— (b) 收起顶栏 ——
      const collapseBtn = page.getByRole('button', { name: '收起顶栏' });
      await expect(collapseBtn).toHaveAttribute('aria-pressed', 'false');
      await collapseBtn.click();
      // 机器门：body 类生效、顶栏隐藏、坞仍可见
      await expect(page.locator('body')).toHaveClass(/ldj-chrome-collapsed/);
      await expect(dock).toHaveAttribute('data-collapsed', 'true');
      await expect(header).toBeHidden();
      await expect(dock).toBeVisible();
      await expect(settingsBtn).toBeVisible();
      const expandBtn = page.getByRole('button', { name: '展开顶栏' });
      await expect(expandBtn).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(400); // 等收起过渡静止
      await page.screenshot({
        path: path.join(SHOTS_DIR, `werewolf-moderator-dock-collapsed-${vpLabel}.png`),
        fullPage: false,
      });

      // —— 恢复：再点「展开顶栏」 ——
      await expandBtn.click();
      await expect(page.locator('body')).not.toHaveClass(/ldj-chrome-collapsed/);
      await expect(dock).toHaveAttribute('data-collapsed', 'false');
      await expect(header).toBeVisible();
      await expect(dock).toBeVisible();
    }
  });
});
