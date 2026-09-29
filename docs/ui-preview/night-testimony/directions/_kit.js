// 谁是狱警 · 定稿世界（C 牛皮纸档案室）后续阶段画面公用脚本：假数据、视角切换、档案袋席位、飞行。只服务于静态预览，不进生产。
// 页面约定同伪人测试 _kit.js：工具条 data-param / data-value；席位容器 data-seats="all"；页面设置 KIT.status / KIT.decorate 后调用 KIT.render()。
(function () {
  const params = new URLSearchParams(location.search);
  const ALL = [
    { name: '阿杰', c: '#f29a7a', crime: 'arson' },
    { name: '小鱼干', c: '#f7c84b', crime: 'office_theft' },
    { name: '可可', c: '#8fd3b6', crime: 'noise_nuisance' },
    { name: '老王', c: '#9cc7f0', warden: true },
    { name: 'Momo', c: '#f6b7cf', crime: 'dine_and_dash' },
    { name: '一个名字特别长的囚犯', c: '#b9a4e6', crime: 'hacker' },
  ];
  const CRIMES = {
    arson: '恶意纵火', office_theft: '偷吃外卖', noise_nuisance: '深夜扰民', dine_and_dash: '吃霸王餐', hacker: '黑客入侵',
    graffiti: '乱涂乱画', fraud: '电信诈骗',
  };
  const count = Number(params.get('n')) === 6 ? 6 : 5;
  const players = ALL.slice(0, count).map((p, i) => ({ ...p, seat: i + 1, no: String(7 + i * 11).padStart(3, '0') }));
  // 多出来的一张罪行（规则：发牌时多抽一张，猜罪阶段混进候选里当干扰项）
  const EXTRA = count === 6 ? 'graffiti' : 'hacker';
  const YES = { '阿杰': 2, '小鱼干': 1, '可可': 3, '老王': 2, 'Momo': 1, '一个名字特别长的囚犯': 1 };
  players.forEach((p) => (p.yes = YES[p.name]));

  const BUST = `<svg class="bust" viewBox="0 0 80 80" aria-hidden="true">
    <path d="M8 80 C8 58 22 50 40 50 C58 50 72 58 72 80 Z" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="40" cy="30" r="17" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5"/>
  </svg>`;
  const MAX_YES = 3;

  const KIT = { players, params, count, CRIMES, EXTRA, BUST, MAX_YES, status: () => '', decorate: () => {} };
  KIT.byName = (n) => players.find((p) => p.name === n);
  KIT.warden = players.find((p) => p.warden);

  function seatHtml(p) {
    const pips = Array.from({ length: MAX_YES }, (_, k) => `<i class="${k < p.yes ? 'used' : ''}"></i>`).join('');
    return `<span class="no">${p.seat}</span><div class="av">${BUST}</div>
      <div class="nm">${p.name}${p.me ? '<em class="you">你</em>' : ''}</div>
      <div class="st">${KIT.status(p)}</div>
      <div class="yes">${pips}</div>
      <span class="inmate">#${p.no}</span>`;
  }
  const seatEls = new Map();
  document.querySelectorAll('[data-seats]').forEach((box) => {
    players.forEach((p) => {
      const el = document.createElement('div');
      el.dataset.name = p.name;
      box.appendChild(el);
      seatEls.set(p, el);
    });
  });
  KIT.render = function () {
    seatEls.forEach((el, p) => {
      el.className = 'seat';
      if (p.me) el.classList.add('me');
      el.style.setProperty('--seat-c', p.c);
      el.innerHTML = seatHtml(p);
      KIT.decorate(el, p);
    });
  };
  KIT.seatOf = (p) => seatEls.get(p);
  KIT.bind = (key, value) => document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => (el.textContent = value));

  // ---------- 工具条 ----------
  const SIZES = { desktop: [1280, 800], mobile: [390, 844] };
  const device = document.querySelector('.device');
  device.dataset.size = params.get('size') === 'mobile' ? 'mobile' : 'desktop';
  device.dataset.count = String(count);
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
  document.querySelectorAll('[data-param]').forEach((b) => {
    const k = b.dataset.param;
    const first = document.querySelector(`[data-param="${k}"]`).dataset.value;
    const cur = k === 'size' ? device.dataset.size : k === 'n' ? String(count) : params.get(k) || first;
    b.setAttribute('aria-pressed', String(cur === b.dataset.value));
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

  KIT.ring = function (total, start) {
    const rings = document.querySelectorAll('[data-ring]');
    if (total == null) { rings.forEach((r) => ((r.closest('.ring-box') || r).hidden = true)); return; }
    let left = start ?? total;
    const paint = () => rings.forEach((r) => {
      r.style.setProperty('--p', String(left / total));
      r.classList.toggle('warn', left <= 10);
      r.querySelector('span').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    });
    paint();
    setInterval(() => { if (left > 0) { left--; paint(); } }, 1000);
    document.getElementById('act-hurry')?.addEventListener('click', () => { left = 10; paint(); });
  };

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
      setTimeout(end, dur + 80);
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
  KIT.device = device;
  window.KIT = KIT;
})();
