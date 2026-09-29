// 第 2 轮 · Ding 两个画面共用：盘心铃 + 按用户纠正后的规则（2026-09-26）
//   任何时候都能拍铃 → 从手里挑一张短语卡亮出（不用同色）→ 其他人 3 秒内可点「没做过」
//   → 过半质疑 = 拍错，卡收回、罚摸 1 张；否则成功，卡进弃牌堆、回合交给拍铃者。
(function () {
  const P = Preview, U = Party;
  const device = document.querySelector('.device');

  function buildBell() {
    device.insertAdjacentHTML('beforeend', `
      <div class="bell-ring" id="bell-ring"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="46"/><circle class="bar" cx="50" cy="50" r="46"/></svg><span class="ring-num"></span></div>
      <button class="bell" id="bell" aria-label="拍铃" data-box="bell"><span class="wave"></span><span class="wave"></span><span class="base"></span><span class="rim"></span><span class="dome"></span><span class="knob"></span></button>
      <div class="pick-tip" id="pick-tip">点一张你看到的动作</div>
      <div class="reveal" id="reveal" data-box="reveal"><div class="reveal-card"></div>
        <div class="challenge"><b>真的有人这么做了吗？</b><div class="votes" id="votes"></div><span class="left" id="ch-left"></span></div></div>`);
  }

  const state = { phase: 'idle' };

  function strike(miss = false) {
    const bell = document.getElementById('bell');
    bell.classList.remove('hit', 'miss'); void bell.offsetWidth;
    bell.classList.add(miss ? 'miss' : 'hit');
  }

  // 第 1 步：拍铃。手里的短语卡浮起，等你点一张
  function ring(hand) {
    if (state.phase !== 'idle') return false;
    const phrases = [...hand.children].filter((el) => el.dataset.phrase);
    if (!phrases.length) { strike(true); U.slam('手里没有短语卡', 'miss'); return false; }
    strike();
    P.shake(3);
    state.phase = 'picking';
    device.classList.add('picking');
    phrases.forEach((el) => el.classList.add('hot'));
    return true;
  }

  // 第 2 步：亮卡 + 3 秒质疑。votes = 其他人的投票脚本 [{ who, bg, a, doubt, at }]
  async function reveal(el, votes) {
    state.phase = 'challenge';
    device.classList.remove('picking');
    device.querySelectorAll('.my-hand .hot').forEach((x) => x.classList.remove('hot'));
    const box = document.getElementById('reveal');
    const slot = box.querySelector('.reveal-card');
    slot.innerHTML = '';
    const ghost = el.cloneNode(true);
    ghost.style.transform = 'none';
    el.style.visibility = 'hidden';
    device.classList.add('challenging');
    await P.fly(ghost, el, slot, { lift: 120, spin: 10, duration: 460, endScale: 1.6 });
    slot.innerHTML = el.outerHTML.replace(' hot', '');
    slot.firstElementChild.style.visibility = 'visible';
    slot.firstElementChild.classList.add('land');
    U.slam(`「${el.dataset.phrase}」`, 'phrase');
    const list = document.getElementById('votes');
    list.innerHTML = votes.map((v) => `<span class="vote" data-who="${v.who}"><i style="background:${v.bg}">${v.a}</i><em>…</em></span>`).join('');
    const ringEl = document.getElementById('bell-ring');
    device.classList.add('bell-open');
    P.countdown(ringEl, 3);
    const left = document.getElementById('ch-left');
    votes.forEach((v) => setTimeout(() => {
      const tag = list.querySelector(`[data-who="${v.who}"]`);
      tag.classList.add(v.doubt ? 'doubt' : 'ok');
      tag.querySelector('em').textContent = v.doubt ? '没做过' : '有';
      if (!P.reduce) tag.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }, v.at));
    const doubts = votes.filter((v) => v.doubt).length;
    const tick = (s) => { left.textContent = s ? `${s} 秒` : '揭晓'; };
    for (let s = 3; s >= 0; s--) { tick(s); await new Promise((ok) => setTimeout(ok, s ? 1000 : 300)); }
    device.classList.remove('bell-open');
    clearTimeout(ringEl._t);
    const fail = doubts * 2 > votes.length;
    return { fail, doubts, card: slot.firstElementChild, handEl: el };
  }

  function finish() {
    state.phase = 'idle';
    device.classList.remove('challenging');
  }

  window.DingBell = { buildBell, ring, reveal, finish, strike, state };
})();
