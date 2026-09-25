import { useEffect, useState } from 'react';

/** Pause only the two themed games' decorative CSS; never pause game timers or commands. */
export function useGameVisibility() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => {
      document.documentElement.dataset.gameUiHidden = String(document.hidden);
      setVisible(!document.hidden);
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      delete document.documentElement.dataset.gameUiHidden;
    };
  }, []);
  return visible;
}
