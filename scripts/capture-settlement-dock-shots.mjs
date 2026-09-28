import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const shotsDir = path.join(rootDir, 'docs', 'plans', '2026-09-26-settlement-dock-visual', 'shots');

if (!fs.existsSync(shotsDir)) {
  fs.mkdirSync(shotsDir, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const dockHtmlPath = 'file:///' + path.join(rootDir, 'docs', 'ui-preview', 'settlement-dock', 'B-signin-board.html').replace(/\\/g, '/');
  const t1Path = 'file:///' + path.join(rootDir, 'docs', 'ui-preview', 'settlement-dock', 'T1-dock-sheet.html').replace(/\\/g, '/');
  const t2Path = 'file:///' + path.join(rootDir, 'docs', 'ui-preview', 'settlement-dock', 'T2-curtain.html').replace(/\\/g, '/');
  const t3Path = 'file:///' + path.join(rootDir, 'docs', 'ui-preview', 'settlement-dock', 'T3-theme-stripes.html').replace(/\\/g, '/');

  console.log('Navigating to B-signin-board.html...');
  await page.goto(dockHtmlPath);
  await page.waitForLoadState('networkidle');

  const dockStates = [
    {
      id: 'S1-light',
      desc: '刚结算，自己未准备（浅色）',
      patch: { skin: 'light', count: 5, phase: 'waiting', role: 'guest', more: false },
    },
    {
      id: 'S1-dark',
      desc: '刚结算，自己未准备（深色）',
      patch: { skin: 'dark', count: 5, phase: 'waiting', role: 'guest', more: false },
    },
    {
      id: 'S2',
      desc: '自己已准备，只差1人（就等豆豆了）',
      patch: { skin: 'light', count: 5, phase: 'meReady', role: 'guest', more: false },
    },
    {
      id: 'S3',
      desc: '倒计时中，数字2（房主视角）',
      patch: { skin: 'light', count: 5, phase: 'countdown', role: 'host', tick: 2, more: false },
    },
    {
      id: 'S4',
      desc: '更多菜单展开（房主视角）',
      patch: { skin: 'light', count: 5, phase: 'waiting', role: 'host', more: true },
    },
    {
      id: 'S5',
      desc: '10人签到牌（浅色）',
      patch: { skin: 'light', count: 10, phase: 'waiting', role: 'guest', more: false },
    },
    {
      id: 'S6',
      desc: '狼人杀全员就绪，非房主等房主开局（深色）',
      patch: { skin: 'dark', count: 5, phase: 'noAuto', role: 'guest', more: false },
    },
    {
      id: 'S7',
      desc: '观战者视角',
      patch: { skin: 'light', count: 5, phase: 'waiting', role: 'spectator', more: false },
    },
  ];

  for (const s of dockStates) {
    await page.evaluate((patch) => {
      Object.assign(window.DockKit.S, patch);
      window.DockKit.render();
    }, s.patch);

    await page.waitForTimeout(100);

    const frameDesktop = page.locator('.frame[data-v="d"]');
    const frameMobile = page.locator('.frame[data-v="m"]');

    const dPath = path.join(shotsDir, `${s.id}-1280x800.png`);
    const mPath = path.join(shotsDir, `${s.id}-390x844.png`);

    await frameDesktop.screenshot({ path: dPath });
    await frameMobile.screenshot({ path: mPath });
    console.log(`Captured ${s.id}: ${s.desc}`);
  }

  // S8: T1 sheet (name phase)
  console.log('Navigating to T1-dock-sheet.html...');
  await page.goto(t1Path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const scene = document.querySelector('.t-scene');
    if (scene) {
      scene.className = 't-scene skin-light is-name';
    }
  });
  await page.waitForTimeout(200);
  await page.locator('.frame[data-v="d"]').screenshot({ path: path.join(shotsDir, 'S8-t1-sheet-1280x800.png') });
  await page.locator('.frame[data-v="m"]').screenshot({ path: path.join(shotsDir, 'S8-t1-sheet-390x844.png') });
  console.log('Captured S8: T1 坞即幕布 (name阶段)');

  // S9: T2 curtain (name phase)
  console.log('Navigating to T2-curtain.html...');
  await page.goto(t2Path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const scene = document.querySelector('.t-scene');
    if (scene) {
      scene.className = 't-scene skin-light is-name';
    }
  });
  await page.waitForTimeout(200);
  await page.locator('.frame[data-v="d"]').screenshot({ path: path.join(shotsDir, 'S9-t2-curtain-1280x800.png') });
  await page.locator('.frame[data-v="m"]').screenshot({ path: path.join(shotsDir, 'S9-t2-curtain-390x844.png') });
  console.log('Captured S9: T2 合幕开幕 (name阶段)');

  // S10: T3 stripes (name phase, light)
  console.log('Navigating to T3-theme-stripes.html...');
  await page.goto(t3Path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const scene = document.querySelector('.t-scene');
    if (scene) {
      scene.className = 't-scene skin-light is-name';
    }
  });
  await page.waitForTimeout(200);
  await page.locator('.frame[data-v="d"]').screenshot({ path: path.join(shotsDir, 'S10-t3-stripes-light-1280x800.png') });
  await page.locator('.frame[data-v="m"]').screenshot({ path: path.join(shotsDir, 'S10-t3-stripes-light-390x844.png') });
  console.log('Captured S10: T3 主题色彩条 浅色 (name阶段)');

  // S11: T3 stripes (name phase, dark - werewolf)
  await page.evaluate(() => {
    const scene = document.querySelector('.t-scene');
    if (scene) {
      scene.className = 't-scene skin-dark is-name';
    }
  });
  await page.waitForTimeout(200);
  await page.locator('.frame[data-v="d"]').screenshot({ path: path.join(shotsDir, 'S11-t3-stripes-dark-1280x800.png') });
  await page.locator('.frame[data-v="m"]').screenshot({ path: path.join(shotsDir, 'S11-t3-stripes-dark-390x844.png') });
  console.log('Captured S11: T3 主题色彩条 深色狼人杀 (name阶段)');

  await browser.close();
  console.log('All screenshots captured successfully into:', shotsDir);
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
