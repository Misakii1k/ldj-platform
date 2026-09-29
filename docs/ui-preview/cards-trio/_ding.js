// Ding 两稿共用：固定假数据 + 拍铃窗口演出。出牌 / 摸牌复用 _uno.js。只服务于静态预览。
window.TABLE_CFG = {
  top: { c: 'blue', v: '4' },
  hand: [
    { c: 'green', v: '2' },
    { c: 'blue', v: '5' },
    { c: 'green', phrase: '伸了一个懒腰' },
    { c: 'red', v: '6' },
    { c: 'yellow', phrase: '双手抱胸' },
    { c: 'blue', v: '1' },
  ],
  drawPool: [{ c: 'red', v: '3' }, { c: 'green', phrase: '做了一个鬼脸' }, { c: 'yellow', v: '4' }],
};

window.addEventListener('DOMContentLoaded', () => {
  const P = window.Preview, T = window.Table;
  const device = document.querySelector('.device');
  const bell = document.querySelector('.bell');
  const ringBtn = document.getElementById('btn-ring');
  const drawBtn = document.getElementById('btn-draw');
  const bellRing = document.querySelector('.bell-ring');
  const banner = document.querySelector('.phrase-banner');
  const bannerText = banner?.querySelector('.text');
  const opp = document.querySelector('[data-opp="jie"]');
  const discard = document.querySelector('.discard');
  const hand = document.querySelector('.my-hand');
  let open = false;

  function openWindow(phrase, c) {
    open = true;
    device.classList.add('bell-open');
    T.setColor(c);
    if (bannerText) bannerText.textContent = phrase;
    if (banner) { banner.classList.remove('in'); void banner.offsetWidth; banner.classList.add('in'); }
    T.slam(`「${phrase}」`, 'phrase');
    ringBtn.disabled = false;
    ringBtn.classList.add('btn-primary');
    drawBtn.disabled = true;
    if (bellRing) P.countdown(bellRing, 10);
  }
  function closeWindow() {
    open = false;
    device.classList.remove('bell-open');
    ringBtn.disabled = true;
    ringBtn.classList.remove('btn-primary');
    drawBtn.disabled = false;
    clearTimeout(bellRing?._t);
  }
  ringBtn.disabled = true;

  // 演示：阿杰打出一张绿色短语卡，开拍铃窗口
  document.getElementById('demo-open')?.addEventListener('click', async () => {
    if (open) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = T.card({ c: 'green', phrase: '伸手指向牌堆' });
    const c = tmp.firstElementChild;
    await P.fly(c, opp, discard, { lift: 120, spin: 14, duration: 480 });
    discard.innerHTML = T.card({ c: 'green', phrase: '伸手指向牌堆' });
    discard.firstElementChild.classList.add('land');
    openWindow('伸手指向牌堆', 'green');
  });

  function strike() {
    bell.classList.remove('hit');
    void bell.offsetWidth;
    bell.classList.add('hit');
  }

  bell.addEventListener('click', () => ringBtn.click());
  ringBtn.addEventListener('click', async () => {
    if (!open) return;
    strike();
    P.shake(4);
    const match = [...hand.children].find((el) => el.dataset.phrase && el.dataset.c === document.querySelector('.device').dataset.color);
    closeWindow();
    if (!match) {
      T.slam('拍错了！罚摸 1 张', 'phrase');
      setTimeout(() => drawBtn.click(), 500);
      return;
    }
    T.slam('叮！', 'uno');
    document.querySelectorAll('.sticker.active').forEach((s) => s.classList.remove('active'));
    document.querySelector('.me-tag')?.classList.add('active');
    // 抢到回合：自动打出同色短语卡（拍铃成功打出的短语卡不再开窗）
    setTimeout(() => match.click(), 520);
  });

  window.TABLE_CFG.onPhrase = () => {};
});
