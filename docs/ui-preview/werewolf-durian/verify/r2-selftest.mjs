import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.R2_BASE || 'http://127.0.0.1:4175';

// Re-use the exact same audit function shape as the main script (kept in sync manually)
const AUDIT = () => {
  const describe = (el) => {
    if (!el || el.nodeType !== 1) return 'null';
    const parts = [];
    let cur = el, guard = 0;
    while (cur && cur.nodeType === 1 && guard++ < 5) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(s + '#' + cur.id); break; }
      if (typeof cur.className === 'string' && cur.className.trim()) {
        const cls = cur.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (cls.length) s += '.' + cls.join('.');
      }
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const visible = (el, cs) => !(cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0);
  const insideDialog = (el) => !!(el && el.closest && el.closest('dialog'));
  const out = { outOfViewport: [], clippedText: [], smallTargets: [] };
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const key = describe(el);
    if (rect.right > window.innerWidth + 1 || rect.left < -1) {
      out.outOfViewport.push({ sel: key, left: +rect.left.toFixed(1), right: +rect.right.toFixed(1), transformed: cs.transform !== 'none', inDialog: insideDialog(el) });
    }
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (hasOwnText) {
      const clipX = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1;
      const clipY = (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1;
      const ellipsis = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
      if (clipX || clipY || ellipsis) out.clippedText.push({ sel: key, text: (el.textContent || '').trim().slice(0, 40), kind: ellipsis ? 'ellipsis' : clipX ? 'clip-x' : 'clip-y' });
    }
    if (el.matches('button,a,select,input,summary,[role="button"],[role="tab"],[role="option"]')) {
      if (cs.pointerEvents === 'none') continue;
      if (rect.width < 43.5 || rect.height < 43.5) out.smallTargets.push({ sel: key, w: +rect.width.toFixed(1), h: +rect.height.toFixed(1) });
    }
  }
  const dedupe = (arr, k) => { const m = new Map(); for (const x of arr) if (!m.has(k(x))) m.set(k(x), x); return [...m.values()]; };
  out.outOfViewport = dedupe(out.outOfViewport, (x) => x.sel);
  out.clippedText = dedupe(out.clippedText, (x) => x.sel + x.kind);
  out.smallTargets = dedupe(out.smallTargets, (x) => x.sel);
  return out;
};

const INJECT = () => {
  // 1. wide element -> must be detected as out of viewport
  const wide = document.createElement('div');
  wide.id = 'selftest-wide';
  wide.style.cssText = 'position:absolute;top:0;left:0;width:5000px;height:10px;background:red';
  document.body.appendChild(wide);
  // 2. clipped text -> must be detected
  const clip = document.createElement('div');
  clip.id = 'selftest-clip';
  clip.style.cssText = 'width:60px;overflow:hidden;white-space:nowrap;height:20px';
  clip.textContent = '这是一段一定会被裁掉的很长的测试文字内容';
  document.body.appendChild(clip);
  // 3. tiny button -> must be detected
  const btn = document.createElement('button');
  btn.id = 'selftest-btn';
  btn.style.cssText = 'width:20px;height:20px';
  btn.textContent = 'x';
  document.body.appendChild(btn);
  return true;
};

const results = [];
for (const url of ['/durian.html?scene=placement', '/art-directions.html']) {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const before = await page.evaluate(AUDIT);
  await page.evaluate(INJECT);
  await page.waitForTimeout(120);
  const after = await page.evaluate(AUDIT);

  const got = {
    wide: after.outOfViewport.some((x) => x.sel.includes('selftest-wide')),
    clip: after.clippedText.some((x) => x.sel.includes('selftest-clip')),
    btn: after.smallTargets.some((x) => x.sel.includes('selftest-btn')),
  };
  results.push({ url, beforeCounts: { oov: before.outOfViewport.length, clip: before.clippedText.length, small: before.smallTargets.length }, detected: got });
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
const allOk = results.every((r) => r.detected.wide && r.detected.clip && r.detected.btn);
console.log(allOk ? 'SELFTEST_PASS: 检测器有效' : 'SELFTEST_FAIL: 检测器不可信');
process.exit(allOk ? 0 : 1);
