(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // 与玩家端 art-directions.js 使用同一组昵称，保证两页是同一局。
  const seats = [
    { no: 1, name: '阿橙', role: '狼人', camp: 'wolf' },
    { no: 2, name: '月亮邮递员', role: '村民', camp: 'villager' },
    { no: 3, name: '小满', role: '预言家', camp: 'god' },
    { no: 4, name: '不吃香菜的猫', role: '狼人', camp: 'wolf' },
    { no: 5, name: '十一', role: '女巫', camp: 'god' },
    { no: 6, name: '山间一阵晚风', role: '村民', camp: 'villager' },
    { no: 7, name: '南瓜', role: '狼人', camp: 'wolf' },
    { no: 8, name: '阿白', role: '守卫', camp: 'god' },
    { no: 9, name: '薄荷', role: '村民', camp: 'villager' },
    { no: 10, name: '长颈鹿不熬夜', role: '狼人', camp: 'wolf' },
    { no: 11, name: '小岛', role: '猎人', camp: 'god' },
    { no: 12, name: '半夏', role: '村民', camp: 'villager' },
  ];

  const state = { out: new Set([3, 9]), ended: false, pending: null };

  const themes = {
    woodcut: 'THE FOREST FABLE',
    eclipse: 'THE ECLIPSE RITUAL',
    curtain: 'THE CRIMSON STAGE',
  };

  /* ---------- 渲染 ---------- */
  function counts() {
    const alive = seats.filter((s) => !state.out.has(s.no));
    const by = (camp) => ({
      total: seats.filter((s) => s.camp === camp).length,
      alive: alive.filter((s) => s.camp === camp).length,
    });
    return { alive: alive.length, wolf: by('wolf'), god: by('god'), villager: by('villager') };
  }

  function render() {
    const c = counts();
    $('mod-alive').textContent = c.alive;
    $('mod-wolf').textContent = c.wolf.total;
    $('mod-wolf-alive').textContent = c.wolf.alive;
    $('mod-god').textContent = c.god.total;
    $('mod-god-alive').textContent = c.god.alive;
    $('mod-villager').textContent = c.villager.total;
    $('mod-villager-alive').textContent = c.villager.alive;

    $('mod-seat-grid').innerHTML = seats
      .map((s) => {
        const out = state.out.has(s.no);
        return `<article class="mod-seat${out ? ' is-out' : ''}${state.ended ? ' is-revealed' : ''}" data-seat="${s.no}">
  <span class="mod-seat__no">${String(s.no).padStart(2, '0')}</span>
  <div class="mod-seat__body">
    <span class="mod-seat__name">${s.name}</span>
    <span class="mod-seat__meta">
      <span class="mod-seat__role" data-camp="${s.camp}">${s.role}</span>
      <span class="mod-seat__state" data-out="${out}">${out ? '已出局' : '存活'}</span>
    </span>
  </div>
  <button class="mod-seat__btn" data-toggle="${s.no}" aria-label="${out ? `撤销 ${s.no} 号 ${s.name} 的出局` : `标记 ${s.no} 号 ${s.name} 出局`}">${out ? '撤销出局' : '标记出局'}</button>
</article>`;
      })
      .join('');

    $('mod-seat-grid').querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => requestToggle(Number(btn.dataset.toggle)));
    });

    const ended = state.ended;
    $('mod-reveal').disabled = ended;
    $('mod-reveal').textContent = ended ? '全场身份底牌已公开' : '结束对局并亮牌 →';
    document.querySelector('.mod-console').classList.toggle('is-ended', ended);
    $('mod-note').textContent = ended
      ? '本局已结束，全场身份底牌已公开；玩家端同步进入亮牌画面。'
      : '仅法官可见全部身份。玩家端在终局亮牌前不会显示任何他人身份。';
    $('mod-seats-hint').textContent = ended ? '本局已结束，仍可修正出局记录。' : '点「标记出局」需要二次确认；出局可撤销。';
  }

  /* ---------- 二次确认 ---------- */
  function askConfirm({ title, body, okText, onOk }) {
    state.pending = onOk;
    $('mod-confirm-title').textContent = title;
    $('mod-confirm-body').innerHTML = body;
    $('mod-confirm-ok').textContent = okText;
    openDialog($('mod-confirm'));
  }

  function requestToggle(no) {
    const seat = seats[no - 1];
    const out = state.out.has(no);
    askConfirm({
      title: out ? '确认撤销出局' : '确认标记出局',
      body: `<p>${String(no).padStart(2, '0')} 号 · ${seat.name}（${seat.role}）<br>当前状态：${out ? '已出局' : '存活'}。</p><p class="mod-muted">${
        out ? '撤销后该席位恢复为存活，玩家端会同步。' : '标记后玩家端会同步为已出局；这一步可以撤销。'
      }</p>`,
      okText: out ? '确认撤销' : '确认标记出局',
      onOk: () => {
        if (out) state.out.delete(no);
        else state.out.add(no);
        render();
      },
    });
  }

  function requestReveal() {
    const c = counts();
    askConfirm({
      title: '确认结束并亮牌',
      body: `<p>结束本局后，全场身份底牌将对所有玩家公开，且不能回到进行中。</p><p class="mod-muted">当前存活 ${c.alive} / ${seats.length} 人：狼人 ${c.wolf.alive}、神职 ${c.god.alive}、村民 ${c.villager.alive}。</p>`,
      okText: '确认结束并亮牌',
      onOk: () => {
        state.ended = true;
        render();
        if (!$('mod-ended-banner')) {
          const banner = document.createElement('p');
          banner.id = 'mod-ended-banner';
          banner.className = 'mod-ended-banner';
          banner.setAttribute('role', 'status');
          banner.textContent = '本局已结束 · 全场身份底牌已公开';
          document.querySelector('.mod-status').after(banner);
        }
      },
    });
  }

  /* ---------- 弹层与焦点 ---------- */
  let returnFocus = null;
  function openDialog(dialog) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
  }
  function trapFocus(dialog) {
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((el) => !el.disabled && el.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) { event.preventDefault(); first.focus({ preventScroll: true }); return; }
      if (event.shiftKey) {
        if (active === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
      } else if (active === last) {
        event.preventDefault(); first.focus({ preventScroll: true });
      }
    });
  }
  document.querySelectorAll('dialog').forEach((dialog) => {
    trapFocus(dialog);
    dialog.addEventListener('close', () => {
      if (document.querySelector('dialog[open]')) return;
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  });

  $('mod-confirm-cancel').addEventListener('click', () => { state.pending = null; $('mod-confirm').close(); });
  $('mod-confirm-ok').addEventListener('click', () => {
    const run = state.pending;
    state.pending = null;
    $('mod-confirm').close();
    if (typeof run === 'function') run();
  });
  $('mod-rules').addEventListener('click', () => openDialog($('mod-rules-dialog')));
  $('mod-rules-close').addEventListener('click', () => $('mod-rules-dialog').close());
  $('mod-reveal').addEventListener('click', requestReveal);

  /* ---------- 主题与工具 ---------- */
  const designChoice = $('design-choice');
  const initialDesign = new URLSearchParams(location.search).get('design') === 'current' ? 'current' : 'refined';
  document.body.dataset.design = initialDesign;
  designChoice.value = initialDesign;
  designChoice.addEventListener('change', () => { document.body.dataset.design = designChoice.value; });

  document.querySelectorAll('.choices button').forEach((btn) => btn.addEventListener('click', () => {
    document.body.dataset.theme = btn.dataset.theme;
    document.querySelectorAll('.choices button').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
    const edition = document.querySelector('.mod-header .brand small');
    if (edition) edition.textContent = themes[btn.dataset.theme];
  }));

  $('hide').addEventListener('click', () => { document.querySelector('.tools').hidden = true; $('show').hidden = false; $('show').focus(); });
  $('show').addEventListener('click', () => { document.querySelector('.tools').hidden = false; $('show').hidden = true; $('hide').focus(); });

  render();
})();
