(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // 朝外展示牌只承载"公开且对路人有用"的信息：在玩什么、进行到哪一步、怎么加入。
  // 刻意不包含任何身份、手牌、票型细节。
  const states = {
    playing: {
      status: '正在进行',
      statusKey: 'playing',
      title: '狼人杀',
      sub: '十二人 · 经典场 · 第三日 / 自由之夜之后',
      room: '8241',
      hint: '开局了，欢迎围观这一桌。',
      facts: [
        { label: '进行到', value: '03', unit: '日' },
        { label: '在座', value: '12', unit: '人' },
        { label: '存活', value: '10', unit: '人' },
      ],
    },
    waiting: {
      status: '等待开局',
      statusKey: 'waiting',
      title: '准备开始',
      sub: '十二人 · 经典场 · 人齐了就发牌',
      room: '8241',
      hint: '还差几个人，坐下就能开。',
      facts: [
        { label: '已入座', value: '7', unit: '人' },
        { label: '需要', value: '12', unit: '人' },
        { label: '规则', value: '经典', unit: '场' },
      ],
    },
    durian: {
      status: '正在进行',
      statusKey: 'durian',
      title: '榴莲',
      sub: '水果生意 · 7 人同桌 · 第 02 轮 / 共 07 轮',
      room: '8241',
      hint: '水果生意，心里有数。',
      facts: [
        { label: '轮次', value: '02', unit: '/ 07' },
        { label: '同桌', value: '7', unit: '人' },
        { label: '牌堆', value: '15', unit: '张' },
      ],
    },
  };

  function render(key) {
    const s = states[key] || states.playing;
    $('dx-status').textContent = s.status;
    $('dx-status').dataset.state = s.statusKey;
    $('dx-title').textContent = s.title;
    $('dx-sub').textContent = s.sub;
    $('dx-room').textContent = s.room;
    $('dx-hint').textContent = s.hint;
    $('dx-facts').innerHTML = s.facts
      .map((f) => `<div class="dx-fact"><span>${f.label}</span><b>${f.value}</b><em>${f.unit}</em></div>`)
      .join('');
  }

  const select = $('dx-state');
  const initial = new URLSearchParams(location.search).get('state');
  select.value = initial && states[initial] ? initial : 'playing';
  select.addEventListener('change', () => render(select.value));
  render(select.value);
})();
