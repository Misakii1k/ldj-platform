import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.B3_BASE || 'http://127.0.0.1:4176';
const ROOT = process.env.B3_ROOT || 'D:/项目';
const OUT = path.resolve(ROOT, 'docs/ui-preview/werewolf-durian/screenshots/verified-20260918-b2');
const RESULTS = process.env.B3_RESULTS || path.join(process.env.TEMP || '.', 'b2-results.json');

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];

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
  const out = {
    viewport: { w: innerWidth, h: innerHeight },
    doc: { scrollWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 },
    outOfViewport: [], clippedText: [], smallTargets: [],
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const key = describe(el);
    if (r.right > innerWidth + 1 || r.left < -1) {
      const k = 'oov:' + key + r.top.toFixed(0);
      if (!seen.has(k)) { seen.add(k); out.outOfViewport.push({ sel: key, left: +r.left.toFixed(1), right: +r.right.toFixed(1), transformed: cs.transform !== 'none' }); }
    }
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (hasOwnText) {
      const clipX = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1;
      const clipY = (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1;
      const ellipsis = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
      if (clipX || clipY || ellipsis) out.clippedText.push({ sel: key, text: (el.textContent || '').trim().slice(0, 30), kind: ellipsis ? 'ellipsis' : clipX ? 'clip-x' : 'clip-y' });
    }
    if (el.matches('button,a,select,input,[role="button"]')) {
      if (cs.pointerEvents === 'none') continue;
      if (r.width < 43.5 || r.height < 43.5) out.smallTargets.push({ sel: key, w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (el.textContent || '').trim().slice(0, 20) });
    }
  }
  const dd = (a, k) => { const m = new Map(); for (const x of a) if (!m.has(k(x))) m.set(k(x), x); return [...m.values()]; };
  out.outOfViewport = dd(out.outOfViewport, (x) => x.sel).slice(0, 20);
  out.clippedText = dd(out.clippedText, (x) => x.sel + x.kind).slice(0, 20);
  out.smallTargets = dd(out.smallTargets, (x) => x.sel).slice(0, 25);
  return out;
};

const FIT = () => {
  const de = document.documentElement;
  const need = Math.max(de.scrollHeight, document.body.scrollHeight);
  const scrollers = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      scrollers.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(/\s+/)[0] : ''));
    }
  }
  return { viewportH: innerHeight, contentH: need, overflowPx: Math.max(0, need - innerHeight), scrollers };
};

const report = { base: BASE, chromium: null, cells: {}, flows: {}, consoleIssues: [], startedAt: new Date().toISOString() };
const log = (...a) => console.log('[b2]', ...a);

async function shoot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }

const PAGES = [
  { key: 'moderator', file: 'moderator.html', label: '狼人杀法官端' },
  { key: 'durianTable', file: 'durian-table.html', label: '榴莲公共桌面' },
  { key: 'display', file: 'display.html', label: '朝外展示端' },
];

const browser = await chromium.launch({ args: ['--no-proxy-server', '--disable-lcd-text'] });
report.chromium = browser.version();
log('chromium', report.chromium);

for (const vp of VIEWPORTS) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: vp.width < 900 });
    const page = await ctx.newPage();
    const issues = [];
    page.on('console', (m) => { if (m.type() === 'error') issues.push({ kind: 'console.error', text: m.text().slice(0, 200) }); });
    page.on('pageerror', (e) => issues.push({ kind: 'pageerror', text: String(e).slice(0, 200) }));

    await page.goto(`${BASE}/${pg.file}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const audit = await page.evaluate(AUDIT);
    const fit = await page.evaluate(FIT);
    report.cells[`${vp.name}|${pg.key}`] = { label: pg.label, audit, fit, issues };
    if (audit.doc.horizontalOverflow || audit.outOfViewport.length || audit.clippedText.length || audit.smallTargets.length || issues.length) {
      log('ISSUE', vp.name, pg.key, JSON.stringify({ hOv: audit.doc.horizontalOverflow, oov: audit.outOfViewport.length, clip: audit.clippedText.length, small: audit.smallTargets.length, err: issues.length }));
    }
    await shoot(page, `${pg.key}-${vp.name}`);
    await ctx.close();
  }
}

/* ---------- 交互流程 ---------- */
const flow = [];
const add = (step, ok, detail) => { flow.push({ step, ok: !!ok, detail: detail === undefined ? null : detail }); if (!ok) log('FLOW FAIL:', step, detail ? JSON.stringify(detail) : ''); };

// 法官端：出局二次确认 + 撤销 + 亮牌 + 弹层焦点
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const issues = [];
  page.on('console', (m) => { if (m.type() === 'error') issues.push(m.text()); });
  page.on('pageerror', (e) => issues.push(String(e)));
  await page.goto(`${BASE}/moderator.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const alive = () => page.evaluate(() => document.getElementById('mod-alive').textContent);
  const seatOut = (n) => page.evaluate((s) => document.querySelector(`.mod-seat[data-seat="${s}"]`).classList.contains('is-out'), n);

  add('法官端 · 初始 12 席位', (await page.evaluate(() => document.querySelectorAll('.mod-seat').length)) === 12);
  add('法官端 · 初始存活 10（3、9 已出局）', (await alive()) === '10', { alive: await alive() });
  add('法官端 · 席位显示真实身份', (await page.evaluate(() => document.querySelector('.mod-seat[data-seat="1"] .mod-seat__role').textContent)) === '狼人');

  await page.click('.mod-seat[data-seat="5"] .mod-seat__btn');
  await page.waitForTimeout(300);
  add('法官端 · 标记出局弹出二次确认', await page.evaluate(() => !!document.getElementById('mod-confirm').open));
  add('法官端 · 确认弹窗打开时焦点在弹层内', await page.evaluate(() => { const d = document.getElementById('mod-confirm'); return !!(d.open && document.activeElement && d.contains(document.activeElement)); }));
  await page.click('#mod-confirm-cancel');
  await page.waitForTimeout(250);
  add('法官端 · 取消后状态不变', !(await seatOut(5)) && (await alive()) === '10');

  await page.click('.mod-seat[data-seat="5"] .mod-seat__btn');
  await page.waitForTimeout(250);
  await page.click('#mod-confirm-ok');
  await page.waitForTimeout(300);
  add('法官端 · 确认后 05 号出局', await seatOut(5));
  add('法官端 · 存活数降为 9', (await alive()) === '9', { alive: await alive() });

  await page.click('.mod-seat[data-seat="5"] .mod-seat__btn');
  await page.waitForTimeout(250);
  await page.click('#mod-confirm-ok');
  await page.waitForTimeout(300);
  add('法官端 · 撤销出局恢复存活 10', !(await seatOut(5)) && (await alive()) === '10');

  await page.click('#mod-reveal');
  await page.waitForTimeout(250);
  add('法官端 · 结束对局弹出二次确认', await page.evaluate(() => !!document.getElementById('mod-confirm').open));
  await page.click('#mod-confirm-ok');
  await page.waitForTimeout(350);
  add('法官端 · 亮牌后出现已结束横幅', await page.evaluate(() => !!document.getElementById('mod-ended-banner')));
  add('法官端 · 亮牌后按钮禁用', await page.evaluate(() => document.getElementById('mod-reveal').disabled === true));

  // Tab 焦点陷阱
  await page.click('#mod-rules');
  await page.waitForTimeout(300);
  let inside = true; const trail = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); const ae = document.activeElement; return { open: !!d, in: !!(d && ae && d.contains(ae)), t: ae ? ae.tagName.toLowerCase() + (ae.id ? '#' + ae.id : '') : 'null' }; });
    trail.push(r.t);
    if (r.open && !r.in) inside = false;
  }
  add('法官端 · Tab 焦点不跑出弹层', inside, { trail });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  add('法官端 · 关闭后焦点回到触发按钮', await page.evaluate(() => document.activeElement?.id === 'mod-rules'));

  flow.push({ step: '法官端 console', issues });
  await shoot(page, 'moderator-1280x800-ended');
  await ctx.close();
}

// 榴莲公共桌面：不泄露隐藏信息
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const issues = [];
  page.on('console', (m) => { if (m.type() === 'error') issues.push(m.text()); });
  page.on('pageerror', (e) => issues.push(String(e)));
  await page.goto(`${BASE}/durian-table.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => ({
    totals: [...document.querySelectorAll('#dt-totals .d-total')].map((d) => ({ name: d.querySelector('.d-total-name').textContent, n: d.querySelector('strong').textContent })),
    placements: document.querySelectorAll('.dt-placement').length,
    players: document.querySelectorAll('.dt-player').length,
    deck: document.querySelector('#dt-deck b')?.textContent,
    turn: document.querySelector('#dt-turn strong')?.textContent,
    round: document.getElementById('dt-round').textContent,
    // 只扫描内容区：页脚的"不会出现头顶牌/摸到的牌"是安全声明，不是泄露。
    contentText: (() => {
      const c = document.querySelector('.dt-page').cloneNode(true);
      c.querySelector('.dt-footer')?.remove();
      return c.innerText;
    })(),
    hasCardLikeNodes: document.querySelectorAll('.dt-page .d-mini-card, .dt-page .d-forehead, .dt-page .d-drawn-card, .dt-page .d-half').length,
  }));

  add('公共桌面 · 累计需求 5 项', info.totals.length === 5, info.totals);
  add('公共桌面 · 累计需求数值与玩家端一致（榴莲5/草莓3/香蕉2/葡萄2/苹果3）',
    JSON.stringify(info.totals.map((t) => t.name + t.n)) === JSON.stringify(['榴莲5', '草莓3', '香蕉2', '葡萄2', '苹果3']), info.totals);
  add('公共桌面 · 已出牌列 6 张', info.placements === 6, { placements: info.placements });
  add('公共桌面 · 玩家 7 位', info.players === 7);
  add('公共桌面 · 牌堆剩余 15', info.deck === '15', { deck: info.deck });
  add('公共桌面 · 显示当前轮到 03 号', (info.turn || '').includes('03'), { turn: info.turn });
  add('公共桌面 · 轮次 02', info.round === '02');

  // 泄露检查：内容区不得出现"头顶牌/摸到/库存/隐藏牌/手牌"，也不得渲染任何手牌类节点
  const leaks = ['头顶', '摸到', '摸牌', '库存', '隐藏牌', '本人牌', '手牌'].filter((w) => info.contentText.includes(w));
  add('公共桌面 · 内容区不含私密字段文案', leaks.length === 0, { leaks });
  add('公共桌面 · 不渲染任何手牌类节点（头顶牌/摸到的牌/本人牌）', info.hasCardLikeNodes === 0, { hasCardLikeNodes: info.hasCardLikeNodes });

  flow.push({ step: '公共桌面 console', issues });
  await ctx.close();
}

// 朝外展示端：三态切换
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const issues = [];
  page.on('console', (m) => { if (m.type() === 'error') issues.push(m.text()); });
  page.on('pageerror', (e) => issues.push(String(e)));
  await page.goto(`${BASE}/display.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const snap = () => page.evaluate(() => ({ title: document.getElementById('dx-title').textContent, status: document.getElementById('dx-status').textContent, facts: document.querySelectorAll('.dx-fact').length, room: document.getElementById('dx-room').textContent }));
  const a = await snap();
  add('展示端 · 默认显示狼人杀进行中', a.title === '狼人杀' && a.status === '正在进行', a);
  add('展示端 · 展示 3 项桌况概览', a.facts === 3, a);

  await page.selectOption('#dx-state', 'waiting');
  await page.waitForTimeout(300);
  const b = await snap();
  add('展示端 · 可切到等待开局', b.status === '等待开局' && b.title !== a.title, b);

  await page.selectOption('#dx-state', 'durian');
  await page.waitForTimeout(300);
  const c = await snap();
  add('展示端 · 可切到榴莲进行中', c.title === '榴莲', c);

  await page.selectOption('#dx-state', 'playing');
  await page.waitForTimeout(250);
  await shoot(page, 'display-1280x800-playing');
  await page.selectOption('#dx-state', 'waiting');
  await page.waitForTimeout(250);
  await shoot(page, 'display-1280x800-waiting');

  flow.push({ step: '展示端 console', issues });
  await ctx.close();
}

report.flows = flow;
report.finishedAt = new Date().toISOString();
fs.writeFileSync(RESULTS, JSON.stringify(report, null, 2), 'utf8');
log('results ->', RESULTS);

let bad = 0;
for (const v of Object.values(report.cells)) {
  const n = (v.audit.doc.horizontalOverflow ? 1 : 0) + v.audit.outOfViewport.length + v.audit.clippedText.length + v.audit.smallTargets.length + v.issues.length;
  if (n) bad++;
}
log('cells', Object.keys(report.cells).length, 'with issues', bad);
log('flow pass', flow.filter((f) => f.ok).length, '/', flow.filter((f) => f.step && f.ok !== undefined).length);

await browser.close();
