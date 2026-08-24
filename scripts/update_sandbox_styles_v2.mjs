import fs from 'node:fs';

const filePath = 'packages/client/src/styles.css';
let css = fs.readFileSync(filePath, 'utf8');

const marker = '/* ══════════════════════════════════════════════════════════════════════════\n   创意工坊（Party Sandbox）高保真拟物桌游与互动道具全套样式';

const updatedStyles = `/* ══════════════════════════════════════════════════════════════════════════
   创意工坊（Party Sandbox）高保真拟物桌游与互动道具全套样式
   ══════════════════════════════════════════════════════════════════════════ */

.sandbox-arena {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 8px 12px 40px;
  box-sizing: border-box;
}

.sandbox-top-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  background: #fffdf7;
  border: 2.5px solid var(--home-ink, #221e1a);
  border-radius: 16px;
  padding: 8px 12px;
  box-shadow: 2px 3px 0 var(--home-ink, #221e1a);
}

.sandbox-top-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 12px;
  font-size: 0.84rem;
  font-weight: 900;
  border: 2px solid var(--home-ink, #221e1a);
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.sandbox-top-btn:hover {
  transform: translate(-1px, -1px);
}

.sandbox-top-btn--ai {
  background: #e0f2fe;
  color: #0369a1;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
}

.sandbox-top-btn--editor {
  background: #fef08a;
  color: #854d0e;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
}

.sandbox-top-btn--reset {
  background: #fee2e2;
  color: #991b1b;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
  margin-left: auto;
}

.sandbox-top-bar__divider {
  width: 2px;
  height: 24px;
  background: rgba(34, 30, 26, 0.15);
  margin: 0 4px;
}

.sandbox-add-prop-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.sandbox-mini-add-btn {
  padding: 4px 8px;
  font-size: 0.76rem;
  font-weight: 800;
  border-radius: 8px;
  border: 1.5px solid var(--home-ink, #221e1a);
  background: #ffffff;
  color: var(--home-ink, #221e1a);
  cursor: pointer;
  box-shadow: 1px 1px 0 var(--home-ink, #221e1a);
  transition: all 0.1s ease;
  white-space: nowrap;
}

.sandbox-mini-add-btn:hover {
  background: #fff8db;
  transform: translateY(-1px);
}

.sandbox-assistant-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #f0fdf4;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 14px;
  padding: 10px 14px;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
}

.sandbox-assistant-banner__avatar {
  font-size: 1.8rem;
}

.sandbox-assistant-banner__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sandbox-assistant-banner__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #166534;
}

.sandbox-assistant-banner__prompt {
  color: #716b61;
  font-style: italic;
}

.sandbox-assistant-banner__text {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--home-ink, #221e1a);
  line-height: 1.4;
}

.sandbox-props-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
  width: 100%;
}

.sandbox-prop-card {
  background: #fffdf7;
  border: 2.5px solid var(--home-ink, #221e1a);
  border-radius: 18px;
  box-shadow: 3px 4px 0 var(--home-ink, #221e1a);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sandbox-prop-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fef3c7;
  border-bottom: 2px solid var(--home-ink, #221e1a);
  font-weight: 900;
  font-size: 0.88rem;
}

.sandbox-prop-card__close {
  background: none;
  border: none;
  font-size: 1rem;
  font-weight: 900;
  color: #991b1b;
  cursor: pointer;
  padding: 0 4px;
}

.sandbox-prop-card__body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.sandbox-prop-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}

.sandbox-btn {
  padding: 7px 12px;
  border-radius: 12px;
  font-weight: 900;
  font-size: 0.82rem;
  border: 2px solid var(--home-ink, #221e1a);
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
  transition: all 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.sandbox-btn:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--home-ink, #221e1a);
}

.sandbox-btn:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: none;
}

.sandbox-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sandbox-btn--primary {
  background: #f8c822;
  color: #221e1a;
}

.sandbox-btn--secondary {
  background: #38bdf8;
  color: #0c4a6e;
}

.sandbox-btn--outline {
  background: #ffffff;
  color: #221e1a;
}

.sandbox-btn--cancel {
  background: #f3f4f6;
  color: #4b5563;
}

.sandbox-btn--peek {
  background: #fef08a;
  color: #854d0e;
  font-size: 0.74rem;
  padding: 4px 8px;
}

.sandbox-btn--peek-hide {
  background: #fee2e2;
  color: #991b1b;
  font-size: 0.74rem;
  padding: 4px 8px;
}

/* 左轮手枪细节 */
.sandbox-revolver-status {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
}

.sandbox-cylinder-wheel {
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.25));
}

.sandbox-revolver-feedback {
  font-size: 0.84rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 8px;
  text-align: center;
}

.sandbox-revolver-feedback.is-live {
  background: #fee2e2;
  color: #dc2626;
  animation: shake 0.3s;
}

.sandbox-revolver-feedback.is-blank {
  background: #f0fdf4;
  color: #16a34a;
}

/* 摇骰盅细节与骨质圆角点数骰子 */
.sandbox-dice-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.sandbox-dice-cup-covered {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: #fff8db;
  border: 2px dashed var(--home-ink, #221e1a);
  border-radius: 12px;
  padding: 10px 16px;
  width: 100%;
}

.sandbox-dice-cup-icon {
  font-size: 2.2rem;
}

.sandbox-dice-values {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
}

.sandbox-dice-box {
  width: 44px;
  height: 44px;
  background: #ffffff;
  border: 2.5px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  box-shadow: 2px 3px 0 var(--home-ink, #221e1a);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  box-sizing: border-box;
}

.sandbox-d6-face {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  width: 100%;
  height: 100%;
  gap: 2px;
}

.sandbox-pip {
  border-radius: 50%;
  width: 6px;
  height: 6px;
  margin: auto;
}

.sandbox-pip.is-active {
  background: #221e1a;
}

.sandbox-pip.is-center-red.is-active {
  background: #dc2626;
  width: 9px;
  height: 9px;
}

.sandbox-dice-d20-text {
  font-size: 1.1rem;
  font-weight: 900;
  color: #ea580c;
}

.sandbox-dice-sum {
  font-size: 0.84rem;
  font-weight: 800;
  color: #716b61;
}

/* 抢答铃细节 */
.sandbox-bell-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.sandbox-big-bell-btn {
  width: 104px;
  height: 104px;
  border-radius: 50%;
  border: 3px solid var(--home-ink, #221e1a);
  background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
  box-shadow: 0 6px 0 #b45309, 0 10px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.1s ease;
}

.sandbox-big-bell-btn:active {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #b45309, 0 4px 8px rgba(0, 0, 0, 0.2);
}

.sandbox-big-bell-btn.is-rung {
  animation: bellRing 0.5s ease;
}

@keyframes bellRing {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-15deg); }
  75% { transform: rotate(15deg); }
}

.sandbox-big-bell-icon {
  font-size: 2.3rem;
}

.sandbox-big-bell-text {
  font-size: 0.74rem;
  font-weight: 900;
  color: #221e1a;
}

.sandbox-bell-info {
  text-align: center;
  font-size: 0.84rem;
}

.sandbox-bell-winner {
  color: #08715d;
  font-weight: 800;
}

/* SVG 拟物转盘 */
.sandbox-wheel-prop {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.sandbox-wheel-prop__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sandbox-wheel-prop__title {
  font-weight: 900;
  font-size: 0.88rem;
}

.sandbox-wheel-edit-btn {
  font-size: 0.72rem;
  font-weight: 800;
  background: #ffffff;
  border: 1.5px solid var(--home-ink, #221e1a);
  border-radius: 8px;
  padding: 2px 8px;
  cursor: pointer;
  box-shadow: 1px 1px 0 var(--home-ink, #221e1a);
}

.sandbox-wheel-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.sandbox-wheel-stage {
  position: relative;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sandbox-wheel-top-pointer {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.sandbox-wheel-disc-wrapper {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sandbox-wheel-svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.15));
}

.sandbox-wheel-result-banner {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sandbox-wheel-result-active {
  background: #fff8db;
  border: 1.5px solid var(--home-ink, #221e1a);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.84rem;
  box-shadow: 1px 1px 0 var(--home-ink, #221e1a);
}

.sandbox-wheel-result-text {
  color: #ea580c;
}

.sandbox-wheel-spin-btn {
  width: 100%;
}

.sandbox-wheel-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sandbox-wheel-editor__label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #716b61;
}

.sandbox-wheel-editor__textarea {
  width: 100%;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  box-sizing: border-box;
}

.sandbox-wheel-editor__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 筹码计分板细节 */
.sandbox-scoreboard-prop {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.sandbox-scoreboard-prop__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sandbox-scoreboard-prop__title-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sandbox-scoreboard-prop__title {
  font-weight: 900;
  font-size: 0.88rem;
}

.sandbox-scoreboard-prop__unit-tag {
  font-size: 0.7rem;
  color: #716b61;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 6px;
}

.sandbox-scoreboard-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.sandbox-scoreboard-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f9fafb;
  border: 1.5px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 4px 8px;
}

.sandbox-scoreboard-row.is-leader {
  background: #fefce8;
  border-color: #f59e0b;
}

.sandbox-scoreboard-rank-badge {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 0.68rem;
  font-weight: 900;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #374151;
}

.sandbox-scoreboard-rank-badge.rank-1 {
  background: #f59e0b;
  color: #ffffff;
}

.sandbox-scoreboard-player {
  flex: 1;
  min-width: 0;
}

.sandbox-scoreboard-player__name {
  font-size: 0.78rem;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sandbox-scoreboard-score {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}

.sandbox-scoreboard-score__currency {
  font-size: 0.8rem;
}

.sandbox-scoreboard-score__num {
  font-size: 0.92rem;
  font-weight: 900;
  color: #b45309;
}

.sandbox-scoreboard-btns {
  display: flex;
  gap: 3px;
}

.sandbox-chip-btn {
  padding: 2px 5px;
  font-size: 0.7rem;
  font-weight: 900;
  border-radius: 6px;
  border: 1px solid var(--home-ink, #221e1a);
  cursor: pointer;
  background: #ffffff;
  transition: transform 0.1s;
}

.sandbox-chip-btn:active {
  transform: scale(0.9);
}

.sandbox-chip-btn.chip-minus-10 {
  color: #dc2626;
  background: #fee2e2;
}

.sandbox-chip-btn.chip-minus-1 {
  color: #ef4444;
  background: #fef2f2;
}

.sandbox-chip-btn.chip-plus-1 {
  color: #16a34a;
  background: #dcfce7;
}

.sandbox-chip-btn.chip-plus-10 {
  color: #0284c7;
  background: #e0f2fe;
}

.sandbox-chip-btn.chip-plus-50 {
  color: #d97706;
  background: #fef3c7;
}

/* 定时炸弹细节 */
.sandbox-timer-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
  gap: 4px;
}

.sandbox-timer-digits {
  font-size: 2.4rem;
  font-weight: 900;
  font-family: monospace;
  color: #221e1a;
}

.sandbox-timer-clock.is-running .sandbox-timer-digits {
  color: #ea580c;
  animation: pulse 1s infinite;
}

.sandbox-timer-clock.is-exploded .sandbox-timer-digits {
  color: #dc2626;
}

.sandbox-timer-boom {
  font-size: 0.88rem;
  font-weight: 900;
  color: #dc2626;
  animation: shake 0.4s;
}

/* 3D 幸运硬币细节 */
.sandbox-coin-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  perspective: 600px;
}

.sandbox-coin-disc {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid var(--home-ink, #221e1a);
  background: #fcd34d;
  box-shadow: 0 4px 0 #b45309;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 900;
  transition: transform 0.6s ease;
  position: relative;
  transform-style: preserve-3d;
}

.sandbox-coin-disc.is-flipping {
  animation: coinSpin3D 0.6s ease-in-out;
}

@keyframes coinSpin3D {
  0% { transform: rotateY(0) translateY(0); }
  50% { transform: rotateY(900deg) translateY(-24px); }
  100% { transform: rotateY(1800deg) translateY(0); }
}

.sandbox-coin-side {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
}

.sandbox-coin-side.back {
  transform: rotateY(180deg);
}

.sandbox-coin-disc.is-tails {
  transform: rotateY(180deg);
  background: #e5e7eb;
}

.sandbox-coin-result {
  font-size: 0.84rem;
  font-weight: 800;
}

/* 卡牌堆细节 */
.sandbox-deck-stats {
  display: flex;
  gap: 8px;
  font-size: 0.74rem;
  font-weight: 700;
  color: #716b61;
}

.sandbox-table-cards-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
  background: #fff8db;
  border: 2px dashed var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 8px;
}

.sandbox-table-card {
  background: #ffffff;
  border: 1.5px solid var(--home-ink, #221e1a);
  border-radius: 8px;
  padding: 6px 8px;
}

.sandbox-table-card__author {
  font-size: 0.7rem;
  color: #716b61;
  display: block;
}

.sandbox-table-card__title {
  font-size: 0.82rem;
  font-weight: 900;
  display: block;
  color: #ea580c;
}

.sandbox-table-card__content {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: #221e1a;
  white-space: pre-wrap;
}

/* 手牌抽屉 */
.sandbox-hand-drawer {
  background: #fffdf7;
  border: 2.5px solid var(--home-ink, #221e1a);
  border-radius: 16px;
  box-shadow: 3px 3px 0 var(--home-ink, #221e1a);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sandbox-hand-drawer__header {
  font-size: 0.86rem;
  color: #08715d;
}

.sandbox-hand-cards-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 8px;
}

.sandbox-hand-card {
  flex: 0 0 160px;
  background: #ffffff;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.12s ease;
}

.sandbox-hand-card:hover {
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 var(--home-ink, #221e1a);
}

.sandbox-hand-card.is-selected {
  background: #fff8db;
  border-color: #d97706;
  transform: translateY(-4px);
  box-shadow: 3px 4px 0 var(--home-ink, #221e1a);
}

.sandbox-hand-card__title {
  font-size: 0.82rem;
  font-weight: 900;
  color: #ea580c;
}

.sandbox-hand-card__content {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.35;
  color: #221e1a;
  white-space: pre-wrap;
}

.sandbox-hand-card__actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.sandbox-btn--mini {
  padding: 3px 6px;
  font-size: 0.7rem;
  flex: 1;
}

/* 活动日志 */
.sandbox-activity-box {
  background: #faf7f2;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 14px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sandbox-activity-title {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 900;
  color: #716b61;
}

.sandbox-activity-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.sandbox-activity-item {
  display: flex;
  gap: 8px;
  font-size: 0.76rem;
}

.sandbox-activity-time {
  color: #9ca3af;
  font-family: monospace;
}

.sandbox-activity-text {
  color: #374151;
}

/* 弹窗与 AI 助手样式 */
.sandbox-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  backdrop-filter: blur(2px);
}

.sandbox-modal-dialog {
  background: #fffdf7;
  border: 3px solid var(--home-ink, #221e1a);
  border-radius: 20px;
  box-shadow: 6px 6px 0 var(--home-ink, #221e1a);
  width: min(720px, 94vw);
  max-height: min(88vh, 700px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sandbox-modal-dialog--small {
  width: min(400px, 94vw);
}

.sandbox-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: #fef3c7;
  border-bottom: 2.5px solid var(--home-ink, #221e1a);
}

.sandbox-modal-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 900;
}

.sandbox-modal-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  font-weight: 900;
  cursor: pointer;
}

.sandbox-modal-body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sandbox-ai-input-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #e0f2fe;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 14px;
  padding: 12px;
}

.sandbox-ai-label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #0369a1;
}

.sandbox-ai-input-row {
  display: flex;
  gap: 8px;
}

.sandbox-ai-text-input {
  flex: 1;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-weight: 700;
}

.sandbox-presets-heading {
  margin: 6px 0 0;
  font-size: 0.88rem;
  font-weight: 900;
}

.sandbox-presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.sandbox-preset-card {
  background: #ffffff;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 12px;
  padding: 10px;
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.12s ease;
}

.sandbox-preset-card:hover {
  transform: translateY(-2px);
  background: #fff8db;
  box-shadow: 3px 3px 0 var(--home-ink, #221e1a);
}

.sandbox-preset-card__top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sandbox-preset-card__icon {
  font-size: 1.3rem;
}

.sandbox-preset-card__name {
  font-size: 0.85rem;
  font-weight: 900;
  color: #221e1a;
}

.sandbox-preset-card__desc {
  margin: 0;
  font-size: 0.74rem;
  color: #716b61;
  line-height: 1.35;
}

.sandbox-preset-card__badge {
  font-size: 0.7rem;
  font-weight: 800;
  color: #08715d;
  margin-top: auto;
}

/* 自定义卡牌工坊 Modal 细节 */
.card-editor-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.card-editor-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.card-editor-title-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.card-editor-label {
  font-size: 0.84rem;
  font-weight: 900;
  white-space: nowrap;
}

.card-editor-input {
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 0.82rem;
  font-weight: 800;
  width: 100%;
}

.card-editor-toggle-json {
  font-size: 0.78rem;
  font-weight: 800;
  background: #f3f4f6;
  border: 1.5px solid var(--home-ink, #221e1a);
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
}

.card-editor-visual-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-editor-create-form {
  background: #fdf8e6;
  border: 2px dashed var(--home-ink, #221e1a);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-editor-subheading {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 900;
}

.card-editor-form-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.card-editor-textarea {
  width: 100%;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 0.82rem;
  box-sizing: border-box;
}

.card-editor-add-btn {
  background: var(--home-yellow, #f8c822);
  border: 2px solid var(--home-ink, #221e1a);
  box-shadow: 2px 2px 0 var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 900;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.card-editor-list-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-editor-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-editor-clear-btn {
  font-size: 0.72rem;
  font-weight: 800;
  color: #dc2626;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.card-editor-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.card-editor-card-item {
  background: #ffffff;
  border: 1.5px solid var(--home-ink, #221e1a);
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-editor-card-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.card-editor-card-item__index {
  font-size: 0.68rem;
  color: #9ca3af;
  font-weight: 800;
}

.card-editor-card-item__title {
  font-size: 0.8rem;
  font-weight: 900;
  color: #ea580c;
  flex: 1;
}

.card-editor-card-item__del {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 0.8rem;
}

.card-editor-card-item__del:hover {
  color: #dc2626;
}

.card-editor-card-item__content {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.35;
  color: #221e1a;
  white-space: pre-wrap;
}

.card-editor-card-item__tag {
  font-size: 0.65rem;
  font-weight: 800;
  color: #08715d;
  background: #dcfce7;
  padding: 1px 6px;
  border-radius: 999px;
  align-self: flex-start;
}

.card-editor-json-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-editor-json-hint {
  margin: 0;
  font-size: 0.78rem;
  color: #716b61;
}

.card-editor-json-textarea {
  width: 100%;
  border: 2px solid var(--home-ink, #221e1a);
  border-radius: 12px;
  padding: 8px;
  font-family: monospace;
  font-size: 0.8rem;
  box-sizing: border-box;
}

.card-editor-json-actions {
  display: flex;
  justify-content: flex-end;
}
`;

const markerIdx = css.indexOf(marker);
if (markerIdx !== -1) {
  css = css.slice(0, markerIdx) + updatedStyles;
} else {
  css += updatedStyles;
}

fs.writeFileSync(filePath, css, 'utf8');
console.log('Updated sandbox styles v2 successfully!');
