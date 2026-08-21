
import { chromium } from "playwright";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  let clientCss = readFileSync(resolve("packages/client/src/styles.css"), "utf-8");
  
  // Replace relative URLs with absolute file URLs so Playwright can load them from disk
  const assetsDir = "file:///" + resolve("packages/client/public/assets/backgrounds").replace(/\\/g, "/");
  clientCss = clientCss.replace(/\/assets\/backgrounds/g, assetsDir);

  const page = await browser.newPage();
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>${clientCss}</style>
  <style>
    body { margin: 0; background: #000; }
  </style>
</head>
<body>
  <div class="tabletop-shell tabletop-theme-poker tabletop-shell--portrait" data-game-id="uno" style="height: 100vh;">
    <header class="tabletop-header">
      <div class="tabletop-header__info">
        <h1>UNO</h1>
      </div>
    </header>
    <div style="flex:1; display:flex; align-items:center; justify-content:center; color: #333; font-size: 24px;">
      Center Arena
    </div>
  </div>
</body>
</html>
  `;
  
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(html);
  // Wait for background image to load
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve("C:/Users/87850/.gemini/antigravity/brain/62d2856a-d39c-47c4-ba46-493928fc7228/preview_uno_portrait.png") });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const shell = document.querySelector(".tabletop-shell");
    shell.classList.remove("tabletop-shell--portrait");
    shell.classList.add("tabletop-shell--landscape");
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve("C:/Users/87850/.gemini/antigravity/brain/62d2856a-d39c-47c4-ba46-493928fc7228/preview_uno_landscape.png") });

  await browser.close();
}

capture().catch(console.error);

