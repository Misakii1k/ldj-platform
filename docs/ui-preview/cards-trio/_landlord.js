// 斗地主方向稿公用逻辑：手牌、选牌、出牌飞行、炸弹演出、翻底牌、倒计时。只服务于静态预览。
(function () {
  const P = window.Preview;
  const RED = new Set(['♥', '♦']);
  const pk = (r, s, extra = '') => {
    if (r === '大王' || r === '小王') {
      return `<div class="pk joker ${r === '大王' ? 'red' : ''} ${extra}" data-r="${r}"><span class="r">JOKER</span><span class="big">${r === '大王' ? '王' : '王'}</span></div>`;
    }
    return `<div class="pk ${RED.has(s) ? 'red' : ''} ${extra}" data-r="${r}"><span class="r">${r}</span><span class="s">${s}</span><span class="big">${s}</span></div>`;
  };
  window.pk = pk;

  // 固定假数据：你是地主「小鱼干」，剩 14 张；上家阿杰刚出了对 K
  const HAND = [['3', '♠'], ['5', '♥'], ['6', '♣'], ['7', '♦'], ['8', '♠'], ['8', '♥'], ['8', '♣'], ['8', '♦'], ['10', '♠'], ['J', '♥'], ['Q', '♣'], ['A', '♦'], ['2', '♠'], ['大王', '']];
  const hand = document.querySelector('.my-hand');
  function renderHand() {
    hand.innerHTML = HAND.map(([r, s]) => pk(r, s)).join('');
    P.indexFan(hand);
    [...hand.children].forEach((c) => c.addEventListener('click', () => c.classList.toggle('sel')));
  }
  renderHand();

  const pile = document.querySelector('.pile-cards');
  const pileLabel = document.querySelector('.pile-label');
  pile.innerHTML = pk('K', '♠') + pk('K', '♥');

  const count = document.querySelector('[data-me-count]');
  const mult = document.querySelector('[data-mult]');
  const slamBomb = document.querySelector('.slam-bomb');
  const bubble = document.querySelector('.me-bubble');

  document.getElementById('btn-hint')?.addEventListener('click', () => {
    [...hand.children].forEach((c) => c.classList.toggle('sel', c.dataset.r === '8'));
  });

  document.getElementById('btn-pass')?.addEventListener('click', () => {
    if (!bubble) return;
    bubble.textContent = '不出';
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
  });

  document.getElementById('btn-play')?.addEventListener('click', async () => {
    const picked = [...hand.querySelectorAll('.sel')];
    if (!picked.length) return;
    const bomb = picked.length === 4 && picked.every((c) => c.dataset.r === picked[0].dataset.r);
    pile.classList.add('leaving');
    await Promise.all(
      picked.map((c, k) => {
        const ghost = c.cloneNode(true);
        ghost.classList.remove('sel');
        ghost.style.transform = 'none';
        c.style.visibility = 'hidden';
        return new Promise((ok) => setTimeout(ok, k * 60)).then(() => P.fly(ghost, c, pile, { lift: 160, spin: 10 + k * 4, duration: 520 }));
      }),
    );
    pile.classList.remove('leaving');
    pile.innerHTML = picked.map((c) => c.outerHTML.replace(' sel', '')).join('');
    [...pile.children].forEach((c) => { c.removeAttribute('style'); c.classList.add('land'); });
    picked.forEach((c) => c.remove());
    P.indexFan(hand);
    if (pileLabel) pileLabel.textContent = bomb ? '小鱼干 · 炸弹' : '小鱼干 出牌';
    if (count) P.roll(count, hand.children.length);
    if (bomb) {
      if (slamBomb) P.slam(slamBomb);
      P.shake(4);
      document.querySelector('.device').classList.add('bombed');
      if (mult) setTimeout(() => P.roll(mult, 12, { prefix: '×', duration: 500 }), 260);
    }
  });

  document.getElementById('btn-kitty')?.addEventListener('click', () => {
    const k = document.querySelector('.kitty');
    const faces = [['A', '♠'], ['2', '♥'], ['小王', '']];
    k.innerHTML = faces.map(([r, s]) => pk(r, s, 'flip')).join('');
  });

  const ring = document.querySelector('.turn-ring');
  if (ring) P.countdown(ring, 20);
})();
