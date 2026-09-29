// 谁是狱警方向稿公用脚本：假数据、席位、答题牌、问答流程、飞行。只服务于静态预览，不进生产。
// 固定假数据：第 3 / 5 问，老王出题；阿杰、可可已作答（牌面朝下），等你亮 YES / NO。
// 演出：全员答完后所有答题牌同时翻面，答 YES 的人头顶多一枚红图钉；这道题随后钉进案卷。
(function () {
  const ALL = [
    { name: '阿杰', c: '#f29a7a' },
    { name: '小鱼干', c: '#f7c84b', me: true },
    { name: '可可', c: '#8fd3b6' },
    { name: '老王', c: '#9cc7f0', asker: true },
    { name: 'Momo', c: '#f6b7cf' },
    { name: '一个名字特别长的囚犯', c: '#b9a4e6' },
  ];
  const count = Number(new URLSearchParams(location.search).get('n')) === 6 ? 6 : 5;
  const players = ALL.slice(0, count).map((p, i) => ({ ...p, seat: i + 1, id: 'p' + (i + 1), no: String(7 + i * 11).padStart(3, '0') }));
  const byName = Object.fromEntries(players.map((p) => [p.name, p]));
  const MAX_YES = 3;
  const LIMIT = 5;
  const MY_CRIME = { name: '偷吃外卖', traits: '偷拿前台外卖、冰箱偷喝奶茶' };

  const history = [
    { i: 1, asker: '阿杰', q: '作案是否发生在深夜黑暗或无人时？', yes: ['可可', '老王', 'Momo'] },
    { i: 2, asker: '小鱼干', q: '你是否直接盗取了他人的实体物品？', yes: ['小鱼干', '可可'] },
  ].map((h) => ({ ...h, yes: h.yes.filter((n) => byName[n]) }));
  const current = { i: 3, asker: '老王', q: '作案现场是否有火烧痕迹？' };
  // 机器人本题答案（按各自罪行如实回答；老王是狱警，撒了谎）
  const BOT = { '阿杰': 'no', '可可': 'no', '老王': 'yes', 'Momo': 'no', '一个名字特别长的囚犯': 'yes' };
  const answers = { '阿杰': 'no', '可可': 'no' };
  const yesCount = Object.fromEntries(players.map((p) => [p.name, 0]));
  history.forEach((h) => h.yes.forEach((n) => yesCount[n]++));
  let revealed = false;

  const BUST = `<svg class="bust" viewBox="0 0 80 80" aria-hidden="true">
    <path d="M8 80 C8 58 22 50 40 50 C58 50 72 58 72 80 Z" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="40" cy="30" r="17" fill="currentColor" stroke="var(--bust-line)" stroke-width="3.5"/>
  </svg>`;

  function yesPips(p) {
    return Array.from({ length: MAX_YES }, (_, k) => `<i class="${k < yesCount[p.name] ? 'used' : ''}"></i>`).join('');
  }
  function statusOf(p) {
    if (revealed) return answers[p.name] === 'yes' ? 'YES' : 'NO';
    if (answers[p.name]) return '已作答';
    return p.me ? '轮到你' : '思考中';
  }
  function seatHtml(p) {
    return `<span class="no">${p.seat}</span><div class="av">${BUST}</div>
      <div class="nm">${p.name}${p.me ? '<em class="you">你</em>' : ''}</div>
      <div class="st">${p.asker ? '出题人 · ' : ''}${statusOf(p)}</div>
      <div class="yes" title="已用 YES ${yesCount[p.name]} / ${MAX_YES}">${yesPips(p)}</div>
      <span class="inmate">#${p.no}</span>`;
  }
  const seatEls = new Map();
  function renderSeat(el, p) {
    el.className = 'seat';
    if (p.asker) el.classList.add('asker');
    if (p.me) el.classList.add('me');
    if (answers[p.name]) el.classList.add('answered');
    if (revealed) el.classList.add(answers[p.name] === 'yes' ? 'said-yes' : 'said-no');
    if (yesCount[p.name] >= MAX_YES - 1) el.classList.add('hot');
    el.style.setProperty('--seat-c', p.c);
    el.innerHTML = seatHtml(p);
  }
  const half = Math.ceil(players.length / 2);
  const groups = { all: players, left: players.slice(0, half), right: players.slice(half), others: players.filter((p) => !p.asker), asker: players.filter((p) => p.asker) };
  document.querySelectorAll('[data-seats]').forEach((box) => {
    (groups[box.dataset.seats] || players).forEach((p) => {
      const el = document.createElement('div');
      el.dataset.name = p.name;
      box.appendChild(el);
      if (!seatEls.has(p)) seatEls.set(p, []);
      seatEls.get(p).push(el);
    });
  });

  // 答题牌：每人一张，作答后背面朝上，全员答完同时翻面
  function chipHtml(p) {
    const a = answers[p.name];
    const face = revealed && a ? (a === 'yes' ? 'YES' : 'NO') : a ? '' : '…';
    return `<div class="chip ${a ? 'in' : 'empty'} ${revealed && a ? 'flip ' + a : ''}" data-chip="${p.name}" style="--seat-c:${p.c}">
      <span class="chip-face">${face}</span><span class="chip-name">${p.name}</span></div>`;
  }
  function renderAnswers() {
    document.querySelectorAll('[data-answers]').forEach((box) => (box.innerHTML = players.map(chipHtml).join('')));
  }
  function renderHistory() {
    document.querySelectorAll('[data-history]').forEach((box) => {
      box.innerHTML = history
        .map((h) => `<div class="note" data-note="${h.i}"><span class="note-no">Q${h.i}</span><span class="note-q">${h.q}</span>
          <span class="note-yes">${h.yes.map((n) => `<i style="--seat-c:${byName[n].c}" title="${n}"></i>`).join('') || '<em>全员 NO</em>'}</span></div>`)
        .join('');
    });
  }
  function bind(key, value) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => (el.textContent = value));
  }
  function renderText() {
    const done = players.filter((p) => answers[p.name]).length;
    bind('question', current.q);
    bind('asker', current.asker);
    bind('qi', String(current.i));
    bind('limit', String(LIMIT));
    bind('answered', String(done));
    bind('total', String(players.length));
    bind('max-yes', String(MAX_YES));
    bind('crime', MY_CRIME.name);
    bind('traits', MY_CRIME.traits);
    const mine = answers['小鱼干'];
    bind('dock-title', revealed ? '答案全部亮出' : mine ? '已作答，等其他人亮牌' : '轮到你回答');
    bind('dock-sub', revealed ? '谁的 YES 和罪行对不上？讨论后进入下一问' : mine ? '所有人答完会同时翻牌' : `你是囚犯，罪行「${MY_CRIME.name}」——必须如实回答`);
    document.querySelectorAll('[data-answer]').forEach((b) => (b.disabled = !!mine));
  }
  function render() {
    seatEls.forEach((els, p) => els.forEach((el) => renderSeat(el, p)));
    renderAnswers();
    renderHistory();
    renderText();
  }
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
  device.dataset.count = String(count);

  // ---------- 倒计时 ----------
  let left = 52;
  function paintRing() {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    document.querySelectorAll('[data-ring]').forEach((r) => {
      r.style.setProperty('--p', String(left / 60));
      r.classList.toggle('warn', left <= 10);
      r.querySelector('span').textContent = `${mm}:${ss}`;
    });
  }
  paintRing();
  setInterval(() => { if (left > 0) { left--; paintRing(); } }, 1000);
  document.getElementById('act-hurry')?.addEventListener('click', () => { left = 10; paintRing(); });

  document.querySelectorAll('[data-secret]').forEach((el) => el.addEventListener('click', () => el.classList.toggle('hidden')));

  // ---------- 飞行 ----------
  function local(rect) {
    const d = device.getBoundingClientRect();
    return { x: (rect.left - d.left) / scale, y: (rect.top - d.top) / scale, w: rect.width / scale, h: rect.height / scale };
  }
  const visible = (els) => (els || []).find((el) => el.offsetParent !== null);
  function fly(fromEl, toEl, ghost, { arc = 80, spin = -16, dur = 520 } = {}) {
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
  }
  function shake() {
    if (reduce) return;
    device.animate([{ translate: '0 0' }, { translate: '-4px 2px' }, { translate: '3px -2px' }, { translate: '0 0' }], { duration: 240 });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

  async function answer(p, a) {
    if (answers[p.name]) return;
    const fromEl = visible(seatEls.get(p));
    const chipEl = document.querySelector(`[data-chip="${p.name}"]`);
    const ghost = document.createElement('div');
    ghost.className = 'chip in';
    ghost.style.setProperty('--seat-c', p.c);
    ghost.innerHTML = `<span class="chip-face"></span><span class="chip-name">${p.name}</span>`;
    await fly(fromEl, chipEl, ghost);
    answers[p.name] = a;
    render();
    document.querySelector(`[data-chip="${p.name}"]`)?.animate([{ transform: 'scale(1.2)' }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }
  async function revealAll() {
    await wait(420);
    revealed = true;
    players.forEach((p) => { if (answers[p.name] === 'yes') yesCount[p.name]++; });
    render();
    document.dispatchEvent(new CustomEvent('reveal'));
    shake();
    // YES 的人：红图钉从答题牌飞到头顶
    const yesPlayers = players.filter((p) => answers[p.name] === 'yes');
    await Promise.all(yesPlayers.map((p, k) => wait(k * 90).then(() => {
      const pin = document.createElement('div');
      pin.className = 'pin-fly';
      return fly(document.querySelector(`[data-chip="${p.name}"]`), visible(seatEls.get(p))?.querySelector('.yes'), pin, { arc: 120, spin: 30, dur: 560 });
    })));
    await wait(900);
    history.push({ i: current.i, asker: current.asker, q: current.q, yes: yesPlayers.map((p) => p.name) });
    renderHistory();
    const n = document.querySelector(`[data-note="${current.i}"]`);
    n?.animate([{ transform: 'translateY(-30px) rotate(-6deg) scale(1.15)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    document.dispatchEvent(new CustomEvent('pinned'));
  }
  document.querySelectorAll('[data-answer]').forEach((b) =>
    b.addEventListener('click', async () => {
      const me = players.find((p) => p.me);
      await answer(me, b.dataset.answer);
      for (const p of players) {
        if (answers[p.name]) continue;
        await wait(380);
        await answer(p, BOT[p.name]);
      }
      revealAll();
    }),
  );

  window.NT = { players, count, history, answers };
})();
