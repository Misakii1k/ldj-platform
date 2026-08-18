import { useUserProfile } from './UserProfileContext.tsx';
import { UserAvatar } from './UserAvatar.tsx';
import { GameIcon } from '../shared-ui/GameIcon.tsx';

interface UserProfileBadgeProps {
  className?: string;
  onClick?: () => void;
}

export function UserProfileBadge({ className = '', onClick }: UserProfileBadgeProps) {
  const { profile, openProfileModal } = useUserProfile();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openProfileModal();
    }
  };

  return (
    <button
      type="button"
      className={`user-profile-badge ${className}`}
      onClick={handleClick}
      title="点击编辑个人资料与头像"
    >
      <UserAvatar avatar={profile.avatar} nickname={profile.nickname} size={32} />
      <span className="user-profile-badge__name">{profile.nickname}</span>
      <span className="user-profile-badge__edit-icon">
        <GameIcon name="star" size={12} />
      </span>
    </button>
  );
}
