/* 开局转场方向稿 · 共用：假场景、起点（结算坞 / 房间页）、时间线驱动 */
(function () {
  const GAMES = {
    light: { name: '奶酪大盗', sub: '第 2 局 · 6 人', icon: '🧀', bg: '#c7cdee', ink: '#292722', paper: '#fffaf0', a: '#f7c84b', b: '#8f9bd6', c: '#e98f5a', d: '#6f7fc4' },
    dark: { name: '狼人杀', sub: '第 2 局 · 9 人', icon: '🐺', bg: '#170c0e', ink: '#e9c874', paper: '#1c1712', a: '#7a1420', b: '#3b0a12', c: '#e9c874', d: '#241015' },
  };
  const S = { skin: 'light', source: 'dock', motion: 'full', running: false };
  window.TKit = { S, GAMES };

  const VIEWS = [
    { v: 'd', w: 1280, h: 800, scale: 0.6, cap: '桌面 1280×800（缩放 60%）' },
    { v: 'm', w: 390, h: 844, scale: 0.8, cap: '手机 390×844（缩放 80%）' },
  ];

  function origin(g) {
    if (S.source === 'dock') {
      return `<div class="t-origin t-origin--dock"><span class="t-digit">3</span><span class="t-origin-lab">秒后开局</span></div>`;
    }
    return `<div class="t-origin t-origin--room"><span class="t-digit">3</span><span class="t-origin-lab">全员就绪 · 即将开局</span></div>`;
  }

  function before() {
    if (S.source === 'dock') {
      return `<div class="t-before t-before--settle"><div class="t-placard">${S.skin === 'dark' ? '好人阵营胜利' : '村民胜！'}</div>
        <div class="t-cards">${'<i></i>'.repeat(6)}</div></div>`;
    }
    return `<div class="t-before t-before--room"><div class="t-room-title">房间 8231 · ${GAMES[S.skin].name}</div>
      <div class="t-room-list">${['我', '阿May', '老周', '小鱼干', '豆豆', 'Kiki'].map((n) => `<div><b>${n[0]}</b>${n}<span>✓ 已准备</span></div>`).join('')}</div></div>`;
  }

  function after() {
    return `<div class="t-after"><div class="t-after-tag">示意：${GAMES[S.skin].name} 开局画面</div>
      <div class="t-after-stage"></div><div class="t-after-seats">${'<i></i>'.repeat(6)}</div></div>`;
  }

  function frameHTML(v) {
    const g = GAMES[S.skin];
    const vars = Object.entries(g).filter(([k]) => k.length === 1 || ['bg', 'ink', 'paper'].includes(k)).map(([k, val]) => `--g-${k}:${val}`).join(';');
    return `<div class="t-scene skin-${S.skin} src-${S.source} v-${v}" style="${vars}">
      ${after()}
      <div class="t-pre">${before()}${origin(g)}</div>
      <div class="t-layer">${window.TRANS.markup(g, v)}</div>
    </div>`;
  }

  function mount() {
    const ctl = document.getElementById('controls');
    const groups = [
      ['skin', '表皮', [['light', '浅色 · 奶酪大盗'], ['dark', '深色 · 狼人杀']]],
      ['source', '起点', [['dock', '结算坞 · 再来一局'], ['room', '房间页 · 首次开局']]],
      ['motion', '动效档', [['full', '完整'], ['reduced', '减弱（reduced）']]],
    ];
    ctl.innerHTML = groups.map(([k, label, opts]) => `<div class="grp"><span>${label}</span>${opts.map(([val, t]) => `<button data-k="${k}" data-val="${val}">${t}</button>`).join('')}</div>`).join('')
      + '<div class="grp"><button data-play class="play">▶ 播放（3 秒倒计时 + 转场）</button><button data-skip>只看转场</button></div>';
    document.getElementById('frames').innerHTML = VIEWS.map((f) => `<div>
      <div class="frame-wrap" style="width:${f.w * f.scale}px;height:${f.h * f.scale}px">
        <div class="frame" data-v="${f.v}" style="width:${f.w}px;height:${f.h}px;transform:scale(${f.scale})"></div>
      </div><div class="frame-cap">${f.cap}</div></div>`).join('');
    render();
  }

  function render() {
    document.querySelectorAll('.frame').forEach((el) => { el.innerHTML = frameHTML(el.dataset.v); });
    document.querySelectorAll('.controls button[data-k]').forEach((b) => b.classList.toggle('on', S[b.dataset.k] === b.dataset.val));
  }

  /* ---------- 时间线 ---------- */
  let timers = [];
  let actx = null;
  function tone(freq, dur, type, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(); const gn = actx.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol || 0.16, actx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(gn).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 忽略 */ }
  }
  window.TKit.tone = tone;
  function clear() { timers.forEach(clearTimeout); timers = []; }
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function setDigit(n) {
    document.querySelectorAll('.t-digit').forEach((d) => {
      d.textContent = n; d.classList.remove('slam'); void d.offsetWidth; d.classList.add('slam');
    });
  }
  function scenes(fn) { document.querySelectorAll('.t-scene').forEach(fn); }

  function play(withCountdown) {
    clear(); render();
    const k = S.motion === 'reduced' ? 0.62 : 1;
    scenes((s) => s.classList.add('is-motion-' + S.motion));
    let t0 = 0;
    if (withCountdown) {
      [3, 2, 1].forEach((n, i) => at(i * 1000, () => { setDigit(n); tone(660, 0.12); }));
      t0 = 3000;
    } else {
      setDigit(1);
    }
    // 转场接手：坞数到 1 后不再砸「开局」，直接交给转场
    window.TRANS.steps.forEach(([ms, cls, sound]) => at(t0 + ms * k, () => {
      scenes((s) => s.classList.add(cls));
      if (sound) sound(tone);
    }));
    const end = window.TRANS.steps[window.TRANS.steps.length - 1][0];
    at(t0 + end * k + 50, () => scenes((s) => s.classList.add('is-done')));
  }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('.controls button[data-k]');
    if (c) { S[c.dataset.k] = c.dataset.val; clear(); render(); return; }
    if (e.target.closest('[data-play]')) play(true);
    if (e.target.closest('[data-skip]')) play(false);
  });
  window.addEventListener('DOMContentLoaded', mount);
})();
