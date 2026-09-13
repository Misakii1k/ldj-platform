import { chromium } from 'playwright';
import { seedRoom } from '../e2e/helpers/dbClient.ts';
import { resumeAs } from './emulator-audit/lib.ts';

const DB_PATH = 'D:/项目/data/platform.db';

const GAMES = [
  { gameId: 'cheese-thief', count: 5, config: { rulesetId: 'cheese_thief_classic_v1' } },
  { gameId: 'loveletter', count: 4, config: { rulesetId: 'loveletter_classic16_v1' } },
  { gameId: 'echo-judge', count: 4, config: { rulesetId: 'echo_judge_v1' } },
  { gameId: 'bell-clash', count: 4, config: { rulesetId: 'bell_clash_v1' } },
  { gameId: 'goose-relay', count: 4, config: { rulesetId: 'goose_relay_classic_v1' } },
  { gameId: 'night-testimony', count: 4, config: { rulesetId: 'night_testimony_v1' } },
];

async function evaluatePageContrast(page, sceneName) {
  const issues = await page.evaluate(() => {
    function parseRgba(str) {
      if (!str) return null;
      const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
        a: match[4] !== undefined ? parseFloat(match[4]) : 1,
      };
    }

    function channelLuminance(val) {
      const s = val / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }

    function getLuminance(rgb) {
      return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
    }

    function getContrast(rgb1, rgb2) {
      const l1 = getLuminance(rgb1);
      const l2 = getLuminance(rgb2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function getEffectiveBg(el) {
      let cur = el;
      const colors = [];
      while (cur && cur !== document.documentElement) {
        const style = window.getComputedStyle(cur);
        const bg = parseRgba(style.backgroundColor);
        if (bg && bg.a > 0) {
          colors.unshift(bg);
          if (bg.a >= 0.98) break;
        } else if (style.backgroundImage && style.backgroundImage.includes('gradient')) {
          const match = style.backgroundImage.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/);
          if (match) {
            const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
            colors.unshift({
              r: parseInt(match[1], 10),
              g: parseInt(match[2], 10),
              b: parseInt(match[3], 10),
              a: alpha,
            });
            if (alpha >= 0.95) break;
          }
        }
        cur = cur.parentElement;
      }
      let curR = 255, curG = 245, curB = 230;
      for (const col of colors) {
        curR = col.r * col.a + curR * (1 - col.a);
        curG = col.g * col.a + curG * (1 - col.a);
        curB = col.b * col.a + curB * (1 - col.a);
      }
      return { r: Math.round(curR), g: Math.round(curG), b: Math.round(curB) };
    }

    const elements = Array.from(document.querySelectorAll('*'));
    const results = [];
    const seen = new Set();

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;

      let text = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent?.trim();
          if (t) text += t + ' ';
        }
      }
      text = text.trim();
      if (!text && el.tagName !== 'BUTTON' && el.tagName !== 'INPUT') continue;
      if (!text && el.tagName === 'INPUT') text = el.getAttribute('placeholder') || el.value || '';
      if (!text || text.length < 2) continue;

      const fg = parseRgba(style.color);
      if (!fg || fg.a < 0.1) continue;
      const bg = getEffectiveBg(el);

      const effectiveFg = {
        r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
        g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
        b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
      };

      const ratio = getContrast(effectiveFg, bg);
      const fontSize = parseFloat(style.fontSize);
      const isBold = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === 'bold';
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && isBold);
      const minRatio = isLarge ? 3.0 : 4.5;

      if (ratio < minRatio) {
        const key = `${el.tagName}:${text.slice(0, 30)}:${style.color}:${ratio.toFixed(2)}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            tag: el.tagName.toLowerCase(),
            className: el.className?.toString().slice(0, 80) || '',
            text: text.slice(0, 50),
            fontSize: `${fontSize}px`,
            isBold,
            color: style.color,
            bg: `rgb(${bg.r},${bg.g},${bg.b})`,
            ratio: parseFloat(ratio.toFixed(2)),
            required: minRatio,
          });
        }
      }
    }
    return results;
  });

  return { sceneName, issues };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const item of GAMES) {
    try {
      console.log(`[audit] Starting ${item.gameId}...`);
      const seeded = seedRoom(DB_PATH, {
        gameId: item.gameId,
        count: item.count,
        ready: true,
        config: item.config,
      });

      const host = await resumeAs(seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      await host.ready();

      const player = seeded.players[1];
      const me = {
        playerId: player.playerId,
        resumeToken: player.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '审核玩家',
        seatRole: 'player',
      };

      const gamePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await gamePage.addInitScript(([key, val]) => {
        localStorage.setItem(key, val);
      }, ['ldj:session', JSON.stringify(me)]);

      await gamePage.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
      await gamePage.waitForTimeout(600);

      // Start game
      await host.startGame(item.config).catch((e) => console.log(`startGame note: ${e.message}`));
      await gamePage.waitForSelector('.game-session-root, .game-view, .tabletop-shell', { timeout: 8000 }).catch(() => null);
      await gamePage.waitForTimeout(1000);

      const gameRes = await evaluatePageContrast(gamePage, `游戏桌面: ${item.gameId} (Mobile)`);
      allResults.push(gameRes);
      console.log(`[audit] ${item.gameId}: ${gameRes.issues.length} issues found`);

      await gamePage.close();
      host.client.close();

      // Wait 3 seconds to stay well within rate limits
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      console.error(`Failed auditing ${item.gameId}:`, e.message);
    }
  }

  await browser.close();
  console.log(JSON.stringify(allResults, null, 2));
}

main().catch(console.error);
