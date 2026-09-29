(() => {
  'use strict';
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  const game = document.body.dataset.game;
  const host = document.querySelector('#preview-tools');
  let sceneCallback;
  let scenes = [];
  let select;
  let current;
  if (host && !embedded) {
    host.innerHTML = `<nav class="preview-tools" aria-label="设计预览工具"><a href="index.html">预览入口</a><a href="werewolf.html" ${game === 'werewolf' ? 'aria-current="page"' : ''}>狼人杀</a><a href="durian.html" ${game === 'durian' ? 'aria-current="page"' : ''}>榴莲</a><label>场景 <select aria-label="演示场景"></select></label><button type="button" data-reset>重置</button><button type="button" data-hide>隐藏工具栏</button></nav>`;
    select = host.querySelector('select');
    select.addEventListener('change', () => changeScene(select.value));
    host.querySelector('[data-reset]').addEventListener('click', () => changeScene(current));
    const reopen = document.createElement('button');
    reopen.className = 'preview-reopen';
    reopen.textContent = '显示预览工具';
    reopen.hidden = true;
    document.body.append(reopen);
    host.querySelector('[data-hide]').addEventListener('click', () => { host.hidden = true; reopen.hidden = false; reopen.focus(); });
    reopen.addEventListener('click', () => { host.hidden = false; reopen.hidden = true; host.querySelector('[data-hide]').focus(); });
    if (game === 'durian') {
      host.hidden = true; reopen.hidden = false;
      reopen.textContent = '预览'; reopen.setAttribute('aria-label', '显示预览工具和场景切换');
      document.querySelector('.d-header').append(reopen);
    }
  }
  function changeScene(id) {
    if (!scenes.some(s => s.id === id)) return;
    current = id;
    if (select) select.value = id;
    sceneCallback(id);
  }
  window.Preview = {
    registerScenes(items, callback) {
      scenes = items;
      sceneCallback = callback;
      if (select) for (const item of items) select.add(new Option(item.label, item.id));
      const requested = new URLSearchParams(location.search).get('scene');
      changeScene(items.some(s => s.id === requested) ? requested : items[0].id);
      if (embedded) parent.postMessage({ type: 'preview-ready', game }, '*');
    },
  };
  addEventListener('message', event => {
    if (!embedded || event.source !== parent || event.data?.type !== 'preview-scene') return;
    changeScene(event.data.scene);
  });
})();
