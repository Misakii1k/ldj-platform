// 方向稿公用脚本：视口切换、昼夜切换、偷奶酪飞行、偷看骰子。只服务于静态预览，不进生产。
(function () {
  const PLAYERS = [
    // 点数按规则排过：任意 4–8 人时，1 点都是多人同醒互相目击，3 点"你"是第一个独醒的人→偷走奶酪，之后独醒的人只能偷看。四个画面讲的是同一局。
    { name: '阿杰', seat: 1, die: 5, c: 'var(--m2)' },
    { name: '小鱼干', seat: 2, die: 3, c: 'var(--m1)', me: true, alt: 5 },
    { name: '可可', seat: 3, die: 1, c: 'var(--m3)' },
    { name: '老王', seat: 4, die: 1, c: 'var(--m4)' },
    { name: '糯米', seat: 5, die: 6, c: 'var(--m5)' },
    { name: 'Momo', seat: 6, die: 4, c: 'var(--m6)' },
    { name: '大橘', seat: 7, die: 6, c: 'var(--m7)' },
    { name: '一只很长昵称的鼠', seat: 8, die: 4, c: 'var(--m8)' },
  ];
  const count = Math.min(8, Math.max(4, Number(new URLSearchParams(location.search).get('n')) || 6));
  const players = PLAYERS.slice(0, count);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const MOUSE = `<svg class="mouse" viewBox="0 0 100 92" aria-hidden="true">
    <circle cx="22" cy="26" r="19" fill="currentColor" stroke="#292722" stroke-width="4"/>
    <circle cx="22" cy="26" r="9" fill="#f6b7cf" opacity=".8"/>
    <circle cx="78" cy="26" r="19" fill="currentColor" stroke="#292722" stroke-width="4"/>
    <circle cx="78" cy="26" r="9" fill="#f6b7cf" opacity=".8"/>
    <path d="M50 22 C78 22 90 44 90 58 C90 76 72 88 50 88 C28 88 10 76 10 58 C10 44 22 22 50 22 Z" fill="currentColor" stroke="#292722" stroke-width="4"/>
    <g style="opacity:var(--eo)"><circle cx="36" cy="54" r="5.5" fill="#292722"/><circle cx="64" cy="54" r="5.5" fill="#292722"/><circle cx="38" cy="52" r="1.8" fill="#fff"/><circle cx="66" cy="52" r="1.8" fill="#fff"/></g>
    <g style="opacity:var(--ec)" stroke="#292722" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M30 55 q6 5 12 0"/><path d="M58 55 q6 5 12 0"/></g>
    <ellipse cx="50" cy="68" rx="6" ry="4.5" fill="#292722"/>
    <g stroke="#292722" stroke-width="2.5" stroke-linecap="round"><path d="M40 70 L20 66"/><path d="M40 74 L22 78"/><path d="M60 70 L80 66"/><path d="M60 74 L78 78"/></g>
  </svg>`;
  const die = (n) => `<div class="die">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;

  const badge = document.body.dataset.seatStyle === 'badge';
  const seatHtml = (p) => badge
    ? `<span class="seat-no">${p.seat}</span><span class="zzz">Zz</span><div class="mouse-box">${MOUSE}</div>
        <div class="seat-name" style="color:var(--ink)">${p.name}${p.me ? '<em class="you">你</em>' : ''}</div>
        <div class="seat-dice">${p.me ? '' : '<div class="cup"></div>'}${die(p.die)}</div><span class="seat-loot"></span>`
    : `<span class="zzz">Zz</span><div class="mouse-box">${MOUSE}</div>
        <div class="seat-name" style="color:var(--ink)">${p.name}${p.me ? '（你）' : ''}<small>${p.seat} 号鼠</small></div>
        <div class="seat-dice">${p.me ? '' : '<div class="cup"></div>'}${die(p.die)}</div><span class="seat-loot"></span>`;
  const place = (box, list, offset) => list.forEach((p, k) => {
    const el = document.createElement('div');
    el.className = 'seat' + (p.me ? ' awake' : '');
    if (p.me) el.id = 'me';
    el.style.setProperty('--i', offset + k);
    el.style.color = p.c;
    el.innerHTML = seatHtml(p);
    box.appendChild(el);
  });

  document.querySelectorAll('[data-seats]').forEach((box) => {
    const [from, to] = box.dataset.seats.split('-').map(Number);
    place(box, PLAYERS.slice(from, to + 1), from);
  });
  const leftCount = Math.ceil(players.length / 2);
  document.querySelectorAll('[data-half]').forEach((box) => {
    const left = box.dataset.half === 'left';
    place(box, left ? players.slice(0, leftCount) : players.slice(leftCount), left ? 0 : leftCount);
  });
  document.querySelectorAll('[data-set-count]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.setCount) === count));
    b.addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.set('n', b.dataset.setCount);
      location.href = u.toString();
    });
  });
  document.querySelectorAll('[data-mouse]').forEach((el) => (el.innerHTML = MOUSE));
  // 给后三个画面（掷骰 / 指认 / 揭晓）的页面脚本用
  window.CT = { players, count, die, MOUSE };
})();

(function () {
  const SIZES = { desktop: [1280, 800], mobile: [390, 844] };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
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

  document.querySelectorAll('[data-set-size]').forEach((b) =>
    b.addEventListener('click', () => {
      device.dataset.size = b.dataset.setSize;
      document.querySelectorAll('[data-set-size]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      fit();
    }),
  );

  function applyText() {
    const t = body.dataset.time;
    document.querySelectorAll('[data-night]').forEach((el) => {
      el.textContent = t === 'day' ? el.dataset.day : el.dataset.night;
    });
  }

  function setTime(next) {
    if (body.dataset.time === next) return;
    const sweep = document.querySelector('.sweep');
    if (reduce || !sweep) {
      body.dataset.time = next;
      applyText();
      return;
    }
    sweep.dataset.to = next;
    sweep.classList.remove('run');
    void sweep.offsetWidth;
    sweep.classList.add('run');
    setTimeout(() => {
      body.dataset.time = next;
      applyText();
    }, 380);
  }
  document.querySelectorAll('[data-set-time]').forEach((b) =>
    b.addEventListener('click', () => {
      setTime(b.dataset.setTime);
      document.querySelectorAll('[data-set-time]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }),
  );

  function local(rect) {
    const d = device.getBoundingClientRect();
    return { x: (rect.left - d.left) / scale, y: (rect.top - d.top) / scale, w: rect.width / scale, h: rect.height / scale };
  }

  function shake() {
    if (reduce) return;
    device.animate(
      [{ translate: '0 0' }, { translate: '-4px 2px' }, { translate: '3px -2px' }, { translate: '-2px 1px' }, { translate: '0 0' }],
      { duration: 260, easing: 'ease-out' },
    );
  }

  const cheese = document.getElementById('cheese');
  const meSlot = document.querySelector('#me .seat-loot');
  const stealBtn = document.getElementById('act-steal');
  stealBtn?.addEventListener('click', () => {
    if (!cheese || cheese.classList.contains('taken')) return;
    stealBtn.disabled = true;
    const a = local(cheese.getBoundingClientRect());
    const b = local(meSlot.getBoundingClientRect());
    const ghost = cheese.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.classList.add('flying');
    Object.assign(ghost.style, { position: 'absolute', left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px', margin: 0, zIndex: 50 });
    device.appendChild(ghost);
    cheese.classList.add('taken');
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    // 席位上有实际尺寸的落点时（B2），飞行终点缩到落点大小，落地后放一个同形状的小奶酪，避免大小跳变
    const end = b.w ? b.w / a.w : 0.3;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      ghost.remove();
      if (b.w) {
        const mini = cheese.cloneNode(true);
        mini.removeAttribute('id');
        mini.classList.remove('taken');
        meSlot.appendChild(mini);
      }
      document.getElementById('me').classList.add('has-cheese');
      shake();
      document.querySelectorAll('[data-after-steal]').forEach((el) => (el.textContent = el.dataset.afterSteal));
    };
    if (reduce) return land();
    setTimeout(land, 650);
    ghost
      .animate(
        [
          { transform: 'translate(0,0) scale(1) rotate(0)' },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 150}px) scale(1.35) rotate(-14deg)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(10deg)` },
        ],
        { duration: 580, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
      .finished.then(land);
  });

  const peekBtn = document.getElementById('act-peek');
  peekBtn?.addEventListener('click', () => {
    body.classList.toggle('peeking');
    peekBtn.setAttribute('aria-pressed', body.classList.contains('peeking'));
  });
  document.querySelectorAll('.seat:not(#me)').forEach((s) =>
    s.addEventListener('click', () => {
      if (!body.classList.contains('peeking')) return;
      body.classList.remove('peeking');
      peekBtn?.setAttribute('aria-pressed', 'false');
      s.classList.add('revealed');
    }),
  );

  document.getElementById('reset')?.addEventListener('click', () => location.reload());

  // 通用飞行：把 node 从 fromEl 的位置抛物线飞到 toEl，终点缩到 toEl 的大小；done 在落地时调用一次
  function fly(node, fromEl, toEl, done, arc = 150) {
    const a = local(fromEl.getBoundingClientRect());
    const b = local(toEl.getBoundingClientRect());
    Object.assign(node.style, { position: 'absolute', left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px', margin: 0, zIndex: 50, pointerEvents: 'none' });
    device.appendChild(node);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      node.remove();
      done?.();
    };
    if (reduce) return land();
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const end = b.w / a.w;
    setTimeout(land, 650);
    node.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(${Math.max(end, 1) * 1.2}) rotate(-12deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(8deg)` },
      ],
      { duration: 580, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    ).finished.then(land);
  }
  Object.assign(window.CT || (window.CT = {}), { fly, shake, reduce, setTime, applyText });

  applyText();
  fit();

  // 仅供自动检查：列出席位与主要区块的重叠和出框（单位为设计像素）
  window.__layoutCheck = () => {
    const d = device.getBoundingClientRect();
    const W = parseFloat(device.style.width), H = parseFloat(device.style.height), s = d.width / W;
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: (b.left - d.left) / s, y: (b.top - d.top) / s, w: b.width / s, h: b.height / s }; };
    const boxes = [...document.querySelectorAll('.seat')].map((e, i) => ({ n: 'seat' + i, ...r(e) }))
      .concat([...document.querySelectorAll('[data-box]')].map((e) => ({ n: e.dataset.box, ...r(e) })));
    const hit = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) hit.push(`${a.n}×${b.n} ${Math.round(ox)}x${Math.round(oy)}`);
    }
    const out = boxes.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1).map((b) => `${b.n} out [${[b.x, b.y, b.w, b.h].map(Math.round)}]`);
    return { size: W + 'x' + H, hit, out };
  };
})();
