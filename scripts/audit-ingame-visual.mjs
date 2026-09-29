/**
 * 对局内视觉审计：对指定游戏 seed 房间 → 开局 → 以玩家身份进入对局界面，
 * 在桌面 (1280x800) 与移动 (390x844) 两种视口截图，并做 WCAG 文字对比度扫描。
 *
 * 用法：node scripts/audit-ingame-visual.mjs [gameId,...] [--out dir]
 * 前置：dev 服务器已在 127.0.0.1:8080 运行（node packages/server/src/index.ts）。
 */
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  uno: { count: 4, config: { rulesetId: 'uno_platform_house_v1' } },
};

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : 'output/ingame-audit';
const selected = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
const gameIds = selected.length > 0 ? selected : Object.keys(GAMES);

fs.mkdirSync(OUT_DIR, { recursive: true });

async function scanContrast(page) {
  return page.evaluate(() => {
    function parse(str) {
      if (!str) return null;
      const s = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (s) return { r: +s[1] * 255, g: +s[2] * 255, b: +s[3] * 255, a: s[4] !== undefined ? +s[4] : 1 };
      const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    }
    const lum = (c) => {
      const f = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    function effectiveBg(el) {
      const layers = [];
      let cur = el;
      let sawImage = false;
      while (cur && cur !== document.documentElement) {
        const st = getComputedStyle(cur);
        const bg = parse(st.backgroundColor);
        if (bg && bg.a > 0) { layers.unshift(bg); if (bg.a >= 0.98) break; }
        if (st.backgroundImage && st.backgroundImage !== 'none') {
          const grads = st.backgroundImage.match(/rgba?\([^)]+\)/g);
          if (grads) {
            // 渐变取平均色作为近似
            const cols = grads.map(parse).filter(Boolean);
            const avg = cols.reduce((acc, c) => ({ r: acc.r + c.r / cols.length, g: acc.g + c.g / cols.length, b: acc.b + c.b / cols.length, a: Math.max(acc.a, c.a) }), { r: 0, g: 0, b: 0, a: 0 });
            layers.unshift(avg);
            if (avg.a >= 0.95) break;
          } else if (st.backgroundImage.includes('url(')) { sawImage = true; }
        }
        cur = cur.parentElement;
      }
      const html = parse(getComputedStyle(document.body).backgroundColor);
      let r = 255, g = 245, b = 230;
      if (html && html.a > 0) { r = html.r; g = html.g; b = html.b; }
      for (const c of layers) { r = c.r * c.a + r * (1 - c.a); g = c.g * c.a + g * (1 - c.a); b = c.b * c.a + b * (1 - c.a); }
      return { r, g, b, image: sawImage };
    }
    const out = [];
    const seen = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('[aria-hidden="true"], .sr-only')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity < 0.1) continue;
      let text = '';
      for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent.trim() + ' ';
      text = text.trim();
      if (text.length < 2) continue;
      const fg = parse(st.color);
      if (!fg || fg.a < 0.1) continue;
      const bg = effectiveBg(el);
      const efg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
      const rt = ratio(efg, bg);
      const fs = parseFloat(st.fontSize);
      const bold = parseInt(st.fontWeight, 10) >= 700;
      const min = fs >= 24 || (fs >= 18.66 && bold) ? 3 : 4.5;
      const hasShadow = st.textShadow && st.textShadow !== 'none';
      if (rt < min || (window.__probeAll && out.length < 400)) {
        const key = `${el.className}|${text.slice(0, 20)}|${st.color}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          cls: String(el.className).slice(0, 90), text: text.slice(0, 40), fontSize: fs, bold,
          color: st.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, ratio: +rt.toFixed(2), min,
          textShadow: hasShadow, bgImage: bg.image,
        });
      }
    }
    return out;
  });
}

async function openPlayer(browser, vp, me) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(([k, v, h]) => { window.localStorage.setItem(k, v); window.sessionStorage.setItem(h, 'true'); },
    [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me }), PC_HOST_ENTERED_KEY]);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page };
}

const report = {};
const PROBE = args.includes('--probe');
const browser = await chromium.launch({ headless: true });
for (const gameId of gameIds) {
  const spec = GAMES[gameId];
  if (!spec) { console.error(`未知游戏 ${gameId}`); continue; }
  console.log(`[audit] ${gameId} ...`);
  try {
    const seeded = seedRoom(DB_PATH, { gameId, count: spec.count, ready: true, config: spec.config });
    const host = await resumeAs(seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    await host.ready();
    const pages = [];
    for (const [i, vp] of VIEWPORTS.entries()) {
      const player = seeded.players[1 + i];
      const me = { playerId: player.playerId, resumeToken: player.resumeToken, roomCode: seeded.roomCode, nickname: '审核玩家' + (i + 1) };
      pages.push({ vp, ...(await openPlayer(browser, vp, me)) });
    }
    const ack = await host.startGame(spec.config);
    if (ack.type === 'error') throw new Error('startGame 失败: ' + JSON.stringify(ack.payload));
    for (const { page } of pages) {
      await page.waitForSelector('.tabletop-shell, .game-session-root', { timeout: 15000 });
    }
    await new Promise((r) => setTimeout(r, 2500));

    report[gameId] = {};
    for (const { vp, page, ctx } of pages) {
      const shot = path.join(OUT_DIR, `${gameId}-${vp.name}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      if (PROBE) await page.evaluate(() => { window.__probeAll = true; });
      const issues = await scanContrast(page);
      const summary = await page.evaluate(() => {
        const names = new Set();
        for (const e of document.body.querySelectorAll('[class]')) {
          for (const c of String(e.className).split(/\s+/)) {
            if (/^(tabletop|game|sim|bell|cheese|echo|goose|landlord|ll-|nt-|uno|blank|uc-)/.test(c)) names.add(c);
          }
        }
        return { classes: [...names].slice(0, 80), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600) };
      });
      report[gameId][vp.name] = { screenshot: shot, issues, summary };
      console.log(`  ${vp.name}: ${issues.length} 处对比度不足`);
      await ctx.close();
    }
    host.client.close();
  } catch (e) {
    console.error(`  失败: ${e.message}`);
    report[gameId] = { error: e.message };
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT_DIR, 'contrast-report.json'), JSON.stringify(report, null, 2));
console.log(`报告写入 ${OUT_DIR}/contrast-report.json`);
