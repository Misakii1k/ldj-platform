/**
 * 对局内动效生效性与降级验证：
 * 对每个游戏在 full / reduced / off 三档下，采集关键元素的 animation-name，
 * 确认 full 档动效挂上、minimal/off 档被正确关闭。
 *
 * 用法：node scripts/verify-ingame-motion.mjs [gameId,...]
 * 前置：dev 服务器已在 127.0.0.1:8080 运行。
 */
import { chromium } from 'playwright';
import { seedRoom } from '../e2e/helpers/dbClient.ts';
import { ME_STORAGE_KEY, PC_HOST_ENTERED_KEY } from '../e2e/helpers/serverEnv.ts';
import { resumeAs } from './emulator-audit/lib.ts';

const DB_PATH = 'D:/项目/data/platform.db';
const BASE = 'http://127.0.0.1:8080/';

const GAMES = {
  'bell-clash': { count: 4, config: { rulesetId: 'bell_clash_v1' } },
  'cheese-thief': { count: 5, config: { rulesetId: 'cheese_thief_classic_v1' } },
  'echo-judge': { count: 4, config: { rulesetId: 'echo_judge_v1' } },
  'goose-relay': { count: 5, config: { rulesetId: 'goose_relay_classic_v1' } },
  landlord: { count: 3, config: { rulesetId: 'landlord_platform_v1', variant: 'standard' } },
  loveletter: { count: 4, config: { rulesetId: 'loveletter_classic16_v1' } },
  'night-testimony': { count: 4, config: { rulesetId: 'night_testimony_v1' } },
  undercover: { count: 4, config: { rulesetId: 'undercover_classic_v1' } },
};

/** 被检查的元素：选择器 → 期望 full 档挂上的动画名前缀 */
const PROBES = [
  ['.tabletop-center-content__stage', 'stage'],
  ['.card-fan-item > *', 'tgm-card-deal'],
  ['.echo-topic-card, .testimony-topic-card, .cheese-vote-candidate-card, .goose-modal-card-item, .vote-card, .uc-order-card, .loveletter-card, .landlord-opponent, .ll-opponent', 'tgm-card-deal'],
  ['.tabletop-seat--active-turn', 'tgm-actor-breathe'],
];

const gameIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(GAMES);

async function probeLevel(browser, me, level) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(([k, v, h, motionKey, motionValue]) => {
    window.localStorage.setItem(k, v);
    window.sessionStorage.setItem(h, 'true');
    window.localStorage.setItem(motionKey, motionValue);
    // 进场动画只有 420ms，轮询采样必然错过；改为全程记录 is-active 出现过几次
    window.__stageActivations = 0;
    window.__stageAnimations = new Set();
    const observer = new MutationObserver(() => {
      for (const el of document.querySelectorAll('.tabletop-center-content__stage.is-active')) {
        window.__stageActivations += 1;
        const child = el.firstElementChild;
        if (child) window.__stageAnimations.add(getComputedStyle(child).animationName);
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    });
  }, [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me }), PC_HOST_ENTERED_KEY, 'ldj_motion_preference', level]);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tabletop-shell, .game-session-root', { timeout: 15000 });
  // 舞台进场是一次性动画（420ms），必须在早期采样
  await new Promise((r) => setTimeout(r, 150));
  const early = await page.evaluate(() => {
    const el = document.querySelector('.tabletop-center-content__stage');
    const fan = [...document.querySelectorAll('.card-fan-item > *, .loveletter-card, .uc-order-card, .echo-topic-card, .cheese-vote-candidate-card')];
    return {
      stageActivations: window.__stageActivations ?? 0,
      stageAnimations: [...(window.__stageAnimations ?? [])],
      stage: el ? { active: el.classList.contains('is-active'), animation: getComputedStyle(el).animationName } : null,
      stageChild: el?.firstElementChild ? getComputedStyle(el.firstElementChild).animationName : null,
      dealCount: fan.length,
      dealAnimations: [...new Set(fan.slice(0, 8).map((n) => getComputedStyle(n).animationName))],
    };
  });
  await new Promise((r) => setTimeout(r, 1400));

  const result = await page.evaluate((probes) => {
    const out = { motionLevel: document.documentElement.dataset.motionLevel ?? null, probes: {} };
    for (const [selector, expected] of probes) {
      const nodes = [...document.querySelectorAll(selector)].filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const names = new Set();
      for (const el of nodes.slice(0, 12)) {
        const name = getComputedStyle(el).animationName;
        if (name && name !== 'none') names.add(name);
      }
      out.probes[expected] = { found: nodes.length, animations: [...names] };
    }
    return out;
  }, PROBES);

  result.early = early;
  await ctx.close();
  return result;
}

const browser = await chromium.launch({ headless: true });
const report = {};
for (const gameId of gameIds) {
  const spec = GAMES[gameId];
  if (!spec) continue;
  console.log(`[motion] ${gameId} ...`);
  try {
    const seeded = seedRoom(DB_PATH, { gameId, count: spec.count, ready: true, config: spec.config });
    const host = await resumeAs(seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    await host.ready();
    const ack = await host.startGame(spec.config);
    if (ack.type === 'error') throw new Error(JSON.stringify(ack.payload));
    const player = seeded.players[1];
    const me = { playerId: player.playerId, resumeToken: player.resumeToken, roomCode: seeded.roomCode, nickname: '动效验证' };

    report[gameId] = {};
    for (const level of ['full', 'off']) {
      report[gameId][level] = await probeLevel(browser, me, level);
      const r = report[gameId][level];
      console.log(`  ${level} 舞台进场次数=${r.early.stageActivations} 进场动画=${r.early.stageAnimations.join(',') || '无'} | 发牌元素 ${r.early.dealCount} 个 → ${r.early.dealAnimations.join(',')}`);
      const summary = Object.entries(r.probes)
        .map(([k, v]) => `${k}:${v.found}个/${v.animations.length ? v.animations.join(',') : '无动画'}`)
        .join(' | ');
      console.log(`  ${level} (data-motion-level=${r.motionLevel}) ${summary}`);
    }
    host.client.close();
  } catch (e) {
    console.error(`  失败: ${e.message}`);
    report[gameId] = { error: e.message };
  }
  await new Promise((r) => setTimeout(r, 12000));
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
