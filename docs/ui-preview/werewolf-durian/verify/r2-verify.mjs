import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.R2_BASE || 'http://127.0.0.1:4175';
const ROOT = process.env.R2_ROOT || process.cwd();
const OUT = path.resolve(ROOT, 'docs/ui-preview/werewolf-durian/screenshots/verified-20260918-r2');
const RESULTS = process.env.R2_RESULTS || path.join(process.env.TEMP || '.', 'r2-results.json');

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  chromium: null,
  viewports: {},
  durianFlow: [],
  werewolfFlow: [],
  consoleIssues: [],
};

const log = (...a) => console.log('[r2]', ...a);

/* ---------- in-page audit helpers (inlined as strings) ---------- */

const AUDIT_FN = () => {
  const describe = (el) => {
    if (!el || el.nodeType !== 1) return 'null';
    const parts = [];
    let cur = el;
    let guard = 0;
    while (cur && cur.nodeType === 1 && guard++ < 5) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(s + '#' + cur.id);
        break;
      }
      if (typeof cur.className === 'string' && cur.className.trim()) {
        const cls = cur.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (cls.length) s += '.' + cls.join('.');
      }
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const visible = (el, cs) => {
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  };

  const insideDialog = (el) => !!(el && el.closest && el.closest('dialog'));

  const out = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    doc: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      bodyScrollWidth: document.body.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    },
    outOfViewport: [],
    clippedText: [],
    smallTargets: [],
    dialogState: [],
  };

  const seen = new Set();

  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const key = describe(el);
    const inDialog = insideDialog(el);

    // --- out of viewport horizontally (visual, transform-aware) ---
    if (rect.right > window.innerWidth + 1 || rect.left < -1) {
      if (!seen.has('oov:' + key + rect.top.toFixed(0))) {
        seen.add('oov:' + key + rect.top.toFixed(0));
        out.outOfViewport.push({
          sel: key,
          left: +rect.left.toFixed(1),
          right: +rect.right.toFixed(1),
          width: +rect.width.toFixed(1),
          transformed: cs.transform !== 'none',
          inDialog,
        });
      }
    }

    // --- text clipping: element has direct text and clips it ---
    const hasOwnText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (hasOwnText) {
      const clipX =
        (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
        el.scrollWidth > el.clientWidth + 1;
      const clipY =
        (cs.overflowY === 'hidden' || cs.overflowY === 'clip') &&
        el.scrollHeight > el.clientHeight + 1;
      const ellipsis = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
      if (clipX || clipY || ellipsis) {
        out.clippedText.push({
          sel: key,
          text: (el.textContent || '').trim().slice(0, 40),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
          kind: ellipsis ? 'ellipsis' : clipX ? 'clip-x' : 'clip-y',
          inDialog,
        });
      }
    }

    // --- touch targets ---
    if (el.matches('button,a,select,input,summary,[role="button"],[role="tab"],[role="option"]')) {
      if (cs.pointerEvents === 'none') continue;
      if (el.disabled) {
        // still record disabled primary controls separately
      }
      if (rect.width < 44 - 0.5 || rect.height < 44 - 0.5) {
        out.smallTargets.push({
          sel: key,
          w: +rect.width.toFixed(1),
          h: +rect.height.toFixed(1),
          text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24),
          disabled: !!el.disabled,
          inDialog,
        });
      }
    }
  }

  for (const d of document.querySelectorAll('dialog')) {
    if (!d.open) continue;
    const r = d.getBoundingClientRect();
    const ae = document.activeElement;
    const body = d.querySelector('.d-dialog-body, .d-dialog-body, #dialog-body');
    out.dialogState.push({
      id: d.id,
      rect: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      fitsViewport: r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
      activeInsideDialog: !!(ae && d.contains(ae)),
      activeTag: ae ? describe(ae) : 'null',
      scrollableBody: body ? { scrollH: body.scrollHeight, clientH: body.clientHeight, canScroll: body.scrollHeight > body.clientHeight + 1 } : null,
    });
  }

  // dedupe
  const dedupe = (arr, k) => {
    const m = new Map();
    for (const x of arr) {
      const kk = k(x);
      if (!m.has(kk)) m.set(kk, x);
    }
    return [...m.values()];
  };
  out.outOfViewport = dedupe(out.outOfViewport, (x) => x.sel).slice(0, 25);
  out.clippedText = dedupe(out.clippedText, (x) => x.sel + x.kind).slice(0, 25);
  out.smallTargets = dedupe(out.smallTargets, (x) => x.sel).slice(0, 40);

  return out;
};

const FOCUS_FN = () => {
  const d = document.querySelector('dialog[open]');
  if (!d) return { open: false };
  const ae = document.activeElement;
  return {
    open: true,
    id: d.id,
    activeInside: !!(ae && d.contains(ae)),
    activeTag: ae ? ae.tagName.toLowerCase() + (ae.id ? '#' + ae.id : '') : 'null',
  };
};

/* 一屏容纳：找出所有真的会产生内部滚动的容器及其溢出量。
   注意 documentElement 的 scrollHeight 会被 body{overflow:hidden} 夹住，
   所以必须逐元素看，不能只看整页。 */
const FIT_FN = () => {
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
  // 注：曾尝试用 elementFromPoint 检测"粘性条遮挡正文"，实测不可靠（元素自身就在该点之上），
  // 已移除。内部滚动量才是可靠信号：有滚动就说明一屏放不下。
  return { scrollers };
};

async function attachConsole(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.push({ kind: 'console.error', text: msg.text().slice(0, 300) });
  });
  page.on('pageerror', (err) => bucket.push({ kind: 'pageerror', text: String(err).slice(0, 300) }));
}

function shotPath(name) {
  return path.join(OUT, name + '.png');
}

async function shoot(page, name) {
  await page.screenshot({ path: shotPath(name) });
  return name + '.png';
}

/* ---------- durian ---------- */
async function checkDurianViewport(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: vp.width < 900,
  });
  const page = await ctx.newPage();
  const issues = [];
  await attachConsole(page, issues);

  const vpReport = {};

  // --- scene: placement (turn dialog auto-opens) ---
  await page.goto(`${BASE}/durian.html?scene=placement`, { waitUntil: 'load' });
  await page.waitForTimeout(350);

  const turnOpen = await page.evaluate(() => !!document.querySelector('#d-turn-dialog[open]'));
  vpReport.turnDialogAutoOpen = turnOpen;

  await shoot(page, `durian-${vp.name}-turn-dialog`);
  vpReport.auditDialog = await page.evaluate(AUDIT_FN);
  vpReport.fitDialog = await page.evaluate(FIT_FN);

  // close dialog -> table view, compact
  await page.evaluate(() => {
    const b = document.querySelector('#d-turn-dialog [data-close]');
    if (b) b.click();
  });
  await page.waitForTimeout(250);
  vpReport.auditCompact = await page.evaluate(AUDIT_FN);
  vpReport.fitCompact = await page.evaluate(FIT_FN);
  await shoot(page, `durian-${vp.name}-table-compact`);

  // comfortable
  await page.evaluate(() => {
    const s = document.querySelector('#d-card-layout');
    s.value = 'comfortable';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  vpReport.auditComfortable = await page.evaluate(AUDIT_FN);
  vpReport.fitComfortable = await page.evaluate(FIT_FN);
  await shoot(page, `durian-${vp.name}-table-comfortable`);

  // result scene
  await page.goto(`${BASE}/durian.html?scene=result`, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  vpReport.auditResult = await page.evaluate(AUDIT_FN);
  vpReport.fitResult = await page.evaluate(FIT_FN);
  await shoot(page, `durian-${vp.name}-result`);

  vpReport.consoleIssues = issues;
  await ctx.close();
  return vpReport;
}

async function checkDurianFlow(browser) {
  const flow = [];
  const add = (step, ok, detail) => {
    flow.push({ step, ok: !!ok, detail: detail === undefined ? null : detail });
    if (!ok) log('FLOW FAIL:', step, detail ? JSON.stringify(detail) : '');
  };

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const issues = [];
  await attachConsole(page, issues);

  const count = () => page.evaluate(() => Number(document.getElementById('d-placement-count').textContent));
  const dialogOpen = (id) => page.evaluate((i) => !!document.querySelector(`#${i}[open]`), id);
  const resumeVisible = () => page.evaluate(() => !document.getElementById('d-resume-bar').hidden);
  const round = () => page.evaluate(() => document.getElementById('d-round').textContent);
  const pressed = (side) =>
    page.evaluate((s) => document.querySelector(`[data-side="${s}"]`)?.getAttribute('aria-pressed'), side);
  const placeDisabled = () => page.evaluate(() => document.getElementById('d-place')?.disabled);

  await page.goto(`${BASE}/durian.html?scene=placement`, { waitUntil: 'load' });
  await page.waitForTimeout(350);

  // 1. auto open
  add('1. placement 场景加载后回合弹窗自动打开', await dialogOpen('d-turn-dialog'));
  add('1b. 弹窗打开时焦点在弹层内', await page.evaluate(FOCUS_FN).then((r) => r.activeInside));

  const before = await count();
  add('1c. 初始牌列张数为 6', before === 6, { before });

  // 2. collapse -> not submitted
  await page.evaluate(() => document.querySelector('#d-turn-dialog [data-close]').click());
  await page.waitForTimeout(250);
  add('2. 点「收起看桌面」后弹窗关闭', !(await dialogOpen('d-turn-dialog')));
  add('2b. 收起未提交（牌列张数不变）', (await count()) === before, { after: await count() });
  add('2c. 收起后顶部出现「继续我的回合」', await resumeVisible());
  add('2d. 收起后焦点回到 #d-resume', await page.evaluate(() => document.activeElement?.id === 'd-resume'));

  // 3. resume
  await page.evaluate(() => document.getElementById('d-resume').click());
  await page.waitForTimeout(250);
  add('3. 点「继续我的回合」重新打开弹窗', await dialogOpen('d-turn-dialog'));

  // 4. pick side
  await page.evaluate(() => document.querySelector('[data-side="left"]').click());
  await page.waitForTimeout(200);
  add('4. 选左半边后 aria-pressed=true', (await pressed('left')) === 'true');
  add('4b. 选边后确认按钮可用', (await placeDisabled()) === false);

  // 5. collapse again -> selection preserved
  await page.evaluate(() => document.querySelector('#d-turn-dialog [data-close]').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('d-resume').click());
  await page.waitForTimeout(250);
  add('5. 再次收起后重开，选择仍保留', (await pressed('left')) === 'true');
  add('5b. 重开后确认按钮仍可用', (await placeDisabled()) === false);

  // 6. confirm -> submit once
  await page.evaluate(() => document.getElementById('d-place').click());
  await page.waitForTimeout(300);
  const afterPlace = await count();
  add('6. 确认出牌后牌列 +1（只提交一次）', afterPlace === before + 1, { before, afterPlace });
  add('6b. 确认后回合弹窗关闭（进入等待）', !(await dialogOpen('d-turn-dialog')));
  const postPlaceFocus = await page.evaluate(() => {
    const ae = document.activeElement;
    return { isBody: ae === document.body, tag: ae ? ae.tagName.toLowerCase() + (ae.id ? '#' + ae.id : '') : 'null' };
  });
  add('6c. 确认出牌后焦点不丢到 body', !postPlaceFocus.isBody, postPlaceFocus);

  // 7. waiting has exits
  const waitingExits = await page.evaluate(() => ({
    history: !!document.getElementById('d-view-history'),
    next: !!document.getElementById('d-next-inline'),
  }));
  add('7. waiting 阶段有「看牌列」与「开始下一轮」出路', waitingExits.history && waitingExits.next, waitingExits);

  // 7b. view history opens dialog
  await page.evaluate(() => document.getElementById('d-view-history').click());
  await page.waitForTimeout(300);
  add('7b. 「看牌列」打开牌列弹窗', await dialogOpen('d-history-dialog'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // 8. next round -> draw, auto open, focus on draw button
  await page.evaluate(() => document.getElementById('d-next-inline').click());
  await page.waitForTimeout(350);
  add('8. 开始下一轮后轮次 +1', (await round()) === '03', { round: await round() });
  add('8b. 下一轮牌列清空', (await count()) === 0, { count: await count() });
  add('8c. 下一轮摸牌弹窗自动打开', await dialogOpen('d-turn-dialog'));
  add('8d. 焦点落在「摸一张牌」按钮', await page.evaluate(() => document.activeElement?.id === 'd-draw'));

  // 9. draw -> placement -> place
  await page.evaluate(() => document.getElementById('d-draw').click());
  await page.waitForTimeout(300);
  add('9. 摸牌后进入选边阶段且弹窗仍打开', await dialogOpen('d-turn-dialog'));
  add('9b. 未选边时确认按钮禁用', (await placeDisabled()) === true);
  await page.evaluate(() => document.querySelector('[data-side="right"]').click());
  await page.waitForTimeout(200);
  add('9c. 选右半边后确认按钮可用', (await placeDisabled()) === false);
  await page.evaluate(() => document.getElementById('d-place').click());
  await page.waitForTimeout(300);
  add('9d. 出牌后牌列 +1', (await count()) === 1, { count: await count() });

  // 10. ESC / backdrop behaviour
  await page.goto(`${BASE}/durian.html?scene=placement`, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  add('10. ESC 可关闭回合弹窗', !(await dialogOpen('d-turn-dialog')));

  await page.evaluate(() => document.getElementById('d-resume').click());
  await page.waitForTimeout(250);
  const box = await page.evaluate(() => {
    const d = document.getElementById('d-turn-dialog');
    const r = d.getBoundingClientRect();
    return { r: { top: r.top, left: r.left, width: r.width, height: r.height } };
  });
  // click outside dialog box (top-left corner of viewport)
  await page.mouse.click(4, 4);
  await page.waitForTimeout(250);
  add('10b. 遮罩外点击可关闭回合弹窗', !(await dialogOpen('d-turn-dialog')), box);

  await page.evaluate(() => document.getElementById('d-resume').click());
  await page.waitForTimeout(250);
  // click inside dialog header area -> should stay open
  await page.evaluate(() => {
    const d = document.getElementById('d-turn-dialog');
    const t = d.querySelector('.d-turn-heading h2') || d.querySelector('.d-dialog-header');
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  add('10c. 弹窗内部点击不会关闭', await dialogOpen('d-turn-dialog'));

  // 11. challenge flow (scene=draw has 6 placements -> bell available)
  await page.goto(`${BASE}/durian.html?scene=draw`, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  add('11. draw 场景弹窗自动打开', await dialogOpen('d-turn-dialog'));
  const hasBell = await page.evaluate(() => !!document.getElementById('d-challenge'));
  add('11b. 桌面已有出牌时出现「按铃质疑」', hasBell);
  if (hasBell) {
    await page.evaluate(() => document.getElementById('d-challenge').click());
    await page.waitForTimeout(400);
    add('11c. 质疑后结算弹窗打开', await dialogOpen('d-result-dialog'));
    const resultInfo = await page.evaluate(() => {
      const t = document.getElementById('d-result-title')?.textContent;
      const next = !!document.getElementById('d-next-round');
      const body = document.getElementById('d-result-body');
      return { title: t, hasNext: next, bodyLen: body ? body.textContent.trim().length : 0, scrollable: body ? body.scrollHeight > body.clientHeight + 1 : null };
    });
    add('11d. 结算内容已渲染且可继续下一轮', resultInfo.hasNext && resultInfo.bodyLen > 30, resultInfo);
    await shoot(page, 'durian-390x844-challenge-result');

    // next round from result dialog
    const roundBefore = await round();
    await page.evaluate(() => document.getElementById('d-next-round').click());
    await page.waitForTimeout(400);
    add('11e. 结算后「开始下一轮」推进轮次', (await round()) !== roundBefore, { roundBefore, roundAfter: await round() });
    add('11f. 新一轮摸牌弹窗自动打开', await dialogOpen('d-turn-dialog'));
    add('11g. 焦点落在「摸一张牌」按钮', await page.evaluate(() => document.activeElement?.id === 'd-draw'));
  }

  // 12. Tab focus containment
  await page.goto(`${BASE}/durian.html?scene=placement`, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  let stayedInside = true;
  const trail = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(FOCUS_FN);
    trail.push(r.activeTag);
    if (r.open && !r.activeInside) stayedInside = false;
  }
  add('12. Tab 焦点不跑出弹层', stayedInside, { trail: trail.slice(0, 14) });

  flow.push({ step: 'console', issues });
  await ctx.close();
  return flow;
}

/* ---------- werewolf ---------- */
async function checkWerewolfViewport(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: vp.width < 900,
  });
  const page = await ctx.newPage();
  const issues = [];
  await attachConsole(page, issues);
  const vpReport = {};

  await page.goto(`${BASE}/art-directions.html`, { waitUntil: 'load' });
  await page.waitForTimeout(350);

  vpReport.theme = await page.evaluate(() => document.body.dataset.theme);
  vpReport.design = await page.evaluate(() => document.body.dataset.design);
  vpReport.auditWoodcut = await page.evaluate(AUDIT_FN);
  vpReport.fitWoodcut = await page.evaluate(FIT_FN);
  vpReport.seatFit = await page.evaluate(() => { const l = document.getElementById("seats-left"); const r = document.getElementById("seats-right"); return { leftBottom: Math.round(l.getBoundingClientRect().bottom), rightBottom: Math.round(r.getBoundingClientRect().bottom), viewportH: innerHeight }; });
  await shoot(page, `werewolf-${vp.name}-refined-woodcut`);

  // seat count check
  vpReport.seatCounts = await page.evaluate(() => ({
    left: document.querySelectorAll('#seats-left .seat').length,
    right: document.querySelectorAll('#seats-right .seat').length,
  }));

  // names clipping
  vpReport.nameClipping = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.seat .name')).map((el) => ({
      text: el.textContent.trim(),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      clipped: el.scrollWidth > el.clientWidth + 1,
    }))
  );

  for (const theme of ['eclipse', 'curtain']) {
    await page.evaluate((t) => {
      const b = document.querySelector(`.choices button[data-theme="${t}"]`);
      if (b) b.click();
    }, theme);
    await page.waitForTimeout(300);
    vpReport['audit_' + theme] = await page.evaluate(AUDIT_FN);
    await shoot(page, `werewolf-${vp.name}-refined-${theme}`);
  }
  // back to default
  await page.evaluate(() => document.querySelector('.choices button[data-theme="woodcut"]').click());
  await page.waitForTimeout(200);

  vpReport.consoleIssues = issues;
  await ctx.close();
  return vpReport;
}

async function checkWerewolfFlow(browser) {
  const flow = [];
  const add = (step, ok, detail) => {
    flow.push({ step, ok: !!ok, detail: detail === undefined ? null : detail });
    if (!ok) log('WW FLOW FAIL:', step, detail ? JSON.stringify(detail) : '');
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const issues = [];
  await attachConsole(page, issues);

  const open = () => page.evaluate(() => !!document.querySelector('#dialog[open]'));
  const title = () => page.evaluate(() => document.getElementById('dialog-title')?.textContent || '');

  await page.goto(`${BASE}/art-directions.html`, { waitUntil: 'load' });
  await page.waitForTimeout(350);

  const triggers = [
    { name: '本局规则', sel: '#rules' },
    { name: '我的身份', sel: '#identity' },
    { name: '上一轮票型', sel: '#ledger' },
    { name: '查看席位', sel: '#seats-left .seat' },
  ];

  for (const t of triggers) {
    // Real mouse click: a programmatic .click() does not move focus, which would
    // invalidate the focus-return assertion below.
    await page.click(t.sel);
    await page.waitForTimeout(300);
    const isOpen = await open();
    const ttl = await title();
    add(`狼人杀 · ${t.name} 弹层可打开`, isOpen, { title: ttl });
    const focus = await page.evaluate(FOCUS_FN);
    add(`狼人杀 · ${t.name} 打开后焦点在弹层内`, focus.activeInside, focus);
    const fits = await page.evaluate(() => {
      const d = document.querySelector('#dialog[open]');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { fits: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, r: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) } };
    });
    add(`狼人杀 · ${t.name} 弹层完整在视口内`, fits?.fits, fits);
    if (t.name === '我的身份') await shoot(page, 'werewolf-1280x800-identity-dialog');
    if (t.name === '本局规则') await shoot(page, 'werewolf-1280x800-rules-dialog');
    if (t.name === '上一轮票型') await shoot(page, 'werewolf-1280x800-ledger-dialog');

    // close via ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    add(`狼人杀 · ${t.name} ESC 可关闭`, !(await open()));

    // focus return check
    const back = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return { activeIsTrigger: document.activeElement === el, activeTag: document.activeElement ? (document.activeElement.tagName.toLowerCase() + (document.activeElement.id ? '#' + document.activeElement.id : '')) : 'null' };
    }, t.sel);
    add(`狼人杀 · ${t.name} 关闭后焦点回到触发元素`, back.activeIsTrigger, back);
  }

  // #close button
  await page.click('#rules');
  await page.waitForTimeout(250);
  await page.click('#close');
  await page.waitForTimeout(250);
  add('狼人杀 · 「收起并返回」按钮可关闭弹层', !(await open()));

  // finish speaking
  const beforeSpeaker = await page.evaluate(() => document.querySelector('.speaker h1')?.textContent);
  await page.click('#finish');
  await page.waitForTimeout(300);
  const afterSpeaker = await page.evaluate(() => document.querySelector('.speaker h1')?.textContent);
  const finishDisabled = await page.evaluate(() => document.getElementById('finish').disabled);
  add('狼人杀 · 结束发言推进到 07 号', beforeSpeaker !== afterSpeaker, { beforeSpeaker, afterSpeaker });
  add('狼人杀 · 推进后按钮变为禁用（正在聆听）', finishDisabled === true);
  const postFinishFocus = await page.evaluate(() => {
    const ae = document.activeElement;
    return { isBody: ae === document.body, tag: ae ? ae.tagName.toLowerCase() + (ae.id ? '#' + ae.id : '') : 'null', text: ae ? (ae.textContent || '').trim().slice(0, 12) : '' };
  });
  add('狼人杀 · 推进后焦点落到新发言人（不丢到 body）', !postFinishFocus.isBody, postFinishFocus);
  await shoot(page, 'werewolf-1280x800-after-finish');

  // Tab containment inside the shared dialog
  await page.click('#rules');
  await page.waitForTimeout(300);
  let stayedInside = true;
  const trail = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(FOCUS_FN);
    trail.push(r.activeTag);
    if (r.open && !r.activeInside) stayedInside = false;
  }
  add('狼人杀 · Tab 焦点不跑出弹层', stayedInside, { trail });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  flow.push({ step: 'console', issues });
  await ctx.close();
  return flow;
}

/* ---------- main ---------- */
(async () => {
  const browser = await chromium.launch({
    args: ['--no-proxy-server', '--disable-lcd-text'],
  });
  report.chromium = browser.version();
  log('chromium', report.chromium);

  for (const vp of VIEWPORTS) {
    log('viewport', vp.name, 'durian');
    const d = await checkDurianViewport(browser, vp);
    log('viewport', vp.name, 'werewolf');
    const w = await checkWerewolfViewport(browser, vp);
    report.viewports[vp.name] = { durian: d, werewolf: w };
  }

  log('durian flow');
  report.durianFlow = await checkDurianFlow(browser);
  log('werewolf flow');
  report.werewolfFlow = await checkWerewolfFlow(browser);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(RESULTS, JSON.stringify(report, null, 2), 'utf8');
  log('results written to', RESULTS);

  await browser.close();
})().catch((e) => {
  console.error('R2_FATAL', e);
  process.exit(1);
});
