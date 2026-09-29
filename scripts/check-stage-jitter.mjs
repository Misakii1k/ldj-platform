#!/usr/bin/env node
// 演出跳动检测：打开一个页面，在演出进行中逐帧采样元素位置与透明度，报告三类问题。
//   MOVE  本该静止的容器（顶栏、题目、牌区、席位卡、托盘、牌匾）移动了 >1.5px
//   JUMP  可见物件（牌、筹码）在相邻两帧之间位移 >20px，即「瞬移」
//   FLASH 可见物件在一帧内从不透明变成透明，即「闪一下」
// 用法：
//   node scripts/check-stage-jitter.mjs <url> [--ms 6500] [--width 1280 --height 800] [--selectors-still ".a,.b"] [--selectors-moving ".c,.d"]
// 退出码：发现问题 = 1，没有问题 = 0。
// 不算问题的：绕中心的 scale 弹跳（数字 / 皇冠，中心点不动）、容器因内容变宽（左上角不动）、原物件在飞行替身底下隐藏（无缝交接）。
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args[0];
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
if (!url || url.startsWith('--')) { console.error('用法：node scripts/check-stage-jitter.mjs <url> [--ms 6500] [--width 1280 --height 800]'); process.exit(2); }

const STILL = opt('selectors-still', '.hud,.question,.board,.pile,.entry,.tray,.reveal,.seats .seat,[data-answer],.ww-question,.ww-board,.ww-seat,.ww-tray,.ww-plaque');
const MOVING = opt('selectors-moving', '.facedown,.slot .chip,.pcard,.ww-poker-card,.ww-chip');
const ms = Number(opt('ms', 6500));
const width = Number(opt('width', 1280)), height = Number(opt('height', 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(url, { waitUntil: 'commit' });
const frames = await page.evaluate(([STILL, MOVING, ms]) => new Promise((res) => {
  const out = []; const t0 = performance.now(); const ids = new WeakMap(); let n = 0;
  const id = (e) => { if (!ids.has(e)) ids.set(e, ++n); return ids.get(e); };
  const grab = (sel, still) => [...document.querySelectorAll(sel)].filter((e) => !e.closest('.ghost,.ww-flight-layer')).map((e) => {
    const r = e.getBoundingClientRect();
    let o = getComputedStyle(e).visibility === 'hidden' ? 0 : 1; for (let x = e; x && x !== document.body; x = x.parentElement) o *= +getComputedStyle(x).opacity;
    return { k: `${e.className.toString().split(' ')[0]}#${id(e)}`, still, l: r.left, t: r.top, x: r.left + r.width / 2, y: r.top + r.height / 2, o };
  });
  // 飞行替身（接手原物件的幽灵）的中心点：原物件在替身底下隐藏属于无缝交接，不算闪烁
  const ghosts = () => [...document.querySelectorAll('.ghost > *, .ww-flight-layer > *')].map((g) => { const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  (function tick() {
    out.push({ t: Math.round(performance.now() - t0), els: [...grab(STILL, true), ...grab(MOVING, false)], ghosts: ghosts() });
    if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(out);
  })();
}), [STILL, MOVING, ms]);
await browser.close();

const issues = [];
for (let i = 1; i < frames.length; i++) {
  const prev = new Map(frames[i - 1].els.map((e) => [e.k, e]));
  for (const e of frames[i].els) {
    const a = prev.get(e.k); if (!a) continue;
    // 真正的平移会同时移动左上角和中心点；只变宽（左上角不动）或绕中心 scale 弹跳（中心不动）都不算移动
    const d = Math.min(Math.hypot(e.x - a.x, e.y - a.y), Math.hypot(e.l - a.l, e.t - a.t));
    const visible = a.o > 0.15 && e.o > 0.15;
    if (visible && e.still && d > 1.5) issues.push(`MOVE  ${e.k} ${d.toFixed(0)}px @${frames[i].t}ms`);
    else if (visible && d > 20) issues.push(`JUMP  ${e.k} ${d.toFixed(0)}px @${frames[i].t}ms`);
    const handedOff = frames[i].ghosts.some(([gx, gy]) => Math.hypot(gx - a.x, gy - a.y) < 12);
    if (a.o > 0.8 && e.o < 0.2 && !handedOff) issues.push(`FLASH ${e.k} @${frames[i].t}ms`);
  }
}
console.log(`${url} ${width}x${height}：采样 ${frames.length} 帧，问题 ${issues.length} 条`);
issues.slice(0, 40).forEach((s) => console.log('  ' + s));
if (issues.length > 40) console.log(`  …另有 ${issues.length - 40} 条`);
process.exit(issues.length ? 1 : 0);
