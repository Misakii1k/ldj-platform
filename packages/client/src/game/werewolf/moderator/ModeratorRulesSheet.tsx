/**
 * 「本局规则」弹层：读取游戏目录中 werewolf_moderator_v1 的规则条目。
 * 法官控制台与玩家端共用同一份权威文案，不各自维护说明。
 */
import { useRef } from 'react';
import { GAME_CATALOG } from '@ldj/shared';
import { SheetDialog } from '../../../app/SheetDialog.tsx';

const RULESET_ID = 'werewolf_moderator_v1';

export function ModeratorRulesSheet({ onClose }: { readonly onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const game = GAME_CATALOG.find((entry) => entry.id === 'werewolf');
  const ruleset = game?.rulesets.find((entry) => entry.id === RULESET_ID);

  return (
    <SheetDialog
      title={ruleset?.label ?? '真人主持'}
      description={ruleset?.description}
      onClose={onClose}
      initialFocusRef={closeRef}
      footer={(
        <button ref={closeRef} type="button" className="confirm-btn confirm-btn--primary" onClick={onClose}>
          知道了
        </button>
      )}
    >
      <ul className="mod-rules-list">
        {(ruleset?.details ?? []).map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
    </SheetDialog>
  );
}
