import { useEffect, useState } from 'react';
import type { PauseKind, StudioMode, StudioPhase } from '../types/cadence';
import styles from './EyeLineBeacon.module.css';

export interface EyeLineBeaconProps {
  phase: StudioPhase;
  mode: StudioMode;
  inPowerPause: boolean;
  inDynamicSilence: boolean;
  lastPauseBloomAt: number | null;
  /** Optional anchor text; defaults to "Look at camera lens" */
  label?: string;
}

const BLOOM_LINGER_MS = 2200;

export function EyeLineBeacon({
  phase,
  mode,
  inPowerPause,
  inDynamicSilence,
  lastPauseBloomAt,
  label = 'Look at camera lens',
}: EyeLineBeaconProps) {
  const [recentBloomKind, setRecentBloomKind] = useState<PauseKind | null>(null);

  useEffect(() => {
    if (inDynamicSilence) {
      setRecentBloomKind('dynamic');
      return;
    }
    if (inPowerPause) {
      setRecentBloomKind('power');
      return;
    }
    if (!lastPauseBloomAt) {
      return;
    }

    const elapsed = Date.now() - lastPauseBloomAt;
    if (elapsed >= BLOOM_LINGER_MS) {
      return;
    }

    setRecentBloomKind((prev) => prev ?? 'power');
    const remaining = Math.max(200, BLOOM_LINGER_MS - elapsed);
    const timer = window.setTimeout(() => {
      setRecentBloomKind(null);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [inPowerPause, inDynamicSilence, lastPauseBloomAt]);

  // Clear lingering bloom when returning to prep
  useEffect(() => {
    if (phase === 'prep') {
      setRecentBloomKind(null);
    }
  }, [phase]);

  const activePauseKind: PauseKind | null = inDynamicSilence
    ? 'dynamic'
    : inPowerPause
      ? 'power'
      : phase === 'live'
        ? recentBloomKind
        : null;

  const isPauseBloom = activePauseKind !== null;
  const isLive = phase === 'live';
  const isCountdown = phase === 'countdown';

  const stateClass = isPauseBloom
    ? styles.statePause
    : isLive
      ? styles.stateLive
      : isCountdown
        ? styles.stateCountdown
        : styles.statePrep;

  const statusText = isPauseBloom
    ? activePauseKind === 'dynamic'
      ? 'Dynamic Silence'
      : 'Power Pause'
    : isLive
      ? mode === 'timer'
        ? 'Timer'
        : 'Live'
      : isCountdown
        ? 'Breathe'
        : 'Ready';

  const anchorLabel =
    isCountdown ? 'Hold lens · Inhale' : label;

  return (
    <div
      className={`${styles.beacon} ${stateClass}`}
      role="status"
      aria-live="polite"
      aria-label={`${anchorLabel}, ${statusText}`}
    >
      <span className={styles.lensReticle} aria-hidden="true">
        <span className={styles.haloOuter} />
        <span className={styles.haloInner} />
        <span className={styles.coreDot} />
      </span>

      <span className={styles.anchorText}>{anchorLabel}</span>

      <span className={styles.divider} aria-hidden="true" />

      <span
        className={`${styles.whisperBadge} ${isPauseBloom ? styles.whisperBadgeBloom : ''}`}
      >
        {statusText}
      </span>
    </div>
  );
}
