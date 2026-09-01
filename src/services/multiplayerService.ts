import { io, Socket } from 'socket.io-client';
import type { 
  Position, 
  PieceType,
  ServerToClientEvents,
  ClientToServerEvents,
  CreateGameOptions,
  CreateGameResponse,
  JoinGameResponse,
  LeaveGameResponse,
  MakeMoveResponse,
  DrawResponse,
  ResignResponse
} from '../chess/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Configured at build time via .env (Vite inlines VITE_* vars); the localhost
// default only applies to local development.
const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

/** How long to wait for a server acknowledgement before failing an action. */
const ACK_TIMEOUT_MS = 10_000;

class MultiplayerService {
  private socket: TypedSocket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  connect(url: string = DEFAULT_SERVER_URL): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    // A socket already exists but has not finished connecting (first attempt or
    // an auto-reconnect). Wait on it rather than building a second socket and
    // abandoning the first, which would leak the connection and its listeners.
    if (this.socket) {
      if (this.socket.active) {
        return this.waitForConnect(this.socket);
      }
      // The socket has given up (reconnection attempts exhausted), so nothing
      // would ever settle a promise attached to it. Replace it, but keep the
      // subscriber callbacks so the caller's handlers survive the retry.
      this.teardownSocket();
    }

    const socket: TypedSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    this.socket = socket;

    // Bridge server events to our own emitter exactly once per socket instance:
    // registering these per connect() call would duplicate every server event
    // after a reconnect.
    this.setupEventListeners(socket);

    return this.waitForConnect(socket);
  }

  /**
   * Resolves on the socket's next successful connect, rejects on the next
   * connection error. 'connect' fires again after every auto-reconnect and
   * 'connect_error' fires once per failed attempt (reconnectionAttempts: 5), so
   * the promise is guarded to settle exactly once and unhooks itself afterwards.
   */
  private waitForConnect(socket: TypedSocket): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (socket.connected) {
        resolve();
        return;
      }

      let settled = false;
      const settle = (error?: Error): void => {
        if (settled) return;
        settled = true;
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const onConnect = (): void => settle();
      const onError = (error: Error): void => settle(error);

      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
    });
  }

  private setupEventListeners(socket: TypedSocket): void {
    const events: Array<keyof ServerToClientEvents> = [
      'gameState', 'gameCreated', 'gameJoined', 'playerJoined',
      'playerLeft', 'moveMade', 'moveRejected', 'gameEnded',
      'clockUpdate', 'clockSync', 'error', 'drawOffered'
    ];

    for (const event of events) {
      socket.on(event, (...args: any[]) => {
        this.emit(event, ...args);
      });
    }

    // 'connect' and 'disconnect' are socket.io reserved events, not part of
    // ServerToClientEvents. 'connect' fires again after every successful
    // auto-reconnect, which is the only signal a client has that it needs to
    // re-join its game room (the server room is keyed by socket id, and that id
    // changes on reconnect).
    socket.on('connect', () => {
      this.emit('connect');
    });

    socket.on('disconnect', (reason) => {
      this.emit('disconnect', reason);
    });
  }

  private teardownSocket(): void {
    if (!this.socket) return;
    // disconnect() first so subscribers still receive the 'disconnect' event,
    // then drop the socket-level wiring so the next connect() starts clean.
    this.socket.disconnect();
    this.socket.removeAllListeners();
    this.socket = null;
  }

  disconnect(): void {
    this.teardownSocket();
    // Subscriber callbacks are cleared too: connectToServer() re-registers a
    // fresh set of closures every time it runs, so keeping them would apply
    // each server event once per past session.
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // Event emitter methods
  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(cb => cb(...args));
  }

  // Game actions
  createGame(options: CreateGameOptions): Promise<CreateGameResponse> {
    return this.callWithCallback('createGame', options);
  }

  joinGame(gameId: string, playerName: string): Promise<JoinGameResponse> {
    return this.callWithCallback('joinGame', gameId, playerName);
  }

  leaveGame(): Promise<LeaveGameResponse> {
    return this.callWithCallback('leaveGame');
  }

  makeMove(from: Position, to: Position, promotion?: PieceType): Promise<MakeMoveResponse> {
    return this.callWithCallback('makeMove', from, to, promotion);
  }

  offerDraw(): Promise<DrawResponse> {
    return this.callWithCallback('offerDraw');
  }

  acceptDraw(): Promise<DrawResponse> {
    return this.callWithCallback('acceptDraw');
  }

  declineDraw(): Promise<DrawResponse> {
    return this.callWithCallback('declineDraw');
  }

  resign(): Promise<ResignResponse> {
    return this.callWithCallback('resign');
  }

  reconnectGame(gameId: string, playerId?: string): Promise<any> {
    return this.callWithCallback('reconnectGame', gameId, playerId);
  }

  private callWithCallback<T>(event: keyof ClientToServerEvents, ...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Server did not acknowledge "${event}" in time`));
      }, ACK_TIMEOUT_MS);

      // A Socket has no per-event methods — every client action goes out through
      // emit(), with the acknowledgement callback as the final argument.
      // Optional middle arguments (e.g. an omitted promotion piece) are passed
      // through as-is: the server handlers have a fixed arity, so dropping them
      // would slide the callback into the wrong parameter.
      socket.emit(event as any, ...args, (response: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (response && typeof response === 'object' && 'success' in response) {
          if ((response as any).success) {
            resolve(response);
          } else {
            reject(new Error((response as any).error || 'Unknown error'));
          }
        } else {
          resolve(response);
        }
      });
    });
  }
}

export const multiplayerService = new MultiplayerService();