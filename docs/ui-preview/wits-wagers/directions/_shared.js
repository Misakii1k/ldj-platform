// 方向稿公用脚本：固定假数据 + 规则计算 + 预览外壳（视口 / 画面切换、缩放、飞行、计数）。只服务于静态预览，不进生产。
(function () {
  // ---------- 固定假数据（三稿共用） ----------
  // 第 3 / 7 轮。答案 330；估数 5 个不同值 250/280/300/324/412 → L2 L1 C R1 R2 = 净赢 ×4 3 2 3 4，另有「更低」×6。
  // 324 与答案差 6 → 324（R1 ×3）获胜；作者小鱼干、糯米各 +3。结算后：老王 30、小鱼干 25、糯米 21、阿杰 12、鲸 11、可可 10。
  const QUESTION = {
    round: 3, total: 7,
    prompt: '埃菲尔铁塔（含顶部天线）有多高？',
    unit: '米', answer: 330,
    source: '埃菲尔铁塔官网 · 2022 年加装新天线后',
  };
  const PLAYERS = [
    { id: 'p1', seat: 1, name: '阿杰', c: '#e0795b', guess: 300, before: 12, bets: [['g:300', 3], ['g:324', 0]], submitted: true },
    { id: 'me', seat: 2, name: '小鱼干', c: '#e8c35a', guess: 324, before: 9, bets: [['g:324', 4], ['g:412', 2]], me: true },
    { id: 'p3', seat: 3, name: '可可', c: '#6fb89a', guess: 250, before: 15, bets: [['g:250', 5], ['lower', 0]], submitted: true },
    { id: 'p4', seat: 4, name: '老王', c: '#9d8ad6', guess: 280, before: 6, bets: [['g:324', 6], ['g:324', 0]], submitted: true },
    { id: 'p5', seat: 5, name: '糯米', c: '#6fa3d6', guess: 324, before: 8, bets: [['g:412', 2], ['g:324', 3]] },
    { id: 'p6', seat: 6, name: '一只很长昵称的鲸', c: '#d98bb0', guess: 412, before: 11, bets: [['g:300', 0], ['g:280', 0]] },
  ];

  // ---------- 规则计算（照 01-rules-and-sources.md §3 / §4） ----------
  const LAYOUT = { 1: ['C'], 2: ['L1', 'R1'], 3: ['L1', 'C', 'R1'], 4: ['L2', 'L1', 'R1', 'R2'], 5: ['L2', 'L1', 'C', 'R1', 'R2'], 6: ['L3', 'L2', 'L1', 'R1', 'R2', 'R3'], 7: ['L3', 'L2', 'L1', 'C', 'R1', 'R2', 'R3'] };
  const ODDS = { L3: 5, L2: 4, L1: 3, C: 2, R1: 3, R2: 4, R3: 5, LOWER: 6 };
  const values = [...new Set(PLAYERS.map((p) => p.guess))].sort((a, b) => a - b);
  const BOARD = [{ id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: [] }].concat(
    values.map((v, i) => {
      const slot = LAYOUT[values.length][i];
      return { id: 'g:' + v, value: v, slot, odds: ODDS[slot], authors: PLAYERS.filter((p) => p.guess === v) };
    }),
  );
  const best = Math.min(...values.map((v) => Math.abs(v - QUESTION.answer)));
  const WIN = BOARD.filter((t) => t.value !== null && Math.abs(t.value - QUESTION.answer) === best).map((t) => t.id);
  const oddsOf = (id) => BOARD.find((t) => t.id === id).odds;
  PLAYERS.forEach((p) => {
    let win = 0, loss = 0;
    p.bets.forEach(([t, extra]) => { if (WIN.includes(t)) win += (1 + extra) * oddsOf(t); else loss += extra; });
    const author = WIN.includes('g:' + p.guess) ? 3 : 0;
    Object.assign(p, { win, loss, author, after: p.before + win - loss + author, delta: win - loss + author });
  });
  const ME = PLAYERS.find((p) => p.me);
  const ranked = (key) => [...PLAYERS].sort((a, b) => b[key] - a[key]);

  // ---------- 预览外壳 ----------
  const SIZES = { desktop: [1280, 800], mobile: [390, 844] };
  const SCREENS = [['answering', '① 作答'], ['arranging', '② 排牌'], ['betting', '③ 下注'], ['settlement', '④ 揭晓结算']];
  const params = new URLSearchParams(location.search);
  const state = { screen: params.get('s') || 'answering', size: params.get('v') || 'desktop' };

  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.innerHTML = `<strong>${document.body.dataset.title}</strong><span class="note">${document.body.dataset.note}</span>
    <div class="group">${SCREENS.map(([k, t]) => `<button data-screen="${k}">${t}</button>`).join('')}</div>
    <div class="group"><button data-size="desktop">桌面 1280×800</button><button data-size="mobile">手机 390×844</button></div>
    <div class="group"><button id="play">▶ 播放演出</button></div>`;
  document.body.prepend(bar);
  const wrap = document.createElement('div');
  wrap.className = 'stage-wrap';
  wrap.innerHTML = '<div class="device"></div>';
  bar.after(wrap);
  const device = wrap.firstChild;
  let scale = 1;

  function fit() {
    const [w, h] = SIZES[state.size];
    device.style.width = w + 'px';
    device.style.height = h + 'px';
    scale = Math.max(0.2, Math.min((innerWidth - 32) / w, (innerHeight - bar.offsetHeight - 32) / h, 1));
    device.style.transform = `scale(${scale})`;
    wrap.style.height = h * scale + 32 + 'px';
  }
  let playGen = 0;
  function render(autoplay) {
    // 切画面 / 重播时先终止上一段演出：取消进行中的动画、清掉飞行幽灵，旧的演出链在下一个等待点自动停下（见 gate）
    playGen++;
    device.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    bar.querySelectorAll('[data-screen]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.screen === state.screen));
    bar.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.size === state.size));
    device.dataset.size = state.size;
    device.dataset.screen = state.screen;
    device.innerHTML = '';
    fit();
    window.WWRender(device, state);
    history.replaceState(null, '', `?s=${state.screen}&v=${state.size}`);
    // 同一帧内立刻开演：演出的起始帧在首次绘制前就生效，不会先闪一下终态再倒回起点
    if (autoplay && window.WWPlay) window.WWPlay(device, state);
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.screen) state.screen = b.dataset.screen;
    if (b.dataset.size) state.size = b.dataset.size;
    if (b.id === 'play') return render(true);
    render(true);
  });
  addEventListener('resize', fit);
  fit();

  // ---------- 演出工具 ----------
  /** 演出链的闸门：发起时记下代号，等到结果时若已切过画面就永远挂起，旧演出不会再碰新画面 */
  function gate(p) {
    const g = playGen;
    return Promise.resolve(p).then((v) => (g === playGen ? v : new Promise(() => {})), () => new Promise(() => {}));
  }
  /** 设备内坐标（去掉预览缩放） */
  function box(el) {
    const r = el.getBoundingClientRect(), d = device.getBoundingClientRect();
    return { x: (r.left - d.left) / scale, y: (r.top - d.top) / scale, w: r.width / scale, h: r.height / scale };
  }
  /** 把一个幽灵物件从 from 飞到 to；arc 为抛物线高度 */
  function fly(from, to, html, { ms = 520, arc = 90, spin = 0, endScale = 1, delay = 0 } = {}) {
    // 演出途中切了画面：旧元素已脱离文档，量出来的坐标是 (0,0)，飞出去会从左上角横穿全屏——直接放弃这一拍
    if (!from || !to || !from.isConnected || !to.isConnected || !device.contains(from)) return Promise.resolve();
    const a = box(from), b = box(to);
    const g = document.createElement('div');
    g.className = 'ghost';
    g.innerHTML = html;
    g.style.left = a.x + a.w / 2 + 'px';
    g.style.top = a.y + a.h / 2 + 'px';
    device.appendChild(g);
    const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const anim = g.animate([
      { transform: 'translate(-50%,-50%) scale(1) rotate(0)' },
      { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - arc}px)) scale(1.15) rotate(${spin / 2}deg)`, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${endScale}) rotate(${spin}deg)` },
    ], { duration: ms, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    return gate(anim.finished.finally(() => g.remove()));
  }
  /** 数字逐步计数，结束时弹一下 */
  function countUp(el, from, to, ms = 700, sign = false) {
    const t0 = performance.now(), gen = playGen;
    const fmt = (v) => (sign && v > 0 ? '+' : '') + v;
    return gate(new Promise((res) => {
      (function tick(now) {
        if (gen !== playGen) return res();
        const k = Math.min(1, (now - t0) / ms);
        el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
        else { el.animate([{ scale: '1.35' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' }); res(); }
      })(t0);
    }));
  }
  const wait = (ms) => gate(new Promise((r) => setTimeout(r, ms)));
  // 用独立的 translate 属性震动：它与元素自身的 transform（居中用的 translateX(-50%)、画框缩放）叠加，不会覆盖掉它们
  const shake = (el, px = 4) => el.animate(
    [{ translate: '0 0' }, { translate: `${px}px ${-px / 2}px` }, { translate: `${-px}px ${px / 2}px` }, { translate: `${px / 2}px ${px}px` }, { translate: '0 0' }],
    { duration: 260 },
  );
  /** 往一摞里插入新物件：先记下已有物件的位置，插入后让它们从旧位置平滑滑到新位置，不瞬移 */
  function flipInsert(container, html, only = '*') {
    const kids = [...container.children].filter((k) => k.matches(only));
    const before = kids.map((k) => { const r = k.getBoundingClientRect(); return [r.left, r.top]; });
    const ref = container.querySelector(':scope > :not(' + (only === '*' ? '*' : only) + ')');
    if (ref && only !== '*') ref.insertAdjacentHTML('beforebegin', html); else container.insertAdjacentHTML('beforeend', html);
    kids.forEach((k, i) => {
      const r = k.getBoundingClientRect();
      const dx = (before[i][0] - r.left) / scale, dy = (before[i][1] - r.top) / scale;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) k.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
    });
    const added = [...container.children].filter((k) => k.matches(only));
    return added[added.length - 1];
  }
  /** 押在某槽位上的全部筹码（下注阶段起公开） */
  const betsOn = (id) => PLAYERS.flatMap((p) => p.bets.map(([t, extra], i) => ({ p, chip: i ? 'B' : 'A', t, extra }))).filter((b) => b.t === id);
  const fmt = (n) => n.toLocaleString('en-US');

  // ---------- 语义骨架：四个画面共用同一组区块，各方向稿只换皮肤与构图 ----------
  const PHASE = { answering: '作答', arranging: '排牌', betting: '下注', settlement: '揭晓' };
  const HEAD = {
    answering: '写下你的估数',
    arranging: '答案牌按大小上桌',
    betting: '押你觉得最接近的那张',
    settlement: '正确答案',
  };
  function build(device, state, skin) {
    const s = state.screen;
    const shown = s !== 'answering';
    const h = [];
    h.push(`<div class="decor">${skin.decor(s)}</div>`);
    h.push(`<header class="hud"><span class="round">第 <b class="num">${QUESTION.round}</b> / ${QUESTION.total} 轮</span>
      <span class="phase">${PHASE[s]}</span>
      ${s === 'settlement' ? '' : `<div class="ring" style="--p:${s === 'arranging' ? 1 : 0.62}"><span>${s === 'arranging' ? '…' : s === 'betting' ? 19 : 22}</span></div>`}</header>`);
    h.push(`<section class="question"><div class="q-kicker">${skin.kicker ? skin.kicker(s) : HEAD[s]}</div><h1 class="q-text">${QUESTION.prompt}</h1><div class="q-unit">单位：${QUESTION.unit}</div></section>`);
    h.push(`<section class="seats">${PLAYERS.map((p) => `<div class="seat${p.me ? ' me' : ''}${s === 'answering' && (p.submitted) ? ' done' : ''}" data-seat="${p.id}" style="--pc:${p.c}">${skin.seat(p, s)}</div>`).join('')}</section>`);
    if (!shown) {
      const done = PLAYERS.filter((p) => p.submitted).length;
      h.push(`<section class="pile" data-pile>${PLAYERS.filter((p) => p.submitted).map((_, i) => `<div class="facedown" style="--i:${i}">${skin.back()}</div>`).join('')}<div class="pile-count"><b class="num">${done}</b> / ${PLAYERS.length} 已交</div></section>`);
      h.push(`<section class="entry"><label class="entry-label">你的估数</label>
        <div class="entry-field"><span class="num entry-value">324</span><span class="entry-unit">${QUESTION.unit}</span></div>
        <div class="entry-hint">写一个正整数；估得越接近、又不超过越好</div></section>`);
    } else {
      h.push(`<section class="board">${BOARD.map((t) => {
        const win = s === 'settlement' && WIN.includes(t.id);
        const lose = s === 'settlement' && !win;
        return `<div class="slot${t.id === 'lower' ? ' lower' : ''}${win ? ' win' : ''}${lose ? ' lose' : ''}" data-slot="${t.id}">${skin.card(t, s)}
          <div class="chips">${s === 'arranging' ? '' : betsOn(t.id).filter((b) => !(s === 'betting' && b.p.me)).map((b) => skin.chip(b.p, b.chip, b.extra)).join('')}</div></div>`;
      }).join('')}</section>`);
    }
    if (s === 'betting') {
      const reserved = ME.bets.reduce((a, [, x]) => a + x, 0);
      h.push(`<section class="tray"><div class="tray-bal">可用 <b class="num">${ME.before - reserved}</b><small> / 余额 ${ME.before}</small></div>
        ${ME.bets.map(([t, extra], i) => {
          const id = i ? 'B' : 'A';
          const card = BOARD.find((x) => x.id === t);
          return `<div class="bet" data-bet="${id}">${skin.chip(ME, id, extra)}<div class="bet-to">${card.value === null ? '更低' : fmt(card.value)} <small>×${card.odds}</small></div>
          <div class="stepper"><button>−</button><span class="num">+${extra}</span><button>＋</button></div></div>`;
        }).join('')}</section>`);
    }
    if (s === 'settlement') {
      h.push(`<section class="reveal"><div class="rv-label">正确答案</div><div class="rv-value"><span class="num" data-answer>${QUESTION.answer}</span><small>${QUESTION.unit}</small></div><div class="rv-src">${QUESTION.source}</div></section>`);
      h.push(`<section class="ledger">${skin.ledger ? skin.ledger() : ranked('after').map((p, i) => `<div class="row${p.me ? ' me' : ''}" style="--pc:${p.c};--i:${i}"><span class="rk num">${i + 1}</span><span class="nm">${p.name}</span>
        <span class="dl num${p.delta > 0 ? ' up' : p.delta < 0 ? ' down' : ''}" data-delta="${p.delta}">${p.delta > 0 ? '+' : ''}${p.delta}</span>${p.author ? '<span class="au">作者 +3</span>' : ''}
        <span class="sc num" data-from="${p.before}" data-to="${p.after}">${p.after}</span></div>`).join('')}</section>`);
    }
    const cta = { answering: '交出答案', arranging: '', betting: '确认下注', settlement: '下一轮' }[s];
    h.push(`<footer class="dock">${s === 'arranging' ? '<span class="dock-wait">排牌中，马上开始下注…</span>' : `<button class="cta">${cta}</button>`}</footer>`);
    device.innerHTML = h.join('');
    if (skin.after) skin.after(device, state);
  }

  /** 四个画面的默认演出；各方向稿可在 skin.play 里追加世界专属的一拍 */
  async function play(device, state, skin) {
    const s = state.screen, q = (sel) => device.querySelector(sel), qa = (sel) => [...device.querySelectorAll(sel)];
    if (s === 'answering') {
      const cards = qa('.facedown');
      cards.forEach((c, i) => c.animate([{ transform: 'translateY(-60px) rotate(-12deg)', opacity: 0 }, { transform: '', opacity: 1 }], { duration: 420, delay: i * 120, easing: 'cubic-bezier(.34,1.4,.64,1)', fill: 'backwards' }));
      await wait(900);
      const n = cards.length;
      // 飞向「下一张牌该落的位置」，落地后换成牌堆里真实的一张，不凭空消失
      const pile = q('[data-pile]');
      const slot = flipInsert(pile, `<div class="facedown" style="--i:${n};visibility:hidden">${skin.back()}</div>`, '.facedown');
      await fly(q('.entry-field'), slot, `<div class="facedown flying">${skin.back()}</div>`, { spin: 14 });
      slot.style.visibility = '';
      slot.animate([{ translate: '0 -6px' }, { translate: '0 0' }], { duration: 180, easing: 'ease-out' });
      q('.pile-count b').textContent = n + 1;
      q('[data-seat="me"]').classList.add('done');
    }
    if (s === 'arranging') {
      const slots = qa('.slot:not(.lower)');
      q('.slot.lower').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'both' });
      for (const [i, el] of slots.entries()) {
        el.animate([{ transform: 'translateY(-50px) rotateY(90deg) scale(.8)', opacity: 0 }, { transform: 'translateY(-8px) rotateY(0) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: i * 160, easing: 'ease-out', fill: 'both' });
      }
      await wait(slots.length * 160 + 500);
      qa('.odds').forEach((o, i) => o.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 320, delay: i * 70, easing: 'ease-out', fill: 'backwards' }));
    }
    if (s === 'betting') {
      for (const [i, [t]] of ME.bets.entries()) {
        const src = q(`[data-bet="${i ? 'B' : 'A'}"] .chip`);
        const dst = q(`[data-slot="${t}"] .chips`);
        await fly(src, dst, src.outerHTML, { arc: 120, spin: 360 });
        flipInsert(dst, src.outerHTML).animate([{ scale: '1.4' }, { scale: '1' }], { duration: 240, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        src.style.opacity = 0.25;
      }
    }
    if (s === 'settlement') {
      qa('.slot').forEach((el) => el.classList.remove('win', 'lose'));
      qa('.stamp').forEach((el) => el.remove());
      qa('.ledger .row').forEach((r) => { r.style.opacity = 0; });
      const ans = q('[data-answer]');
      await countUp(ans, 0, QUESTION.answer, 900);
      if (skin.onReveal) await skin.onReveal(device);
      qa('.slot').forEach((el) => el.classList.add(WIN.includes(el.dataset.slot) ? 'win' : 'lose'));
      await wait(450);
      for (const r of qa('.ledger .row')) {
        r.style.opacity = 1;
        r.animate([{ transform: 'translateX(-24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
        const sc = r.querySelector('.sc');
        countUp(sc, +sc.dataset.from, +sc.dataset.to, 520);
        await wait(170);
      }
    }
    if (skin.play) skin.play(device, state);
  }

  window.WW = { QUESTION, PLAYERS, BOARD, WIN, ME, ranked, fly, countUp, wait, gate, shake, betsOn, fmt, build, play };
  window.WWUse = (skin) => {
    window.WWRender = (device, state) => build(device, state, skin);
    window.WWPlay = (device, state) => play(device, state, skin);
  };
  // DOM 就绪即渲染（不等图片等资源），避免画框先以 0 宽出现再横跳到位
  document.addEventListener('DOMContentLoaded', () => render(true));
})();
