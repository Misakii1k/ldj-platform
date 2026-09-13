import { chromium } from 'playwright';
import { seedRoom } from '../e2e/helpers/dbClient.ts';
import { resumeAs } from './emulator-audit/lib.ts';

const DB_PATH = 'D:/项目/data/platform.db';

const GAMES_TO_TEST = [
  { gameId: 'undercover', count: 4, config: { rulesetId: 'undercover_classic_v1' } },
  { gameId: 'werewolf', count: 6, config: { rulesetId: 'werewolf_platform_open_kill_v1', preset: 'classic' } },
  { gameId: 'landlord', count: 3, config: { rulesetId: 'landlord_platform_v1' } },
  { gameId: 'cheese-thief', count: 5, config: { rulesetId: 'cheese_thief_classic_v1' } },
  { gameId: 'durian', count: 4, config: { rulesetId: 'durian_orchard_v1' } },
  { gameId: 'loveletter', count: 4, config: { rulesetId: 'loveletter_classic16_v1' } },
  { gameId: 'echo-judge', count: 4, config: { rulesetId: 'echo_judge_v1' } },
  { gameId: 'bell-clash', count: 4, config: { rulesetId: 'bell_clash_v1' } },
  { gameId: 'goose-relay', count: 5, config: { rulesetId: 'goose_relay_classic_v1' } },
  { gameId: 'night-testimony', count: 4, config: { rulesetId: 'night_testimony_v1' } },
];

async function evaluatePageContrast(page, sceneName, scopeSelector = null) {
  const issues = await page.evaluate((scope) => {
    function parseRgba(str) {
      if (!str) return null;
      if (str.startsWith('color(srgb')) {
        const srgbMatch = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
        if (srgbMatch) {
          return {
            r: Math.round(parseFloat(srgbMatch[1]) * 255),
            g: Math.round(parseFloat(srgbMatch[2]) * 255),
            b: Math.round(parseFloat(srgbMatch[3]) * 255),
            a: srgbMatch[4] !== undefined ? parseFloat(srgbMatch[4]) : 1,
          };
        }
      }
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

    const root = scope ? document.querySelector(scope) : document.body;
    const elements = Array.from(root ? root.querySelectorAll('*') : []);
    const results = [];
    const seen = new Set();

    for (const el of elements) {
      if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) continue;
      if (el.classList?.contains('sr-only') || el.closest?.('.sr-only')) continue;
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
      if (!text || text.length < 2) continue; // Skip single symbols

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
  }, scopeSelector);

  return { sceneName, issues };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  // 1. Home Desktop
  const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktopPage.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  allResults.push(await evaluatePageContrast(desktopPage, '首页 (Desktop)'));

  // 2. Home Mobile
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  allResults.push(await evaluatePageContrast(mobilePage, '首页 (Mobile)'));

  // 3. Create Room Sheet
  try {
    const firstGameAction = await desktopPage.$('.game-card__action');
    if (firstGameAction) {
      await firstGameAction.click();
      await desktopPage.waitForSelector('.room-sheet', { timeout: 3000 }).catch(() => null);
      await desktopPage.waitForTimeout(400);
      const res = await evaluatePageContrast(desktopPage, '创建房间面板 (Create Room Sheet)', '.room-sheet');
      allResults.push(res);
      console.log(`[audit] 创建房间面板: ${res.issues.length} issues`);
      await desktopPage.keyboard.press('Escape');
      await desktopPage.waitForTimeout(400);
    }
  } catch (e) {
    console.error('Failed auditing Create Room Sheet:', e.message);
  }

  // 4. Settings Modal
  try {
    const settingsBtn = await desktopPage.$('button[title*="设置"], button[aria-label*="设置"], button:has-text("设置")');
    if (settingsBtn) {
      await settingsBtn.click();
      await desktopPage.waitForSelector('.room-sheet', { timeout: 3000 }).catch(() => null);
      await desktopPage.waitForTimeout(400);
      const res = await evaluatePageContrast(desktopPage, '系统设置弹窗 (Settings)', '.room-sheet');
      allResults.push(res);
      console.log(`[audit] 系统设置弹窗: ${res.issues.length} issues`);
      await desktopPage.keyboard.press('Escape');
      await desktopPage.waitForTimeout(400);
    }
  } catch (e) {
    console.error('Failed auditing Settings:', e.message);
  }

  await desktopPage.close();
  await mobilePage.close();

  // 5. Test Game Tabletop Scenes & Waiting Room
  for (const item of GAMES_TO_TEST) {
    try {
      console.log(`[audit] Seeding ${item.gameId}...`);
      const seeded = seedRoom(DB_PATH, {
        gameId: item.gameId,
        count: item.count,
        ready: true,
        config: item.config,
      });

      const host = await resumeAs(seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      await host.ready();

      // First audit waiting room
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
      await gamePage.waitForSelector('.room-page, .room-screen, .game-view, .game-session-root, .tabletop-shell', { timeout: 10000 });
      await gamePage.waitForTimeout(500);
      const waitRes = await evaluatePageContrast(gamePage, `等待房间: ${item.gameId} (Mobile)`);
      allResults.push(waitRes);
      console.log(`[audit] 等待房间: ${item.gameId}: ${waitRes.issues.length} issues`);

      // Now start game and audit in-game tabletop
      await host.startGame(item.config);
      await gamePage.waitForSelector('.tabletop-shell, .game-session-root, .game-view', { timeout: 10000 });
      await gamePage.waitForTimeout(1200);
      const gameRes = await evaluatePageContrast(gamePage, `游戏对局桌面: ${item.gameId} (Mobile)`);
      allResults.push(gameRes);
      console.log(`[audit] 游戏对局桌面: ${item.gameId}: ${gameRes.issues.length} issues`);

      await gamePage.close();
      host.client.close();
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Failed auditing ${item.gameId}:`, e.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  await browser.close();
  console.log(JSON.stringify(allResults, null, 2));
}

main().catch(console.error);
