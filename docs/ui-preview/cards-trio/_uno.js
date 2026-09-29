// UNO / Ding 方向稿公用逻辑：手牌、出牌飞行、功能牌冲屏、选色、方向反转、摸牌、UNO! / 拍铃。只服务于静态预览。
(function () {
  const P = window.Preview;
  const GLYPH = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', draw4: '+4' };
  const COLOR_NAME = { red: '红', yellow: '黄', green: '绿', blue: '蓝' };
  const card = ({ c, v, phrase }) => {
    if (phrase) return `<div class="uc phrase ${c}" data-c="${c}" data-phrase="${phrase}"><span class="v">${phrase}</span><span class="c1">!</span><span class="c2">!</span></div>`;
    const g = GLYPH[v] ?? v;
    const wild = v === 'wild' || v === 'draw4';
    return `<div class="uc ${wild ? 'wild' : c}" data-c="${wild ? 'wild' : c}" data-v="${v}"><span class="v">${g}</span><span class="c1">${g}</span><span class="c2">${g}</span></div>`;
  };
  window.unoCard = card;

  const cfg = window.TABLE_CFG;
  const root = document.querySelector('.device');
  const hand = document.querySelector('.my-hand');
  const discard = document.querySelector('.discard');
  const deck = document.querySelector('.deck');
  const count = document.querySelector('[data-me-count]');
  let current = cfg.top.c;

  function setColor(c) {
    current = c;
    root.dataset.color = c;
    document.querySelectorAll('[data-color-name]').forEach((el) => (el.textContent = COLOR_NAME[c] ?? ''));
  }

  function wire(el) {
    el.addEventListener('click', () => play(el));
  }
  function render() {
    hand.innerHTML = cfg.hand.map(card).join('');
    P.indexFan(hand);
    [...hand.children].forEach(wire);
  }
  render();
  discard.innerHTML = card(cfg.top);
  setColor(cfg.top.c);

  const slamEl = document.querySelector('.slam-fx');
  const slamWord = slamEl?.querySelector('.word');
  function slam(text, cls = '') {
    if (!slamEl) return;
    slamWord.textContent = text;
    slamEl.dataset.kind = cls;
    P.slam(slamEl);
  }

  const picker = document.querySelector('.picker');
  function pickColor() {
    return new Promise((ok) => {
      picker.classList.add('open');
      picker.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { picker.classList.remove('open'); ok(b.dataset.pick); }));
    });
  }

  let dir = 1;
  function reverse() {
    dir = -dir;
    document.querySelectorAll('.dir-ring').forEach((r) => {
      r.classList.toggle('ccw', dir < 0);
      if (!P.reduce) r.animate([{ scale: 1 }, { scale: 1.2 }, { scale: 1 }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    });
  }

  async function play(el) {
    if (el.dataset.busy) return;
    el.dataset.busy = '1';
    const ghost = el.cloneNode(true);
    ghost.style.transform = 'none';
    el.style.visibility = 'hidden';
    await P.fly(ghost, el, discard, { lift: 170, spin: 16, duration: 520 });
    discard.innerHTML = el.outerHTML;
    const landed = discard.firstElementChild;
    landed.removeAttribute('style');
    landed.removeAttribute('data-busy');
    landed.classList.add('land');
    el.remove();
    P.indexFan(hand);
    if (count) P.roll(count, hand.children.length);
    const v = el.dataset.v;
    const phrase = el.dataset.phrase;
    if (phrase) {
      setColor(el.dataset.c);
      cfg.onPhrase?.(phrase, el.dataset.c);
      return;
    }
    if (v === 'draw4' || v === 'wild') {
      if (v === 'draw4') { slam('+4', 'draw4'); P.shake(4); }
      const c = await pickColor();
      setColor(c);
      landed.style.setProperty('--c', `var(--${c})`);
      landed.classList.add('tinted');
      cfg.onColor?.(c);
      return;
    }
    if (v === 'reverse') { slam('反转！', 'reverse'); reverse(); }
    else if (v === 'skip') slam('跳过！', 'skip');
    else if (v === 'draw2') { slam('+2', 'draw2'); P.shake(3); }
    setColor(el.dataset.c);
    if (hand.children.length === 1) document.getElementById('btn-uno')?.classList.add('ready');
  }

  document.getElementById('btn-draw')?.addEventListener('click', async () => {
    const pool = cfg.drawPool;
    const next = pool[(pool.i = ((pool.i ?? -1) + 1) % pool.length)];
    const tmp = document.createElement('div');
    tmp.innerHTML = card(next);
    const el = tmp.firstElementChild;
    const ghost = document.createElement('div');
    ghost.innerHTML = card({ c: 'back', v: 'UNO' });
    const g = ghost.firstElementChild;
    g.className = 'uc back';
    await P.fly(g, deck, hand, { lift: 90, spin: -8, duration: 460 });
    hand.appendChild(el);
    wire(el);
    P.indexFan(hand);
    el.classList.add('drawn');
    if (count) P.roll(count, hand.children.length);
  });

  document.getElementById('btn-uno')?.addEventListener('click', () => {
    slam('UNO!', 'uno');
    P.shake(4);
  });

  window.Table = { slam, setColor, reverse, card };
})();
