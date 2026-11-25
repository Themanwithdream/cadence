import { useEffect, useMemo } from 'react';
import {
  ArrowUpRight,
  Flame,
  History,
  Mic,
  Timer,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  Framework,
  FrameworkId,
  Scenario,
  SessionRecord,
  StreakSummary,
  StudioMode,
} from '../types/cadence';
import styles from './JournalDrawer.module.css';

export interface JournalDrawerProps {
  isOpen: boolean;
  sessions: SessionRecord[];
  scenarios: Scenario[];
  frameworks: Framework[];
  streak: StreakSummary;
  onClose: () => void;
  onSelectSession: (session: SessionRecord) => void;
  onDeleteSession: (sessionId: string) => void;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatSessionTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);
  const targetKey = toLocalDateKey(parsed);

  const timeStr = parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (targetKey === todayKey) return `Today · ${timeStr}`;
  if (targetKey === yesterdayKey) return `Yesterday · ${timeStr}`;

  const dateStr = parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${dateStr} · ${timeStr}`;
}

function ModeIcon({ mode }: { mode: StudioMode }) {
  switch (mode) {
    case 'camera':
      return <Video size={12} strokeWidth={1.7} aria-hidden="true" />;
    case 'audio':
      return <Mic size={12} strokeWidth={1.7} aria-hidden="true" />;
    case 'timer':
      return <Timer size={12} strokeWidth={1.7} aria-hidden="true" />;
  }
}

export function JournalDrawer({
  isOpen,
  sessions,
  scenarios,
  frameworks,
  streak,
  onClose,
  onSelectSession,
  onDeleteSession,
}: JournalDrawerProps) {
  const scenarioMap = useMemo(() => {
    const map = new Map<string, Scenario>();
    for (const sc of scenarios) {
      map.set(sc.id, sc);
    }
    return map;
  }, [scenarios]);

  const frameworkMap = useMemo(() => {
    const map = new Map<FrameworkId, Framework>();
    for (const fw of frameworks) {
      map.set(fw.id, fw);
    }
    return map;
  }, [frameworks]);

  const orderedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [sessions]
  );

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerTitleBlock}>
            <span className={styles.eyebrow}>
              <History size={13} strokeWidth={1.7} aria-hidden="true" />
              Saved Takes
            </span>
            <h2 id="history-drawer-title" className={styles.title}>
              History
            </h2>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close history"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {/* Compact Summary Strip */}
          {streak.totalSessions > 0 && (
            <section className={styles.summaryStrip} aria-label="Practice summary">
              <span className={`${styles.summaryStat} tabular-nums`}>
                <strong>{streak.totalSessions}</strong>{' '}
                {streak.totalSessions === 1 ? 'take' : 'takes'}
              </span>

              {streak.currentStreakDays > 0 && (
                <>
                  <span className={styles.summaryDot} aria-hidden="true" />
                  <span className={`${styles.summaryStreak} tabular-nums`}>
                    <Flame size={13} strokeWidth={1.8} aria-hidden="true" />
                    {streak.currentStreakDays}-day streak
                  </span>
                </>
              )}
            </section>
          )}

          {/* Session List or Warm Empty State */}
          {orderedSessions.length === 0 ? (
            <section className={styles.emptyState}>
              <svg
                className={styles.emptyWave}
                viewBox="0 0 120 36"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 18 C 22 4, 34 32, 50 18 C 66 4, 78 32, 94 18 C 104 9, 110 18, 114 18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle cx="60" cy="18" r="3.5" fill="var(--accent-terracotta)" />
              </svg>
              <h3 className={styles.emptyTitle}>No takes saved yet.</h3>
              <p className={styles.emptyCopy}>
                Complete one 60-second take to start tracking your pace, pauses, and
                takeaways privately on this device.
              </p>
              <button
                type="button"
                className={styles.emptyButton}
                onClick={onClose}
              >
                Browse Practice Desk
              </button>
            </section>
          ) : (
            <div className={styles.sessionList} role="list" aria-label="Saved practice takes">
              {orderedSessions.map((session) => {
                const scenario = scenarioMap.get(session.scenarioId);
                const framework = frameworkMap.get(session.frameworkId);
                const title =
                  scenario?.title ??
                  (session.scenarioId.startsWith('custom-')
                    ? 'Custom Scenario'
                    : 'Practice Take');
                const m = session.metrics;

                return (
                  <article key={session.id} role="listitem" className={styles.sessionCard}>
                    <div className={styles.sessionTop}>
                      <div className={styles.sessionMetaLeft}>
                        <span
                          className={`${styles.lensDot} ${styles[`lensDot_${session.lens}`]}`}
                          aria-hidden="true"
                        />
                        <span className={`${styles.takePill} tabular-nums`}>
                          Take {session.takeNumber}
                        </span>
                        <span className={styles.modeTag} title={`Recorded in ${session.mode} mode`}>
                          <ModeIcon mode={session.mode} />
                          <span>{session.mode}</span>
                        </span>
                      </div>

                      <div className={styles.sessionMetaRight}>
                        <span className={styles.timestamp}>
                          {formatSessionTimestamp(session.createdAt)}
                        </span>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          aria-label={`Delete Take ${session.takeNumber} of ${title}`}
                          title="Delete take"
                        >
                          <Trash2 size={14} strokeWidth={1.65} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <h3 className={styles.sessionTitle}>
                      <button
                        type="button"
                        className={styles.sessionSelectTrigger}
                        onClick={() => onSelectSession(session)}
                      >
                        {title}
                      </button>
                    </h3>

                    <div className={styles.metricRow}>
                      {m.wpm !== null ? (
                        <span className={`${styles.metricChip} tabular-nums`}>
                          {Math.round(m.wpm)} WPM
                        </span>
                      ) : session.mode === 'timer' ? (
                        <span className={`${styles.metricChip} tabular-nums`}>
                          {m.beatsHit}/{m.totalBeats} beats
                        </span>
                      ) : (
                        <span className={`${styles.metricChip} tabular-nums`}>
                          {Math.round(m.vocalExpressiveness)}% dynamic
                        </span>
                      )}

                      {session.mode !== 'timer' && (
                        <span
                          className={`${styles.metricChip} ${
                            m.powerPauseCount >= 2 ? styles.metricChipSage : ''
                          } tabular-nums`}
                        >
                          {m.powerPauseCount}{' '}
                          {m.powerPauseCount === 1 ? 'pause' : 'pauses'}
                        </span>
                      )}

                      {framework && (
                        <span className={styles.frameworkTag}>{framework.shortName}</span>
                      )}
                    </div>

                    {session.reflectionNote.trim().length > 0 && (
                      <p className={styles.reflectionNote}>
                        &ldquo;{session.reflectionNote.trim()}&rdquo;
                      </p>
                    )}

                    <div className={styles.cardOpenCue} aria-hidden="true">
                      <span>Open review</span>
                      <ArrowUpRight size={13} strokeWidth={1.8} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
