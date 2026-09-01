import type { ReactNode } from 'react';
import { Header } from './Header';
import { SettingsModal } from '../game/SettingsModal';
import { PromotionModal } from '../game/PromotionModal';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900 transition-colors duration-200 dark:bg-gray-950 dark:text-gray-100">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <SettingsModal />
      <PromotionModal />
    </div>
  );
}
