import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function run() {
  const outDir = path.resolve('docs/ui-preview/werewolf-durian/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  const fileUrl = 'file:///' + path.resolve('docs/ui-preview/werewolf-durian/werewolf-art.html').replace(/\\/g, '/');
  console.log('Visiting:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  const styles = ['storybook', 'tarot', 'folklore', 'theatre'];
  for (const st of styles) {
    await page.click(`button[data-style-target="${st}"]`);
    await page.waitForTimeout(300);
    const frame = page.locator('#device-frame');
    await frame.screenshot({ path: path.join(outDir, `style-${st}.png`) });
    console.log(`Captured: style-${st}.png`);
  }

  // 同时也截一张全屏宽屏模式的图
  await page.click('button[data-viewport-target="free"]');
  await page.click('button[data-style-target="tarot"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'overview-wide.png') });
  console.log('Captured: overview-wide.png');

  await browser.close();

  if (errors.length > 0) {
    console.error('Console errors encountered:', errors);
    process.exit(1);
  } else {
    console.log('Verification passed: No console errors, all screenshots generated!');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
