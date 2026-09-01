export type PieceColor = 'white' | 'black';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export type UiTheme = 'dark' | 'light';
export type BoardTheme = 'wood' | 'emerald' | 'slate' | 'blue' | 'purple' | 'marble';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export type Square = Piece | null;

/**
 * 8x8 board represented as a 2D array.
 * board[0] is rank 8 (top), board[7] is rank 1 (bottom).
 * board[row][col] where col 0 = file 'a', col 7 = file 'h'.
 */
export type Board = Square[][];

export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Position {
  row: number; // 0-7, 0 = rank 8
  col: number; // 0-7, 0 = file a
}

export interface PlayerCastlingRights {
  kingside: boolean;
  queenside: boolean;
}

export type CastlingRights = Record<PieceColor, PlayerCastlingRights>;

export function createInitialCastlingRights(): CastlingRights {
  return {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true },
  };
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  capturedPiece: Piece | null;
  promotion: PieceType | null;
  isCastling: boolean;
  isEnPassant: boolean;
  san: string;
  check: boolean;
  checkmate: boolean;
}

export type GameStatus =
  | 'idle'
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'timeout';

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type BoardOrientation = 'white' | 'black';

export interface TimeControl {
  display: string;
  initialMs: number;
  incrementMs: number;
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  activeColor: PieceColor | null;
  isRunning: boolean;
  lastTickMs: number | null;
}

export interface Player {
  id: string;
  name: string;
  color: PieceColor | null;
  connected: boolean;
  socketId?: string;
}

export interface DrawOffer {
  offeredBy: PieceColor;
  timestamp: number;
}

export interface PendingPromotion {
  from: Position;
  to: Position;
  color: PieceColor;
}

export type DrawReason =
  | 'Threefold Repetition'
  | '50-Move Rule'
  | 'Insufficient Material'
  | 'Stalemate'
  | 'Timeout vs Insufficient Material'
  | 'Draw Offer Accepted'
  | 'Resignation'
  | null;

export interface GameRoom {
  gameId: string;
  whitePlayer: Player | null;
  blackPlayer: Player | null;
  currentFEN: string;
  moveHistory: Move[];
  turn: PieceColor;
  clocks: ClockState;
  gameStatus: GameStatus;
  result: GameResult;
  timeControl: TimeControl;
  // Pending draw offer, or null when nobody has offered one
  drawOffer: { offeredBy: PieceColor; timestamp: number } | null;
  createdAt: number;
  updatedAt: number;
}

// Socket.io event types
export interface ServerToClientEvents {
  gameState: (game: GameRoom) => void;
  gameCreated: (game: GameRoom) => void;
  gameJoined: (game: GameRoom, playerColor: PieceColor) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (color: PieceColor) => void;
  moveMade: (move: Move, fen: string, clocks: ClockState) => void;
  moveRejected: (reason: string) => void;
  gameEnded: (result: GameResult, reason: string) => void;
  clockUpdate: (clocks: ClockState) => void;
  clockSync: (clocks: ClockState) => void;
  error: (message: string) => void;
  drawOffered: (color: PieceColor) => void;
}

export interface ClientToServerEvents {
  createGame: (options: CreateGameOptions, callback: (response: CreateGameResponse) => void) => void;
  joinGame: (gameId: string, playerName: string, callback: (response: JoinGameResponse) => void) => void;
  leaveGame: (callback: (response: LeaveGameResponse) => void) => void;
  makeMove: (from: Position, to: Position, promotion: PieceType | undefined, callback: (response: MakeMoveResponse) => void) => void;
  offerDraw: (callback: (response: DrawResponse) => void) => void;
  acceptDraw: (callback: (response: DrawResponse) => void) => void;
  declineDraw: (callback: (response: DrawResponse) => void) => void;
  resign: (callback: (response: ResignResponse) => void) => void;
  reconnectGame: (gameId: string, playerId: string | undefined, callback: (response: any) => void) => void;
}

export interface CreateGameOptions {
  playerName: string;
  timeControl: string;
  color?: 'white' | 'black' | 'random';
}

export interface CreateGameResponse {
  success: boolean;
  gameId?: string;
  game?: GameRoom;
  color?: PieceColor;
  error?: string;
}

export interface JoinGameResponse {
  success: boolean;
  game?: GameRoom;
  color?: PieceColor;
  error?: string;
}

export interface LeaveGameResponse {
  success: boolean;
  error?: string;
}

export interface MakeMoveResponse {
  success: boolean;
  move?: Move;
  fen?: string;
  clocks?: ClockState;
  error?: string;
}

export interface DrawResponse {
  success: boolean;
  error?: string;
}

export interface ResignResponse {
  success: boolean;
  error?: string;
}