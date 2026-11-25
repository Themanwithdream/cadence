import { BookOpen, Flame, History } from 'lucide-react';
import type { AppView, StreakSummary } from '../types/cadence';
import styles from './TopBar.module.css';

export interface TopBarProps {
  currentView: AppView;
  streak: StreakSummary;
  onGoHome: () => void;
  onOpenFrameworks: () => void;
  onOpenJournal: () => void;
  disableHomeNav?: boolean;
}

export function TopBar({
  currentView,
  streak,
  onGoHome,
  onOpenFrameworks,
  onOpenJournal,
  disableHomeNav = false,
}: TopBarProps) {
  const isStudio = currentView === 'studio';

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.brandButton}
          onClick={onGoHome}
          disabled={disableHomeNav}
          aria-label="Cadence — Return to practice desk"
        >
          <span
            className={`${styles.pilotDot} ${isStudio ? styles.pilotLive : ''}`}
            aria-hidden="true"
          />
          <span className={styles.wordmark}>Cadence</span>
        </button>

        <nav className={styles.actions} aria-label="Studio navigation">
          {streak.currentStreakDays > 0 && (
            <span
              className={`${styles.streakTag} tabular-nums`}
              title={`${streak.currentStreakDays}-day practice streak`}
              aria-label={`${streak.currentStreakDays}-day streak`}
            >
              <Flame size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>{streak.currentStreakDays}d</span>
            </span>
          )}

          <button
            type="button"
            className={styles.navButton}
            onClick={onOpenFrameworks}
            aria-label="Open spoken frameworks guide"
          >
            <BookOpen size={15} strokeWidth={1.65} aria-hidden="true" />
            <span className={styles.navLabel}>Frameworks</span>
          </button>

          <button
            type="button"
            className={styles.navButton}
            onClick={onOpenJournal}
            aria-label={`Open practice history (${streak.totalSessions} saved takes)`}
          >
            <History size={15} strokeWidth={1.65} aria-hidden="true" />
            <span className={styles.navLabel}>History</span>
            {streak.totalSessions > 0 && (
              <span className={`${styles.countBadge} tabular-nums`}>
                {streak.totalSessions}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
