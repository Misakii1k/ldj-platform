(() => {
  'use strict';
  const names = ['阿橙', '月亮邮递员', '小满', '不吃香菜的猫', '十一', '山间一阵晚风', '南瓜', '阿白', '薄荷', '长颈鹿不熬夜', '小岛', '半夏'];
  const $ = id => document.getElementById(id);
  const dead = new Set([3, 9]);
  let phase = 'day', selected = null, submitted = false, speaker = 6, toastTimer;
  const seats = $('w-seats');
  const dialog = $('w-dialog');
  let dialogKind = null;
  function say(text) { clearTimeout(toastTimer); $('w-toast').textContent = text; $('w-toast').hidden = false; toastTimer = setTimeout(() => { $('w-toast').hidden = true; }, 2600); }
  function render() {
    document.body.dataset.phase = phase;
    const night = phase === 'night', vote = phase === 'vote';
    $('w-day').textContent = night ? '第三夜' : '第三日';
    $('w-phase-kicker').textContent = night ? 'NIGHTFALL / 03' : 'DAYLIGHT / 03';
    $('w-scene-label').textContent = night ? '夜幕 · 预言家行动' : vote ? '放逐投票 · 作出选择' : '白昼 · 寻找真相';
    $('w-phase-title').textContent = night ? '借一束光，看清真相。' : vote ? '这一票，交给你的判断。' : '每一句话，都有分量。';
    $('w-time').textContent = night ? '00:30' : vote ? '00:25' : '00:48';
    $('w-hero-number').textContent = night ? '☾' : vote ? (selected ? String(selected).padStart(2, '0') : '？') : String(speaker).padStart(2, '0');
    $('w-hero-tag').textContent = submitted ? '已完成本次行动' : night ? '你的查验时刻' : vote ? '每人一票' : speaker === 6 ? '轮到你发言' : '请听现场发言';
    $('w-hero-name').textContent = night ? (submitted ? '查验已完成' : selected ? names[selected - 1] : '请选择查验对象') : vote ? (submitted ? '你的投票已提交' : selected ? names[selected - 1] : '请选择放逐对象') : names[speaker - 1];
    $('w-hero-description').textContent = submitted ? '等待其他玩家完成行动。' : night ? '轻点席位，查验一名玩家的阵营。' : vote ? '选中后仍可更换，确认后提交。' : '说出你的判断，也听见不同的声音。';
    $('w-scene-foot').textContent = night ? '查验结果' : vote ? '当前选择' : '下一位发言';
    $('w-next').textContent = night ? '仅你可见' : vote ? (selected ? `${String(selected).padStart(2, '0')} 号 · ${names[selected - 1]}` : '尚未选择') : `${String(speaker + 1).padStart(2, '0')} 号 · ${names[speaker]}`;
    seats.innerHTML = names.map((name, i) => {
      const n = i + 1, out = dead.has(n), active = phase === 'day' && n === speaker, picked = selected === n;
      const selectable = phase !== 'day' && !out && n !== 6 && !submitted;
      return `<button class="w-seat ${out ? 'is-out' : ''} ${active ? 'is-speaking' : ''} ${picked ? 'is-selected' : ''}" data-seat="${n}" aria-label="${n}号 ${name} ${out ? '已出局' : active ? '发言中' : '存活'}" ${phase !== 'day' ? `aria-pressed="${picked}"` : ''} ${!selectable && phase !== 'day' ? 'disabled' : ''}><span class="w-seat-top"><span class="w-seat-number">${String(n).padStart(2, '0')}</span>${n === 6 ? '<span class="w-seat-self">我</span>' : ''}</span><span class="w-seat-name" title="${name}">${name}</span><span class="w-seat-status">${picked ? '✓ 已选择' : out ? '— 已出局' : active ? '● 发言中' : '· 存活'}</span></button>`;
    }).join('');
    $('w-table-note').textContent = submitted ? '操作已提交，请等候下一阶段' : night ? '你的选择与查验结果不会向其他人展示' : vote ? '轻点席位选择对象，再点击下方确认' : `${speaker} 号正在发言，请留意现场交流`;
    $('w-action-hint').textContent = submitted ? '已完成 · 可以抬头继续现场交流' : phase === 'day' ? (speaker === 6 ? '你是 6 号 · 发言结束后交给下一位' : `你是 6 号 · 正在聆听 ${speaker} 号发言`) : selected ? `已选择 ${selected} 号 · ${names[selected - 1]}` : '你是 6 号 · 请选择一名存活玩家';
    $('w-primary').textContent = submitted ? '已提交，等待其他人' : phase === 'day' ? (speaker === 6 ? '结束发言 →' : `${speaker} 号发言中`) : selected ? `${night ? '确认查验' : '确认投票'} ${selected} 号 →` : '先选择一名玩家';
    $('w-primary').disabled = submitted || (phase === 'day' ? speaker !== 6 : selected === null);
  }
  function openDialog(kind, html, closeLabel = '关闭') {
    dialogKind = kind;
    $('w-dialog-content').innerHTML = html;
    $('w-dialog-close').textContent = closeLabel;
    dialog.showModal();
  }
  function clearDialog() { dialogKind = null; $('w-dialog-content').replaceChildren(); }
  dialog.addEventListener('close', clearDialog);
  $('w-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  function conceal() { if (dialog.open && (dialogKind === 'identity' || dialogKind === 'result')) { dialog.close(); clearDialog(); } }
  addEventListener('blur', conceal);
  document.addEventListener('visibilitychange', () => { if (document.hidden) conceal(); });
  seats.addEventListener('click', event => {
    const button = event.target.closest('[data-seat]');
    if (!button || button.disabled) return;
    const n = Number(button.dataset.seat);
    if (phase === 'day') {
      openDialog('seat', `<p class="w-eyebrow">SEAT ${String(n).padStart(2, '0')}</p><h2 id="w-dialog-title">${n} 号 · ${names[n - 1]}</h2><p>${dead.has(n) ? '已出局' : n === speaker ? '正在发言' : '存活'} · 身份尚未公开</p><p>留意现场发言，秘密身份只会在终局公开。</p>`);
      return;
    }
    selected = n; render();
    seats.querySelector(`[data-seat="${n}"]`).focus({ preventScroll: true });
  });
  $('w-primary').addEventListener('click', () => {
    if ($('w-primary').disabled) return;
    if (phase === 'day') { speaker = 7; render(); say('发言已结束，轮到 7 号南瓜。'); return; }
    submitted = true; render();
    if (phase === 'night') openDialog('result', `<p class="w-eyebrow">ONLY FOR YOUR EYES</p><h2 id="w-dialog-title">${selected} 号的查验结果</h2><div class="w-vote-detail"><span class="w-role-camp">${selected === 2 || selected === 10 ? '狼人阵营' : '好人阵营'}</span><p>${names[selected - 1]}</p></div><p>查验已完成。记下结果后收起，避免被旁人看见。</p>`, '收起查验结果');
    else say(`已将你的放逐票投给 ${selected} 号。`);
  });
  $('w-identity').addEventListener('click', () => openDialog('identity', '<p class="w-eyebrow">YOUR SECRET / 06</p><img class="w-role-image" src="assets/seer.png" width="170" height="170" alt="预言家角色插画"><h2 id="w-dialog-title">预言家</h2><span class="w-role-camp">好人阵营 · 神职</span><p>每晚可以查验一名玩家的阵营。<br>用你知道的真相，帮助好人找到狼人。</p><p>仅自己查看，离开页面会自动收起。</p>', '我记住了，收起身份'));
  $('w-rules').addEventListener('click', () => openDialog('rules', '<p class="w-eyebrow">TONIGHT’S COMPANY</p><h2 id="w-dialog-title">十二人 · 经典场</h2><dl><dt>阵营配置</dt><dd>4 狼人 · 4 村民 · 预言家、女巫、猎人、守卫各 1 名</dd><dt>白天</dt><dd>依次发言，再投票放逐。讨论时可以点开席位查看完整昵称。</dd><dt>夜晚</dt><dd>按系统引导完成自己角色的行动，秘密信息不会公开。</dd><dt>本页演示</dt><dd>固定示例数据；通过预览工具切换白天、夜晚与投票。</dd></dl>'));
  $('w-ledger').addEventListener('click', () => openDialog('ledger', '<p class="w-eyebrow">VOTE RECORD / DAY 02</p><h2 id="w-dialog-title">上一轮放逐票型</h2><div class="w-vote-detail"><p>9 号薄荷 · 4 票<br>来自 2、5、8、10 号</p><p>2 号月亮邮递员 · 3 票<br>来自 1、6、7 号</p><p>5 号十一 · 2 票<br>来自 4、9 号</p><p>弃票 · 11、12 号</p></div><p>9 号出局，身份未公开。</p>'));
  window.Preview.registerScenes([{ id: 'day', label: '白天发言' }, { id: 'night', label: '夜间查验' }, { id: 'vote', label: '放逐投票' }], id => {
    if (dialog.open) dialog.close();
    phase = id; selected = null; submitted = false; speaker = 6;
    clearTimeout(toastTimer); $('w-toast').hidden = true; render();
    document.querySelector('.w-scroll').scrollTop = 0;
  });
})();
