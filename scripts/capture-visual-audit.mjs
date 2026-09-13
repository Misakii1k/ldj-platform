import { chromium } from 'playwright';
import { seedRoom } from '../e2e/helpers/dbClient.ts';
import { resumeAs } from './emulator-audit/lib.ts';

const CONFIG = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'relaxed',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
  freeDiscussion: true,
};

async function main() {
  const seeded = seedRoom('D:/项目/data/platform.db', {
    gameId: 'werewolf',
    count: 6,
    ready: true,
    config: CONFIG,
  });
  console.log('Seeded room:', seeded.roomCode);

  const host = await resumeAs(seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  await host.ready();
  await host.startGame(CONFIG);
  console.log('Game started by host');

  // Resume other node players (players 3, 4, 5)
  const otherDrivers = [];
  for (let i = 3; i < seeded.players.length; i++) {
    const p = seeded.players[i];
    const driver = await resumeAs(seeded.roomCode, p.playerId, p.resumeToken);
    otherDrivers.push(driver);
  }

  const browser = await chromium.launch({ headless: true });
  const desktopPlayer = seeded.players[1];
  const mobilePlayer = seeded.players[2];

  const desktopMe = {
    playerId: desktopPlayer.playerId,
    resumeToken: desktopPlayer.resumeToken,
    roomCode: seeded.roomCode,
    nickname: '桌面玩家',
    seatRole: 'player',
  };

  const mobileMe = {
    playerId: mobilePlayer.playerId,
    resumeToken: mobilePlayer.resumeToken,
    roomCode: seeded.roomCode,
    nickname: '手机玩家',
    seatRole: 'player',
  };

  const outDir = 'C:/Users/87850/.gemini/antigravity/brain/786d7f94-b943-4023-b1ef-27107647f92a/scratch';

  // 1. Desktop Context
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopPage = await desktopCtx.newPage();
  desktopPage.on('console', msg => console.log('DESKTOP LOG:', msg.text()));
  desktopPage.on('pageerror', err => console.error('DESKTOP ERR:', err));

  await desktopPage.addInitScript(([key, val]) => localStorage.setItem(key, val), [
    'ldj:session',
    JSON.stringify(desktopMe),
  ]);
  await desktopPage.goto('http://127.0.0.1:8080/');
  await desktopPage.waitForSelector('.werewolf-arena', { timeout: 15000 });
  await desktopPage.waitForTimeout(1000);
  await desktopPage.screenshot({ path: `${outDir}/audit_desktop_reveal.png` });
  console.log('Saved audit_desktop_reveal.png');

  // 2. Mobile Context
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileCtx.newPage();
  mobilePage.on('console', msg => console.log('MOBILE LOG:', msg.text()));
  mobilePage.on('pageerror', err => console.error('MOBILE ERR:', err));

  await mobilePage.addInitScript(([key, val]) => localStorage.setItem(key, val), [
    'ldj:session',
    JSON.stringify(mobileMe),
  ]);
  await mobilePage.goto('http://127.0.0.1:8080/');
  await mobilePage.waitForSelector('.werewolf-arena', { timeout: 15000 });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: `${outDir}/audit_mobile_reveal.png` });
  console.log('Saved audit_mobile_reveal.png');

  // Confirm role for all players to trigger night phase
  const desktopBtn = desktopPage.getByRole('button', { name: /我已记住/ });
  if (await desktopBtn.count() > 0) {
    await desktopBtn.click();
    console.log('Desktop confirmed role');
  }

  const mobileBtn = mobilePage.getByRole('button', { name: /我已记住/ });
  if (await mobileBtn.count() > 0) {
    await mobileBtn.click();
    console.log('Mobile confirmed role');
  }

  // Host confirms role
  await host.gameAction({ type: 'confirm_role' });
  console.log('Host confirmed role');

  // Other node players confirm role
  for (const driver of otherDrivers) {
    await driver.gameAction({ type: 'confirm_role' });
  }
  console.log('All players confirmed role');

  // Wait for night phase
  await desktopPage.waitForTimeout(4000);
  await desktopPage.screenshot({ path: `${outDir}/audit_desktop_night.png` });
  console.log('Saved audit_desktop_night.png');

  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: `${outDir}/audit_mobile_night.png` });
  console.log('Saved audit_mobile_night.png');

  await browser.close();
  host.client.close();
  for (const driver of otherDrivers) {
    driver.client.close();
  }
  console.log('Done visual capture!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
