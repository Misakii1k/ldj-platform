import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

async function main() {
  const portFile = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/DevToolsActivePort');
  if (!fs.existsSync(portFile)) {
    console.error('DevToolsActivePort not found');
    process.exit(1);
  }
  const lines = fs.readFileSync(portFile, 'utf8').trim().split('\n').map(l => l.trim());
  const wsUrl = 'ws://127.0.0.1:' + lines[0] + lines[1];
  console.log('Connecting to Chrome CPP at:', wsUrl);

  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 15000 });
  const context = browser.contexts()[0];
  const pages = context.pages();
  console.log('Open tabs count:', pages.length);

  for (let i = 0; i < pages.length; i++) {
    console.log(`[${i}] ${await pages[i].title()} -> ${pages[i].url()}`);
  }

  const authPage = pages.find(p => p.url().includes('oauth2/auth')) || pages[pages.length - 1];
  console.log('Target page URL:', authPage.url());

  await authPage.waitForTimeout(3000);
  await authPage.screenshot({ path: 'cf-oauth.png' });
  console.log('Saved cf-oauth.png');

  const btn = authPage.locator('button:has-text("Allow"), button:has-text("Authorize"), button[type="submit"]').first();
  if (await btn.isVisible()) {
    console.log('Found button, clicking it!');
    await btn.click();
    console.log('Clicked! Waiting for callback...');
    await authPage.waitForTimeout(4000);
  } else {
    console.log('Button not found directly.');
  }

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
