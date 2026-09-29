(() => {
  'use strict';
  const gallery = document.getElementById('p-gallery');
  const scenes = { werewolf: 'day', durian: 'placement' };
  const sizes = { phone: [390, 844], small: [360, 640], landscape: [844, 390], desktop: [1280, 800] };
  let size = 'phone';
  function sendScene(game) {
    document.getElementById(`frame-${game}`).contentWindow.postMessage({ type: 'preview-scene', scene: scenes[game] }, '*');
  }
  function fitFrames() {
    const [width, height] = sizes[size];
    gallery.style.setProperty('--device-width', width);
    gallery.style.setProperty('--device-height', height);
    gallery.querySelectorAll('.p-device-space').forEach(space => {
      const scale = Math.min(1, space.clientWidth / (width + 2));
      if (!scale) return;
      space.style.height = `${(height + 2) * scale}px`;
      space.querySelector('.p-device').style.transform = `translateX(-${(width + 2) * scale / 2}px) scale(${scale})`;
    });
  }
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    button.addEventListener('click', () => {
      gallery.dataset.view = button.dataset.view;
      document.querySelectorAll('button[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      fitFrames();
    });
  });
  document.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {
    size = button.dataset.size;
    document.querySelectorAll('[data-size]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    if ((size === 'desktop' || size === 'landscape') && gallery.dataset.view === 'compare') document.querySelector('button[data-view="werewolf"]').click();
    document.getElementById('p-size-note').textContent = `画面按 ${sizes[size][0]} × ${sizes[size][1]} 渲染；空间不足时等比缩小。点击“单独打开”可按浏览器实际尺寸体验。`;
    fitFrames();
  }));
  document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => {
    const game = button.dataset.game;
    scenes[game] = button.dataset.scene;
    document.querySelectorAll(`[data-scene][data-game="${game}"]`).forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    sendScene(game);
  }));
  document.getElementById('p-reset').addEventListener('click', () => { sendScene('werewolf'); sendScene('durian'); });
  document.getElementById('p-hide').addEventListener('click', () => { document.body.classList.add('is-clean'); document.getElementById('p-show').hidden = false; fitFrames(); document.getElementById('p-show').focus(); });
  document.getElementById('p-show').addEventListener('click', () => { document.body.classList.remove('is-clean'); document.getElementById('p-show').hidden = true; fitFrames(); document.getElementById('p-hide').focus(); });
  addEventListener('message', event => {
    if (event.data?.type !== 'preview-ready') return;
    const game = event.data.game;
    if (!Object.hasOwn(scenes, game) || event.source !== document.getElementById(`frame-${game}`).contentWindow) return;
    sendScene(game);
  });
  new ResizeObserver(fitFrames).observe(gallery);
  fitFrames();
})();
