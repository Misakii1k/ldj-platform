import { useState, useCallback } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { ServerError, describeError } from '../../shared-ui/errors.ts';
import type { WitsWagersPlayerView, BetPairView } from './types.ts';

export interface WitsWagersControllerApi {
  submitGuess: (value: number) => Promise<boolean>;
  setBets: (chips: BetPairView) => Promise<boolean>;
  returnToLobby: () => Promise<void>;
  isSubmittingGuess: boolean;
  isSavingBets: boolean;
  error: string | null;
  clearError: () => void;
}

export function useWitsWagersController(view: WitsWagersPlayerView): WitsWagersControllerApi {
  const { send, resync } = useConnection();
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isSavingBets, setIsSavingBets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const submitGuess = useCallback(
    async (value: number): Promise<boolean> => {
      if (!view.me || !view.me.canGuess) return false;
      setIsSubmittingGuess(true);
      setError(null);

      try {
        await send('game_action', {
          type: 'submit_guess',
          roundToken: view.roundToken,
          expectedRevision: view.me.guessRevision,
          value,
        });
        return true;
      } catch (err) {
        if (err instanceof ServerError) {
          if (err.payload.code === 'STALE_CLIENT_STATE') {
            resync();
            setError('桌面状态已更新，请重新核对后再次提交估数');
          } else {
            setError(err.payload.message || describeError(err));
          }
        } else {
          setError(describeError(err));
        }
        return false;
      } finally {
        setIsSubmittingGuess(false);
      }
    },
    [view.me, view.roundToken, send, resync],
  );

  const setBets = useCallback(
    async (chips: BetPairView): Promise<boolean> => {
      if (!view.me || !view.me.canBet) return false;
      setIsSavingBets(true);
      setError(null);

      try {
        await send('game_action', {
          type: 'set_bets',
          roundToken: view.roundToken,
          expectedRevision: view.me.betRevision,
          chips,
        });
        return true;
      } catch (err) {
        if (err instanceof ServerError) {
          if (err.payload.code === 'STALE_CLIENT_STATE') {
            resync();
            setError('桌面状态已更新，请保留草稿并重新点击保存');
          } else {
            setError(err.payload.message || describeError(err));
          }
        } else {
          setError(describeError(err));
        }
        return false;
      } finally {
        setIsSavingBets(false);
      }
    },
    [view.me, view.roundToken, send, resync],
  );

  const returnToLobby = useCallback(async () => {
    try {
      await send('room_command', { command: 'return_to_lobby' });
    } catch {
      resync();
    }
  }, [send, resync]);

  return {
    submitGuess,
    setBets,
    returnToLobby,
    isSubmittingGuess,
    isSavingBets,
    error,
    clearError,
  };
}
