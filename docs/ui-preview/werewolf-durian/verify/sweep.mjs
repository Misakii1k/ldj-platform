import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.SWEEP_BASE || 'http://127.0.0.1:4176';

const PAGES = [
  { file: 'index.html', label: '总入口（含 iframe）' },
  { file: 'durian.html', label: '榴莲玩家端' },
  { file: 'art-directions.html', label: '狼人杀玩家端' },
  { file: 'moderator.html', label: '狼人杀法官端' },
  { file: 'durian-table.html', label: '榴莲公共桌面' },
  { file: 'display.html', label: '朝外展示端' },
];

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '1280x800', width: 1280, height: 800 },
];

const PROBE = () => {
  const describe = (el) =>
    el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const scrollers = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') continue;
    const over = el.scrollHeight - el.clientHeight;
    if (over > 1) scrollers.push({ sel: describe(el), over });
  }
  const smallTargets = [];
  for (const el of document.querySelectorAll('button,a,select,input,[role="button"]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.width < 43.5 || r.height < 43.5) smallTargets.push({ sel: describe(el), w: Math.round(r.width), h: Math.round(r.height) });
  }
  const outOfViewport = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > innerWidth + 1 || r.left < -1) outOfViewport.push(describe(el));
  }
  return {
    hOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    scrollers,
    smallTargets: [...new Map(smallTargets.map((x) => [x.sel, x])).values()],
    outOfViewport: [...new Set(outOfViewport)],
    frames: document.querySelectorAll('iframe').length,
  };
};

const browser = await chromium.launch({ args: ['--no-proxy-server', '--disable-lcd-text'] });
console.log('chromium', browser.version());
let bad = 0;
const rows = [];

for (const vp of VIEWPORTS) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: vp.width < 900 });
    const page = await ctx.newPage();
    const issues = [];
    page.on('console', (m) => { if (m.type() === 'error') issues.push('console: ' + m.text().slice(0, 160)); });
    page.on('pageerror', (e) => issues.push('pageerror: ' + String(e).slice(0, 160)));
    page.on('requestfailed', (rq) => issues.push('requestfailed: ' + rq.url().split('/').pop()));

    await page.goto(`${BASE}/${pg.file}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const p = await page.evaluate(PROBE);

    const problems = [];
    if (p.hOverflow) problems.push('横向溢出');
    if (p.outOfViewport.length) problems.push(`出界 ${p.outOfViewport.length}: ${p.outOfViewport.slice(0, 3).join(', ')}`);
    if (p.smallTargets.length) problems.push(`<44px ${p.smallTargets.length}: ${p.smallTargets.slice(0, 3).map((s) => s.sel + ' ' + s.w + 'x' + s.h).join(', ')}`);
    if (issues.length) problems.push(`报错 ${issues.length}: ${issues.slice(0, 2).join(' | ')}`);

    const status = problems.length ? 'FAIL' : 'PASS';
    if (problems.length) bad++;
    rows.push(`${status} | ${vp.name.padEnd(9)} | ${pg.label.padEnd(18)} | iframe ${p.frames} | 滚动容器 ${p.scrollers.length ? p.scrollers.map((s) => s.sel + '+' + s.over).join(',') : '无'}` + (problems.length ? `\n        问题: ${problems.join(' ; ')}` : ''));
    await ctx.close();
  }
}

console.log(rows.join('\n'));
console.log('');
console.log(`回归扫描：${VIEWPORTS.length * PAGES.length} 个组合，失败 ${bad} 个`);
await browser.close();
process.exit(bad ? 1 : 0);
