import { useRef, useState } from 'react';
import type { SandboxCard } from './types.ts';
import { SheetDialog } from '../../app/SheetDialog.tsx';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';

interface CardDeckEditorModalProps {
  initialTitle?: string;
  initialCards?: SandboxCard[];
  onSaveAndDeploy: (title: string, cards: SandboxCard[]) => void;
  onClose: () => void;
}

export function CardDeckEditorModal({
  initialTitle = '我的专属卡牌包',
  initialCards = [],
  onSaveAndDeploy,
  onClose,
}: CardDeckEditorModalProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [deckTitle, setDeckTitle] = useState(initialTitle);
  const [cards, setCards] = useState<SandboxCard[]>(
    initialCards.length > 0
      ? initialCards
      : [
          {
            id: `card_1`,
            title: '真心话',
            content: '现场说出最让你难忘的一件事！',
            category: 'truth',
          },
          {
            id: `card_2`,
            title: '大冒险',
            content: '向全场深情演唱任意一首歌的高潮段落！',
            category: 'dare',
          },
        ]
  );

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('custom');

  const [jsonText, setJsonText] = useState('');
  const [isJsonMode, setIsJsonMode] = useState(false);

  // 添加卡牌
  const handleAddCard = () => {
    if (!newTitle.trim() || !newContent.trim()) {
      alert('请填写卡牌标题和内容！');
      return;
    }
    const newCard: SandboxCard = {
      id: `card_${Date.now()}_${cards.length}`,
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory.trim() || 'custom',
    };
    setCards([...cards, newCard]);
    setNewTitle('');
    setNewContent('');
  };

  // 删除卡牌
  const handleDeleteCard = (id: string) => {
    setCards(cards.filter((c) => c.id !== id));
  };

  // 导出 JSON
  const handleExportJson = () => {
    const data = JSON.stringify({ title: deckTitle, cards }, null, 2);
    setJsonText(data);
    setIsJsonMode(true);
  };

  // 导入 JSON
  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.title) setDeckTitle(parsed.title);
      if (Array.isArray(parsed.cards)) {
        setCards(parsed.cards);
        alert(`成功导入 ${parsed.cards.length} 张卡牌！`);
        setIsJsonMode(false);
      } else {
        alert('导入格式错误：缺少 cards 数组');
      }
    } catch {
      alert('JSON 格式解析失败，请检查语法！');
    }
  };

  // 保存并部署到桌面
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cards.length === 0) {
      alert('卡牌包至少需要包含 1 张卡牌！');
      return;
    }
    onSaveAndDeploy(deckTitle.trim() || '自制卡组', cards);
    onClose();
  };

  return (
    <SheetDialog
      title="🃏 自定义卡牌工坊编辑器"
      description="自由设计卡牌标题与内容，一键生成专属牌堆并摆上桌面对局！"
      onClose={onClose}
      initialFocusRef={titleInputRef}
      footer={
        <>
          <button
            type="button"
            className="room-sheet__cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="room-sheet__submit"
            onClick={handleSubmit}
          >
            保存并装载至桌面
          </button>
        </>
      }
    >
      <div className="card-editor-modal">
        {/* 卡组标题与模式切换 */}
        <div className="card-editor-header-bar">
          <div className="card-editor-title-field">
            <label className="card-editor-label">卡牌包名称：</label>
            <input
              ref={titleInputRef}
              type="text"
              className="card-editor-input"
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
              placeholder="请输入卡组名称"
              maxLength={32}
            />
          </div>
          <button
            type="button"
            className="card-editor-toggle-json"
            onClick={() => {
              if (!isJsonMode) handleExportJson();
              else setIsJsonMode(false);
            }}
          >
            {isJsonMode ? '切换到可视化列表' : '导入 / 导出 JSON'}
          </button>
        </div>

        {isJsonMode ? (
          <div className="card-editor-json-box">
            <p className="card-editor-json-hint">
              可在此粘贴他人分享的卡组 JSON，或复制下方内容进行备份：
            </p>
            <textarea
              className="card-editor-json-textarea"
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            <div className="card-editor-json-actions">
              <button
                type="button"
                className="sandbox-btn sandbox-btn--primary"
                onClick={handleImportJson}
              >
                📥 解析并应用 JSON 卡组
              </button>
            </div>
          </div>
        ) : (
          <div className="card-editor-visual-box">
            {/* 新增卡牌表单 */}
            <div className="card-editor-create-form">
              <h4 className="card-editor-subheading">➕ 增加一张新卡牌</h4>
              <div className="card-editor-form-row">
                <input
                  type="text"
                  className="card-editor-input"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="卡牌标题（如：真心话/惩罚令）"
                  style={{ flex: '1 1 140px' }}
                />
                <input
                  type="text"
                  className="card-editor-input"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="标签分类（可选）"
                  style={{ flex: '0 0 110px' }}
                />
              </div>
              <textarea
                className="card-editor-textarea"
                rows={2}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="卡牌正文挑战或描述内容..."
              />
              <button
                type="button"
                className="card-editor-add-btn"
                onClick={handleAddCard}
              >
                <GameIcon name="cards_deck" size={14} style={{ marginRight: '4px' }} />
                添加卡牌到列表
              </button>
            </div>

            {/* 卡牌列表总览 */}
            <div className="card-editor-list-section">
              <div className="card-editor-list-header">
                <span className="card-editor-subheading">
                  📋 当前卡牌列表（共 {cards.length} 张）
                </span>
                {cards.length > 0 && (
                  <button
                    type="button"
                    className="card-editor-clear-btn"
                    onClick={() => {
                      if (confirm('确定要清空全部卡牌吗？')) setCards([]);
                    }}
                  >
                    清空全部
                  </button>
                )}
              </div>

              <div className="card-editor-cards-grid">
                {cards.map((c, idx) => (
                  <div key={c.id || idx} className="card-editor-card-item">
                    <div className="card-editor-card-item__top">
                      <span className="card-editor-card-item__index">#{idx + 1}</span>
                      <strong className="card-editor-card-item__title">{c.title}</strong>
                      <button
                        type="button"
                        className="card-editor-card-item__del"
                        onClick={() => handleDeleteCard(c.id)}
                        title="删除这张卡"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="card-editor-card-item__content">{c.content}</p>
                    {c.category && (
                      <span className="card-editor-card-item__tag">{c.category}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SheetDialog>
  );
}
