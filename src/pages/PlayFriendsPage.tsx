import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Globe, Copy, Check, Loader2, Users, Clock, User, Shuffle, ChevronLeft, X, Hash } from 'lucide-react';
import { useChessStore } from '../store/useChessStore';
import { Layout } from '../components/layout';
import { TIME_CONTROLS } from '../utils/clock';

/** Remembers the name between visits so a returning player only clicks once. */
const NAME_KEY = 'friend-game-player-name';

const COLOR_OPTIONS = [
  { value: 'white' as const, label: 'White', icon: <div className="h-5 w-5 rounded border border-gray-300 bg-white" /> },
  { value: 'black' as const, label: 'Black', icon: <div className="h-5 w-5 rounded bg-gray-800" /> },
  { value: 'random' as const, label: 'Random', icon: <Shuffle size={18} className="text-gray-700 dark:text-gray-300" /> },
];

/**
 * "Play with a Friend" — the invite-link half of online play.
 *
 * Two routes render this one component:
 *   /friends           the host creates a room and gets a shareable link
 *   /join/:roomId      the friend opens that link and only has to pick a name
 *
 * It deliberately does not reuse OnlineGameSetup / JoinGameModal: those are
 * modals stacked over a live board and require the room code to be typed in by
 * hand, which is exactly what a share link is meant to avoid.
 */
export function PlayFriendsPage() {
  const { roomId: invitedRoomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const connectToServer = useChessStore((s) => s.connectToServer);
  const createOnlineGame = useChessStore((s) => s.createOnlineGame);
  const joinOnlineGame = useChessStore((s) => s.joinOnlineGame);
  const leaveOnlineGame = useChessStore((s) => s.leaveOnlineGame);
  const isOnlineGame = useChessStore((s) => s.isOnlineGame);
  const onlineGameId = useChessStore((s) => s.onlineGameId);
  const myColor = useChessStore((s) => s.myColor);
  const opponentConnected = useChessStore((s) => s.opponentConnected);

  const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | 'random'>('random');
  const [selectedTimeControl, setSelectedTimeControl] = useState('10+0');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  /** Which half of the section is showing: make a room, or go join one. */
  const [mode, setMode] = useState<'create' | 'join'>('create');
  /** Room ID typed or pasted by hand, for friends who got the code not the link. */
  const [roomInput, setRoomInput] = useState('');

  // Only a room opened from *this* page hands over to the board. Without this
  // flag a leftover online game in the store would bounce the visitor straight
  // to /, and they would never see the create form or the invite link.
  const [entered, setEntered] = useState(false);

  const isHost = !invitedRoomId;
  const room = invitedRoomId?.toUpperCase() ?? onlineGameId;
  const inviteLink = onlineGameId ? `${window.location.origin}/join/${onlineGameId}` : '';

  // The friend has arrived — hand the board over. The host waits for that
  // moment; the joiner already has a live game, so it goes straight through.
  useEffect(() => {
    if (!entered || !isOnlineGame) return;
    if (isHost && !opponentConnected) return;
    navigate('/', { replace: true });
  }, [entered, isOnlineGame, isHost, opponentConnected, navigate]);

  const run = async (action: () => Promise<void>) => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      await connectToServer();
      await action();
      localStorage.setItem(NAME_KEY, playerName.trim());
      setEntered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreate = () =>
    run(() => createOnlineGame(playerName.trim(), selectedTimeControl, selectedColor));

  const handleJoin = (code: string) => run(() => joinOnlineGame(code, playerName.trim()));

  const handleManualJoin = () => {
    if (!roomInput.trim()) {
      setError('Enter the room ID your friend sent you');
      return;
    }
    void handleJoin(roomInput.trim());
  };

  /**
   * A room ID is 8 characters, but friends paste whatever they were sent — often
   * the whole invite link. Pull the code out of it rather than rejecting it.
   */
  const onRoomChange = (raw: string) => {
    const fromLink = raw.match(/\/join\/([^/?#\s]+)/i);
    setRoomInput((fromLink ? fromLink[1] : raw).replace(/\s+/g, '').toUpperCase());
  };

  /** Enter key: whichever action the current view is offering. */
  const submit = () => {
    if (isBusy) return;
    if (!isHost) void handleJoin(room!);
    else if (mode === 'join') handleManualJoin();
    else void handleCreate();
  };

  const handleCancel = async () => {
    setEntered(false);
    await leaveOnlineGame();
    navigate('/', { replace: true });
  };

  const copy = async (text: string, which: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Could not copy — select the text and copy it manually');
    }
  };

  const nameField = (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Your Name
      </label>
      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Enter your name"
        maxLength={20}
        autoFocus
        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
      />
    </div>
  );

  const errorBanner = error && (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
      {error}
    </div>
  );

  const modeTabs = (
    <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
      {([
        { value: 'create' as const, label: 'Create Room' },
        { value: 'join' as const, label: 'Join Room' },
      ]).map((tab) => (
        <button
          key={tab.value}
          onClick={() => {
            setMode(tab.value);
            setError(null);
          }}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
            mode === tab.value
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const shell = (title: string, subtitle: string, body: ReactNode) => (
    <Layout>
      <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        <button
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ChevronLeft size={14} />
          Back to board
        </button>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-sm">
              <Globe size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
          </div>
          <div className="mt-5 space-y-5">{body}</div>
        </div>
      </div>
    </Layout>
  );

  // ---------------------------------------------------------------- waiting
  // Host has a room but nobody has joined yet: show the link to share.
  if (isHost && entered && isOnlineGame && onlineGameId && !opponentConnected) {
    return shell(
      'Invite your friend',
      'Send them this link — the game starts the moment they open it',
      <>
        {errorBanner}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Invite Link
          </label>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <button
              onClick={() => copy(inviteLink, 'link')}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
              aria-label={copied === 'link' ? 'Link copied' : 'Copy invite link'}
            >
              {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'link' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            or share the room code
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <code className="font-mono text-xl font-bold tracking-widest text-gray-900 dark:text-gray-100">
              {onlineGameId}
            </code>
            <button
              onClick={() => copy(onlineGameId, 'code')}
              className="rounded-lg bg-gray-100 p-2 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
              aria-label={copied === 'code' ? 'Code copied' : 'Copy room code'}
            >
              {copied === 'code' ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <Loader2 size={16} className="animate-spin" />
          <span>Waiting for your friend to join…</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Users size={14} />
          <span>You play as {myColor === 'black' ? '♚ Black' : '♔ White'}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <Clock size={14} />
          <span>{selectedTimeControl}</span>
        </div>

        <button
          onClick={handleCancel}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <X size={14} />
          Cancel room
        </button>
      </>,
    );
  }

  // ------------------------------------------------------------------- join
  if (!isHost) {
    return shell(
      'Join your friend’s game',
      `Room ${room}`,
      <>
        {errorBanner}
        {nameField}

        <button
          onClick={() => handleJoin(room!)}
          disabled={isBusy || !playerName.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
          {isBusy ? 'Joining…' : 'Join Game'}
        </button>

        <button
          onClick={() => {
            setMode('create');
            navigate('/friends');
          }}
          className="w-full text-center text-xs text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
        >
          Create your own room instead
        </button>
      </>,
    );
  }

  // ------------------------------------------------------- create / join room
  return shell(
    mode === 'create' ? 'Play with a Friend' : 'Join a Room',
    mode === 'create'
      ? 'Create a room and send the link to whoever you want to play'
      : 'Type or paste the room ID your friend sent you',
    <>
      {modeTabs}
      {errorBanner}
      {nameField}

      {mode === 'join' ? (
        <>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Hash size={14} />
              Room ID
            </label>
            <input
              type="text"
              value={roomInput}
              onChange={(e) => onRoomChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="e.g. 0E85787B"
              spellCheck={false}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 font-mono text-lg tracking-widest text-gray-900 placeholder-gray-400 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Pasting the whole invite link works too — the code is pulled out of it.
            </p>
          </div>

          <button
            onClick={handleManualJoin}
            disabled={isBusy || !playerName.trim() || !roomInput.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
            {isBusy ? 'Joining…' : 'Join Game'}
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <User size={14} />
              Play As
            </label>
            <div className="mt-2.5 grid grid-cols-3 gap-3">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedColor(opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
                    selectedColor === opt.value
                      ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20 dark:bg-amber-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  {opt.icon}
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Clock size={14} />
              Time Control
            </label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.display}
                  onClick={() => setSelectedTimeControl(tc.display)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    selectedTimeControl === tc.display
                      ? 'bg-amber-600 text-white ring-2 ring-amber-500/20'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  <Clock size={12} />
                  <span>{tc.display}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isBusy || !playerName.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            {isBusy ? 'Creating room…' : 'Create Room & Get Link'}
          </button>
        </>
      )}
    </>,
  );
}
