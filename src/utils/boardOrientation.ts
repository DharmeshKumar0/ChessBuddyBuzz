import type { BoardOrientation } from '../chess';

/** The "Board Orientation" setting: a fixed side, or "let the game decide". */
export type OrientationSetting = BoardOrientation | 'auto';

/**
 * The single rule for which way round the board is drawn.
 *
 * Everything that draws a side of the board — the squares, the two player
 * panels, the evaluation bar — has to go through this, because the sides are
 * only labelled correctly while they all agree. When the board derived it from
 * the settings store and the panels from the game store, a player seated as
 * black saw white's pieces at the bottom with their own name underneath them.
 *
 * @param setting         the user's Board Orientation preference
 * @param gamePerspective the game's own perspective: your colour in an online or
 *                        engine game, or whatever the flip control last set
 */
export function resolveBoardOrientation(
  setting: OrientationSetting,
  gamePerspective: BoardOrientation,
): BoardOrientation {
  return setting === 'auto' ? gamePerspective : setting;
}
