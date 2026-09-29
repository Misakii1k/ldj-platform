// 方向稿公用脚本：视口切换、飞行、屏震、冲屏、数字滚动、倒计时。只服务于静态预览，不进生产。
(function () {
  const SIZES = { desktop: [1280, 800], mobile: [390, 844], landscape: [844, 390] };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const device = document.querySelector('.device');
  let scale = 1;

  function fit() {
    const [w, h] = SIZES[device.dataset.size];
    device.style.width = w + 'px';
    device.style.height = h + 'px';
    scale = Math.max(0.2, Math.min((innerWidth - 32) / w, (innerHeight - 96) / h, 1));
    device.style.transform = `scale(${scale})`;
    device.parentElement.style.height = h * scale + 'px';
  }
  addEventListener('resize', fit);
  const initial = new URLSearchParams(location.search).get('size');
  if (initial && SIZES[initial]) device.dataset.size = initial;
  document.querySelectorAll('[data-set-size]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.setSize === device.dataset.size));
    b.addEventListener('click', () => {
      device.dataset.size = b.dataset.setSize;
      document.querySelectorAll('[data-set-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      fit();
    });
  });
  document.getElementById('reset')?.addEventListener('click', () => {
    const u = new URL(location.href);
    u.searchParams.set('size', device.dataset.size);
    location.href = u.toString();
  });

  // 手牌扇：给每张牌写序号，CSS 用它算倾斜
  function indexFan(fan) {
    const kids = [...fan.children];
    fan.style.setProperty('--mid', (kids.length - 1) / 2);
    kids.forEach((k, i) => k.style.setProperty('--i', i));
  }
  document.querySelectorAll('.fan').forEach(indexFan);

  function local(el) {
    const d = device.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: (r.left - d.left) / scale, y: (r.top - d.top) / scale, w: r.width / scale, h: r.height / scale };
  }

  let layer = device.querySelector('.fly-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'fly-layer';
    device.appendChild(layer);
  }

  // 把 node 从 fromEl 的位置飞到 toEl 的位置；返回 Promise，落地后 node 已移除
  function fly(node, fromEl, toEl, { lift = 120, spin = 12, duration = 520, endScale = 1 } = {}) {
    const a = local(fromEl), b = local(toEl);
    Object.assign(node.style, { position: 'absolute', left: a.x + 'px', top: a.y + 'px', margin: 0 });
    layer.appendChild(node);
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    if (reduce) { node.remove(); return Promise.resolve(); }
    return node.animate(
      [
        { transform: 'translate(0,0) rotate(0) scale(1)' },
        { transform: `translate(${dx * .5}px, ${dy * .5 - lift}px) rotate(${-spin}deg) scale(1.18)`, offset: .45 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin / 2}deg) scale(${endScale})` },
      ],
      { duration, easing: 'cubic-bezier(.22,1,.36,1)' },
    ).finished.then(() => node.remove());
  }

  function shake(px = 4) {
    if (reduce) return;
    device.animate(
      [{ translate: '0 0' }, { translate: `${-px}px ${px / 2}px` }, { translate: `${px * .75}px ${-px / 2}px` }, { translate: `${-px / 2}px ${px / 4}px` }, { translate: '0 0' }],
      { duration: 280, easing: 'ease-out' },
    );
  }

  function slam(el) {
    el.classList.remove('run');
    void el.offsetWidth;
    el.classList.add('run');
  }

  function bump(el) {
    if (reduce) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  // 数字逐步滚到 to，变化瞬间弹一下
  function roll(el, to, { prefix = '', duration = 420 } = {}) {
    const from = Number(el.dataset.value ?? el.textContent.replace(/\D/g, '')) || 0;
    el.dataset.value = to;
    bump(el);
    if (reduce) { el.textContent = prefix + to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      el.textContent = prefix + Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // 倒计时环：<svg class="ring"><circle class="track"/><circle class="bar"/></svg> + 数字
  function countdown(root, seconds) {
    const bar = root.querySelector('.bar');
    const num = root.querySelector('.ring-num');
    const len = 2 * Math.PI * Number(bar.getAttribute('r'));
    bar.style.strokeDasharray = len;
    let left = seconds;
    const tick = () => {
      num.textContent = left;
      bar.style.strokeDashoffset = len * (1 - left / seconds);
      root.classList.toggle('low', left <= 10);
      root.classList.toggle('last', left <= 5);
      if (left <= 5 && left > 0) bump(num);
      if (left > 0) { left -= 1; root._t = setTimeout(tick, 1000); }
    };
    clearTimeout(root._t);
    tick();
  }

  window.Preview = { fit, fly, shake, slam, bump, roll, countdown, local, indexFan, reduce };
  fit();

  // 仅供自动检查：[data-box] 区块之间的重叠与出框（设计像素）
  window.__layoutCheck = () => {
    const W = parseFloat(device.style.width), H = parseFloat(device.style.height);
    const boxes = [...device.querySelectorAll('[data-box]')].map((e) => ({ n: e.dataset.box, ...local(e) }));
    const hit = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) hit.push(`${a.n}×${b.n} ${Math.round(ox)}x${Math.round(oy)}`);
    }
    const out = boxes.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1).map((b) => `${b.n} [${[b.x, b.y, b.w, b.h].map(Math.round)}]`);
    return { size: W + 'x' + H, hit, out };
  };
})();
