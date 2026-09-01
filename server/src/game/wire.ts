import type { GameRoom, Player } from '../chess/types.js';
import type { GameRoomInternal } from './GameRoomManager.js';

/**
 * Projects a room onto the shape the client is actually typed against.
 *
 * The server's room carries derived state it needs to validate moves — the
 * board, the repetition history, castling rights — and the handlers used to
 * emit that object verbatim. Every `gameState` broadcast therefore shipped a
 * few kilobytes of state no client reads, growing with the game, twice per
 * move, to every player in the room. It also leaked each player's socket id.
 *
 * `moveHistory` is passed by reference rather than copied: socket.io encodes a
 * broadcast once per room, so there is nothing to gain from cloning it and a
 * per-move array copy to lose.
 */
export function toWireRoom(room: GameRoomInternal): GameRoom {
  return {
    gameId: room.gameId,
    whitePlayer: toWirePlayer(room.whitePlayer),
    blackPlayer: toWirePlayer(room.blackPlayer),
    currentFEN: room.currentFEN,
    moveHistory: room.moveHistory,
    turn: room.turn,
    clocks: room.clocks,
    gameStatus: room.gameStatus,
    result: room.result,
    timeControl: room.timeControl,
    drawOffer: room.drawOffer,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

/** Drops `socketId`: an internal handle no client needs and none reads. */
export function toWirePlayer(player: Player | null): Player | null {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    connected: player.connected,
  };
}
