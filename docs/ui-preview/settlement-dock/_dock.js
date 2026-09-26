/* 结算坞方向稿 · 共用脚本：假数据、控制条、双视口渲染、倒计时演出
 * 每个方向稿定义 window.DOCK = { render(s, v) -> html }，v = 'd' | 'm'
 */
(function () {
  const NAMES = ['我', '阿May', '老周', '小鱼干', '豆豆', '南风知我意', 'Kiki', '大熊', '橘子汽水', '阿杰'];
  const COLORS = ['#c23616', '#08715d', '#7358a7', '#d97706', '#2563eb', '#be185d', '#0f766e', '#6b4f2a', '#ea580c', '#475569'];
  const ROLES_DARK = ['预言家', '狼人', '村民', '女巫', '村民', '狼人', '守卫', '村民', '猎人', '村民'];
  const ROLES_LIGHT = ['村民', '小偷', '村民', '村民', '村民', '村民', '村民', '村民', '村民', '村民'];

  const S = {
    skin: 'light',     // light | dark
    count: 5,          // 5 | 10
    phase: 'waiting',  // waiting | meReady | countdown | noAuto
    role: 'guest',     // guest | host | spectator
    more: false,
    tick: 3,           // 倒计时当前值；0 = 开局！
    fresh: -1,         // 刚准备好的玩家下标（弹一下）
  };

  // 由 phase 推出每位玩家是否已准备（固定假数据：谁在等一眼可辨）
  function players() {
    const n = S.count;
    const list = [];
    for (let i = 0; i < n; i++) {
      let ready;
      if (S.phase === 'countdown' || S.phase === 'noAuto') ready = true;
      else if (S.phase === 'meReady') ready = i !== 3 && (n === 5 || i % 4 !== 3);
      else ready = i === 1 || i === 2 || (n === 10 && (i === 4 || i === 6 || i === 7 || i === 9));
      if (i === 0 && S.role === 'spectator') continue;
      list.push({
        i, name: NAMES[i], color: COLORS[i], ready,
        isMe: i === 0, isHost: S.role === 'host' ? i === 0 : i === 1,
        roleName: (S.skin === 'dark' ? ROLES_DARK : ROLES_LIGHT)[i],
      });
    }
    return list;
  }

  function derived() {
    const ps = players();
    const me = ps.find((p) => p.isMe);
    const ready = ps.filter((p) => p.ready).length;
    const waiting = ps.filter((p) => !p.ready);
    return {
      ps, me, ready, total: ps.length, waiting,
      isHost: S.role === 'host', isSpec: S.role === 'spectator',
      meReady: Boolean(me && me.ready),
      allReady: ready === ps.length,
    };
  }

  function av(p, size, extra) {
    const cls = ['av', p.ready ? 'is-ready' : 'is-wait', S.fresh === p.i ? 'is-new-ready' : '', extra || ''].join(' ');
    return `<span class="${cls}" style="--c:${p.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" title="${p.name}">${p.name[0]}${p.isHost ? '<span class="host-dot">👑</span>' : ''}${p.ready ? '<span class="tick">✓</span>' : ''}</span>`;
  }

  function moreMenu(d) {
    if (!S.more) return '';
    return `<div class="more-menu" role="menu">
      ${d.isHost ? '<button data-act="noop"><span>🏠</span><span>返回房间大厅<small>带全员回房间，可换游戏</small></span></button>' : ''}
      <button data-act="noop"><span>↩</span><span>暂离回首页<small>席位保留，随时回来</small></span></button>
      <hr>
      <button class="danger" data-act="noop"><span>⏻</span><span>退出房间<small>释放你的席位</small></span></button>
    </div>`;
  }
  function moreBtn(d) {
    return `<div class="more-wrap"><button class="btn btn--more ${S.more ? 'on' : ''}" data-act="more" aria-label="更多">⋯</button>${moreMenu(d)}</div>`;
  }

  // 主按钮区：按规则只保留一个黄色按钮
  function actions(d, opt) {
    opt = opt || {};
    const out = [];
    if (S.phase === 'countdown') {
      if (d.isHost) out.push('<button class="btn btn--cta" data-act="noop">▶ 立即开局</button>');
      if (!d.isSpec) out.push('<button class="btn btn--ghost" data-act="toggle">取消准备</button>');
    } else if (S.phase === 'noAuto') {
      if (d.isHost) out.push('<button class="btn btn--cta" data-act="noop">▶ 开局</button>');
      else if (!d.isSpec) out.push('<button class="btn btn--ghost" data-act="toggle">取消准备</button>');
    } else if (!d.isSpec) {
      if (d.meReady) out.push('<button class="btn btn--ghost is-ready" data-act="toggle">✓ 已准备 · 取消</button>');
      else out.push(`<button class="btn btn--cta" data-act="toggle"${opt.wide ? ' style="flex:1"' : ''}>↻ 再来一局</button>`);
    }
    out.push(moreBtn(d));
    return out.join('');
  }

  // 一句话状态：告诉玩家现在在等谁
  function statusLine(d) {
    if (S.phase === 'countdown') return S.tick > 0 ? '全员就绪 · 即将开局' : '开局！';
    if (S.phase === 'noAuto') return d.isHost ? '全员就绪 · 复盘完了就开' : '全员就绪 · 等房主开局';
    if (d.isSpec) return '观战中 · 等玩家准备';
    const w = d.waiting.filter((p) => !p.isMe);
    if (!d.meReady) return '对局结束 · 再来一局？';
    if (w.length === 1) return `就等 ${w[0].name} 了`;
    return `还在等 ${w.length} 人`;
  }

  function digit(size) {
    const txt = S.tick > 0 ? String(S.tick) : '开局';
    return `<span class="digit slam ${S.tick > 0 ? '' : 'go'}" style="font-size:${size}px">${txt}</span>`;
  }

  const API = { S, players, derived, av, actions, moreBtn, statusLine, digit };
  window.DockKit = API;

  /* ---------- 页面骨架 ---------- */
  const VIEWS = [
    { v: 'd', w: 1280, h: 800, scale: 0.6, cap: '桌面 1280×800（缩放 60%）' },
    { v: 'm', w: 390, h: 844, scale: 0.8, cap: '手机 390×844（缩放 80%）' },
  ];

  function scene(v) {
    const d = derived();
    const dark = S.skin === 'dark';
    const cards = players().map((p) => `<div class="scard ${dark ? (['狼人'].includes(p.roleName) ? '' : 'win') : (p.roleName === '小偷' ? '' : 'win')}"><span class="role">${p.roleName}</span><span>${p.name}</span></div>`).join('');
    return `<div class="scene ${dark ? 'scene--dark' : 'scene--light'} ${S.count === 10 ? 'dense' : ''} ${v === 'm' ? 'is-m' : ''}">
      <span class="scene-tag">示意：游戏自己的结算画面（不属于坞）</span>
      <div class="scene-body">
        <div class="placard">${dark ? '好人阵营胜利' : '村民胜！'}<small>${dark ? '第 3 夜 · 预言家带队' : '小偷在 3 点独醒偷走了奶酪'}</small></div>
        <div class="scene-cards">${cards}</div>
      </div>
      <div class="dock-host skin-${S.skin} dock-${v}">${window.DOCK.render(S, v, d)}</div>
    </div>`;
  }

  const CONTROLS = [
    ['skin', '表皮', [['light', '浅色派对'], ['dark', '深色悬疑']]],
    ['count', '人数', [['5', '5 人'], ['10', '10 人']]],
    ['role', '我是', [['guest', '普通玩家'], ['host', '房主'], ['spectator', '观战']]],
    ['phase', '状态', [['waiting', '刚结算'], ['meReady', '我已准备'], ['countdown', '全员就绪 · 倒计时'], ['noAuto', '全员就绪 · 不自动开（狼人杀）']]],
  ];

  function mount() {
    const ctl = document.getElementById('controls');
    ctl.innerHTML = CONTROLS.map(([k, label, opts]) => `<div class="grp"><span>${label}</span>${opts.map(([val, t]) => `<button data-k="${k}" data-val="${val}">${t}</button>`).join('')}</div>`).join('')
      + '<div class="grp"><button data-replay>▶ 重放倒计时</button></div>';
    const root = document.getElementById('frames');
    root.innerHTML = VIEWS.map((f) => `<div>
      <div class="frame-wrap" style="width:${f.w * f.scale}px;height:${f.h * f.scale}px">
        <div class="frame" data-v="${f.v}" style="width:${f.w}px;height:${f.h}px;--frame-scale:scale(${f.scale});transform:scale(${f.scale})"></div>
      </div>
      <div class="frame-cap">${f.cap}</div>
    </div>`).join('');
    render();
  }

  function render() {
    document.querySelectorAll('.frame').forEach((el) => { el.innerHTML = scene(el.dataset.v); });
    document.querySelectorAll('.controls button[data-k]').forEach((b) => {
      b.classList.toggle('on', String(S[b.dataset.k]) === b.dataset.val);
    });
    if (window.DOCK.after) window.DOCK.after(S);
  }
  API.render = render;

  /* ---------- 倒计时演出：每秒砸入 + 滴答；归零轻屏震 ---------- */
  let timer = null;
  let actx = null;
  function beep(freq, dur) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.18, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 静音环境忽略 */ }
  }
  function shake() {
    document.querySelectorAll('.frame').forEach((el) => {
      el.classList.remove('is-shake'); void el.offsetWidth; el.classList.add('is-shake');
    });
  }
  function startCountdown() {
    clearInterval(timer);
    S.tick = 3; render(); beep(660, 0.12);
    timer = setInterval(() => {
      S.tick -= 1; render();
      if (S.tick > 0) beep(660, 0.12);
      else { beep(990, 0.35); shake(); clearInterval(timer); }
    }, 1000);
  }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('.controls button[data-k]');
    if (c) {
      const k = c.dataset.k; const val = c.dataset.val;
      S[k] = k === 'count' ? Number(val) : val;
      S.more = false; S.fresh = -1;
      clearInterval(timer);
      if (S.role === 'spectator' && S.phase === 'meReady') S.phase = 'waiting';
      if (S.phase === 'countdown') startCountdown(); else render();
      return;
    }
    if (e.target.closest('[data-replay]')) { S.phase = 'countdown'; S.more = false; startCountdown(); return; }
    const a = e.target.closest('.frame [data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'more') { S.more = !S.more; render(); }
    else if (act === 'toggle') {
      S.more = false;
      if (S.phase === 'waiting') { S.phase = 'meReady'; S.fresh = 0; render(); }
      else { clearInterval(timer); S.phase = 'waiting'; S.fresh = -1; render(); }
    } else if (act === 'noop') { S.more = false; render(); }
  });

  window.addEventListener('DOMContentLoaded', mount);
})();
