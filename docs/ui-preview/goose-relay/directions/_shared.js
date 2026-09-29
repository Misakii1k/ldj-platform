// 以鹅传鹅方向稿公用脚本：固定假数据、席位排布、接力连线、传棒飞行、倒计时、视口切换。只服务于静态预览，不进生产。
// 每个方向稿在引入本脚本前定义 window.DESIGN = { seat, layout, linkPath?, onState, batonSelector? }。
(function () {
  // 方向稿布局用：沿椭圆弧按弧长等距取 n 个点（θ 从 a0 到 a1，屏幕坐标系）
  window.GR = {
    ellipsePoints(cx, cy, rx, ry, n, a0 = Math.PI, a1 = 2 * Math.PI) {
      const steps = 400, pts = [], acc = [0];
      for (let k = 0; k <= steps; k++) {
        const t = a0 + ((a1 - a0) * k) / steps;
        pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
        if (k) acc.push(acc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      }
      const total = acc[steps];
      return Array.from({ length: n }, (_, i) => {
        const target = n === 1 ? 0 : (total * i) / (n - 1);
        let k = acc.findIndex((v) => v >= target);
        if (k < 0) k = steps;
        return { ...pts[k] };
      });
    },
  };
})();

(function () {
  const ALL = [
    { name: '阿杰', card: 'goose_010_king', goose: '国王鹅', head: true },
    { name: '小鱼干', card: 'goose_004_chef', goose: '厨师鹅' },
    { name: '可可', card: 'goose_016_ballerina', goose: '芭蕾舞鹅' },
    { name: '老王', card: 'goose_001_detective', goose: '侦探鹅' },
    { name: '糯米', card: 'goose_027_sushi', goose: '寿司鹅' },
    { name: 'Momo', card: 'goose_014_ninja', goose: '忍者鹅' },
    { name: '大橘', card: 'goose_003_pirate', goose: '海盗鹅' },
    { name: '一只很长昵称的鹅', card: 'goose_008_wizard', goose: '魔法师鹅' },
    { name: '小满', card: 'goose_009_samurai', goose: '武士鹅' },
  ];
  const params = new URLSearchParams(location.search);
  const n = Math.min(9, Math.max(5, Number(params.get('n')) || 7));
  // ?me=<棒次下标> 切换视角（默认第 4 棒老王）；第 6 棒是恶鹅（5 人局时为第 5 棒）
  const EVIL = Math.min(5, n - 1);
  const ME = params.has('me') ? Math.min(n - 1, Math.max(0, Number(params.get('me')) || 0)) : 3;
  const players = ALL.slice(0, n).map((p, i) => ({
    ...p, i, seatNo: i + 1, img: `img/${p.card}.png`, me: i === ME,
    role: i === 0 ? 'head' : i === EVIL ? 'evil' : 'white',
  }));
  const SIZES = { desktop: [1280, 800], mobile: [390, 844] };
  const RELAY_SECONDS = 30;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = window.DESIGN;
  const body = document.body;
  const device = document.querySelector('.device');
  const seatsBox = device.querySelector('.seats');
  const links = device.querySelector('svg.links');

  const state = { cur: 2, left: RELAY_SECONDS, busy: false };
  let scale = 1;

  // ---------- 席位 ----------
  const slots = players.map((p) => {
    const el = document.createElement('div');
    el.className = 'seat-slot';
    el.innerHTML = D.seat(p);
    seatsBox.appendChild(el);
    return el;
  });

  function layout() {
    const size = device.dataset.size;
    const [w, h] = SIZES[size];
    device.style.width = w + 'px';
    device.style.height = h + 'px';
    const pts = D.layout(size, n, w, h);
    slots.forEach((el, i) => {
      el.style.left = pts[i].x + 'px';
      el.style.top = pts[i].y + 'px';
      el.dataset.side = pts[i].side || '';
    });
    links.setAttribute('viewBox', `0 0 ${w} ${h}`);
    links.innerHTML = '';
    const layers = D.linkLayers || ['line'];
    for (let i = 0; i < n - 1; i++) {
      const d = D.linkPath ? D.linkPath(pts[i], pts[i + 1], i, size) : `M${pts[i].x} ${pts[i].y} L${pts[i + 1].x} ${pts[i + 1].y}`;
      for (const layer of layers) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.dataset.i = i;
        path.dataset.layer = layer;
        links.appendChild(path);
      }
    }
    fit();
    paint();
  }

  function fit() {
    const [w, h] = SIZES[device.dataset.size];
    scale = Math.max(0.2, Math.min((innerWidth - 32) / w, (innerHeight - 96) / h, 1));
    device.style.transform = `scale(${scale})`;
    device.parentElement.style.height = h * scale + 'px';
  }
  addEventListener('resize', fit);

  // ---------- 状态绘制 ----------
  function ctx() {
    const finished = state.cur >= n;
    const performer = players[state.cur];
    const watcher = players[state.cur + 1];
    const prev = players[state.cur - 1];
    let headline, hint;
    if (finished) {
      headline = '传递完毕';
      hint = '整条鹅链都演完了，下一步全员讨论';
    } else if (state.cur === ME) {
      headline = '轮到你表演！';
      hint = watcher ? `把刚才 ${prev ? prev.name : '头鹅'} 的动作原样演给 ${watcher.name} 看` : '你是末棒，演完就进入讨论';
    } else if (state.cur + 1 === ME) {
      headline = '下一棒就是你';
      hint = `盯紧 ${performer.name} 的动作，一会儿你要原样模仿`;
    } else {
      headline = `${performer.name} 正在表演`;
      hint = ME > state.cur
        ? `${watcher ? watcher.name + ' 在看。' : ''}你是第 ${ME + 1} 棒，还要等 ${ME - state.cur - 1} 棒`
        : '你已经传完了，安静看戏，别出声';
    }
    return {
      n, players, state, finished, headline, hint,
      performer: players[state.cur] || null,
      watcher: players[state.cur + 1] || null,
      me: players[ME],
      prev: players[state.cur - 1] || null,
      isMyTurn: state.cur === ME,
      isMyWatch: state.cur + 1 === ME,
      doneCount: Math.min(state.cur, n),
      size: device.dataset.size,
    };
  }

  function paint() {
    slots.forEach((el, i) => {
      const s = el.firstElementChild;
      s.classList.toggle('is-done', i < state.cur);
      s.classList.toggle('is-active', i === state.cur);
      s.classList.toggle('is-next', i === state.cur + 1);
      s.classList.toggle('is-me', i === ME);
      s.classList.toggle('is-head', !!players[i].head);
    });
    links.querySelectorAll('path').forEach((p) => {
      const i = Number(p.dataset.i);
      p.setAttribute('class', i < state.cur ? 'done' : i === state.cur ? 'next' : 'idle');
    });
    const c = ctx();
    body.dataset.turn = c.finished ? 'over' : c.isMyTurn ? 'mine' : c.isMyWatch ? 'watch' : 'wait';
    D.onState(c);
    const passBtn = document.getElementById('act-pass');
    if (passBtn) {
      passBtn.disabled = !c.isMyTurn || state.busy;
      passBtn.textContent = (D.passLabel && D.passLabel(c)) || (c.isMyTurn ? '表演完成，传给下一棒' : c.finished ? '传递完毕' : c.isMyWatch ? '仔细看，下一棒就是你' : `等待 ${c.performer.name} 表演…`);
    }
    paintClock();
  }

  function paintClock() {
    document.querySelectorAll('.countdown').forEach((cd) => {
      const fg = cd.querySelector('.ring-fg');
      const len = fg.getTotalLength();
      fg.style.strokeDasharray = len;
      fg.style.strokeDashoffset = len * (1 - state.left / RELAY_SECONDS);
      cd.querySelector('.num').textContent = state.cur >= n ? '—' : Math.ceil(state.left);
      cd.classList.toggle('last10', state.left <= 10 && state.cur < n);
      cd.classList.toggle('last5', state.left <= 5 && state.cur < n);
    });
  }

  setInterval(() => {
    if (state.busy || state.cur >= n) return;
    state.left = Math.max(0, state.left - 0.25);
    paintClock();
    if (state.left === 0) advance();
  }, 250);

  // ---------- 传棒飞行 ----------
  function local(rect) {
    const d = device.getBoundingClientRect();
    return { x: (rect.left - d.left) / scale, y: (rect.top - d.top) / scale, w: rect.width / scale, h: rect.height / scale };
  }
  function shake() {
    if (reduce) return;
    device.animate([{ translate: '0 0' }, { translate: '-3px 2px' }, { translate: '3px -1px' }, { translate: '0 0' }], { duration: 220, easing: 'ease-out' });
  }

  function advance() {
    if (state.busy || state.cur >= n) return;
    const from = slots[state.cur];
    const to = slots[state.cur + 1];
    const finish = () => {
      state.cur += 1;
      state.left = RELAY_SECONDS;
      state.busy = false;
      paint();
      const landed = slots[state.cur]?.firstElementChild;
      if (landed) {
        landed.classList.remove('pop');
        void landed.offsetWidth;
        landed.classList.add('pop');
      }
      document.querySelectorAll('[data-swap]').forEach((el) => {
        el.classList.remove('swap');
        void el.offsetWidth;
        el.classList.add('swap');
      });
      shake();
    };
    if (!to || reduce || !D.baton) return finish();
    state.busy = true;
    paint();
    const src = (D.batonSelector && from.querySelector(D.batonSelector)) || from.firstElementChild;
    const a = local(src.getBoundingClientRect());
    const tgt = (D.batonSelector && to.querySelector(D.batonSelector)) || to.firstElementChild;
    const b = local(tgt.getBoundingClientRect());
    const ghost = document.createElement('div');
    ghost.className = 'flying';
    ghost.innerHTML = D.baton ? D.baton() : '';
    device.appendChild(ghost);
    const gw = ghost.offsetWidth, gh = ghost.offsetHeight;
    const x0 = a.x + a.w / 2 - gw / 2, y0 = a.y + a.h / 2 - gh / 2;
    const x1 = b.x + b.w / 2 - gw / 2, y1 = b.y + b.h / 2 - gh / 2;
    const lift = Math.min(160, 60 + Math.hypot(x1 - x0, y1 - y0) * 0.35);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      ghost.remove();
      finish();
    };
    setTimeout(land, 640);
    ghost
      .animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(.6) rotate(0)` },
          { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) scale(1.25) rotate(-16deg)`, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px) scale(.8) rotate(8deg)` },
        ],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
      )
      .finished.then(land);
  }

  // ---------- 工具条与按钮 ----------
  document.getElementById('act-pass')?.addEventListener('click', advance);
  document.querySelectorAll('[data-set-me]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.setMe) === ME));
    b.addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.set('me', b.dataset.setMe);
      location.href = u.toString();
    });
  });
  document.querySelectorAll('[data-act="next"]').forEach((b) => b.addEventListener('click', advance));
  document.querySelectorAll('[data-act="myturn"]').forEach((b) =>
    b.addEventListener('click', () => {
      state.cur = ME;
      state.left = RELAY_SECONDS;
      paint();
    }),
  );
  document.querySelectorAll('[data-act="first"]').forEach((b) =>
    b.addEventListener('click', () => {
      state.cur = 0;
      state.left = RELAY_SECONDS;
      paint();
    }),
  );
  document.querySelectorAll('[data-act="last5"]').forEach((b) =>
    b.addEventListener('click', () => {
      state.left = 6;
      paintClock();
    }),
  );
  document.getElementById('reset')?.addEventListener('click', () => {
    state.cur = 2;
    state.left = RELAY_SECONDS;
    state.busy = false;
    paint();
  });
  document.querySelectorAll('[data-set-size]').forEach((b) =>
    b.addEventListener('click', () => {
      device.dataset.size = b.dataset.setSize;
      document.querySelectorAll('[data-set-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      layout();
    }),
  );
  document.querySelectorAll('[data-set-count]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.setCount) === n));
    b.addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.set('n', b.dataset.setCount);
      location.href = u.toString();
    });
  });

  layout();

  // 仅供自动检查：席位与 [data-box] 区块的重叠、出框（设计像素）
  window.__layoutCheck = () => {
    const d = device.getBoundingClientRect();
    const W = parseFloat(device.style.width), H = parseFloat(device.style.height), s = d.width / W;
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: (b.left - d.left) / s, y: (b.top - d.top) / s, w: b.width / s, h: b.height / s }; };
    const boxes = slots.map((e, i) => ({ n: 'seat' + i, ...r(e.firstElementChild) }))
      .concat([...device.querySelectorAll('[data-box]')].map((e) => ({ n: e.dataset.box, ...r(e) })));
    const hit = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) hit.push(`${a.n}×${b.n} ${Math.round(ox)}x${Math.round(oy)}`);
    }
    const out = boxes.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1).map((b) => `${b.n} out [${[b.x, b.y, b.w, b.h].map(Math.round)}]`);
    return { size: W + 'x' + H, n, hit, out };
  };
})();
