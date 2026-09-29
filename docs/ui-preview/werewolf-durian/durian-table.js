(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const fruits = ['durian', 'strawberry', 'banana', 'grape', 'apple'];
  const names = { durian: '榴莲', strawberry: '草莓', banana: '香蕉', grape: '葡萄', apple: '苹果' };
  const image = (fruit) => `<img src="assets/fruit-${fruit}.svg" alt="" width="34" height="34">`;
  const half = (fruit, quantity) => ({ fruit, quantity });
  const card = (left, right) => ({ left, right });

  // 与 durian.html 的示例局保持同一桌、同一进度。
  const players = [
    { seat: 1, name: '竹里', penalty: 0 },
    { seat: 2, name: '青柠', penalty: 1 },
    { seat: 3, name: '你的小果摊', penalty: 0 },
    { seat: 4, name: '晚风', penalty: 0 },
    { seat: 5, name: '今天也想吃榴莲', penalty: 0 },
    { seat: 6, name: '海盐', penalty: 0 },
    { seat: 7, name: '琥珀', penalty: 0 },
  ];

  const tablePlacements = [
    { seat: 4, card: card(half('durian', 3), half('apple', 1)), selected: 'left' },
    { seat: 5, card: card(half('banana', 1), half('strawberry', 3)), selected: 'right' },
    { seat: 6, card: card(half('banana', 2), half('durian', 1)), selected: 'left' },
    { seat: 7, card: card(half('apple', 2), half('grape', 2)), selected: 'right' },
    { seat: 1, card: card(half('apple', 3), half('strawberry', 2)), selected: 'left' },
    { seat: 2, card: card(half('durian', 2), half('banana', 1)), selected: 'left' },
  ];

  // 公共视图字段：轮次、牌堆、当前与上一手、罚分、淘汰。头顶牌与摸到的牌一律不出现在这里。
  const view = {
    round: 2,
    maxRounds: 7,
    deckTotal: 28,
    foreheadCount: 7,
    placements: tablePlacements,
    currentPlayerId: 3,
    previousPlayerId: 2,
    penalties: players.map((p) => p.penalty),
    eliminated: [],
  };

  const activeTotals = () => {
    const sum = Object.fromEntries(fruits.map((f) => [f, 0]));
    view.placements.forEach((item) => { sum[item.card[item.selected].fruit] += item.card[item.selected].quantity; });
    return sum;
  };

  function render() {
    $('dt-round').textContent = String(view.round).padStart(2, '0');
    $('dt-max-round').textContent = String(view.maxRounds).padStart(2, '0');

    const totals = activeTotals();
    $('dt-totals').innerHTML = fruits
      .map((fruit) => `<div class="d-total">${image(fruit)}<span class="d-total-name">${names[fruit]}</span><strong>${totals[fruit]}</strong></div>`)
      .join('');

    $('dt-placement-note').textContent = `共 ${view.placements.length} 张 · 绿底半边计入需求`;
    $('dt-placements').innerHTML = view.placements
      .map((item, index) => {
        const halves = ['left', 'right']
          .map((side) => {
            const active = side === item.selected;
            return `<div class="dt-half-mini ${active ? 'is-active' : 'is-void'}" aria-label="${names[item.card[side].fruit]} ${item.card[side].quantity}，${active ? '生效' : '不生效'}">${image(item.card[side].fruit)}<span>${names[item.card[side].fruit]}</span><b>×${item.card[side].quantity}</b></div>`;
          })
          .join('');
        return `<article class="dt-placement" aria-label="第 ${index + 1} 手，${item.seat} 号"><span class="dt-placement__no">${String(item.seat).padStart(2, '0')}</span><div class="dt-placement__halves">${halves}</div></article>`;
      })
      .join('');

    const current = players[view.currentPlayerId - 1];
    const previous = view.previousPlayerId ? players[view.previousPlayerId - 1] : null;
    const last = view.placements.at(-1);
    $('dt-turn').innerHTML = `<strong>现在轮到 ${String(view.currentPlayerId).padStart(2, '0')} 号 · ${current.name}</strong><span>${
      last ? `上一手 · ${String(last.seat).padStart(2, '0')} 号${players[last.seat - 1].name}，${names[last.card[last.selected].fruit]} +${last.card[last.selected].quantity}` : '新一轮，桌面需求已清空'
    }${previous ? `<br>上家 ${String(previous.seat).padStart(2, '0')} 号 · ${previous.name}` : ''}</span>`;

    const remaining = view.deckTotal - view.foreheadCount - view.placements.length;
    $('dt-deck').innerHTML = `${image('durian')}<div><span>牌堆剩余</span><b>${remaining}</b></div>`;

    $('dt-players').innerHTML = players
      .map((p) => {
        const out = view.eliminated.includes(p.seat);
        const isCurrent = p.seat === view.currentPlayerId;
        return `<div class="dt-player${isCurrent ? ' is-current' : ''}${out ? ' is-eliminated' : ''}" aria-label="${p.seat} 号 ${p.name}，罚分 ${view.penalties[p.seat - 1]}${out ? '，已淘汰' : ''}"><span class="dt-player__no">${String(p.seat).padStart(2, '0')}</span><span class="dt-player__name">${p.name}${isCurrent ? ' · 出牌中' : ''}${out ? ' · 已淘汰' : ''}</span><span class="dt-player__pen">罚 <b>${view.penalties[p.seat - 1]}</b></span></div>`;
      })
      .join('');
  }

  render();
})();
