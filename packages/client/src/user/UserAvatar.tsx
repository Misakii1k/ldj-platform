import React from 'react';
import { GameIcon } from '../shared-ui/GameIcon.tsx';
import { PRESET_AVATARS } from './UserProfileContext.tsx';

interface UserAvatarProps {
  avatar?: string | null;
  nickname?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function UserAvatar({
  avatar,
  nickname = '玩家',
  size = 40,
  className = '',
  style = {},
}: UserAvatarProps) {
  const isCustomImage = avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/'));
  const isPreset = avatar && avatar.startsWith('preset:');
  const presetId = isPreset ? avatar.replace('preset:', '') : 'fox';
  const preset = PRESET_AVATARS.find((p) => p.id === presetId) || PRESET_AVATARS[0]!;

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    userSelect: 'none',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    ...style,
  };

  if (isCustomImage) {
    return (
      <div
        className={`user-avatar user-avatar--custom ${className}`}
        style={{
          ...containerStyle,
          border: '2px solid rgba(245, 158, 11, 0.6)',
          backgroundColor: '#fffdf7',
        }}
      >
        <img
          src={avatar!}
          alt={nickname}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`user-avatar user-avatar--preset ${className}`}
      style={{
        ...containerStyle,
        background: preset.bg,
        border: `2px solid ${preset.borderColor}`,
      }}
      title={preset.name}
    >
      <GameIcon name={preset.icon} size={Math.round(size * 0.58)} />
    </div>
  );
}
