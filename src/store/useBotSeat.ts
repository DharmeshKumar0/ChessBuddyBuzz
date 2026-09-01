import type { PieceColor } from '../chess';
import type { DifficultyLevel } from '../services/chessEngineService';
import { DIFFICULTY_LEVELS } from '../services/chessEngineService';
import { useChessStore } from './useChessStore';
import { useSettingsStore } from './useSettingsStore';

export interface BotSeat {
  /** The side of the board the bot is playing. */
  color: PieceColor;
  level: DifficultyLevel;
  name: string;
  description: string;
  /** Rating to display beside the name. */
  elo: number;
}

/**
 * The bot's seat at the table: which colour it plays and who it is. `null` in
 * local and online games, where both sides are human.
 *
 * One source for every place the bot shows up — its player panel, the thinking
 * indicator — and for the checks that stop a click or a drag from moving its
 * pieces for it.
 */
export function useBotSeat(): BotSeat | null {
  const gameMode = useChessStore((s) => s.gameMode);
  const computerColor = useChessStore((s) => s.computerColor);
  const level = useSettingsStore((s) => s.computer.difficulty);

  if (gameMode !== 'computer' || !computerColor) return null;

  const bot = DIFFICULTY_LEVELS[level];
  return {
    color: computerColor,
    level,
    name: bot.name,
    description: bot.description,
    elo: bot.elo,
  };
}
