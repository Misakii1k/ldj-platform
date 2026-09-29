(() => {
  // 12 位经典玩家档案
  const PLAYERS = [
    { seat: 1, name: '阿橙', status: 'alive', note: '警下好人牌视角，积极参与分析' },
    { seat: 2, name: '月亮邮递员', status: 'alive', note: '上一轮得 3 票，目前受到怀疑' },
    { seat: 3, name: '小满', status: 'out', note: '第一夜出局，未留遗言' },
    { seat: 4, name: '不吃香菜的猫', status: 'alive', note: '前置位起跳神职，声称持有信息' },
    { seat: 5, name: '十一', status: 'alive', note: '发言偏少，持观望态度' },
    { seat: 6, name: '山间一阵晚风', status: 'alive', self: true, note: '当前玩家席位，持有预言家身份' },
    { seat: 7, name: '南瓜', status: 'alive', note: '下一位准备发言的玩家' },
    { seat: 8, name: '阿白', status: 'alive', note: '状态轻松，逻辑清晰' },
    { seat: 9, name: '薄荷', status: 'out', note: '昨日被 4 票放逐，身份未知' },
    { seat: 10, name: '长颈鹿不熬夜', status: 'alive', note: '投票给 09 号的关键票' },
    { seat: 11, name: '小岛', status: 'alive', note: '弃票者之一，逻辑保持中立' },
    { seat: 12, name: '半夏', status: 'alive', note: '末置位归票位' }
  ];

  // 风格专属文案配置
  const STYLE_CONFIGS = {
    storybook: {
      subtitle: 'THE STORYBOOK FABLE',
      chapter: '第 3 幕 · 林中手稿',
      actionPrompt: '你是 06 号 · 正在向全场发表你的推理'
    },
    tarot: {
      subtitle: 'THE CELESTIAL TAROT',
      chapter: '第 3 度 · 占星灵轨',
      actionPrompt: '你是 06 号 · 星座指针正指向你的箴言'
    },
    folklore: {
      subtitle: 'THE WOODLAND NOIR',
      chapter: '第 3 寒夜 · 霜林肃杀',
      actionPrompt: '你是 06 号 · 冰冷荒野正倾听你的证词'
    },
    theatre: {
      subtitle: 'THE CRIMSON THEATRE',
      chapter: '第 3 幕 · 独 白 审 判',
      actionPrompt: '你是 06 号 · 独白聚光灯正笼罩着你'
    }
  };

  // 状态
  let currentStyle = 'storybook';
  let currentScene = 'day';
  let currentSpeaker = 6;
  let selectedTargetSeat = null;

  // DOM 元素引用
  const $body = document.body;
  const $wingLeft = document.getElementById('wing-left');
  const $wingRight = document.getElementById('wing-right');
  const $dynamicSubtitle = document.getElementById('dynamic-subtitle');
  const $chapterBadge = document.getElementById('chapter-badge');
  const $focusTag = document.getElementById('focus-tag');
  const $focusSeatNum = document.getElementById('focus-seat-num');
  const $focusPlayerName = document.getElementById('focus-player-name');
  const $focusQuote = document.getElementById('focus-quote');
  const $nextPlayerCue = document.getElementById('next-player-cue');
  const $dockStatus = document.getElementById('dock-status');
  const $primaryBtnLabel = document.getElementById('primary-btn-label');
  const $btnPrimaryAction = document.getElementById('btn-primary-action');
  const $btnIdentity = document.getElementById('btn-identity');
  const $modalIdentity = document.getElementById('modal-identity');
  const $btnCloseIdentity = document.getElementById('btn-close-identity');
  const $modalPlayer = document.getElementById('modal-player');
  const $btnClosePlayer = document.getElementById('btn-close-player');
  const $modalPlayerTitle = document.getElementById('modal-player-title');
  const $modalPlayerStatus = document.getElementById('modal-player-status');
  const $modalPlayerLog = document.getElementById('modal-player-log');
  const $btnLedger = document.getElementById('btn-ledger');
  const $btnRules = document.getElementById('btn-rules');
  const $toast = document.getElementById('art-toast');

  // 显示简易 Toast 提示
  function showToast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      $toast.hidden = true;
    }, 2400);
  }

  // 生成单张席位卡片 HTML
  function renderSeatCard(p) {
    const isOut = p.status === 'out';
    const isSpeaking = (currentScene === 'day' && p.seat === currentSpeaker);
    const isSelected = (p.seat === selectedTargetSeat);
    const isSelf = p.self;

    let statusText = '· 存活';
    if (isOut) statusText = '— 已出局';
    else if (isSpeaking) statusText = '● 发言中';
    else if (isSelected) statusText = '✓ 已选中';

    return `
      <button class="seat-card ${isSpeaking ? 'is-speaking' : ''} ${isOut ? 'is-out' : ''} ${isSelected ? 'is-target' : ''}"
              data-seat="${p.seat}"
              aria-label="${p.seat}号 ${p.name}，${isOut ? '已出局' : isSpeaking ? '正在发言' : '在席'}"
              ${isOut && currentScene !== 'day' ? 'disabled' : ''}>
        <div class="seat-top">
          <span class="seat-number">${String(p.seat).padStart(2, '0')}</span>
          ${isSelf ? '<span class="seat-self-badge">本人</span>' : ''}
        </div>
        <div class="seat-name">${p.name}</div>
        <div class="seat-status">${statusText}</div>
      </button>
    `;
  }

  // 渲染两侧席位
  function renderSeats() {
    const leftList = PLAYERS.slice(0, 6);
    const rightList = PLAYERS.slice(6, 12);

    $wingLeft.innerHTML = leftList.map(renderSeatCard).join('');
    $wingRight.innerHTML = rightList.map(renderSeatCard).join('');
  }

  // 切换场景逻辑
  function setScene(scene) {
    currentScene = scene;
    $body.dataset.scene = scene;
    selectedTargetSeat = null;

    document.querySelectorAll('.scene-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.sceneTarget === scene);
    });

    if (scene === 'day') {
      currentSpeaker = 6;
      $focusTag.textContent = '● 06 号发言中';
      $focusSeatNum.textContent = '06';
      $focusPlayerName.textContent = '山间一阵晚风';
      $focusQuote.textContent = '“听完前置位 4、5 号的起跳逻辑，我更倾向相信 4 号是有真视角的预言家。”';
      $nextPlayerCue.innerHTML = '<strong>07 号 南瓜</strong>';
      $dockStatus.textContent = STYLE_CONFIGS[currentStyle].actionPrompt;
      $primaryBtnLabel.textContent = '结束我的发言';
      $btnPrimaryAction.disabled = false;
    } else if (scene === 'night') {
      $focusTag.textContent = '🌙 预言家夜查';
      $focusSeatNum.textContent = '☾';
      $focusPlayerName.textContent = '选择查验目标';
      $focusQuote.textContent = '“请在左右两侧席位中点击选择一名玩家，探查其真实阵营与身份面目。”';
      $nextPlayerCue.innerHTML = '<strong>等待选择</strong>';
      $dockStatus.textContent = '夜深人静 · 全场闭眼中，请下达你的神职指令';
      $primaryBtnLabel.textContent = '请先点击席位';
      $btnPrimaryAction.disabled = true;
    } else if (scene === 'vote') {
      $focusTag.textContent = '🗳️ 第三日公决';
      $focusSeatNum.textContent = '⚔️';
      $focusPlayerName.textContent = '指认放逐嫌疑人';
      $focusQuote.textContent = '“发言阶段结束，全场进入公决投票，得票最高者将被放逐离场。”';
      $nextPlayerCue.innerHTML = '<strong>公决进行中</strong>';
      $dockStatus.textContent = '公决时刻 · 选择你要投出放逐票的席位';
      $primaryBtnLabel.textContent = '请选择放逐对象';
      $btnPrimaryAction.disabled = true;
    }

    renderSeats();
  }

  // 切换风格逻辑
  function setStyle(style) {
    currentStyle = style;
    $body.dataset.style = style;

    document.querySelectorAll('.style-btn').forEach(btn => {
      const active = btn.dataset.styleTarget === style;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });

    const cfg = STYLE_CONFIGS[style];
    $dynamicSubtitle.textContent = cfg.subtitle;
    $chapterBadge.textContent = cfg.chapter;
    if (currentScene === 'day') {
      $dockStatus.textContent = cfg.actionPrompt;
    }

    showToast(`已切换至【${style.toUpperCase()}】艺术设计`);
    renderSeats();
  }

  // 切换视口尺寸
  function setViewport(vp) {
    $body.dataset.viewport = vp;
    document.querySelectorAll('.viewport-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.viewportTarget === vp);
    });
  }

  // 绑定控制栏事件
  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', () => setStyle(btn.dataset.styleTarget));
  });

  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => setScene(btn.dataset.sceneTarget));
  });

  document.querySelectorAll('.viewport-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewport(btn.dataset.viewportTarget));
  });

  // 席位点击交互 (左右翼通用事件处理)
  function handleSeatClick(e) {
    const card = e.target.closest('.seat-card');
    if (!card) return;
    const seatId = Number(card.dataset.seat);
    const p = PLAYERS.find(item => item.seat === seatId);
    if (!p) return;

    if (currentScene === 'day') {
      $modalPlayerTitle.textContent = `${String(p.seat).padStart(2, '0')} 号 · ${p.name}`;
      $modalPlayerStatus.textContent = p.status === 'out' ? '— 已出局' : p.seat === currentSpeaker ? '● 当前发言中' : '· 正常在席';
      $modalPlayerLog.innerHTML = `
        <p><strong>局内简评：</strong>${p.note}</p>
        <p><strong>历史动向：</strong>第二日参与了针对 09 号薄荷的放逐讨论。</p>
      `;
      $modalPlayer.showModal();
    } else if (currentScene === 'night' || currentScene === 'vote') {
      if (p.status === 'out') {
        showToast('该玩家已出局，无法选为目标');
        return;
      }
      if (p.self && currentScene === 'night') {
        showToast('预言家无法查验自己');
        return;
      }

      selectedTargetSeat = seatId;
      renderSeats();

      if (currentScene === 'night') {
        $primaryBtnLabel.textContent = `查验 ${String(p.seat).padStart(2, '0')} 号 ${p.name}`;
        $btnPrimaryAction.disabled = false;
        showToast(`已选定查验目标：${p.seat} 号 ${p.name}`);
      } else {
        $primaryBtnLabel.textContent = `投票放逐 ${String(p.seat).padStart(2, '0')} 号`;
        $btnPrimaryAction.disabled = false;
        showToast(`已选定放逐目标：${p.seat} 号 ${p.name}`);
      }
    }
  }

  $wingLeft.addEventListener('click', handleSeatClick);
  $wingRight.addEventListener('click', handleSeatClick);

  // 主行动按钮点击
  $btnPrimaryAction.addEventListener('click', () => {
    if (currentScene === 'day') {
      currentSpeaker = 7;
      $focusTag.textContent = '● 07 号发言中';
      $focusSeatNum.textContent = '07';
      $focusPlayerName.textContent = '南瓜';
      $focusQuote.textContent = '“接棒 6 号发言。我赞成 6 号关于 4、5 之间真假预言家的拆解，今天我建议出 2 号。”';
      $nextPlayerCue.innerHTML = '<strong>08 号 阿白</strong>';
      $primaryBtnLabel.textContent = '正在倾听发言';
      $btnPrimaryAction.disabled = true;
      $dockStatus.textContent = '你已完成发言 · 请仔细倾听 07 号的分析';
      showToast('发言已结束，席位交接给 07 号');
      renderSeats();
    } else if (currentScene === 'night') {
      const p = PLAYERS.find(item => item.seat === selectedTargetSeat);
      const isWolf = (selectedTargetSeat === 2 || selectedTargetSeat === 8);
      showToast(`查验结果：${p.name} 的真实身份是【${isWolf ? '🐺 狼人阵营' : '✨ 好人阵营'}】！`);
      $primaryBtnLabel.textContent = '查验完毕 · 等待天明';
      $btnPrimaryAction.disabled = true;
    } else if (currentScene === 'vote') {
      showToast(`你已将放逐票投给 ${selectedTargetSeat} 号！等待其他玩家归票...`);
      $primaryBtnLabel.textContent = '已完成投票';
      $btnPrimaryAction.disabled = true;
    }
  });

  // 查看身份弹窗
  $btnIdentity.addEventListener('click', () => {
    $modalIdentity.showModal();
  });

  $btnCloseIdentity.addEventListener('click', () => {
    $modalIdentity.close();
  });

  $btnClosePlayer.addEventListener('click', () => {
    $modalPlayer.close();
  });

  // 规则与记录弹窗
  $btnRules.addEventListener('click', () => {
    $modalPlayerTitle.textContent = '十二人标准板型 · 规则摘要';
    $modalPlayerStatus.textContent = '经典 4 狼、4 民、4 神（预/女/猎/守）';
    $modalPlayerLog.innerHTML = `
      <p><strong>好人阵营：</strong>预言家、女巫、猎人、守卫、4名村民。消灭所有狼人即获胜。</p>
      <p><strong>狼人阵营：</strong>4名狼人。达成屠边（神职或平民全灭）即获胜。</p>
    `;
    $modalPlayer.showModal();
  });

  $btnLedger.addEventListener('click', () => {
    $modalPlayerTitle.textContent = '第二日放逐票型回顾';
    $modalPlayerStatus.textContent = '09 号薄荷 4 票被放逐离场';
    $modalPlayerLog.innerHTML = `
      <p><strong>09 号 (4票)：</strong>来自 02、05、08、10 号</p>
      <p><strong>02 号 (3票)：</strong>来自 04、06、07 号</p>
      <p><strong>05 号 (2票)：</strong>来自 01、09 号</p>
      <p><strong>弃票：</strong>11、12 号</p>
    `;
    $modalPlayer.showModal();
  });

  // 初始化渲染
  renderSeats();
})();
