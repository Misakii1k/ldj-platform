// 第 2 轮 · 斗地主「茶馆正堂」三个画面的公用脚本：场景搭建、牌面、对手、倒计时、飞牌。画面各自的流程在各 HTML 里。
(function () {
  const P = window.Preview;
  const RED = new Set(['♥', '♦']);
  const ORDER = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
  const SUITS = ['♠', '♥', '♣', '♦'];

  // 牌：[点数, 花色]；王没有花色
  function card([r, s], extra = '') {
    if (r === '大王' || r === '小王') {
      const big = r === '大王';
      return `<div class="pk2 joker ${big ? 'big red' : ''} ${extra}" data-r="${r}"><span class="cn tl"><b>JOKER</b></span><span class="cn br"><b>JOKER</b></span><span class="mid"><span>${big ? '大' : '小'}</span></span></div>`;
    }
    const face = ['J', 'Q', 'K'].includes(r);
    return `<div class="pk2 ${RED.has(s) ? 'red' : ''} ${face ? 'face' : ''} ${extra}" data-r="${r}" data-s="${s}"><span class="cn tl"><b>${r}</b><i>${s}</i></span><span class="cn br"><b>${r}</b><i>${s}</i></span><span class="mid"><span>${face ? r : s}</span></span></div>`;
  }
  const back = (extra = '') => `<div class="pk2 back ${extra}"></div>`;
  // 斗地主习惯：大牌在左
  const sortDesc = (list) => [...list].sort((a, b) => ORDER.indexOf(b[0]) - ORDER.indexOf(a[0]) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]));

  const LANTERN = `<svg viewBox="0 0 60 100" aria-hidden="true"><line x1="30" y1="0" x2="30" y2="14" stroke="#292722" stroke-width="3"/><rect x="17" y="11" width="26" height="9" rx="2" fill="#e0a92a" stroke="#292722" stroke-width="3"/><ellipse cx="30" cy="48" rx="27" ry="30" fill="#c23616" stroke="#292722" stroke-width="4"/><ellipse cx="22" cy="40" rx="6" ry="12" fill="#e86a45" opacity=".7"/><path d="M30 18 V78 M15 24 Q6 48 15 72 M45 24 Q54 48 45 72" stroke="#8c2f14" stroke-width="3" fill="none"/><text x="30" y="56" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="20" fill="#e0a92a" stroke="#292722" stroke-width=".8">茶</text><rect x="17" y="76" width="26" height="9" rx="2" fill="#e0a92a" stroke="#292722" stroke-width="3"/><path d="M24 85 V99 M30 85 V100 M36 85 V99" stroke="#c23616" stroke-width="3" stroke-linecap="round"/></svg>`;
  const TEA = `<svg viewBox="0 0 120 70" aria-hidden="true"><ellipse cx="60" cy="56" rx="54" ry="11" fill="#fffdf7" stroke="#292722" stroke-width="4"/><ellipse cx="60" cy="54" rx="34" ry="5" fill="#e6d3ad"/><path d="M26 26 Q26 54 60 54 Q94 54 94 26 Z" fill="#fffdf7" stroke="#292722" stroke-width="4" stroke-linejoin="round"/><path d="M34 34 Q60 42 86 34" stroke="#5f9f86" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M52 40 q4 -6 8 0 q4 6 8 0" stroke="#5f9f86" stroke-width="3" fill="none"/><ellipse cx="60" cy="24" rx="37" ry="8" fill="#fffdf7" stroke="#292722" stroke-width="4"/><circle cx="60" cy="16" r="6" fill="#fffdf7" stroke="#292722" stroke-width="3.5"/><path d="M48 8 q3 -6 0 -10 M66 6 q3 -6 0 -10" stroke="#9c9285" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/></svg>`;
  const FIG = {
    jie: `<svg class="fig" viewBox="0 0 120 110" aria-hidden="true"><path d="M8 110 Q12 62 60 60 Q108 62 112 110 Z" fill="#f29a7a" stroke="#292722" stroke-width="4"/><path d="M44 62 L60 84 L76 62" fill="#fffdf7" stroke="#292722" stroke-width="3.5" stroke-linejoin="round"/><circle cx="60" cy="36" r="27" fill="#fbe3cf" stroke="#292722" stroke-width="4"/><path d="M33 30 Q38 5 60 7 Q84 5 88 30 Q74 18 60 20 Q45 18 33 30 Z" fill="#292722"/><circle cx="50" cy="38" r="3.5" fill="#292722"/><circle cx="70" cy="38" r="3.5" fill="#292722"/><ellipse cx="44" cy="47" rx="5" ry="3" fill="#f29a7a" opacity=".6"/><ellipse cx="76" cy="47" rx="5" ry="3" fill="#f29a7a" opacity=".6"/><path d="M52 50 Q60 56 68 50" stroke="#292722" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
    keke: `<svg class="fig" viewBox="0 0 120 110" aria-hidden="true"><path d="M8 110 Q12 62 60 60 Q108 62 112 110 Z" fill="#8fd3b6" stroke="#292722" stroke-width="4"/><path d="M40 64 Q60 76 80 64" stroke="#292722" stroke-width="3.5" fill="none"/><path d="M26 56 Q22 12 60 8 Q98 12 94 56 Q88 30 60 26 Q32 30 26 56 Z" fill="#6b3f22" stroke="#292722" stroke-width="3.5"/><circle cx="60" cy="38" r="26" fill="#fbe3cf" stroke="#292722" stroke-width="4"/><path d="M34 32 Q46 16 60 20 Q76 14 86 32 Q70 26 60 30 Q46 26 34 32 Z" fill="#6b3f22"/><circle cx="50" cy="40" r="3.5" fill="#292722"/><circle cx="70" cy="40" r="3.5" fill="#292722"/><ellipse cx="44" cy="49" rx="5" ry="3" fill="#f6b7cf" opacity=".8"/><ellipse cx="76" cy="49" rx="5" ry="3" fill="#f6b7cf" opacity=".8"/><path d="M54 52 H66" stroke="#292722" stroke-width="3" stroke-linecap="round"/><circle cx="88" cy="22" r="7" fill="#c23616" stroke="#292722" stroke-width="3"/></svg>`,
  };
  const INGOT = `<svg class="ingot" viewBox="0 0 44 30" aria-label="地主"><path d="M2 15 Q6 28 22 28 Q38 28 42 15 L33 15 Q31 4 22 4 Q13 4 11 15 Z" fill="#f7c84b" stroke="#292722" stroke-width="3" stroke-linejoin="round"/><path d="M15 12 Q22 8 29 12" stroke="#fff6c8" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

  const ring = (cls) => `<div class="${cls}"><svg viewBox="0 0 60 60"><circle class="track" cx="30" cy="30" r="26"/><circle class="bar" cx="30" cy="30" r="26"/></svg><span class="ring-num"></span></div>`;

  // 场景家具：墙、梁、牌匾、对联、花窗、灯笼、桌子、茶
  function buildScene(device) {
    const s = document.createElement('div');
    s.className = 'scene';
    s.innerHTML = `
      <div class="wall"></div><div class="wainscot"></div><div class="beam"></div>
      <span class="bracket" style="left:18%"></span><span class="bracket" style="right:18%"></span>
      <div class="win l"></div><div class="win r"></div>
      <div class="couplet l">春风得意</div><div class="couplet r">四海来财</div>
      <div class="plaque">聚乐茶馆</div>
      <div class="lantern l">${LANTERN}</div><div class="lantern r">${LANTERN}</div>
      <div class="table-wrap"><div class="table"></div><div class="table-edge"></div></div>`;
    device.prepend(s);
    const tea = document.createElement('div');
    tea.className = 'teapot';
    tea.innerHTML = TEA;
    device.appendChild(tea);
    device.insertAdjacentHTML('beforeend', `<div class="rotate-hint"><div class="phone"><i></i></div><b>请把手机横过来</b><span>斗地主只做横屏：三家手牌和出牌区要一眼看全</span></div>`);
  }

  // 对手：半身像 + 名牌（身份圆章 + 名字 + 剩余张数）+ 背面小扇
  function opponent(key, name, side, count, role = 'farmer') {
    const el = document.createElement('div');
    el.className = `opp ${side}`;
    el.dataset.key = key;
    el.dataset.box = 'opp-' + key;
    el.innerHTML = `<span class="halo"></span>${FIG[key]}
      <div class="plate"><span class="role ${role === 'lord' ? 'lord' : ''}">${role === 'lord' ? '主' : role === 'farmer' ? '农' : '?'}</span><b>${name}</b><span class="cnt" data-count>${count}</span>${ring('mini-ring')}</div>
      <div class="say"></div><div class="opp-hand">${Array.from({ length: Math.min(count, 8) }, () => back('sm')).join('')}</div>`;
    return el;
  }
  function setCount(opp, n) {
    const c = opp.querySelector('[data-count]');
    P.roll(c, n);
    c.classList.toggle('warn', n <= 2);
    const h = opp.querySelector('.opp-hand');
    if (!h.classList.contains('open')) h.innerHTML = Array.from({ length: Math.min(n, 8) }, () => back('sm')).join('');
  }
  function setRole(plate, role) {
    const r = plate.querySelector('.role');
    r.classList.toggle('lord', role === 'lord');
    r.textContent = role === 'lord' ? '主' : '农';
    if (!P.reduce) r.animate([{ transform: 'scale(2.2) rotate(-20deg)', opacity: 0 }, { transform: 'scale(.9)', opacity: 1, offset: .6 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  function say(el, text, { stay = false, hot = false } = {}) {
    const b = el.querySelector('.say');
    b.textContent = text;
    b.classList.remove('show', 'stay', 'hot');
    void b.offsetWidth;
    b.classList.add(stay ? 'stay' : 'show');
    if (hot) b.classList.add('hot');
  }

  function setActive(target) {
    document.querySelectorAll('.opp.active, .me-plate.active').forEach((e) => e.classList.remove('active'));
    document.querySelectorAll('.mini-ring').forEach((r) => { clearTimeout(r._t); r.style.visibility = 'hidden'; });
    if (!target) return;
    target.classList.add('active');
    const r = target.querySelector('.mini-ring');
    if (r) { r.style.visibility = 'visible'; P.countdown(r, 15); }
  }

  // 手牌多（叫地主后 20 张）时按可用宽度收紧重叠，保证一行放下
  function fitHand(hand) {
    const n = hand.children.length;
    if (!n) return;
    const device = hand.closest('.device');
    const w = parseFloat(getComputedStyle(hand.children[0]).width);
    const size = device.dataset.size;
    const avail = size === 'mobile' ? 370 : size === 'landscape' ? (hand.dataset.avail ? Number(hand.dataset.avail) : 400) : 900;
    const base = size === 'mobile' ? -29 : size === 'landscape' ? -24 : -38;
    const need = n > 1 ? -(w - (avail - w) / (n - 1)) : 0;
    hand.style.setProperty('--overlap', Math.min(base, need) + 'px');
  }
  document.querySelectorAll('[data-set-size]').forEach((b) => b.addEventListener('click', () => setTimeout(() => document.querySelectorAll('.my-hand').forEach(fitHand))));

  function renderHand(hand, list, onPick) {
    hand.innerHTML = list.map((c) => card(c)).join('');
    P.indexFan(hand);
    fitHand(hand);
    [...hand.children].forEach((el) => el.addEventListener('click', () => onPick ? onPick(el) : el.classList.toggle('sel')));
  }

  // 把若干张牌依次飞到目标，落地后在目标里摆成出牌堆
  async function flyCards(els, target, { lift = 160 } = {}) {
    await Promise.all(els.map((c, k) => {
      const ghost = c.cloneNode(true);
      ghost.classList.remove('sel');
      ghost.classList.add('fly-trail');
      ghost.style.transform = 'none';
      c.style.visibility = 'hidden';
      return new Promise((ok) => setTimeout(ok, k * 55)).then(() => P.fly(ghost, c, target, { lift, spin: 8 + k * 4, duration: 500 }));
    }));
  }

  window.Teahouse = { card, back, sortDesc, INGOT, ring, buildScene, opponent, setCount, setRole, say, setActive, renderHand, fitHand, flyCards };
})();
