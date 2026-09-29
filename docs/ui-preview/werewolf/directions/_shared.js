/* 狼人杀 · 剧场方向稿公共脚本：假数据、席位卡、倒计时、交麦飞行、昼夜切换、视口缩放。
 * 每个方向稿只需定义 window.LAYOUT(ctx) 把席位卡放进自己的构图里。 */
(function () {
  const NAMES = ['月下听风', '阿澈', '小鹿乱撞', 'Kiki', '夜行的猫头鹰', '团子', '老周', '星期八', '白桃乌龙', '阿木', '三分糖', '北岛'];
  const HUES = [8, 32, 205, 280, 150, 45, 0, 190, 330, 100, 260, 20];
  const SELF_NO = 6;
  // 第 2 天白天：2 号第 1 夜出局；12 人局另有 12 号第 1 天被放逐
  const DEAD = { 9: { 2: '第 1 夜出局' }, 12: { 2: '第 1 夜出局', 12: '第 1 天放逐' } };
  const TOTAL_SECONDS = 90;

  const state = { size: 'desktop', count: 12, time: 'day', speaker: 5, spoken: new Set([3, 4]), left: 47 };
  const seatEls = new Map();

  function avatarSvg(no) {
    const h = HUES[(no - 1) % HUES.length];
    return `<svg viewBox="0 0 48 48" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="48" height="48" fill="hsl(${h} 45% 32%)"/>
      <circle cx="24" cy="15" r="18" fill="hsl(${h} 60% 45% / .35)"/>
      <circle cx="24" cy="20" r="9" fill="hsl(${h} 30% 14%)"/>
      <path d="M8 48 Q10 31 24 31 Q38 31 40 48 Z" fill="hsl(${h} 30% 14%)"/>
      <path d="M17 19 Q20 16 23 19 M25 19 Q28 16 31 19" stroke="hsl(${h} 70% 80% / .8)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  function players() {
    const dead = DEAD[state.count];
    return NAMES.slice(0, state.count).map((name, i) => {
      const no = i + 1;
      return { no, name, self: no === SELF_NO, dead: dead[no] || null };
    });
  }

  function nextSpeaker(from) {
    const list = players();
    for (let step = 1; step <= list.length; step += 1) {
      const p = list[(from - 1 + step) % list.length];
      if (!p.dead && !state.spoken.has(p.no) && p.no !== from) return p.no;
    }
    return null;
  }

  function seatTag(p) {
    if (p.dead) return p.dead;
    if (p.no === state.speaker) return '🎙 发言中';
    if (p.no === nextSpeaker(state.speaker)) return '下一位';
    if (state.spoken.has(p.no)) return '已发言';
    return '待发言';
  }

  function makeSeat(p, compact) {
    const el = document.createElement('div');
    el.className = 'seat' + (compact ? ' compact' : '');
    el.dataset.no = p.no;
    el.innerHTML = `<span class="no">${p.no}</span>
      <span class="ava">${avatarSvg(p.no)}</span>
      <span class="txt"><span class="name">${p.name}</span><span class="tag"></span></span>
      ${p.self ? '<span class="me">你</span>' : ''}${p.dead ? '<span class="rose" aria-hidden="true">🥀</span>' : ''}`;
    seatEls.set(p.no, el);
    return el;
  }

  function refreshSeats() {
    if (window.CUSTOM_FLOW) return; // 自带流程的方向稿（如入夜）自己刷新席位
    const next = nextSpeaker(state.speaker);
    for (const p of players()) {
      const el = seatEls.get(p.no);
      if (!el) continue;
      el.classList.toggle('is-speaking', p.no === state.speaker);
      el.classList.toggle('is-next', p.no === next);
      el.classList.toggle('is-self', p.self);
      el.classList.toggle('is-dead', Boolean(p.dead));
      el.querySelector('.tag').textContent = seatTag(p);
    }
  }

  function refreshSpeaker(animate) {
    const box = document.querySelector('.speaker');
    if (!box) return;
    const p = players().find((x) => x.no === state.speaker);
    const alive = players().filter((x) => !x.dead);
    const order = state.spoken.size + 1;
    box.querySelector('.portrait').innerHTML = avatarSvg(p.no);
    box.querySelector('.big-name').textContent = p.self ? '轮到你了' : p.name;
    box.querySelector('.sub').innerHTML = p.self
      ? `<b>${p.no}</b> 号 · 你 · 第 <b>${order}</b> / ${alive.length} 位发言`
      : `<b>${p.no}</b> 号 · 第 <b>${order}</b> / ${alive.length} 位发言`;
    if (animate) {
      box.classList.remove('slam');
      void box.offsetWidth;
      box.classList.add('slam');
    }
    refreshDock();
  }

  function refreshDock() {
    if (window.CUSTOM_FLOW) return;
    const dock = document.querySelector('.dock');
    if (!dock) return;
    const p = players().find((x) => x.no === state.speaker);
    const selfTurn = Boolean(p && p.self);
    const next = nextSpeaker(state.speaker);
    dock.querySelector('.info strong').textContent = state.time === 'night'
      ? '天黑请闭眼'
      : selfTurn ? '轮到你发言' : `${p.no} 号 ${p.name} 正在发言`;
    dock.querySelector('.info span').textContent = state.time === 'night'
      ? '等待法官唤醒你的身份'
      : selfTurn ? '说完点右边的黄色按钮把麦交给下一位' : next === SELF_NO ? '下一位就是你，先想好怎么说' : '点席位可以查看玩家信息';
    const cta = dock.querySelector('[data-cta]');
    cta.hidden = !(selfTurn && state.time === 'day');
  }

  // ── 倒计时 ──
  let timerEl = null;
  function buildTimer() {
    const host = document.querySelector('[data-timer]');
    if (!host) return;
    // 方向稿自带进度路径（如拱形海报框）：沿用它的 path.bar，不重建
    const customBar = host.querySelector('path.bar');
    if (customBar) {
      timerEl = { root: host, bar: customBar, num: host.querySelector('.num'), c: customBar.getTotalLength() };
      customBar.style.strokeDasharray = String(timerEl.c);
      paintTimer();
      return;
    }
    const r = Number(host.dataset.timer) || 34;
    const c = 2 * Math.PI * r;
    const s = r * 2 + 10;
    host.innerHTML = `<div class="timer"><svg width="${s}" height="${s}"><circle class="track" cx="${s / 2}" cy="${s / 2}" r="${r}" stroke-width="5"/><circle class="bar" cx="${s / 2}" cy="${s / 2}" r="${r}" stroke-width="5" stroke-dasharray="${c}"/></svg><span class="num"></span></div>`;
    timerEl = { root: host.firstElementChild, bar: host.querySelector('.bar'), num: host.querySelector('.num'), c };
    paintTimer();
  }
  function paintTimer() {
    if (!timerEl) return;
    const left = Math.max(0, state.left);
    timerEl.num.textContent = left;
    timerEl.bar.style.strokeDashoffset = String(timerEl.c * (1 - left / (state.total || TOTAL_SECONDS)));
    timerEl.root.classList.toggle('warn', left <= 10 && left > 5);
    timerEl.root.classList.toggle('crit', left <= 5 && left > 0);
  }
  setInterval(() => {
    if (state.time !== 'day' && !window.CUSTOM_FLOW) return;
    if (state.left > 0) { state.left -= 1; paintTimer(); }
  }, 1000);

  // ── 交麦飞行 ──
  function scaleOf(device) {
    return device.getBoundingClientRect().width / device.offsetWidth || 1;
  }
  function centerIn(device, el) {
    const d = device.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = scaleOf(device);
    return { x: (r.left + r.width / 2 - d.left) / k, y: (r.top + r.height / 2 - d.top) / k };
  }
  function passMic() {
    if (state.time !== 'day') return;
    const next = nextSpeaker(state.speaker);
    if (!next) { resetSpeech(); return; }
    const device = document.querySelector('.device');
    const from = seatEls.get(state.speaker);
    const to = seatEls.get(next);
    const a = centerIn(device, from);
    const b = centerIn(device, to);
    const fly = document.createElement('div');
    fly.className = 'flyer';
    fly.textContent = '🎙';
    device.appendChild(fly);
    const lift = Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) * 0.35);
    const anim = fly.animate([
      { transform: `translate(${a.x}px, ${a.y}px) scale(.6)` },
      { transform: `translate(${(a.x + b.x) / 2}px, ${(a.y + b.y) / 2 - lift}px) scale(1.25)`, offset: .5 },
      { transform: `translate(${b.x}px, ${b.y}px) scale(1)` },
    ], { duration: 560, easing: 'cubic-bezier(.5,0,.3,1)' });
    let landed = false;
    const onLand = () => {
      if (landed) return;
      landed = true;
      fly.remove();
      state.spoken.add(state.speaker);
      state.speaker = next;
      state.left = TOTAL_SECONDS;
      paintTimer();
      refreshSeats();
      refreshSpeaker(true);
      to.classList.remove('land'); void to.offsetWidth; to.classList.add('land');
      device.classList.remove('shake'); void device.offsetWidth; device.classList.add('shake');
    };
    anim.onfinish = onLand;
    setTimeout(onLand, 700); // 后台标签页动画不推进时兜底
    fly.style.left = '0'; fly.style.top = '0';
  }
  function resetSpeech() {
    state.speaker = 5; state.spoken = new Set([3, 4]); state.left = 47;
    paintTimer(); refreshSeats(); refreshSpeaker(true);
  }

  // ── 昼夜 ──
  function setTime(t) {
    state.time = t;
    document.body.dataset.time = t;
    press('[data-set-time]', 'setTime', t);
    if (t === 'day') setTimeout(() => refreshSpeaker(true), 500);
    refreshDock();
  }

  // ── 渲染与缩放 ──
  function render() {
    seatEls.clear();
    const device = document.querySelector('.device');
    device.dataset.size = state.size;
    device.dataset.count = state.count;
    window.LAYOUT({ size: state.size, count: state.count, players: players(), makeSeat, device });
    buildTimer();
    refreshSeats();
    refreshSpeaker(false);
    if (window.AFTER_RENDER) window.AFTER_RENDER();
    fit();
  }
  function fit() {
    const device = document.querySelector('.device');
    const wrap = document.querySelector('.stage-wrap');
    const k = Math.min(1, (wrap.clientWidth - 24) / device.offsetWidth, (wrap.clientHeight - 24) / device.offsetHeight);
    document.querySelector('.scaler').style.transform = `scale(${k})`;
  }
  function press(selector, key, value) {
    document.querySelectorAll(selector).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === String(value))));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.setSize) { state.size = b.dataset.setSize; press('[data-set-size]', 'setSize', state.size); render(); }
    else if (b.dataset.setCount) { state.count = Number(b.dataset.setCount); press('[data-set-count]', 'setCount', state.count); resetSpeechSilently(); render(); }
    else if (b.dataset.setTime) setTime(b.dataset.setTime);
    else if (b.id === 'pass' || b.hasAttribute('data-cta')) passMic();
    else if (b.id === 'last10') { state.left = 10; paintTimer(); }
    else if (b.id === 'reset') { setTime('day'); resetSpeech(); }
  });
  function resetSpeechSilently() { state.speaker = 5; state.spoken = new Set([3, 4]); state.left = 47; }

  window.addEventListener('resize', fit);
  window.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search);
    if (q.get('size')) state.size = q.get('size');
    if (q.get('count')) state.count = Number(q.get('count'));
    press('[data-set-size]', 'setSize', state.size);
    press('[data-set-count]', 'setCount', state.count);
    document.body.dataset.time = q.get('time') || document.body.dataset.time || 'day';
    state.time = document.body.dataset.time;
    press('[data-set-time]', 'setTime', state.time);
    render();
  });

  // 供方向稿按比例放置元素
  function place(el, x, y, w, h) {
    Object.assign(el.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', ...(h ? { height: h + 'px' } : {}) });
    return el;
  }
  function add(parent, cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    if (html) el.innerHTML = html;
    parent.appendChild(el);
    return el;
  }
  // 舞台：台口 + 帷幔 + 双幕 + 地板 + 脚灯 + 追光
  function buildStage(device, r) {
    const pro = place(add(device, 'proscenium', '<div class="backdrop"><div class="valance"></div><div class="curtain l"></div><div class="curtain r"></div></div><div class="arch"></div>'), r.x, r.y, r.w, r.h);
    const floorH = r.floorH ?? 70;
    place(add(device, 'floor'), r.x - 12, r.y + r.h - 4, r.w + 24, floorH);
    const lights = place(add(device, 'footlights'), r.x + 20, r.y + r.h - 8, r.w - 40);
    const n = Math.max(3, Math.round(r.w / 90));
    lights.innerHTML = '<i></i>'.repeat(n);
    const spotW = r.spotW ?? r.w * 0.62;
    place(add(device, 'spot'), r.x + (r.w - spotW) / 2, r.y + 10, spotW, r.h - 10);
    const poolW = spotW * 1.1;
    place(add(device, 'spot-pool'), r.x + (r.w - poolW) / 2, r.y + r.h - 40, poolW, 60);
    return pro;
  }
  function buildSpeaker(device, r) {
    const el = place(add(device, 'speaker', `<div class="kicker">正在发言</div><div class="portrait"></div><div class="big-name"></div><div class="sub"></div><div data-timer="${r.timerR ?? 34}" style="margin-top:${r.timerGap ?? 14}px"></div>`), r.x, r.y, r.w);
    if (r.portrait) Object.assign(el.querySelector('.portrait').style, { width: r.portrait + 'px', height: r.portrait + 'px' });
    if (r.font) el.querySelector('.big-name').style.fontSize = r.font + 'px';
    return el;
  }
  function buildTopbar(device, r, compact) {
    const el = place(add(device, 'topbar', `<span class="game">狼人杀</span><span class="day">${r.day || '第 2 天 · 白天'}</span>${compact ? '' : '<span class="alive">存活 <b class="alive-n"></b> 人</span>'}<span class="icons"><button class="icon-btn" title="身份">🂠</button><button class="icon-btn" title="记录">📜</button><button class="icon-btn" title="规则">？</button></span>`), r.x, r.y, r.w);
    const n = el.querySelector('.alive-n');
    if (n) n.textContent = players().filter((p) => !p.dead).length;
    return el;
  }
  function buildDock(device, r) {
    return place(add(device, 'dock', '<div class="info"><strong></strong><span></span></div><button class="btn" title="查看发言记录">记录</button><button class="btn primary" data-cta hidden>发言完毕 · 交麦</button>'), r.x, r.y, r.w, r.h);
  }
  function buildNight(device, y) {
    const el = add(device, 'night-title', '<div class="moon"></div><h2>天黑请闭眼</h2><p>红幕落下，法官将依次唤醒各个身份</p>');
    el.style.top = y + 'px';
    return el;
  }
  function reset(device) {
    device.innerHTML = '';
  }

  window.WW = { place, add, buildStage, buildSpeaker, buildTopbar, buildDock, buildNight, reset, players, seatEls, avatarSvg, state, paintTimer };
})();
