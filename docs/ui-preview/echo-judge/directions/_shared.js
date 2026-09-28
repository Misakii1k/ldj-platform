// 伪人测试方向稿公用脚本：假数据、席位渲染、视口切换、倒计时、交棒飞行。只服务于静态预览，不进生产。
// 固定假数据：第 2 轮，老王当审判长；发言顺序从审判长下家起；可可已说完，现在轮到「你」。
(function () {
  const ALL = [
    { name: '阿杰', score: 3, c: '#f29a7a' },
    { name: '老王', score: 5, c: '#9cc7f0', judge: true },
    { name: '可可', score: 2, c: '#8fd3b6' },
    { name: '小鱼干', score: 4, c: '#f7c84b', me: true },
    { name: 'Momo', score: 1, c: '#f6b7cf' },
    { name: '糯米', score: 2, c: '#b9a4e6' },
    { name: '大橘', score: 0, c: '#f0b35c' },
    { name: '一个名字特别长的玩家', score: 3, c: '#c9e27a' },
    { name: '阿May', score: 1, c: '#7fd1d8' },
  ];
  const count = Number(new URLSearchParams(location.search).get('n')) === 9 ? 9 : 6;
  const players = ALL.slice(0, count).map((p, i) => ({ ...p, seat: i + 1, id: 'p' + (i + 1) }));
  const judgeIdx = players.findIndex((p) => p.judge);
  const order = [];
  for (let k = 1; k < players.length; k++) order.push(players[(judgeIdx + k) % players.length]);
  const state = { speaking: 1, answered: 1 }; // order[0] 可可已说完，order[1] 是你

  const QUESTION = '童年时期你最害怕、但现在觉得荒诞好笑的一件事或一个物品是什么？';
  const TRIGGER = '雨伞';

  const BUST = `<svg class="bust" viewBox="0 0 80 80" aria-hidden="true">
    <path d="M8 80 C8 58 22 50 40 50 C58 50 72 58 72 80 Z" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="40" cy="30" r="17" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5"/>
  </svg>`;

  function statusOf(p) {
    if (p.judge) return '审判长';
    const i = order.indexOf(p);
    if (i < state.answered) return '已发言';
    if (i === state.speaking) return '发言中';
    return '等待';
  }
  function seatHtml(p) {
    return `<span class="no">${p.seat}</span><div class="av">${BUST}</div>
      <div class="nm">${p.name}${p.me ? '<em class="you">你</em>' : ''}</div>
      <div class="st">${statusOf(p)}</div><div class="sc numeral">${p.score}</div><span class="mic-slot"></span>`;
  }
  function renderSeat(el, p) {
    el.className = 'seat';
    if (p.judge) el.classList.add('judge');
    const i = order.indexOf(p);
    if (!p.judge && i < state.answered) el.classList.add('done');
    if (i === state.speaking) el.classList.add('speaking');
    if (p.me) el.classList.add('me');
    el.style.setProperty('--seat-c', p.c);
    el.innerHTML = seatHtml(p);
  }
  const seatEls = new Map();
  function renderSeats() {
    seatEls.forEach((els, p) => els.forEach((el) => renderSeat(el, p)));
  }
  const half = Math.ceil(players.length / 2);
  const groups = {
    all: players,
    left: players.slice(0, half),
    right: players.slice(half),
    // 竖屏上下两条：上条放前半，下条放后半
    top: players.slice(0, half),
    bottom: players.slice(half),
    others: order,
    judge: [players[judgeIdx]],
    // 审判长单独摆放时，其余人按发言顺序分两半
    oleft: order.slice(0, Math.ceil(order.length / 2)),
    oright: order.slice(Math.ceil(order.length / 2)),
  };
  document.querySelectorAll('[data-seats]').forEach((box) => {
    (groups[box.dataset.seats] || players).forEach((p) => {
      const el = document.createElement('div');
      el.dataset.id = p.id;
      box.appendChild(el);
      if (!seatEls.has(p)) seatEls.set(p, []);
      seatEls.get(p).push(el);
    });
  });

  function bind(key, value) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => (el.textContent = value));
  }
  function renderPips() {
    document.querySelectorAll('[data-pips]').forEach((box) => {
      box.innerHTML = order
        .map((p, i) => `<span class="pip ${i < state.answered ? 'done' : ''} ${i === state.speaking ? 'now' : ''}" style="--seat-c:${p.c}" title="${p.name}"></span>`)
        .join('');
    });
  }
  function renderText() {
    const sp = order[state.speaking];
    const judge = players[judgeIdx];
    bind('question', QUESTION);
    bind('trigger', TRIGGER);
    bind('judge', judge.name);
    bind('speaker', sp ? sp.name : '全员已发言');
    bind('answered', String(state.answered));
    bind('total', String(order.length));
    bind('round', '2');
    bind('rounds', String(players.length));
    const meTurn = sp && sp.me;
    bind('dock-title', meTurn ? '轮到你了' : sp ? `${sp.name} 正在回答` : '全员答完，等审判长裁决');
    bind('dock-sub', meTurn ? `你是伪人：把「${TRIGGER}」自然地说进回答里` : '仔细听，谁在硬塞词？');
    document.querySelectorAll('#act-done').forEach((b) => (b.hidden = !meTurn));
  }
  function render() { renderSeats(); renderPips(); renderText(); }
  render();

  // ---------- 视口 ----------
  const SIZES = { desktop: [1280, 800], mobile: [390, 844] };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  fit();
  document.querySelectorAll('[data-set-size]').forEach((b) =>
    b.addEventListener('click', () => {
      device.dataset.size = b.dataset.setSize;
      document.querySelectorAll('[data-set-size]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      fit();
    }),
  );
  document.querySelectorAll('[data-set-count]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.setCount) === count));
    b.addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.set('n', b.dataset.setCount);
      location.href = u.toString();
    });
  });
  document.getElementById('reset')?.addEventListener('click', () => location.reload());

  // ---------- 倒计时 ----------
  let left = 75;
  function paintRing() {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    document.querySelectorAll('[data-ring]').forEach((r) => {
      r.style.setProperty('--p', String(left / 90));
      r.classList.toggle('warn', left <= 10);
      r.querySelector('span').textContent = `${mm}:${ss}`;
    });
  }
  paintRing();
  setInterval(() => { if (left > 0) { left--; paintRing(); } }, 1000);
  document.getElementById('act-hurry')?.addEventListener('click', () => { left = 10; paintRing(); });

  // ---------- 身份条 ----------
  document.querySelectorAll('[data-secret]').forEach((el) => el.addEventListener('click', () => el.classList.toggle('hidden')));

  // ---------- 交棒：话筒从旧发言人飞到新发言人 ----------
  function local(rect) {
    const d = device.getBoundingClientRect();
    return { x: (rect.left - d.left) / scale, y: (rect.top - d.top) / scale, w: rect.width / scale, h: rect.height / scale };
  }
  function visibleSeat(p) {
    return (seatEls.get(p) || []).find((el) => el.offsetParent !== null);
  }
  function handoff() {
    const from = order[state.speaking];
    if (!from) return;
    const to = order[state.speaking + 1];
    const tpl = document.getElementById('token');
    const fromEl = visibleSeat(from);
    state.answered = state.speaking + 1;
    state.speaking += 1;
    if (!to || !tpl || !fromEl || reduce) {
      render();
      document.dispatchEvent(new CustomEvent('handoff', { detail: { from, to } }));
      return;
    }
    const a = local(fromEl.getBoundingClientRect());
    render();
    const toEl = visibleSeat(to);
    const b = local(toEl.getBoundingClientRect());
    const ghost = tpl.content.firstElementChild.cloneNode(true);
    ghost.classList.add('flying');
    device.appendChild(ghost);
    const gw = ghost.offsetWidth;
    const gh = ghost.offsetHeight;
    const sx = a.x + a.w / 2 - gw / 2;
    const sy = a.y + a.h / 2 - gh / 2;
    ghost.style.left = sx + 'px';
    ghost.style.top = sy + 'px';
    const dx = b.x + b.w / 2 - gw / 2 - sx;
    const dy = b.y + b.h / 2 - gh / 2 - sy;
    toEl.classList.remove('speaking');
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      ghost.remove();
      toEl.classList.add('speaking');
      toEl.animate([{ transform: 'scale(1.16)' }, { transform: 'translateY(-3px) scale(1.04)' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      document.dispatchEvent(new CustomEvent('handoff', { detail: { from, to } }));
    };
    setTimeout(land, 640);
    ghost
      .animate(
        [
          { transform: 'translate(0,0) scale(1) rotate(0)' },
          { transform: `translate(${dx / 2}px, ${dy / 2 - 90}px) scale(1.5) rotate(-20deg)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0)` },
        ],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
      .finished.then(land);
  }
  document.querySelectorAll('#act-done, #act-next').forEach((b) => b.addEventListener('click', handoff));

  window.EJ = { players, order, state, count };
})();
