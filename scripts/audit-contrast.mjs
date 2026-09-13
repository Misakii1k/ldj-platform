import { chromium } from 'playwright';

async function auditPage(page, pageName) {
  console.log(`\n=== Auditing ${pageName} ===`);
  const violations = await page.evaluate(() => {
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
          if (bg.a === 1) break;
        }
        cur = cur.parentElement;
      }
      // Blend colors from bottom up
      let curR = 255, curG = 255, curB = 255;
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
      if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) continue;
      // Must be visible
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;

      // Find direct text or button / input content
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
      if (!text) continue;

      const fg = parseRgba(style.color);
      if (!fg || fg.a < 0.1) continue;
      const bg = getEffectiveBg(el);

      // Effective fg blended over bg if fg has alpha
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
            text: text.slice(0, 40),
            fontSize: `${fontSize}px`,
            isBold,
            color: style.color,
            bg: `rgb(${bg.r},${bg.g},${bg.b})`,
            ratio: ratio.toFixed(2),
            required: minRatio,
          });
        }
      }
    }
    return results;
  });

  return violations;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  const homeViolations = await auditPage(page, '首页 (Home Desktop)');
  console.log(JSON.stringify(homeViolations, null, 2));

  // Open Create Room modal
  const createBtn = await page.$('button:has-text("创建房间")');
  if (createBtn) {
    await createBtn.click();
    await page.waitForTimeout(500);
    const createModalViolations = await auditPage(page, '创建房间弹窗 (Create Room Sheet)');
    console.log(JSON.stringify(createModalViolations, null, 2));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Open Settings modal
  const settingsBtn = await page.$('button[title*="设置"], button[aria-label*="设置"], button:has-text("设置")');
  if (settingsBtn) {
    await settingsBtn.click();
    await page.waitForTimeout(500);
    const settingsModalViolations = await auditPage(page, '设置弹窗 (Settings Sheet)');
    console.log(JSON.stringify(settingsModalViolations, null, 2));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  await browser.close();
}

run().catch(console.error);
