// 伪人测试 · 定稿世界（B 老式法庭）后续阶段画面公用脚本：假数据、视角切换、席位挂载、飞行。只服务于静态预览，不进生产。
// 页面约定：
//   工具条按钮写 data-param="键" data-value="值"，点击即改 URL 参数（size 不刷新，其余刷新重播）；
//   席位容器写 data-seats="judge|oleft|oright|all|others"；
//   页面脚本设置 KIT.status(p) / KIT.decorate(el, p) 后调用 KIT.render()。
(function () {
  const params = new URLSearchParams(location.search);
  const ALL = [
    { name: '阿杰', score: 3, c: '#f29a7a' },
    { name: '老王', score: 5, c: '#9cc7f0', judge: true },
    { name: '可可', score: 2, c: '#8fd3b6' },
    { name: '小鱼干', score: 4, c: '#f7c84b' },
    { name: 'Momo', score: 1, c: '#f6b7cf' },
    { name: '糯米', score: 2, c: '#b9a4e6' },
    { name: '大橘', score: 0, c: '#f0b35c' },
    { name: '一个名字特别长的玩家', score: 3, c: '#c9e27a' },
    { name: '阿May', score: 1, c: '#7fd1d8' },
  ];
  // 本轮身份（规则：审判长恒为人类；其余人出题阶段自选，伪人各得一个不重复暗号）
  const IMPOSTORS = { '小鱼干': '雨伞', 'Momo': '风筝', '大橘': '纽扣' };

  const count = Number(params.get('n')) === 9 ? 9 : 6;
  const view = params.get('v') || 'judge'; // judge = 你是审判长；player = 你坐在旁听席
  const players = ALL.slice(0, count).map((p, i) => ({
    ...p, seat: i + 1, id: 'p' + (i + 1),
    role: IMPOSTORS[p.name] ? 'impostor' : 'human', trigger: IMPOSTORS[p.name] || null,
  }));
  const judge = players.find((p) => p.judge);
  const judgeIdx = players.indexOf(judge);
  const order = [];
  for (let k = 1; k < players.length; k++) order.push(players[(judgeIdx + k) % players.length]);
  const me = view === 'judge' ? judge : players.find((p) => p.name === '小鱼干');
  me.me = true;

  const BUST = `<svg class="bust" viewBox="0 0 80 80" aria-hidden="true">
    <path d="M8 80 C8 58 22 50 40 50 C58 50 72 58 72 80 Z" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="40" cy="30" r="17" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5"/>
  </svg>`;

  const KIT = {
    players, order, judge, me, view, count, params, BUST,
    status: (p) => (p.judge ? '审判长' : ''),
    decorate: () => {},
    score: (p) => p.score,
  };

  function seatHtml(p) {
    return `<span class="no">${p.seat}</span><div class="av">${BUST}</div>
      <div class="nm">${p.name}${p.me ? '<em class="you">你</em>' : ''}</div>
      <div class="st">${KIT.status(p)}</div><div class="sc numeral">${KIT.score(p)}</div>`;
  }
  const seatEls = new Map();
  const groups = {
    all: players,
    others: order,
    judge: [judge],
    oleft: order.slice(0, Math.ceil(order.length / 2)),
    oright: order.slice(Math.ceil(order.length / 2)),
  };
  document.querySelectorAll('[data-seats]').forEach((box) => {
    (groups[box.dataset.seats] || players).forEach((p) => {
      const el = document.createElement('div');
      el.dataset.name = p.name;
      box.appendChild(el);
      if (!seatEls.has(p)) seatEls.set(p, []);
      seatEls.get(p).push(el);
    });
  });
  KIT.render = function () {
    seatEls.forEach((els, p) =>
      els.forEach((el) => {
        el.className = 'seat';
        if (p.judge) el.classList.add('judge');
        if (p.me) el.classList.add('me');
        el.style.setProperty('--seat-c', p.c);
        el.innerHTML = seatHtml(p);
        KIT.decorate(el, p);
      }),
    );
  };
  KIT.seatOf = (p) => (seatEls.get(p) || []).find((el) => el.offsetParent !== null);
  KIT.bind = (key, value) => document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => (el.textContent = value));

  // ---------- 工具条 ----------
  const SIZES = { desktop: [1280, 800], mobile: [390, 844] };
  const device = document.querySelector('.device');
  device.dataset.size = params.get('size') === 'mobile' ? 'mobile' : 'desktop';
  device.dataset.count = String(count);
  device.dataset.view = view;
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
  fit();
  const current = (k) => params.get(k) || document.querySelector(`[data-param="${k}"]`)?.dataset.value;
  document.querySelectorAll('[data-param]').forEach((b) => {
    const k = b.dataset.param;
    b.setAttribute('aria-pressed', String(current(k) === b.dataset.value || (k === 'n' && String(count) === b.dataset.value) || (k === 'size' && device.dataset.size === b.dataset.value)));
    b.addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.set(k, b.dataset.value);
      if (k === 'size') {
        history.replaceState(null, '', u);
        device.dataset.size = b.dataset.value;
        document.querySelectorAll('[data-param="size"]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        fit();
        return;
      }
      location.href = u.toString();
    });
  });
  document.getElementById('reset')?.addEventListener('click', () => location.reload());
  document.querySelectorAll('[data-secret]').forEach((el) => el.addEventListener('click', () => el.classList.toggle('hidden')));

  // ---------- 倒计时（seconds 为 null 表示本阶段不计时，环隐藏） ----------
  KIT.ring = function (total, start) {
    const rings = document.querySelectorAll('[data-ring]');
    if (total == null) { rings.forEach((r) => (r.closest('.ring-box') || r).hidden = true); return; }
    let left = start ?? total;
    const paint = () => rings.forEach((r) => {
      r.style.setProperty('--p', String(left / total));
      r.classList.toggle('warn', left <= 10);
      r.querySelector('span').textContent = `00:${String(left).padStart(2, '0')}`;
    });
    paint();
    setInterval(() => { if (left > 0) { left--; paint(); } }, 1000);
    document.getElementById('act-hurry')?.addEventListener('click', () => { left = 10; paint(); });
  };

  // ---------- 飞行 / 节奏 ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  KIT.reduce = reduce;
  function local(rect) {
    const d = device.getBoundingClientRect();
    return { x: (rect.left - d.left) / scale, y: (rect.top - d.top) / scale, w: rect.width / scale, h: rect.height / scale };
  }
  KIT.fly = function (fromEl, toEl, ghost, { arc = 80, spin = -16, dur = 520 } = {}) {
    return new Promise((done) => {
      if (!fromEl || !toEl || reduce) return done();
      const a = local(fromEl.getBoundingClientRect());
      const b = local(toEl.getBoundingClientRect());
      ghost.classList.add('flying');
      device.appendChild(ghost);
      const gw = ghost.offsetWidth, gh = ghost.offsetHeight;
      const sx = a.x + a.w / 2 - gw / 2, sy = a.y + a.h / 2 - gh / 2;
      Object.assign(ghost.style, { left: sx + 'px', top: sy + 'px' });
      const dx = b.x + b.w / 2 - gw / 2 - sx, dy = b.y + b.h / 2 - gh / 2 - sy;
      let ok = false;
      const end = () => { if (ok) return; ok = true; ghost.remove(); done(); };
      setTimeout(end, dur + 80); // 后台标签页里 WAAPI 会暂停，靠这个兜底落地
      ghost.animate(
        [
          { transform: 'translate(0,0) scale(.9) rotate(0)' },
          { transform: `translate(${dx / 2}px, ${dy / 2 - arc}px) scale(1.3) rotate(${spin}deg)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0)` },
        ],
        { duration: dur, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      ).finished.then(end);
    });
  };
  KIT.wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
  KIT.shake = () => { if (!reduce) device.animate([{ translate: '0 0' }, { translate: '-5px 3px' }, { translate: '4px -2px' }, { translate: '0 0' }], { duration: 260 }); };
  KIT.gavel = () => {
    const g = document.getElementById('gavel');
    if (!g) return;
    g.classList.remove('hit'); void g.getBoundingClientRect(); g.classList.add('hit');
  };
  KIT.device = device;
  window.KIT = KIT;
})();
