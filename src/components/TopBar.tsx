import { Flame, PenLine, Sparkles, TrendingUp } from 'lucide-react';
import type { AppView, StreakSummary } from '../types/cadence';
import styles from './TopBar.module.css';

export interface TopBarProps {
  currentView: AppView;
  streak: StreakSummary;
  onNavigate: (view: 'practice' | 'create' | 'progress') => void;
}

export function TopBar({ currentView, streak, onNavigate }: TopBarProps) {
  const hasStreak = streak.currentStreakDays > 0;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.brandButton}
          onClick={() => onNavigate('practice')}
          aria-label="Cadence — Go to Practice"
        >
          <span className={styles.pilotDot} aria-hidden="true" />
          <span className={styles.wordmark}>Cadence</span>
        </button>

        <nav className={styles.tabGroup} aria-label="Primary navigation">
          <button
            type="button"
            aria-current={currentView === 'practice' ? 'page' : undefined}
            className={`${styles.tabButton} ${
              currentView === 'practice' ? styles.tabButtonActive : ''
            }`}
            onClick={() => onNavigate('practice')}
          >
            <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Practice</span>
          </button>

          <button
            type="button"
            aria-current={currentView === 'create' ? 'page' : undefined}
            className={`${styles.tabButton} ${
              currentView === 'create' ? styles.tabButtonActive : ''
            }`}
            onClick={() => onNavigate('create')}
          >
            <PenLine size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Create</span>
          </button>

          <button
            type="button"
            aria-current={currentView === 'progress' ? 'page' : undefined}
            className={`${styles.tabButton} ${
              currentView === 'progress' ? styles.tabButtonActive : ''
            }`}
            onClick={() => onNavigate('progress')}
          >
            <TrendingUp size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Progress</span>
            {streak.totalSessions > 0 && (
              <span className={`${styles.countBadge} tabular-nums`}>
                {streak.totalSessions}
              </span>
            )}
          </button>
        </nav>

        <button
          type="button"
          className={`${styles.streakChip} ${hasStreak ? styles.streakChipActive : ''}`}
          onClick={() => onNavigate('progress')}
          title={
            hasStreak
              ? `${streak.currentStreakDays}-day practice streak — view progress`
              : 'View your practice progress'
          }
          aria-label={
            hasStreak
              ? `${streak.currentStreakDays}-day streak. Open Progress`
              : 'Start a streak. Open Progress'
          }
        >
          <Flame size={14} strokeWidth={1.8} className={styles.streakIcon} aria-hidden="true" />
          <span className={hasStreak ? 'tabular-nums' : undefined}>
            {hasStreak ? `${streak.currentStreakDays}d` : 'Start a streak'}
          </span>
        </button>
      </div>
    </header>
  );
}
