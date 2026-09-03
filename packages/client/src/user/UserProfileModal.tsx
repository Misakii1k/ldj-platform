import { useState, useMemo, useRef, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { useUserProfile, PRESET_AVATARS } from './UserProfileContext.tsx';
import { NOTION_AVATARS, NOTION_CATEGORIES } from './notionAvatars.ts';
import { UserAvatar } from './UserAvatar.tsx';
import { GameIcon } from '../shared-ui/GameIcon.tsx';
import { SheetDialog } from '../app/SheetDialog.tsx';

interface UserProfileModalProps {
  onClose?: () => void;
}

const CATEGORIES = [
  ...NOTION_CATEGORIES,
  { id: 'classic', name: '经典彩绘' },
] as const;

export function UserProfileModal({ onClose }: UserProfileModalProps) {
  const { profile, saveProfile, isProfileModalOpen, closeProfileModal } = useUserProfile();

  const handleClose = () => {
    closeProfileModal();
    onClose?.();
  };

  const [draftName, setDraftName] = useState(profile.nickname);
  const [selectedAvatar, setSelectedAvatar] = useState(profile.avatar);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // 构建当前展示头像列表
  const displayAvatars = useMemo(() => {
    if (activeCategory === 'classic') {
      return PRESET_AVATARS.map((p) => ({ id: p.id, name: p.name }));
    }
    if (activeCategory === 'all') {
      return NOTION_AVATARS.map((p) => ({ id: p.id, name: p.name }));
    }
    return NOTION_AVATARS.filter((p) => p.category === activeCategory).map((p) => ({ id: p.id, name: p.name }));
  }, [activeCategory]);

  // 裁切器状态
  const [croppingImageSrc, setCroppingImageSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isProfileModalOpen || onClose) {
      setDraftName(profile.nickname);
      setSelectedAvatar(profile.avatar);
      setCroppingImageSrc(null);
    }
  }, [isProfileModalOpen, onClose, profile]);

  if (!isProfileModalOpen && !onClose) return null;

  // 处理文件上传
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请上传有效的图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setCroppingImageSrc(src);
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // 绘制裁切预览
  useEffect(() => {
    if (!croppingImageSrc || !canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    const size = 240;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // 绘制圆形裁剪区
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scale = Math.max(size / img.width, size / img.height) * cropZoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (size - drawW) / 2 + cropOffset.x;
    const drawY = (size - drawH) / 2 + cropOffset.y;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // 绘制外圈虚线高亮环
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  }, [croppingImageSrc, cropZoom, cropOffset]);

  // 鼠标拖拽平移裁切
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCropOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // 确认裁切并应用为头像
  const handleConfirmCrop = () => {
    if (!canvasRef.current) return;
    const croppedDataUrl = canvasRef.current.toDataURL('image/png', 0.9);
    setSelectedAvatar(croppedDataUrl);
    setCroppingImageSrc(null);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const finalName = draftName.trim() || '快乐玩家';
    saveProfile({
      nickname: finalName,
      avatar: selectedAvatar,
    });
    handleClose();
  };

  return (
    <SheetDialog
      title="个人资料设置"
      description="修改你的游戏昵称与专属桌游头像。"
      onClose={handleClose}
      initialFocusRef={firstInputRef}
      footer={
        <>
          <button
            type="button"
            className="room-sheet__cancel"
            onClick={handleClose}
          >
            取消
          </button>
          <button
            type="submit"
            form="user-profile-form"
            className="room-sheet__submit"
          >
            保存资料
          </button>
        </>
      }
    >
      <form id="user-profile-form" onSubmit={handleSave} className="room-sheet__form profile-modal__form">
        {/* 自定义图片裁切区域 */}
        {croppingImageSrc ? (
          <div className="profile-crop-panel">
            <h4 className="profile-crop-title">拖拽移动 / 缩放进行裁切</h4>
            <div
              className="profile-crop-canvas-wrapper"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas ref={canvasRef} className="profile-crop-canvas" />
            </div>
            <div className="profile-crop-controls">
              <label>缩放</label>
              <input
                type="range"
                min="0.8"
                max="3"
                step="0.05"
                value={cropZoom}
                onChange={(e) => setCropZoom(parseFloat(e.target.value))}
              />
            </div>
            <div className="profile-crop-actions">
              <button
                type="button"
                className="confirm-btn confirm-btn--cancel"
                onClick={() => setCroppingImageSrc(null)}
              >
                取消裁切
              </button>
              <button
                type="button"
                className="confirm-btn confirm-btn--primary"
                onClick={handleConfirmCrop}
              >
                完成裁切并使用
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-modal__layout">
            {/* 左栏（横屏时为侧边栏，竖屏时为顶部栏）：大图预览 + 昵称输入 + 上传入口 */}
            <div className="profile-modal__sidebar">
              <div className="profile-modal__preview-box">
                <UserAvatar avatar={selectedAvatar} nickname={draftName} size={76} />
                <div className="profile-modal__preview-info">
                  <label className="profile-modal__label" htmlFor="profile-nickname-input">游戏昵称</label>
                  <input
                    id="profile-nickname-input"
                    ref={firstInputRef}
                    type="text"
                    className="profile-modal__name-input"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="请输入你的昵称"
                    maxLength={16}
                    required
                  />
                  <span className="profile-modal__hint">展示于房间与对局桌面上（最多16字）</span>
                </div>
              </div>

              <div className="profile-modal__upload-bar">
                <button
                  type="button"
                  className="profile-upload-trigger"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <GameIcon name="cards_deck" size={14} style={{ marginRight: '6px' }} />
                  上传自定义图片裁切…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* 右栏（横屏时占满右侧，竖屏时位于下方）：分类标签 + 头像网格 */}
            <div className="profile-modal__main">
              <div className="profile-modal__section-header">
                <span className="profile-modal__label">选择专属桌游头像</span>
                <span className="profile-modal__count-badge">{displayAvatars.length} 款可用</span>
              </div>

              {/* 分类筛选标签 */}
              <div className="profile-category-tabs" role="tablist" aria-label="头像分类">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === cat.id}
                    className={`profile-category-tab ${activeCategory === cat.id ? 'is-active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* 自适应紧凑正方头像网格 */}
              <div className="profile-preset-grid">
                {displayAvatars.map((item) => {
                  const presetVal = `preset:${item.id}`;
                  const isSelected = selectedAvatar === presetVal;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`profile-preset-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedAvatar(presetVal)}
                      title={item.name}
                    >
                      <UserAvatar avatar={presetVal} size={46} />
                      <span className="profile-preset-name">{item.name}</span>
                      {isSelected && <span className="profile-preset-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </form>
    </SheetDialog>
  );
}
