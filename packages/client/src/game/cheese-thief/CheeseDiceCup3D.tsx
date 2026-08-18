import { DiceCup } from '../../shared-ui/DiceCup.tsx';

interface CheeseDiceCup3DProps {
  diceValue: number | null;
  playerName?: string;
  isMe?: boolean;
  canInteract?: boolean;
  hint?: string;
  peekTargetName?: string;
  onInspectCommit?: () => void;
  variant?: 'large' | 'compact';
}

export function CheeseDiceCup3D({
  diceValue,
  playerName,
  isMe = false,
  canInteract = true,
  hint,
  peekTargetName,
  onInspectCommit,
  variant = 'large',
}: CheeseDiceCup3DProps) {
  return (
    <DiceCup
      diceValues={diceValue}
      playerName={playerName}
      isMe={isMe}
      canInteract={canInteract}
      hint={hint}
      peekTargetName={peekTargetName}
      onInspectCommit={onInspectCommit}
      variant={variant}
      theme="wood"
      allowShake={isMe}
    />
  );
}

