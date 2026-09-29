(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fruits = ['durian', 'strawberry', 'banana', 'grape', 'apple'];
  const names = { durian: '榴莲', strawberry: '草莓', banana: '香蕉', grape: '葡萄', apple: '苹果' };
  const image = (fruit) => `<img src="assets/fruit-${fruit}.svg" alt="" width="64" height="64">`;
  const half = (fruit, quantity) => ({ fruit, quantity });
  const card = (left, right) => ({ left, right });
  const players = [
    { seat: 1, name: '竹里', penalty: 0, card: card(half('durian', 2), half('banana', 1)) },
    { seat: 2, name: '青柠', penalty: 1, card: card(half('strawberry', 3), half('grape', 2)) },
    { seat: 3, name: '你的小果摊', penalty: 0, card: card(half('durian', 1), half('apple', 2)) },
    { seat: 4, name: '晚风', penalty: 0, card: card(half('banana', 2), half('apple', 1)) },
    { seat: 5, name: '今天也想吃榴莲', penalty: 0, card: card(half('durian', 1), half('strawberry', 2)) },
    { seat: 6, name: '海盐', penalty: 0, card: card(half('grape', 2), half('banana', 1)) },
    { seat: 7, name: '琥珀', penalty: 0, card: card(half('apple', 2), half('strawberry', 1)) },
  ];
  const initialPlacements = [
    { seat: 4, card: card(half('durian', 3), half('apple', 1)), selected: 'left' },
    { seat: 5, card: card(half('banana', 1), half('strawberry', 3)), selected: 'right' },
    { seat: 6, card: card(half('banana', 2), half('durian', 1)), selected: 'left' },
    { seat: 7, card: card(half('apple', 2), half('grape', 2)), selected: 'right' },
    { seat: 1, card: card(half('apple', 3), half('strawberry', 2)), selected: 'left' },
    { seat: 2, card: card(half('durian', 2), half('banana', 1)), selected: 'left' },
  ];
  const drawn = card(half('durian', 3), half('apple', 2));
  $('d-card-layout').addEventListener('change', (event) => { document.body.dataset.cardLayout = event.target.value; });
  let state;
  let previousPhase = null;
  let returnFocus = null;
  const totals = (halves) => {
    const sum = Object.fromEntries(fruits.map((fruit) => [fruit, 0]));
    halves.forEach(({ fruit, quantity }) => { sum[fruit] += quantity; });
    return sum;
  };
  const demand = () => totals(state.placements.map((item) => item.card[item.selected]));
  const stock = totals(players.flatMap((player) => [player.card.left, player.card.right]));
  function reset(scene) {
    previousPhase = null;
    document.querySelectorAll('.d-dialog[open]').forEach((dialog) => dialog.close());
    state = { phase: scene === 'result' ? 'result' : scene, selected: null, round: 2, placements: [...initialPlacements], penalties: players.map((player) => player.penalty), result: null };
    if (scene === 'result') resolveChallenge(true);
    else render();
  }
  // 牌面半边的数量用 ×N 徽章，与生产 .durian-card-half__badge 一致；
  // 累计需求、罚分、座位号等仍是纯数字，不加 ×。
  function miniHalf(value) { return `<div class="d-mini-half">${image(value.fruit)}<span>${names[value.fruit]} <b>×${value.quantity}</b></span></div>`; }
  function render() {
    $('d-round').textContent = String(state.round).padStart(2, '0');
    $('d-own-score').textContent = state.penalties[2];
    $('d-self-state').textContent = state.phase === 'result' ? '已在结算中揭晓' : '本人牌已隐藏';
    $('d-players').innerHTML = players.filter((player) => player.seat !== 3).map((player) => `<article class="d-player" aria-label="${player.seat}号 ${player.name}，${names[player.card.left.fruit]}${player.card.left.quantity}，${names[player.card.right.fruit]}${player.card.right.quantity}"><div class="d-player-head"><span class="d-number">${String(player.seat).padStart(2, '0')}</span><span class="d-player-name" title="${player.name}">${player.name}</span><span class="d-player-penalty">罚 ${state.penalties[player.seat - 1]}</span></div><div class="d-mini-card">${miniHalf(player.card.left)}${miniHalf(player.card.right)}</div></article>`).join('');
    const currentTotals = demand();
    $('d-totals').innerHTML = fruits.map((fruit) => `<div class="d-total">${image(fruit)}<span class="d-total-name">${names[fruit]}</span><strong>${currentTotals[fruit]}</strong>${state.phase === 'placement' && state.selected && drawn[state.selected].fruit === fruit ? `<small>+${drawn[state.selected].quantity}</small>` : ''}</div>`).join('');
    $('d-placement-count').textContent = state.placements.length;
    $('d-deck-count').textContent = 28 - 7 - state.placements.length - (state.phase === 'placement' ? 1 : 0);
    $('d-turn-number').textContent = state.placements.length + (state.phase === 'waiting' || state.phase === 'result' ? 0 : 1);
    const last = state.placements.at(-1);
    $('d-last-action').textContent = last ? `上一手 · ${String(last.seat).padStart(2, '0')} 号${players[last.seat - 1].name}，${names[last.card[last.selected].fruit]} +${last.card[last.selected].quantity}` : '新一轮 · 桌面需求已清空';
    const stage = $('d-card-stage');
    const actions = $('d-actions');
    if (state.phase === 'placement') {
      $('d-turn-caption').textContent = '轮到你了 · 03 号';
      $('d-turn-title').textContent = '哪一半，算数？';
      stage.innerHTML = `<div class="d-drawn-card" role="group" aria-label="选择当前抽牌的生效半边">${['left', 'right'].map((side) => `<button class="d-half" data-side="${side}" aria-pressed="${state.selected === side}"><span class="d-half-label">${side === 'left' ? '左半边' : '右半边'}</span>${image(drawn[side].fruit)}<span class="d-half-fruit">${names[drawn[side].fruit]} <b>×${drawn[side].quantity}</b></span><span class="d-check">${state.selected === side ? '✓ 选中生效' : '选择这半边'}</span></button>`).join('')}</div>`;
      const selected = state.selected && drawn[state.selected];
      $('d-play-hint').textContent = selected ? `本手增加 ${selected.quantity} 个${names[selected.fruit]}；另一半不计入。` : '选一半水果，加入这桌的需求。';
      actions.innerHTML = `<div class="d-action-copy"><strong>${selected ? `已选${names[selected.fruit]} +${selected.quantity}` : '你已摸牌，请选一半'}</strong><span>确认后轮到 04 号晚风</span></div><button class="d-button d-primary" id="d-place" ${selected ? '' : 'disabled'}>${selected ? '确认出牌 →' : '请选择生效半边'}</button>`;
      stage.querySelectorAll('[data-side]').forEach((button) => button.addEventListener('click', () => { state.selected = button.dataset.side; render(); stage.querySelector(`[data-side="${state.selected}"]`).focus({ preventScroll: true }); }));
      $('d-place').addEventListener('click', place);
    } else if (state.phase === 'draw') {
      $('d-turn-caption').textContent = '轮到你了 · 03 号';
      $('d-turn-title').textContent = '再接一单，还是按铃？';
      stage.innerHTML = `<div class="d-deck" aria-label="待抽牌堆">${image('durian')}<strong>DURIAN</strong><small>FRUIT MARKET</small></div>`;
      $('d-play-hint').textContent = state.placements.length ? '相信库存够，就摸牌；觉得超卖，就质疑上一家。' : '新一轮开始，摸一张牌，开张吧。';
      actions.innerHTML = `<div class="d-action-copy"><strong>03 号 · 由你决定</strong><span>${state.placements.length ? '摸牌后本回合不能再质疑' : '这一轮的第一单'}</span></div>${state.placements.length ? '<button class="d-button d-bell-button" id="d-challenge">按铃质疑</button>' : ''}<button class="d-button d-primary" id="d-draw">摸一张牌 →</button>`;
      $('d-draw').addEventListener('click', () => { state.phase = 'placement'; render(); stage.querySelector('[data-side]').focus({ preventScroll: true }); });
      $('d-challenge')?.addEventListener('click', () => resolveChallenge(true));
    } else if (state.phase === 'waiting') {
      $('d-turn-caption').textContent = '等待下一位 · 04 号';
      $('d-turn-title').textContent = '这单，接下了。';
      const placed = state.placements.at(-1).card[state.placements.at(-1).selected];
      stage.innerHTML = `<div class="d-waiting"><span aria-hidden="true">04</span><h3>轮到晚风</h3><p>你已出牌：${names[placed.fruit]} +${placed.quantity}<br>等待下一位玩家摸牌或质疑。</p></div>`;
      $('d-play-hint').textContent = '桌面累计需求已更新。';
      actions.innerHTML = '<div class="d-action-copy"><strong>出牌完成</strong><span>晚风正在决定摸牌或质疑</span></div><button class="d-button" id="d-view-history">看牌列</button><button class="d-button d-primary" id="d-next-inline">开始下一轮 →</button>';
      $('d-view-history').addEventListener('click', () => $('d-history').click());
      $('d-next-inline').addEventListener('click', nextRound);
    } else {
      $('d-turn-caption').textContent = `第 ${state.round} 轮 · 已结算`;
      $('d-turn-title').textContent = state.result.success ? '果然，卖多了。' : '库存，还够呢。';
      stage.innerHTML = `<div class="d-waiting"><span aria-hidden="true">${state.result.success ? '!' : '✓'}</span><h3>${state.result.success ? '质疑成功' : '质疑失败'}</h3><p>${players[state.result.loser - 1].name}本轮罚 ${state.round} 分<br>大家聊完后，再开始下一轮。</p></div>`;
      $('d-play-hint').textContent = '完整库存与需求已经揭晓。';
      actions.innerHTML = '<div class="d-action-copy"><strong>本轮已结束</strong><span>由你手动开始下一轮</span></div><button class="d-button" id="d-view-result">查看结算</button><button class="d-button d-primary" id="d-next-inline">下一轮 →</button>';
      $('d-view-result').addEventListener('click', () => openDialog($('d-result-dialog')));
      $('d-next-inline').addEventListener('click', nextRound);
    }
    syncTurnDialog();
  }
  function syncTurnDialog() {
    const ownTurn = state.phase === 'draw' || state.phase === 'placement';
    const dialog = $('d-turn-dialog');
    $('d-resume-bar').hidden = !ownTurn;
    if (ownTurn) {
      $('d-turn-action-host').append($('d-actions'));
      $('d-turn-summary').textContent = state.phase === 'draw' ? '轮到你 · 摸牌或质疑' : state.selected ? '已选半边 · 尚未提交' : '已摸牌 · 请选择半边';
      if (previousPhase !== state.phase && !dialog.open) openDialog(dialog);
    } else {
      if (dialog.open) dialog.close();
      document.querySelector('.d-game').append($('d-actions'));
    }
    previousPhase = state.phase;
  }
  $('d-resume').addEventListener('click', () => openDialog($('d-turn-dialog')));
  function place() {
    if (state.phase !== 'placement' || !state.selected) return;
    state.placements.push({ seat: 3, card: drawn, selected: state.selected });
    state.phase = 'waiting';
    state.selected = null;
    render();
    // The confirm button is destroyed when the phase flips, so move focus to the
    // first available control of the new phase instead of letting it fall to <body>.
    $('d-actions').querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }
  function resolveChallenge(show) {
    if (state.result) return;
    const currentTotals = demand();
    const over = fruits.filter((fruit) => currentTotals[fruit] > stock[fruit]);
    const accused = state.placements.at(-1)?.seat ?? 2;
    state.result = { success: over.length > 0, loser: over.length ? accused : 3, over };
    state.penalties[state.result.loser - 1] += state.round;
    state.phase = 'result';
    render();
    $('d-result-title').textContent = state.result.success ? '质疑成功' : '质疑失败';
    const own = players[2].card;
    $('d-result-body').innerHTML = `<div class="d-verdict"><strong>${over.length ? `${names[over[0]]}不够了，多卖 ${currentTotals[over[0]] - stock[over[0]]} 个` : '所有水果库存充足'}</strong><p>03 号的你按铃，质疑 ${String(accused).padStart(2, '0')} 号${players[accused - 1].name}。${over.length ? '有水果需求超出全桌实际库存，质疑成立。' : '桌面需求均未超出全桌实际库存。'}</p></div><table class="d-result-table"><thead><tr><th>水果</th><th>桌面需求</th><th>实际库存</th><th>判定</th></tr></thead><tbody>${fruits.map((fruit) => `<tr class="${over.includes(fruit) ? 'is-over' : ''}"><td><span>${image(fruit)}${names[fruit]}</span></td><td>${currentTotals[fruit]}</td><td>${stock[fruit]}</td><td>${over.includes(fruit) ? `超卖 ${currentTotals[fruit] - stock[fruit]}` : '充足'}</td></tr>`).join('')}</tbody></table><div class="d-reveal"><strong>你的隐藏牌揭晓</strong>${image(own.left.fruit)}<span>${names[own.left.fruit]} ${own.left.quantity}</span>${image(own.right.fruit)}<span>${names[own.right.fruit]} ${own.right.quantity}</span></div><div class="d-penalty"><span>${String(state.result.loser).padStart(2, '0')} 号${players[state.result.loser - 1].name} · 累计 ${state.penalties[state.result.loser - 1]} 分</span><b>罚 +${state.round}</b></div><p class="d-result-note">第 ${state.round} 轮罚 ${state.round} 分。结算保留，直到手动开始下一轮。</p>`;
    if (show) openDialog($('d-result-dialog'));
  }
  function openDialog(dialog) {
    returnFocus = document.activeElement;
    dialog.showModal();
  }
  // Native modal dialogs let Tab land on <body> once per cycle, which drops the
  // focus ring and the screen-reader position. Keep the cycle inside the dialog.
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
  function nextRound() {
    document.querySelectorAll('.d-dialog[open]').forEach((dialog) => dialog.close());
    state.round += 1;
    state.phase = 'draw';
    state.placements = [];
    state.selected = null;
    state.result = null;
    $('d-result-body').replaceChildren();
    render();
    $('d-draw').focus({ preventScroll: true });
  }
  $('d-history').addEventListener('click', () => {
    $('d-history-list').innerHTML = state.placements.length ? state.placements.map((item, index) => `<div class="d-history-row"><div class="d-history-meta"><strong>第 ${index + 1} 手</strong><span>${String(item.seat).padStart(2, '0')} 号</span></div>${['left', 'right'].map((side) => `<div class="d-history-half ${side === item.selected ? 'is-active' : ''}" aria-label="${names[item.card[side].fruit]} ${item.card[side].quantity}，${side === item.selected ? '生效' : '不生效'}">${image(item.card[side].fruit)}<span>${names[item.card[side].fruit]}</span><b>×${item.card[side].quantity}</b></div>`).join('')}</div>`).join('') : '<p class="d-dialog-intro">新一轮尚未出牌，桌面需求为 0。</p>';
    openDialog($('d-history-dialog'));
  });
  $('d-next-round').addEventListener('click', nextRound);
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('.d-dialog').forEach((dialog) => {
    trapFocus(dialog);
    dialog.addEventListener('close', () => {
      if (document.querySelector('.d-dialog[open]')) return;
      if (!$('d-resume-bar').hidden) $('d-resume').focus({ preventScroll: true });
      else if (returnFocus?.isConnected && !returnFocus.closest('dialog')) returnFocus.focus({ preventScroll: true });
      else $('d-actions').querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  });
  const scenes = [
    { id: 'placement', label: '选择生效半边' },
    { id: 'draw', label: '摸牌 / 质疑' },
    { id: 'result', label: '质疑结算' },
  ];
  if (window.Preview) window.Preview.registerScenes(scenes, reset);
  else reset('placement');
})();
