import { useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Compass,
  Flame,
  Mic,
  Timer,
  Trash2,
  TrendingUp,
  Video,
} from 'lucide-react';
import type {
  CoachReport,
  Framework,
  FrameworkId,
  Scenario,
  SessionRecord,
  StreakSummary,
  StudioMode,
} from '../types/cadence';
import styles from './ProgressView.module.css';

export interface ProgressViewProps {
  sessions: SessionRecord[];
  scenarios: Scenario[];
  frameworks: Framework[];
  streak: StreakSummary;
  getCoachReport: (session: SessionRecord) => CoachReport;
  onSelectSession: (session: SessionRecord) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartFirstRep: () => void;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimestamp(iso: string): string {
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

function scoreToneClass(score: number): 'scoreHigh' | 'scoreMid' | 'scoreLow' {
  if (score >= 75) return 'scoreHigh';
  if (score >= 55) return 'scoreMid';
  return 'scoreLow';
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

export function ProgressView({
  sessions,
  scenarios,
  frameworks,
  streak,
  getCoachReport,
  onSelectSession,
  onDeleteSession,
  onStartFirstRep,
}: ProgressViewProps) {
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

  const orderedEntries = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.map((session) => ({
      session,
      report: getCoachReport(session),
    }));
  }, [sessions, getCoachReport]);

  const avgScore = useMemo(() => {
    if (orderedEntries.length === 0) return null;
    const total = orderedEntries.reduce((sum, entry) => sum + entry.report.overallScore, 0);
    return Math.round(total / orderedEntries.length);
  }, [orderedEntries]);

  const currentFocus =
    orderedEntries[0]?.report.topFocusSummary ?? 'Complete your first rep to unlock coaching';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Coaching Log &amp; Trends</span>
        <h1 className={styles.title}>Your Progress</h1>
        <p className={styles.subtitle}>
          Every 60-second take builds poise. Review past recordings, transcript highlights, and
          speech coaching privately on this device.
        </p>
      </header>

      {/* Top 4 Summary Cards */}
      <section className={styles.summaryGrid} aria-label="Progress highlights">
        <article className={styles.statCard}>
          <span className={styles.statLabel}>
            <TrendingUp size={13} strokeWidth={1.8} aria-hidden="true" />
            Takes Completed
          </span>
          <span className={`${styles.statValue} tabular-nums`}>
            {streak.totalSessions}
          </span>
          <span className={styles.statSub}>
            {streak.practicedScenarioIds.length}{' '}
            {streak.practicedScenarioIds.length === 1 ? 'scenario' : 'scenarios'} practiced
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>
            <Award size={13} strokeWidth={1.8} aria-hidden="true" />
            Avg Clarity Score
          </span>
          <div className={styles.statValueRow}>
            <span className={`${styles.statValue} tabular-nums`}>
              {avgScore !== null ? avgScore : '—'}
            </span>
            {avgScore !== null && (
              <span className={`${styles.statScoreTag} ${styles[scoreToneClass(avgScore)]}`}>
                / 100
              </span>
            )}
          </div>
          <span className={styles.statSub}>
            {avgScore !== null ? 'Across saved takes' : 'Scored after Take 1'}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>
            <Flame size={13} strokeWidth={1.8} aria-hidden="true" />
            Current Streak
          </span>
          <span className={`${styles.statValue} tabular-nums`}>
            {streak.currentStreakDays}{' '}
            <span className={styles.statUnit}>
              {streak.currentStreakDays === 1 ? 'day' : 'days'}
            </span>
          </span>
          <span className={styles.statSub}>
            {streak.practicedToday ? 'Today logged' : 'Ready for today’s rep'}
          </span>
        </article>

        <article className={`${styles.statCard} ${styles.focusCard}`}>
          <span className={styles.statLabel}>
            <Compass size={13} strokeWidth={1.8} aria-hidden="true" />
            Current Focus
          </span>
          <p className={styles.focusValue}>{currentFocus}</p>
          <span className={styles.statSub}>
            {orderedEntries.length > 0 ? 'From your latest take' : 'Coach recommendation'}
          </span>
        </article>
      </section>

      {/* Practice History List */}
      <section className={styles.historySection} aria-labelledby="history-heading">
        <div className={styles.historyHeader}>
          <h2 id="history-heading" className={styles.historyHeading}>
            Practice History
          </h2>
          {orderedEntries.length > 0 && (
            <span className={`${styles.historyCount} tabular-nums`}>
              {orderedEntries.length} saved
            </span>
          )}
        </div>

        {orderedEntries.length === 0 ? (
          <div className={styles.emptyCard}>
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
            <h3 className={styles.emptyTitle}>No takes recorded yet.</h3>
            <p className={styles.emptyCopy}>
              Finish one quick speaking take and you&rsquo;ll see your Clarity Score, annotated
              transcript, and speech coaching right here.
            </p>
            <button
              type="button"
              className={styles.emptyCta}
              onClick={onStartFirstRep}
            >
              <span>Start Your First Rep</span>
              <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className={styles.list} role="list" aria-label="Saved practice takes">
            {orderedEntries.map(({ session, report }) => {
              const scenario = scenarioMap.get(session.scenarioId);
              const framework = frameworkMap.get(session.frameworkId);
              const title =
                scenario?.title ??
                (session.scenarioId.startsWith('custom-')
                  ? 'Custom Scenario'
                  : 'Practice Take');
              const m = session.metrics;
              const tone = scoreToneClass(report.overallScore);

              return (
                <article key={session.id} role="listitem" className={styles.rowCard}>
                  <div
                    className={`${styles.scoreBadge} ${styles[tone]} tabular-nums`}
                    aria-label={`Clarity score ${report.overallScore} out of 100`}
                  >
                    <span className={styles.scoreNum}>{report.overallScore}</span>
                    <span className={styles.scoreCaption}>score</span>
                  </div>

                  <div className={styles.rowBody}>
                    <div className={styles.rowMetaTop}>
                      <span
                        className={`${styles.lensDot} ${styles[`lensDot_${session.lens}`]}`}
                        aria-hidden="true"
                      />
                      <span className={`${styles.takePill} tabular-nums`}>
                        Take {session.takeNumber}
                      </span>
                      <span className={styles.modePill}>
                        <ModeIcon mode={session.mode} />
                        <span>{session.mode}</span>
                      </span>
                      {framework && (
                        <span className={styles.frameworkText}>{framework.shortName}</span>
                      )}
                      <span className={styles.dateText}>
                        {formatTimestamp(session.createdAt)}
                      </span>
                    </div>

                    <h3 className={styles.rowTitle}>
                      <button
                        type="button"
                        className={styles.rowTrigger}
                        onClick={() => onSelectSession(session)}
                      >
                        {title}
                      </button>
                    </h3>

                    <div className={styles.telemetryStrip}>
                      {m.wpm !== null ? (
                        <span className={`${styles.telemetryPill} tabular-nums`}>
                          {Math.round(m.wpm)} WPM
                        </span>
                      ) : session.mode === 'timer' ? (
                        <span className={`${styles.telemetryPill} tabular-nums`}>
                          {m.beatsHit}/{m.totalBeats} questions
                        </span>
                      ) : (
                        <span className={`${styles.telemetryPill} tabular-nums`}>
                          {Math.round(m.vocalExpressiveness)}% dynamic
                        </span>
                      )}

                      {session.mode !== 'timer' && (
                        <span className={`${styles.telemetryPill} tabular-nums`}>
                          {m.powerPauseCount}{' '}
                          {m.powerPauseCount === 1 ? 'pause' : 'pauses'}
                        </span>
                      )}

                      {m.fillersPerMin !== null && (
                        <span className={`${styles.telemetryPill} tabular-nums`}>
                          {m.fillerCount}{' '}
                          {m.fillerCount === 1 ? 'filler' : 'fillers'}
                        </span>
                      )}

                      <span className={styles.verdictText}>{report.verdict}</span>
                    </div>

                    {session.reflectionNote.trim().length > 0 && (
                      <p className={styles.takeawayNote}>
                        &ldquo;{session.reflectionNote.trim()}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className={styles.rowActions}>
                    <span className={styles.openHint} aria-hidden="true">
                      Review
                      <ArrowUpRight size={14} strokeWidth={1.85} />
                    </span>

                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      aria-label={`Delete Take ${session.takeNumber} of ${title}`}
                      title="Delete take"
                    >
                      <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
