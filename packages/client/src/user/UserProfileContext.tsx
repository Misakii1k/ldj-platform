import React, { createContext, useContext, useEffect, useState } from 'react';
import type { GameIconName } from '../shared-ui/GameIcon.tsx';

export interface PresetAvatar {
  id: string;
  name: string;
  icon: GameIconName;
  bg: string;
  borderColor: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'fox', name: '机智狐狸', icon: 'undercover', bg: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)', borderColor: '#f97316' },
  { id: 'dog', name: '忠诚边牧', icon: 'star', bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderColor: '#f59e0b' },
  { id: 'cat', name: '派对花猫', icon: 'horn', bg: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)', borderColor: '#ec4899' },
  { id: 'wolf', name: '暗夜孤狼', icon: 'werewolf', bg: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', borderColor: '#8b5cf6' },
  { id: 'crown', name: '尊荣地主', icon: 'crown', bg: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)', borderColor: '#eab308' },
  { id: 'farmer', name: '勤劳农夫', icon: 'farmer', bg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', borderColor: '#22c55e' },
  { id: 'bomb', name: '王牌炸弹', icon: 'bomb', bg: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', borderColor: '#ef4444' },
  { id: 'rocket', name: '冲天火箭', icon: 'rocket', bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)', borderColor: '#0ea5e9' },
  { id: 'robot', name: '机械极客', icon: 'robot', bg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', borderColor: '#64748b' },
  { id: 'trophy', name: '常胜将军', icon: 'trophy', bg: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)', borderColor: '#d97706' },
  { id: 'cards', name: '扑克牌圣', icon: 'cards_deck', bg: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)', borderColor: '#14b8a6' },
  { id: 'pointer', name: '战略指挥', icon: 'pointer', bg: 'linear-gradient(135deg, #fae8ff 0%, #f5d0fe 100%)', borderColor: '#d946ef' },
];

const DEFAULT_NICKNAMES = ['快乐小象', '麦田捕手', '落日飞车', '星际旅人', '清风徐来', '爆米花桶', '魔法学徒'];

export interface UserProfile {
  nickname: string;
  avatar: string; // 'preset:id' 或 'data:image/...'
}

interface UserProfileContextValue {
  profile: UserProfile;
  setNickname: (name: string) => void;
  setAvatar: (avatar: string) => void;
  saveProfile: (next: Partial<UserProfile>) => void;
  isProfileModalOpen: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

const STORAGE_KEY_NICKNAME = 'ldj_user_nickname';
const STORAGE_KEY_AVATAR = 'ldj_user_avatar';

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => {
    const defaultName = DEFAULT_NICKNAMES[Math.floor(Math.random() * DEFAULT_NICKNAMES.length)]!;
    const defaultAvatar = 'preset:fox';
    try {
      const savedName = localStorage.getItem(STORAGE_KEY_NICKNAME);
      const savedAvatar = localStorage.getItem(STORAGE_KEY_AVATAR);
      return {
        nickname: savedName && savedName.trim() ? savedName.trim() : defaultName,
        avatar: savedAvatar || defaultAvatar,
      };
    } catch {
      // localStorage 不可用（WebView 隐私模式等）：用默认值，避免启动即崩溃
      return { nickname: defaultName, avatar: defaultAvatar };
    }
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NICKNAME, profile.nickname);
      localStorage.setItem(STORAGE_KEY_AVATAR, profile.avatar);
    } catch {
      // localStorage 不可用时忽略
    }
  }, [profile]);

  const saveProfile = (next: Partial<UserProfile>) => {
    // 只做纯状态更新；持久化由上面的 profile effect 完成（updater 必须无副作用）
    setProfile((prev) => ({
      nickname: next.nickname !== undefined ? next.nickname.trim() : prev.nickname,
      avatar: next.avatar !== undefined ? next.avatar : prev.avatar,
    }));
  };

  const setNickname = (nickname: string) => saveProfile({ nickname });
  const setAvatar = (avatar: string) => saveProfile({ avatar });

  return (
    <UserProfileContext.Provider
      value={{
        profile,
        setNickname,
        setAvatar,
        saveProfile,
        isProfileModalOpen,
        openProfileModal: () => setIsProfileModalOpen(true),
        closeProfileModal: () => setIsProfileModalOpen(false),
      }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) throw new Error('useUserProfile must be used within UserProfileProvider');
  return ctx;
}
