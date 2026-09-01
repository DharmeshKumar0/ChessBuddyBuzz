import { Crown, Sun, Moon, Settings, RefreshCw, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useChessStore } from '../../store';

export function Header() {
  const uiTheme = useChessStore((s) => s.uiTheme);
  const toggleUiTheme = useChessStore((s) => s.toggleUiTheme);
  const setSettingsOpen = useChessStore((s) => s.setSettingsOpen);
  const resetGame = useChessStore((s) => s.resetGame);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-sm transition-colors duration-200 dark:border-gray-800 dark:bg-gray-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="flex items-center gap-2.5 text-gray-900 transition-opacity hover:opacity-90 dark:text-gray-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-sm">
              <Crown size={20} className="fill-current" />
            </div>
            <span className="text-lg font-bold tracking-tight">Chess</span>
          </a>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-1 sm:flex">
            <button className="rounded-md px-3 py-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
              Play
            </button>
            <button className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200">
              Analysis
            </button>
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Entry point for the invite-link flow. Lives here rather than in the
              nav above because that nav is hidden below the sm breakpoint. */}
          <Link
            to="/friends"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:bg-gray-100 active:scale-95 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Play with a Friend"
          >
            <Globe size={14} />
            <span className="hidden sm:inline">Friends</span>
          </Link>

          <button
            onClick={resetGame}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:bg-gray-100 active:scale-95 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
            title="New Game"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">New Game</span>
          </button>

          <button
            onClick={toggleUiTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            title={`Switch to ${uiTheme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle UI Theme"
          >
            {uiTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            title="Board Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
