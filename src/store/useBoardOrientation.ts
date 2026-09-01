import type { BoardOrientation } from '../chess';
import { resolveBoardOrientation } from '../utils/boardOrientation';
import { useChessStore } from './useChessStore';
import { useSettingsStore } from './useSettingsStore';

/**
 * Which way round the live game's board is drawn. Every component that renders a
 * side of the board reads it from here — see resolveBoardOrientation for why.
 */
export function useBoardOrientation(): BoardOrientation {
  const gamePerspective = useChessStore((s) => s.orientation);
  const setting = useSettingsStore((s) => s.board.orientation);
  return resolveBoardOrientation(setting, gamePerspective);
}
