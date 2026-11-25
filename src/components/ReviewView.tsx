import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Compass,
  Pause,
  Play,
  Radio,
  RotateCcw,
  TrendingUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  EnergyBucket,
  Framework,
  LensMeta,
  LiveRecordingAsset,
  MetricTone,
  Scenario,
  SessionRecord,
  TakeDelta,
} from '../types/cadence';
import styles from './ReviewView.module.css';

export interface ReviewViewProps {
  session: SessionRecord;
  recording: LiveRecordingAsset | null;
  scenario: Scenario;
  framework: Framework;
  lensMeta: LensMeta;
  takeDelta?: TakeDelta | null;
  onTakeTwo: () => void;
  onNewScenario: () => void;
  onSaveReflection: (sessionId: string, reflectionNote: string) => void;
}

const DEFAULT_FILLER_WORDS = [
  'you know',
  'kind of',
  'sort of',
  'i mean',
  'basically',
  'actually',
  'literally',
  'um',
  'uh',
  'er',
  'ah',
  'like',
];

/** Preceding words where "like" is grammatical (verb/comparison/tactical empathy) rather than a filler */
const GRAMMATICAL_LIKE_PREFIX_RE =
  /(?:^|[\s([{"'“‘])(?:sounds?|sounded|sounding|seems?|seemed|seeming|looks?|looked|looking|feels?|felt|feeling|acts?|acted|acting|smells?|tastes?|works?|worked|appears?|behaves?|reads?|treats?|treated|would|['’]d|do|does|did|don['’]t|doesn['’]t|didn['’]t|will|won['’]t|should|could|might|may|to|really|also|truly|always|never|just|more|less|most|much|very|something|anything|nothing|everything|someone|anyone|things?|people|teams?|companies|options?|cases?|situations?|moments?|tools?|questions?)\s+$/i;

const PRONOUN_LIKE_PREFIX_RE = /(?:^|[\s([{"'“‘])(?:i|we|you|they)\s+$/i;
const GRAMMATICAL_LIKE_SUFFIX_RE = /^\s+to\b/i;

const MAX_TIMELINE_BARS = 84;

function isGrammaticalLike(text: string, matchIndex: number, matchLength: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 32), matchIndex);
  if (GRAMMATICAL_LIKE_PREFIX_RE.test(before)) {
    return true;
  }
  const after = text.slice(matchIndex + matchLength, matchIndex + matchLength + 12);
  if (GRAMMATICAL_LIKE_SUFFIX_RE.test(after)) {
    return true;
  }
  if (PRONOUN_LIKE_PREFIX_RE.test(before) && !/^\s*[,—–-]/.test(after)) {
    return true;
  }
  return false;
}

function formatTimeSec(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function downsampleEnergy(buckets: EnergyBucket[], maxBars: number): EnergyBucket[] {
  if (buckets.length <= maxBars) return buckets;
  const step = buckets.length / maxBars;
  const result: EnergyBucket[] = [];
  for (let i = 0; i < maxBars; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.min(buckets.length, Math.max(start + 1, Math.floor((i + 1) * step)));
    let maxLevel = 0;
    let speakingCount = 0;
    for (let j = start; j < end; j += 1) {
      const b = buckets[j]!;
      if (b.level > maxLevel) maxLevel = b.level;
      if (b.isSpeaking) speakingCount += 1;
    }
    const anchor = buckets[start]!;
    result.push({
      offsetMs: anchor.offsetMs,
      level: maxLevel,
      isSpeaking: speakingCount >= (end - start) / 2,
    });
  }
  return result;
}

function getToneClass(tone: MetricTone): string {
  if (tone === 'positive') return styles.tonePositive ?? '';
  if (tone === 'gentle') return styles.toneGentle ?? '';
  return styles.toneNeutral ?? '';
}

export function ReviewView({
  session,
  recording,
  scenario,
  framework,
  lensMeta,
  takeDelta = null,
  onTakeTwo,
  onNewScenario,
  onSaveReflection,
}: ReviewViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const hasPlayableVideo = Boolean(recording && recording.url && recording.hasVideo);
  const hasPlayableAudio = Boolean(recording && recording.url && recording.hasAudio);
  const isSimulatedPlayback = !hasPlayableVideo && !hasPlayableAudio;
  const isTimerSession = session.mode === 'timer';

  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [mediaDurationSec, setMediaDurationSec] = useState<number | null>(null);

  const [reflectionNote, setReflectionNote] = useState<string>(session.reflectionNote);
  const [savedNotice, setSavedNotice] = useState(false);

  const prevSessionIdRef = useRef<string>(session.id);

  // Reset playback & reflection UI ONLY when switching to a different session (e.g. from History)
  useEffect(() => {
    if (prevSessionIdRef.current !== session.id) {
      prevSessionIdRef.current = session.id;
      setIsMuted(false);
      setIsPlaying(false);
      setCurrentTimeSec(0);
      setMediaDurationSec(null);
      setReflectionNote(session.reflectionNote);
      setSavedNotice(false);
    }
  }, [session.id, session.reflectionNote]);

  // Authoritative duration: guard against WebM Infinity duration quirk
  const totalDurationSec = useMemo(() => {
    if (
      mediaDurationSec !== null &&
      Number.isFinite(mediaDurationSec) &&
      mediaDurationSec > 0.5
    ) {
      return mediaDurationSec;
    }
    return Math.max(1, session.durationSec);
  }, [mediaDurationSec, session.durationSec]);

  const totalDurationMs = totalDurationSec * 1000;
  const currentTimeMs = currentTimeSec * 1000;

  // Keep muted property synchronized cleanly on <video>
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.muted = isMuted;
  }, [isMuted]);

  // Simulated timeline playback loop for Timer takes or saved History sessions
  useEffect(() => {
    if (!isSimulatedPlayback || !isPlaying) return;

    let rafId: number | null = null;
    let lastTimestamp = performance.now();

    const step = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      setCurrentTimeSec((prev) => {
        const next = prev + dtSec;
        if (next >= totalDurationSec) {
          setIsPlaying(false);
          return totalDurationSec;
        }
        return next;
      });

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isSimulatedPlayback, isPlaying, totalDurationSec]);

  const getActiveMediaEl = useCallback((): HTMLMediaElement | null => {
    if (hasPlayableVideo) return videoRef.current;
    if (hasPlayableAudio) return audioRef.current;
    return null;
  }, [hasPlayableAudio, hasPlayableVideo]);

  const seekToSec = useCallback(
    (targetSec: number) => {
      const clamped = Math.max(0, Math.min(totalDurationSec, targetSec));
      setCurrentTimeSec(clamped);

      const mediaEl = getActiveMediaEl();
      if (mediaEl) {
        try {
          mediaEl.currentTime = clamped;
        } catch {
          // Ignore seek errors before metadata loads
        }
      }
    },
    [getActiveMediaEl, totalDurationSec],
  );

  const togglePlayback = useCallback(() => {
    if (isSimulatedPlayback) {
      setIsPlaying((playing) => {
        if (!playing && currentTimeSec >= totalDurationSec - 0.15) {
          setCurrentTimeSec(0);
        }
        return !playing;
      });
      return;
    }

    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;

    if (mediaEl.paused || mediaEl.ended) {
      if (mediaEl.ended || currentTimeSec >= totalDurationSec - 0.15) {
        mediaEl.currentTime = 0;
        setCurrentTimeSec(0);
      }
      mediaEl.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      mediaEl.pause();
    }
  }, [currentTimeSec, getActiveMediaEl, isSimulatedPlayback, totalDurationSec]);

  const handleMediaTimeUpdate = useCallback(() => {
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    setCurrentTimeSec(mediaEl.currentTime);
    if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0.5) {
      setMediaDurationSec(mediaEl.duration);
    }
  }, [getActiveMediaEl]);

  const handleTimelineClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const track = timelineRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      seekToSec(ratio * totalDurationSec);
    },
    [seekToSec, totalDurationSec],
  );

  const handleTimelineKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekToSec(currentTimeSec + 2);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekToSec(currentTimeSec - 2);
      } else if (event.key === 'Home') {
        event.preventDefault();
        seekToSec(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        seekToSec(totalDurationSec);
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
    },
    [currentTimeSec, seekToSec, togglePlayback, totalDurationSec],
  );

  const persistReflection = useCallback(
    (nextNote: string) => {
      onSaveReflection(session.id, nextNote);
      setSavedNotice(true);
    },
    [onSaveReflection, session.id],
  );

  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(false), 1800);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  const flushAndTrigger = useCallback(
    (callback: () => void) => {
      if (reflectionNote !== session.reflectionNote) {
        onSaveReflection(session.id, reflectionNote);
      }
      callback();
    },
    [onSaveReflection, reflectionNote, session.id, session.reflectionNote],
  );

  // Downsampled energy bars for crisp architectural timeline
  const timelineBars = useMemo(() => {
    if (session.energyTimeline.length > 0) {
      return downsampleEnergy(session.energyTimeline, MAX_TIMELINE_BARS);
    }
    const fallbackCount = 48;
    return Array.from({ length: fallbackCount }, (_, idx) => ({
      offsetMs: (idx / fallbackCount) * totalDurationMs,
      level: 0.18,
      isSpeaking: false,
    }));
  }, [session.energyTimeline, totalDurationMs]);

  // Active beat & pause state synced to playhead
  const activeBeatAtPlayhead = useMemo(() => {
    if (session.beatTransitions.length === 0) {
      return framework.beats[0] ?? null;
    }
    let matchedIndex = session.beatTransitions[0]?.beatIndex ?? 0;
    for (const transition of session.beatTransitions) {
      if (transition.enteredAtMs <= currentTimeMs + 150) {
        matchedIndex = transition.beatIndex;
      }
    }
    return framework.beats[matchedIndex] ?? framework.beats[0] ?? null;
  }, [currentTimeMs, framework.beats, session.beatTransitions]);

  const activePauseAtPlayhead = useMemo(() => {
    return (
      session.pauses.find(
        (p) => currentTimeMs >= p.startMs && currentTimeMs <= p.endMs,
      ) ?? null
    );
  }, [currentTimeMs, session.pauses]);

  const playheadEnergyLevel = useMemo(() => {
    if (session.energyTimeline.length === 0) return isPlaying ? 0.35 : 0.1;
    let closest = session.energyTimeline[0]!;
    for (const bucket of session.energyTimeline) {
      if (bucket.offsetMs <= currentTimeMs) {
        closest = bucket;
      } else {
        break;
      }
    }
    return closest.level;
  }, [currentTimeMs, isPlaying, session.energyTimeline]);

  // Filler regex with grammatical "like" exclusion aligned with metricsEvaluator
  const fillerRegex = useMemo(() => {
    const uniqueWords = new Set<string>(DEFAULT_FILLER_WORDS);
    for (const f of session.fillers) {
      const cleaned = f.word.trim().toLowerCase();
      if (cleaned) uniqueWords.add(cleaned);
    }
    const sorted = Array.from(uniqueWords).sort((a, b) => b.length - a.length);
    const pattern = sorted.map((w) => escapeRegExp(w)).join('|');
    return new RegExp(`(\\b(?:${pattern})\\b)`, 'gi');
  }, [session.fillers]);

  const renderAnnotatedText = useCallback(
    (text: string) => {
      if (!text) return null;
      const matcher = new RegExp(fillerRegex.source, 'gi');
      const nodes: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let keyCounter = 0;

      while ((match = matcher.exec(text)) !== null) {
        const matchedText = match[0];
        const matchStart = match.index;
        const normalized = matchedText.toLowerCase();

        if (
          normalized === 'like' &&
          isGrammaticalLike(text, matchStart, matchedText.length)
        ) {
          continue;
        }

        if (matchStart > lastIndex) {
          nodes.push(
            <Fragment key={`t-${keyCounter++}`}>
              {text.slice(lastIndex, matchStart)}
            </Fragment>,
          );
        }

        nodes.push(
          <mark key={`f-${keyCounter++}`} className={styles.fillerPill}>
            {matchedText}
          </mark>,
        );

        lastIndex = matchStart + matchedText.length;
      }

      if (lastIndex < text.length) {
        nodes.push(
          <Fragment key={`t-${keyCounter++}`}>{text.slice(lastIndex)}</Fragment>,
        );
      }

      return nodes.length > 0 ? nodes : text;
    },
    [fillerRegex],
  );

  const finalizedChunks = useMemo(
    () => session.transcriptChunks.filter((c) => c.isFinal && c.text.trim().length > 0),
    [session.transcriptChunks],
  );

  const activeChunkId = useMemo(() => {
    if (finalizedChunks.length === 0) return null;
    let chosen: string | null = null;
    for (const chunk of finalizedChunks) {
      if (chunk.offsetMs <= currentTimeMs + 250) {
        chosen = chunk.id;
      } else {
        break;
      }
    }
    return chosen;
  }, [currentTimeMs, finalizedChunks]);

  const playheadPct = Math.max(0, Math.min(100, (currentTimeSec / totalDurationSec) * 100));
  const metrics = session.metrics;
  const nextTakeNumber = session.takeNumber + 1;
  const hasTranscript = finalizedChunks.length > 0 || session.transcript.trim().length > 0;
  const acousticPulseScale = 1 + (isPlaying ? playheadEnergyLevel * 0.42 : 0.04);

  return (
    <section className={styles.reviewContainer} aria-label="Mirror and Reflection Review">
      {/* Clean Editorial Header */}
      <header className={styles.reviewHeader}>
        <p className={styles.quietMetaLine}>
          <span>{framework.shortName}</span>
          <span className={styles.metaSep} aria-hidden="true">
            ·
          </span>
          <span>Take {session.takeNumber}</span>
          <span className={styles.metaSep} aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums">{formatTimeSec(totalDurationSec)}</span>
        </p>

        <h1 className={styles.scenarioTitle}>{scenario.title}</h1>

        {/* Clean Single-Line Take Shift Bar */}
        {takeDelta && (
          <div className={styles.deltaBar} role="status">
            <span className={styles.deltaTag}>
              <TrendingUp size={13} />
              <span>
                Take {takeDelta.previousTakeNumber} → Take {session.takeNumber}
              </span>
            </span>
            <span className={styles.deltaSummary}>{takeDelta.summaryLabel}</span>
          </div>
        )}
      </header>

      {/* Main Two-Column Review Workspace */}
      <div className={styles.reviewGrid}>
        {/* Main Column: Simple Playback + Clickable Cadence Timeline + Annotated Transcript */}
        <div className={styles.mainColumn}>
          <article className={styles.mirrorCard}>
            {/* Real Video Player */}
            {hasPlayableVideo && recording?.url && (
              <div className={styles.videoViewport}>
                <video
                  ref={videoRef}
                  src={recording.url}
                  className={styles.reviewVideo}
                  playsInline
                  muted={isMuted}
                  onClick={togglePlayback}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTimeSec(totalDurationSec);
                  }}
                  onTimeUpdate={handleMediaTimeUpdate}
                  onLoadedMetadata={handleMediaTimeUpdate}
                />
              </div>
            )}

            {/* Real Audio-Only Player */}
            {!hasPlayableVideo && hasPlayableAudio && recording?.url && (
              <>
                <audio
                  ref={audioRef}
                  src={recording.url}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTimeSec(totalDurationSec);
                  }}
                  onTimeUpdate={handleMediaTimeUpdate}
                  onLoadedMetadata={handleMediaTimeUpdate}
                />
                <div className={styles.audioStage} onClick={togglePlayback}>
                  <span className={styles.audioStageBadge}>
                    <Radio size={12} />
                    <span>Audio Replay</span>
                  </span>

                  <div className={styles.pulseCenter}>
                    <div
                      className={`${styles.pulseHalo} ${
                        activePauseAtPlayhead ? styles.pulseHaloSage : ''
                      }`}
                      style={{
                        transform: `scale(${acousticPulseScale.toFixed(3)})`,
                      }}
                    />
                    <div
                      className={`${styles.pulseCore} ${
                        activePauseAtPlayhead ? styles.pulseCoreSage : ''
                      }`}
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </div>
                  </div>

                  <span className={styles.audioStageSub}>
                    {activePauseAtPlayhead
                      ? activePauseAtPlayhead.kind === 'dynamic'
                        ? `Dynamic Silence · ${(activePauseAtPlayhead.durationMs / 1000).toFixed(1)}s`
                        : `Power Pause · ${(activePauseAtPlayhead.durationMs / 1000).toFixed(1)}s`
                      : activeBeatAtPlayhead
                        ? `Beat ${activeBeatAtPlayhead.index + 1} · ${activeBeatAtPlayhead.label}`
                        : 'Press Play or click the cadence timeline'}
                  </span>
                </div>
              </>
            )}

            {/* Simple Transport Bar (handles Video, Audio, and Timer/History Scrubber) */}
            <div className={styles.transportBar}>
              <div className={styles.transportLeft}>
                <button
                  type="button"
                  className={styles.playBtn}
                  onClick={togglePlayback}
                  aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
                >
                  {isPlaying ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  type="button"
                  className={styles.rewindBtn}
                  onClick={() => seekToSec(Math.max(0, currentTimeSec - 5))}
                  title="Jump back 5 seconds"
                >
                  <RotateCcw size={14} />
                  <span>-5s</span>
                </button>

                {hasPlayableVideo && (
                  <button
                    type="button"
                    className={`${styles.muteBtn} ${isMuted ? styles.muteBtnActive : ''}`}
                    onClick={() => setIsMuted((m) => !m)}
                    aria-pressed={isMuted}
                    aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                    title={isMuted ? 'Unmute video' : 'Mute video to check visual presence'}
                  >
                    {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                )}
              </div>

              <div className={styles.transportRight}>
                {activePauseAtPlayhead ? (
                  <span className={styles.pauseStatusPill}>
                    {activePauseAtPlayhead.kind === 'dynamic'
                      ? 'Dynamic Silence'
                      : 'Power Pause'}
                  </span>
                ) : (
                  activeBeatAtPlayhead && (
                    <span className={styles.activeBeatPill}>
                      Beat {activeBeatAtPlayhead.index + 1} · {activeBeatAtPlayhead.label}
                    </span>
                  )
                )}

                <div className={`${styles.playheadClock} tabular-nums`}>
                  <span>{formatTimeSec(currentTimeSec)}</span>
                  <span className={styles.clockDivider}> / </span>
                  <span>{formatTimeSec(totalDurationSec)}</span>
                </div>
              </div>
            </div>

            {/* Clickable Cadence Timeline */}
            <div className={styles.timelineSection}>
              <div className={styles.timelineTopHeader}>
                <span className={styles.timelineTitle}>Cadence Timeline</span>
                <span className={styles.timelineInstruction}>
                  {isSimulatedPlayback
                    ? isTimerSession
                      ? 'Timer pacing · click any beat to scrub'
                      : 'Saved timeline · click anywhere to scrub'
                    : 'Click any bar, pause pin, or dot to jump'}
                </span>
              </div>

              <div
                ref={timelineRef}
                className={styles.timelineTrack}
                role="slider"
                tabIndex={0}
                aria-label="Cadence playback timeline"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalDurationSec)}
                aria-valuenow={Math.round(currentTimeSec)}
                onClick={handleTimelineClick}
                onKeyDown={handleTimelineKeyDown}
              >
                {/* Beat Transition Markers */}
                {session.beatTransitions.map((transition, idx) => {
                  const pct = Math.max(
                    0,
                    Math.min(98, (transition.enteredAtMs / totalDurationMs) * 100),
                  );
                  const beatObj = framework.beats[transition.beatIndex];
                  const label = beatObj ? beatObj.label : `Beat ${transition.beatIndex + 1}`;
                  return (
                    <button
                      key={`${transition.beatId}-${idx}`}
                      type="button"
                      className={styles.beatMarker}
                      style={{ left: `${pct}%` }}
                      title={`Beat ${transition.beatIndex + 1}: ${label} (${formatTimeSec(transition.enteredAtMs / 1000)})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        seekToSec(transition.enteredAtMs / 1000);
                      }}
                    >
                      <span className={styles.beatMarkerPill}>B{transition.beatIndex + 1}</span>
                      <span className={styles.beatMarkerLine} aria-hidden="true" />
                    </button>
                  );
                })}

                {/* Eucalyptus Power Pause / Dynamic Silence Pins */}
                {session.pauses.map((pause) => {
                  const startPct = Math.max(
                    0,
                    Math.min(99, (pause.startMs / totalDurationMs) * 100),
                  );
                  const widthPct = Math.max(
                    1.2,
                    Math.min(100 - startPct, (pause.durationMs / totalDurationMs) * 100),
                  );
                  const secLabel = (pause.durationMs / 1000).toFixed(1);
                  const kindLabel =
                    pause.kind === 'dynamic' ? 'Dynamic Silence' : 'Power Pause';
                  return (
                    <button
                      key={pause.id}
                      type="button"
                      className={`${styles.pauseSpanPin} ${
                        pause.kind === 'dynamic' ? styles.pauseSpanDynamic : ''
                      }`}
                      style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                      title={`${kindLabel} · ${secLabel}s at ${formatTimeSec(pause.startMs / 1000)} (click to jump)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        seekToSec(Math.max(0, pause.startMs / 1000 - 0.5));
                      }}
                    >
                      <span className={styles.pausePinDot} />
                    </button>
                  );
                })}

                {/* Energy Bar Strip */}
                <div className={styles.energyBars} aria-hidden="true">
                  {timelineBars.map((bucket, idx) => {
                    const barPct = (bucket.offsetMs / totalDurationMs) * 100;
                    const isPlayed = barPct <= playheadPct;
                    const inPause = session.pauses.some(
                      (p) => bucket.offsetMs >= p.startMs && bucket.offsetMs <= p.endMs,
                    );
                    const heightPct = Math.max(12, Math.min(100, Math.round(bucket.level * 100)));

                    return (
                      <span
                        key={idx}
                        className={`${styles.energyBar} ${
                          inPause
                            ? styles.energyBarPause
                            : isPlayed
                              ? styles.energyBarPlayed
                              : bucket.isSpeaking
                                ? styles.energyBarVoiced
                                : styles.energyBarQuiet
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    );
                  })}
                </div>

                {/* Soft Clay Filler Word Dots */}
                {session.fillers.map((filler) => {
                  const pct = Math.max(
                    0.5,
                    Math.min(99.5, (filler.offsetMs / totalDurationMs) * 100),
                  );
                  return (
                    <button
                      key={filler.id}
                      type="button"
                      className={styles.fillerDotPin}
                      style={{ left: `${pct}%` }}
                      title={`Filler "${filler.word}" at ${formatTimeSec(filler.offsetMs / 1000)} (click to jump)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        seekToSec(Math.max(0, filler.offsetMs / 1000 - 0.5));
                      }}
                    />
                  );
                })}

                {/* Playhead Needle */}
                <div
                  className={styles.playheadNeedle}
                  style={{ left: `${playheadPct}%` }}
                  aria-hidden="true"
                />
              </div>

              {/* Timeline Legend */}
              <div className={styles.timelineLegend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.swatchVoice}`} />
                  Voice energy
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.swatchSage}`} />
                  Power Pause ({session.pauses.length})
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.swatchClay}`} />
                  Filler ({session.fillers.length})
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.swatchBeat}`} />
                  Beat
                </span>
              </div>
            </div>
          </article>

          {/* Clean Annotated Transcript Card */}
          <article className={styles.transcriptCard}>
            <div className={styles.transcriptHeader}>
              <div>
                <h2 className={styles.cardHeading}>Annotated Transcript</h2>
                <p className={styles.cardSub}>
                  {hasTranscript
                    ? 'Click any phrase to jump. Filler words are highlighted gently in clay.'
                    : isTimerSession
                      ? 'Timer rehearsal — structure timing captured without mic.'
                      : 'Web Audio cadence captured cleanly.'}
                </p>
              </div>
              {hasTranscript ? (
                <span className={`${styles.wordCountPill} tabular-nums`}>
                  {metrics.wordCount} words
                </span>
              ) : (
                <span className={styles.acousticBadge}>
                  {isTimerSession ? 'Timer Mode' : 'Acoustic Mode'}
                </span>
              )}
            </div>

            {finalizedChunks.length > 0 ? (
              <div className={styles.transcriptBody}>
                {finalizedChunks.map((chunk) => {
                  const isActiveChunk = chunk.id === activeChunkId;
                  return (
                    <button
                      key={chunk.id}
                      type="button"
                      className={`${styles.transcriptChunkBtn} ${
                        isActiveChunk ? styles.transcriptChunkActive : ''
                      }`}
                      onClick={() => seekToSec(chunk.offsetMs / 1000)}
                      title={`Jump to ${formatTimeSec(chunk.offsetMs / 1000)}`}
                    >
                      <span className={`${styles.chunkTimestamp} tabular-nums`}>
                        {formatTimeSec(chunk.offsetMs / 1000)}
                      </span>
                      <span className={styles.chunkText}>
                        {renderAnnotatedText(chunk.text)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : session.transcript.trim().length > 0 ? (
              <p className={styles.transcriptPlain}>
                {renderAnnotatedText(session.transcript)}
              </p>
            ) : (
              <div className={styles.acousticEmptyNote}>
                {isTimerSession ? (
                  <Clock size={16} className={styles.acousticEmptyIcon} />
                ) : (
                  <Compass size={16} className={styles.acousticEmptyIcon} />
                )}
                <div>
                  <div className={styles.acousticEmptyTitle}>
                    {isTimerSession
                      ? 'Silent Timer Rehearsal'
                      : 'Acoustic Mode — Voice & Pauses Captured'}
                  </div>
                  <p className={styles.acousticEmptyBody}>
                    {isTimerSession
                      ? 'You rehearsed your beats on the studio timer without a microphone. Switch to Camera or Audio in the studio whenever you want voice cadence and transcripts.'
                      : 'Browser Speech Recognition was unavailable during this take, so Cadence tracked your Power Pauses, Vocal Expressiveness, Speaking Ratio, and beat pacing directly via Web Audio.'}
                  </p>
                </div>
              </div>
            )}
          </article>
        </div>

        {/* Coaching Column: 3 Crisp Metrics + Next-Take Focus + 1-Line Takeaway + 2 Actions */}
        <aside className={styles.coachingColumn} aria-label="Coaching summary and reflection">
          {/* 3 Crisp Metric Cards */}
          <div className={styles.metricsStack}>
            {/* Card 1: Pace (WPM) | Expressiveness fallback | Beats Hit in Timer mode */}
            <div className={styles.metricCard}>
              <div className={styles.metricLeft}>
                <span className={styles.metricTitle}>
                  {metrics.wpm !== null
                    ? 'Pace'
                    : isTimerSession
                      ? 'Beats Hit'
                      : 'Vocal Expressiveness'}
                </span>
                <span className={styles.metricFoot}>
                  {metrics.wpm !== null
                    ? `Target ${lensMeta.targetWpmMin}–${lensMeta.targetWpmMax} WPM`
                    : isTimerSession
                      ? 'Framework beats covered'
                      : 'Web Audio dynamic contour'}
                </span>
              </div>
              <div className={styles.metricRight}>
                <div className={styles.metricValueRow}>
                  {metrics.wpm !== null ? (
                    <>
                      <span className={`${styles.metricNumber} tabular-nums`}>{metrics.wpm}</span>
                      <span className={styles.metricUnit}>WPM</span>
                    </>
                  ) : isTimerSession ? (
                    <>
                      <span className={`${styles.metricNumber} tabular-nums`}>
                        {metrics.beatsHit}/{metrics.totalBeats}
                      </span>
                      <span className={styles.metricUnit}>beats</span>
                    </>
                  ) : (
                    <>
                      <span className={`${styles.metricNumber} tabular-nums`}>
                        {metrics.vocalExpressiveness}
                      </span>
                      <span className={styles.metricUnit}>/ 100</span>
                    </>
                  )}
                </div>
                <span
                  className={`${styles.metricTonePill} ${getToneClass(
                    isTimerSession && metrics.wpm === null
                      ? metrics.structureTone
                      : metrics.paceTone,
                  )}`}
                >
                  {isTimerSession && metrics.wpm === null
                    ? metrics.structureLabel
                    : metrics.paceLabel}
                </span>
              </div>
            </div>

            {/* Card 2: Power Pauses / Dynamic Silences */}
            <div className={styles.metricCard}>
              <div className={styles.metricLeft}>
                <span className={styles.metricTitle}>
                  {session.lens === 'negotiation' ? 'Silences' : 'Power Pauses'}
                </span>
                <span className={styles.metricFoot}>
                  {isTimerSession
                    ? 'Enable mic for pause detection'
                    : session.lens === 'negotiation' || metrics.dynamicSilenceCount > 0
                      ? `${metrics.dynamicSilenceCount} Dynamic Silence${metrics.dynamicSilenceCount === 1 ? '' : 's'} (≥3s)`
                      : 'Target ≥ 2 clean breaths'}
                </span>
              </div>
              <div className={styles.metricRight}>
                <div className={styles.metricValueRow}>
                  <span className={`${styles.metricNumber} tabular-nums`}>
                    {metrics.powerPauseCount}
                  </span>
                  <span className={styles.metricUnit}>
                    {metrics.powerPauseCount === 1 ? 'pause' : 'pauses'}
                  </span>
                </div>
                <span className={`${styles.metricTonePill} ${getToneClass(metrics.pauseTone)}`}>
                  {isTimerSession ? 'Timer' : metrics.pauseLabel}
                </span>
              </div>
            </div>

            {/* Card 3: Fillers | Speaking Ratio fallback | Duration in Timer mode */}
            <div className={styles.metricCard}>
              <div className={styles.metricLeft}>
                <span className={styles.metricTitle}>
                  {metrics.fillersPerMin !== null
                    ? 'Fillers'
                    : isTimerSession
                      ? 'Duration'
                      : 'Speaking Ratio'}
                </span>
                <span className={styles.metricFoot}>
                  {metrics.fillersPerMin !== null
                    ? 'Target ≤ 3 / min'
                    : isTimerSession
                      ? `Target ${formatTimeSec(scenario.durationSec)}`
                      : 'Active voice vs. breath'}
                </span>
              </div>
              <div className={styles.metricRight}>
                <div className={styles.metricValueRow}>
                  {metrics.fillersPerMin !== null ? (
                    <>
                      <span className={`${styles.metricNumber} tabular-nums`}>
                        {metrics.fillerCount}
                      </span>
                      <span className={`${styles.metricUnit} tabular-nums`}>
                        ({metrics.fillersPerMin.toFixed(1)}/min)
                      </span>
                    </>
                  ) : isTimerSession ? (
                    <span className={`${styles.metricNumber} tabular-nums`}>
                      {formatTimeSec(totalDurationSec)}
                    </span>
                  ) : (
                    <>
                      <span className={`${styles.metricNumber} tabular-nums`}>
                        {metrics.speakingRatio}%
                      </span>
                      <span className={styles.metricUnit}>voiced</span>
                    </>
                  )}
                </div>
                <span
                  className={`${styles.metricTonePill} ${getToneClass(
                    isTimerSession && metrics.fillersPerMin === null
                      ? 'neutral'
                      : metrics.fillerTone,
                  )}`}
                >
                  {isTimerSession && metrics.fillersPerMin === null
                    ? 'Paced'
                    : metrics.fillerLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Next-Take Focus Card */}
          <article className={styles.encoreCard}>
            <div className={styles.encoreEyebrow}>Next-Take Focus</div>
            <h2 className={styles.encoreTitle}>{session.oneChangeCue.title}</h2>
            <p className={styles.encoreBody}>{session.oneChangeCue.instruction}</p>
          </article>

          {/* 1-Line Takeaway Note Card */}
          <article className={styles.takeawayCard}>
            <div className={styles.takeawayHeader}>
              <label htmlFor="cadence-takeaway-note" className={styles.takeawayLabel}>
                Takeaway for next take
              </label>
              {savedNotice && (
                <span className={styles.savedIndicator}>
                  <Check size={12} />
                  <span>Saved</span>
                </span>
              )}
            </div>
            <input
              id="cadence-takeaway-note"
              type="text"
              className={styles.noteInput}
              value={reflectionNote}
              onChange={(e) => setReflectionNote(e.target.value)}
              onBlur={() => persistReflection(reflectionNote)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                  persistReflection(reflectionNote);
                }
              }}
              placeholder="One crisp habit to lock in next…"
              maxLength={140}
            />
          </article>

          {/* 2-Button Action Bar */}
          <div className={styles.actionBar}>
            <button
              type="button"
              className={styles.takeTwoCta}
              onClick={() => flushAndTrigger(onTakeTwo)}
            >
              <span>Take {nextTakeNumber} — Sharpen It</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => flushAndTrigger(onNewScenario)}
            >
              Practice Desk
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
