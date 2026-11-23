import { useEffect, useState } from 'react';
import type { HostApi, MaxWagerResult } from '@chain-protocol/casino-sdk/guest';

const REFRESH_INTERVAL_MS = 30_000;
const UNKNOWN: MaxWagerResult = { kind: 'unknown' };

/**
 * Asks the host for the maximum wager of the bet the player has selected: again
 * whenever its game data changes, and on an interval because the answer moves
 * with the vault. A host that cannot answer reads as `unknown`. Until the host
 * has answered for the selected bet the result is `undefined`, and the game
 * should not open a session.
 */
export function useMaxWager(
  hostApi: HostApi | null,
  gameData: `0x${string}`,
): MaxWagerResult | undefined {
  const [answer, setAnswer] = useState<{ gameData: string; result: MaxWagerResult } | null>(null);

  useEffect(
    function askHostForMaxWager() {
      if (!hostApi) return;
      let superseded = false;
      const ask = () => {
        void hostApi
          .getMaxWager({ gameData })
          .catch(() => UNKNOWN)
          .then(result => {
            if (!superseded) setAnswer({ gameData, result });
          });
      };
      ask();
      const timer = setInterval(ask, REFRESH_INTERVAL_MS);
      return function stopAsking() {
        superseded = true;
        clearInterval(timer);
      };
    },
    [hostApi, gameData],
  );

  return answer?.gameData === gameData ? answer.result : undefined;
}
