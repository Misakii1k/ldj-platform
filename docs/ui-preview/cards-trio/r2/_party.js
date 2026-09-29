// 第 2 轮 · UNO / Ding「整屏色块」共用脚本：搭台、牌、环绕席位、出牌 / 摸牌 / 选色 / 冲屏 / 罚牌飞字。画面各自的流程在各 HTML 里。
(function () {
  const P = window.Preview;
  const GLYPH = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', draw4: '+4' };
  const COLOR_NAME = { red: '红', yellow: '黄', green: '绿', blue: '蓝' };
  const device = document.querySelector('.device');

  function card({ c, v, phrase }, extra = '') {
    if (phrase) return `<div class="uc2 phrase ${c} ${extra}" data-c="${c}" data-phrase="${phrase}"><span class="face"></span><span class="v">${phrase}</span><span class="c1">!</span><span class="c2">!</span></div>`;
    if (c === 'back') return `<div class="uc2 back ${extra}"><span class="face"></span><span class="v">${v}</span></div>`;
    const g = GLYPH[v] ?? v;
    const wild = v === 'wild' || v === 'draw4';
    return `<div class="uc2 ${wild ? 'wild' : c} ${extra}" data-c="${wild ? 'wild' : c}" data-v="${v}"><span class="face"></span><span class="v">${g}</span><span class="c1">${g}</span><span class="c2">${g}</span></div>`;
  }
  const node = (html) => { const t = document.createElement('div'); t.innerHTML = html; return t.firstElementChild; };

  // 搭台：桌布、泼色层、剪影、圆盘、方向环、牌堆、HUD、冲屏、选色盘
  function build({ backLabel = 'UNO', art = ['7', '+2', '⇄', '★'] } = {}) {
    device.insertAdjacentHTML('afterbegin', `
      <div class="cloth"></div><div class="wipe"></div>
      <div class="cloth-art">${art.map((a, k) => `<span style="left:${[4, 80, 8, 78][k]}%;top:${[8, 6, 58, 60][k]}%;--r:${[-14, 12, 10, -8][k]}deg">${a}</span>`).join('')}</div>
      <div class="disc"></div>
      <div class="dir-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="94"/><path d="M100 0 l12 6 -12 6 z"/><path d="M100 200 l-12 -6 12 -6 z"/><path d="M0 100 l6 -12 6 12 z"/><path d="M200 100 l-6 12 -6 -12 z"/></svg></div>
      <div class="core"><div class="deck" data-box="deck">${card({ c: 'back', v: backLabel })}<span class="left" id="deck-left">剩 62 张</span></div><div class="discard" data-box="discard"><div class="under"></div></div></div>`);
    device.insertAdjacentHTML('beforeend', `
      <div class="ghost-big"></div>
      <div class="picker"><div class="pad"><p>选一个颜色</p>${Object.entries(COLOR_NAME).map(([k, n]) => `<button data-pick="${k}" style="background:var(--${k})">${n}</button>`).join('')}</div></div>
      <div class="slam slam-fx"><span class="word"></span></div>`);
  }

  let floorInit = false;
  function setColor(c, { splash = true } = {}) {
    const prev = device.dataset.color;
    device.dataset.color = c;
    document.querySelectorAll('[data-color-name]').forEach((el) => (el.textContent = COLOR_NAME[c] ?? ''));
    if (!floorInit || !splash || P.reduce || prev === c) {
      floorInit = true;
      device.style.setProperty('--floor', device.classList.contains('ding') && !splash ? 'var(--ding)' : `var(--${c})`);
      return;
    }
    const wipe = device.querySelector('.wipe');
    const d = P.local(device.querySelector('.discard'));
    const W = parseFloat(device.style.width), H = parseFloat(device.style.height);
    wipe.style.setProperty('--wx', ((d.x + d.w / 2) / W * 100) + '%');
    wipe.style.setProperty('--wy', ((d.y + d.h / 2) / H * 100) + '%');
    wipe.classList.remove('run');
    void wipe.offsetWidth;
    wipe.classList.add('run');
    // 泼满后写回桌布；animationend 在后台标签页不触发，用定时兜底
    clearTimeout(wipe._t);
    wipe._t = setTimeout(() => { device.style.setProperty('--floor', `var(--${device.dataset.color})`); wipe.classList.remove('run'); }, 580);
  }

  // 环绕席位：上半圈均分；手机收窄角度
  function seats(list) {
    const box = document.createElement('div');
    box.className = 'ring-seats';
    box.innerHTML = list.map((p) => `<div class="sticker ${p.n === 1 ? 'one' : ''}" data-id="${p.id}" data-box="seat-${p.id}"><div class="avatar" style="background:${p.bg}">${p.a}</div><b>${p.name}</b><span class="n" data-count>${p.n}</span><span class="say"></span></div>`).join('');
    device.appendChild(box);
    const els = [...box.children];
    function place() {
      const m = device.dataset.size === 'mobile';
      const cx = m ? 195 : 640, cy = m ? 844 * 0.4 : 800 * 0.44;
      const rx = m ? 150 : 400, ry = m ? 244 : 280;
      const spread = m ? 72 : 100;
      els.forEach((s, k) => {
        const a = (els.length === 1 ? 0 : -spread + (2 * spread * k) / (els.length - 1)) * Math.PI / 180;
        s.style.left = cx + Math.sin(a) * rx + 'px';
        s.style.top = cy - Math.cos(a) * ry + 'px';
        s.style.setProperty('--rot', ((k % 2 ? 1 : -1) * (1.5 + (k % 3))).toFixed(1) + 'deg');
      });
    }
    place();
    document.querySelectorAll('[data-set-size]').forEach((b) => b.addEventListener('click', place));
    return Object.fromEntries(els.map((e) => [e.dataset.id, e]));
  }
  function setActive(el) {
    document.querySelectorAll('.sticker.active').forEach((s) => s.classList.remove('active'));
    el?.classList.add('active');
  }
  function say(el, text) {
    const b = el.querySelector('.say');
    b.textContent = text;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function setCount(el, n) {
    P.roll(el.querySelector('[data-count]'), n);
    el.classList.toggle('one', n === 1);
  }

  const slamEl = () => device.querySelector('.slam-fx');
  function slam(text, kind = '') {
    const s = slamEl();
    s.querySelector('.word').textContent = text;
    s.dataset.kind = kind;
    P.slam(s);
  }
  function ghost(html) {
    if (P.reduce) return;
    const g = device.querySelector('.ghost-big');
    g.innerHTML = html;
    g.classList.remove('run'); void g.offsetWidth; g.classList.add('run');
  }
  function penaltyFly(fromEl, toEl, text) {
    const t = node(`<span class="penalty-tag">${text}</span>`);
    return P.fly(t, fromEl, toEl, { lift: 60, spin: 0, duration: 520 });
  }
  function pickColor() {
    const picker = device.querySelector('.picker');
    return new Promise((ok) => {
      picker.classList.add('open');
      picker.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { picker.classList.remove('open'); ok(b.dataset.pick); }));
    });
  }
  function reverseDir() {
    const r = device.querySelector('.dir-ring');
    r.classList.toggle('ccw');
    if (!P.reduce) r.animate([{ scale: 1 }, { scale: 1.2 }, { scale: 1 }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  // 把一张牌（DOM 或数据）落到弃牌堆；上一张留在下面露一点边
  function landOnDiscard(html, { tilt = (Math.random() * 16 - 8) } = {}) {
    const discard = device.querySelector('.discard');
    const under = discard.querySelector('.under');
    const top = discard.querySelector(':scope > .uc2');
    if (top) {
      top.classList.remove('land');
      top.style.rotate = (Math.random() * 20 - 10) + 'deg';
      under.innerHTML = '';
      under.appendChild(top);
    }
    const el = node(html);
    el.classList.add('land');
    el.style.rotate = tilt + 'deg';
    discard.appendChild(el);
    return el;
  }

  // 功能牌冲屏：统一在这里分派，返回是否需要选色
  function fx(v) {
    if (v === 'draw4') { ghost(card({ c: 'wild', v: 'draw4' })); slam('+4', 'draw4'); P.shake(4); return true; }
    if (v === 'wild') { ghost(card({ c: 'wild', v: 'wild' })); return true; }
    if (v === 'reverse') { slam('反转！', 'reverse'); reverseDir(); }
    else if (v === 'skip') slam('跳过！', 'skip');
    else if (v === 'draw2') { slam('+2', 'draw2'); P.shake(3); }
    return false;
  }

  // 手牌多时自动收紧：一行放不下就加大重叠，只露每张牌左侧角标；悬停 / 选中的那张抽高完整显示
  function fitHand(hand) {
    const n = hand.children.length;
    if (!n) return;
    const m = device.dataset.size === 'mobile';
    const w = parseFloat(getComputedStyle(hand.children[0]).width);
    const avail = m ? 350 : 820;
    const base = m ? -20 : -24;
    const need = n > 1 ? -(w - (avail - w) / (n - 1)) : 0;
    const overlap = Math.min(base, need);
    hand.style.setProperty('--overlap', overlap + 'px');
    // 露出宽度小于角标宽度的一半时进入"紧凑"模式：扇形倾斜收小、中间大字隐藏只看角标
    hand.classList.toggle('tight', w + overlap < w * .42);
    hand.style.setProperty('--tilt', (hand.classList.contains('tight') ? .5 : (m ? 2 : 2.4)) + 'deg');
  }
  document.querySelectorAll('[data-set-size]').forEach((b) => b.addEventListener('click', () => setTimeout(() => document.querySelectorAll('.my-hand').forEach(fitHand))));

  // 紧凑模式下的点按：第一下抽出来看（手机没有悬停），第二下才出牌；返回 true 表示这次只是"看"
  function peekFirst(hand, el) {
    if (!hand.classList.contains('tight') || el.classList.contains('peek')) return false;
    hand.querySelectorAll('.peek').forEach((x) => x.classList.remove('peek'));
    el.classList.add('peek');
    return true;
  }

  window.Party = { card, node, build, setColor, seats, setActive, say, setCount, slam, ghost, penaltyFly, pickColor, reverseDir, landOnDiscard, fx, fitHand, peekFirst, COLOR_NAME };
})();
