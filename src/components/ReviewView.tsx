import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  CoachReport,
  EnergyBucket,
  Framework,
  Lens,
  LensMeta,
  LiveRecordingAsset,
  MetricTone,
  PauseEvent,
  Scenario,
  SessionRecord,
  TakeDelta,
  TranscriptAnnotation,
  TranscriptChunk,
} from '../types/cadence';
import styles from './ReviewView.module.css';

export interface ReviewViewProps {
  session: SessionRecord;
  coachReport: CoachReport;
  recording: LiveRecordingAsset | null;
  scenario: Scenario;
  framework: Framework;
  lensMeta: LensMeta;
  takeDelta?: TakeDelta | null;
  annotateText: (text: string, lens: Lens) => TranscriptAnnotation[];
  onTakeTwo: () => void;
  onBackToPractice: () => void;
  onSaveReflection: (sessionId: string, reflectionNote: string) => void;
}

interface TranscriptChapter {
  key: string;
  beatIndex: number;
  label: string;
  questionText: string;
  startMs: number;
  chunks: TranscriptChunk[];
}

const MAX_TIMELINE_BARS = 84;
const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatTimeSec(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
  coachReport,
  recording,
  scenario,
  framework,
  lensMeta,
  takeDelta = null,
  annotateText,
  onTakeTwo,
  onBackToPractice,
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

  // Animate circular score ring cleanly on mount & session switch
  const [animatedScore, setAnimatedScore] = useState(0);

  const clampedScore = Math.max(0, Math.min(100, Math.round(coachReport.overallScore)));

  useEffect(() => {
    setAnimatedScore(0);
    const raf = window.requestAnimationFrame(() => {
      setAnimatedScore(clampedScore);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [session.id, clampedScore]);

  const prevSessionIdRef = useRef<string>(session.id);

  // Reset playback & reflection UI ONLY when switching to a different session
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

  // Resolve the questions snapshot for chapter headings & timeline markers
  const resolvedQuestions = useMemo(() => {
    if (session.questionSnapshots && session.questionSnapshots.length > 0) {
      return session.questionSnapshots;
    }
    if (scenario.questions.length > 0) {
      return scenario.questions;
    }
    return framework.beats.map((b) => ({
      id: b.id,
      text: b.label,
      hint: b.livePrompt,
    }));
  }, [framework.beats, scenario.questions, session.questionSnapshots]);

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

  // Active question & pause state synced to playhead
  const activeStepAtPlayhead = useMemo(() => {
    let matchedIndex = 0;
    if (session.beatTransitions.length > 0) {
      matchedIndex = session.beatTransitions[0]?.beatIndex ?? 0;
      for (const transition of session.beatTransitions) {
        if (transition.enteredAtMs <= currentTimeMs + 150) {
          matchedIndex = transition.beatIndex;
        }
      }
    }
    const q = resolvedQuestions[matchedIndex] ?? resolvedQuestions[0];
    return q ? { index: matchedIndex, text: q.text } : null;
  }, [currentTimeMs, resolvedQuestions, session.beatTransitions]);

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

  // Finalized spoken chunks sorted chronologically
  const finalizedChunks = useMemo(
    () =>
      session.transcriptChunks
        .filter((c) => c.isFinal && c.text.trim().length > 0)
        .sort((a, b) => a.offsetMs - b.offsetMs),
    [session.transcriptChunks],
  );

  // Group finalized chunks into Q1 / Q2 / Q3 chapters in chronological order
  const transcriptChapters: TranscriptChapter[] = useMemo(() => {
    if (finalizedChunks.length === 0) return [];
    const chapters: TranscriptChapter[] = [];

    for (const chunk of finalizedChunks) {
      const idx = Math.max(0, chunk.beatIndex);
      const lastChapter = chapters[chapters.length - 1];
      if (lastChapter && lastChapter.beatIndex === idx) {
        lastChapter.chunks.push(chunk);
      } else {
        const question = resolvedQuestions[idx];
        chapters.push({
          key: `chapter-${idx}-${chapters.length}`,
          beatIndex: idx,
          label: `Q${idx + 1}`,
          questionText: question?.text ?? `Question ${idx + 1}`,
          startMs: chunk.offsetMs,
          chunks: [chunk],
        });
      }
    }

    return chapters;
  }, [finalizedChunks, resolvedQuestions]);

  // Map each Power Pause / Dynamic Silence to the spoken chunk immediately preceding it
  const pausesAfterChunkId = useMemo(() => {
    const map = new Map<string, PauseEvent[]>();
    if (finalizedChunks.length === 0 || session.pauses.length === 0) return map;

    const sortedPauses = [...session.pauses].sort((a, b) => a.startMs - b.startMs);
    for (const pause of sortedPauses) {
      let targetChunk: TranscriptChunk | null = null;
      for (const chunk of finalizedChunks) {
        if (chunk.offsetMs <= pause.startMs + 250) {
          targetChunk = chunk;
        } else {
          break;
        }
      }
      if (!targetChunk) {
        targetChunk = finalizedChunks[0] ?? null;
      }
      if (targetChunk) {
        const list = map.get(targetChunk.id) ?? [];
        list.push(pause);
        map.set(targetChunk.id, list);
      }
    }

    return map;
  }, [finalizedChunks, session.pauses]);

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

  const renderAnnotatedText = useCallback(
    (text: string) => {
      if (!text) return null;
      const rawAnnos = annotateText(text, session.lens);
      if (rawAnnos.length === 0) return text;

      const sorted = [...rawAnnos]
        .filter((a) => a.start >= 0 && a.end > a.start && a.end <= text.length)
        .sort((a, b) => a.start - b.start);

      const nodes: React.ReactNode[] = [];
      let cursor = 0;
      let keyCounter = 0;

      for (const anno of sorted) {
        if (anno.start < cursor) continue;
        if (anno.start > cursor) {
          nodes.push(
            <Fragment key={`p-${keyCounter++}`}>
              {text.slice(cursor, anno.start)}
            </Fragment>,
          );
        }

        const slice = text.slice(anno.start, anno.end);
        const cls =
          anno.kind === 'filler'
            ? styles.annoFiller
            : anno.kind === 'hedge'
              ? styles.annoHedge
              : styles.annoPower;

        nodes.push(
          <mark key={`a-${keyCounter++}`} className={cls} title={anno.tip}>
            {slice}
          </mark>,
        );
        cursor = anno.end;
      }

      if (cursor < text.length) {
        nodes.push(
          <Fragment key={`p-${keyCounter++}`}>{text.slice(cursor)}</Fragment>,
        );
      }

      return nodes.length > 0 ? nodes : text;
    },
    [annotateText, session.lens],
  );

  const playheadPct = Math.max(0, Math.min(100, (currentTimeSec / totalDurationSec) * 100));
  const metrics = session.metrics;
  const nextTakeNumber = session.takeNumber + 1;
  const hasTranscript = finalizedChunks.length > 0 || session.transcript.trim().length > 0;
  const acousticPulseScale = 1 + (isPlaying ? playheadEnergyLevel * 0.42 : 0.04);

  const scoreTier =
    clampedScore >= 75 ? 'sage' : clampedScore >= 55 ? 'amber' : 'terracotta';
  const scoreStrokeOffset = RING_CIRCUMFERENCE * (1 - animatedScore / 100);

  const scoreTierClass =
    scoreTier === 'sage'
      ? styles.scoreSage
      : scoreTier === 'amber'
        ? styles.scoreAmber
        : styles.scoreTerracotta;

  return (
    <section className={styles.reviewContainer} aria-label="Speech Coach Review">
      {/* Celebration & Clarity Score Header */}
      <header className={styles.reviewHeader}>
        <div className={styles.headerTextCol}>
          <p className={styles.quietMetaLine}>
            <span>{lensMeta.label}</span>
            <span className={styles.metaSep} aria-hidden="true">
              ·
            </span>
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

          {/* Single-line Take 1 -> Take 2 Shift Banner */}
          {takeDelta && (
            <div className={styles.deltaBar} role="status">
              <span className={styles.deltaTag}>
                <TrendingUp size={13} />
                <span>
                  Take {takeDelta.previousTakeNumber} → Take {session.takeNumber}
                </span>
              </span>

              {typeof takeDelta.scoreDiff === 'number' && takeDelta.scoreDiff !== 0 && (
                <span
                  className={`${styles.scoreDiffPill} tabular-nums ${
                    takeDelta.scoreDiff > 0 ? styles.scoreDiffPositive : styles.scoreDiffNeutral
                  }`}
                >
                  {takeDelta.scoreDiff > 0 ? `+${takeDelta.scoreDiff}` : takeDelta.scoreDiff} pts
                </span>
              )}

              <span className={styles.deltaSummary}>{takeDelta.summaryLabel}</span>
            </div>
          )}
        </div>

        {/* Animated SVG Circular Clarity Score Ring */}
        <div className={`${styles.scoreCard} ${scoreTierClass}`} aria-label={`Clarity score ${clampedScore} out of 100, ${coachReport.verdict}`}>
          <div className={styles.scoreRingWrap}>
            <svg className={styles.scoreSvg} viewBox="0 0 84 84" aria-hidden="true">
              <circle
                className={styles.scoreTrack}
                cx="42"
                cy="42"
                r={RING_RADIUS}
                strokeWidth="6"
                fill="none"
              />
              <circle
                className={styles.scoreArc}
                cx="42"
                cy="42"
                r={RING_RADIUS}
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={scoreStrokeOffset}
                transform="rotate(-90 42 42)"
              />
            </svg>
            <div className={styles.scoreCenter}>
              <span className={`${styles.scoreValue} tabular-nums`}>{clampedScore}</span>
              <span className={styles.scoreMax}>/100</span>
            </div>
          </div>

          <div className={styles.scoreMeta}>
            <span className={styles.scoreEyebrow}>Clarity Score</span>
            <span className={styles.verdictBadge}>{coachReport.verdict}</span>
          </div>
        </div>
      </header>

      {/* 2-Column Balanced Workspace */}
      <div className={styles.reviewGrid}>
        {/* LEFT COLUMN: Video/Audio Replay + Cadence Timeline + Chaptered Interactive Transcript */}
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

            {/* Compact Acoustic Player for Audio-Only Takes */}
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
                      : activeStepAtPlayhead
                        ? `Q${activeStepAtPlayhead.index + 1} · ${activeStepAtPlayhead.text}`
                        : 'Press Play or click the cadence timeline'}
                  </span>
                </div>
              </>
            )}

            {/* Playback Transport Bar (Video, Audio, and Timer/History Scrubber) */}
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
                  activeStepAtPlayhead && (
                    <span className={styles.activeBeatPill} title={activeStepAtPlayhead.text}>
                      Q{activeStepAtPlayhead.index + 1} · {activeStepAtPlayhead.text}
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

            {/* Clickable Cadence Timeline with Q1 / Q2 / Q3 Chapter Markers */}
            <div className={styles.timelineSection}>
              <div className={styles.timelineTopHeader}>
                <span className={styles.timelineTitle}>Cadence Timeline</span>
                <span className={styles.timelineInstruction}>
                  {isSimulatedPlayback
                    ? isTimerSession
                      ? 'Timer pacing · click any question marker to scrub'
                      : 'Saved timeline · click anywhere to scrub'
                    : 'Click any bar, pause span, or marker to jump'}
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
                {/* Question Chapter Markers */}
                {session.beatTransitions.map((transition, idx) => {
                  const pct = Math.max(
                    0,
                    Math.min(98, (transition.enteredAtMs / totalDurationMs) * 100),
                  );
                  const qObj = resolvedQuestions[transition.beatIndex];
                  const label = qObj ? qObj.text : `Question ${transition.beatIndex + 1}`;
                  return (
                    <button
                      key={`${transition.beatId}-${idx}`}
                      type="button"
                      className={styles.beatMarker}
                      style={{ left: `${pct}%` }}
                      title={`Q${transition.beatIndex + 1}: ${label} (${formatTimeSec(transition.enteredAtMs / 1000)})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        seekToSec(transition.enteredAtMs / 1000);
                      }}
                    >
                      <span className={styles.beatMarkerPill}>Q{transition.beatIndex + 1}</span>
                      <span className={styles.beatMarkerLine} aria-hidden="true" />
                    </button>
                  );
                })}

                {/* Eucalyptus Power Pause / Dynamic Silence Spans */}
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
                  Question chapter
                </span>
              </div>
            </div>
          </article>

          {/* Upgraded Interactive Speech Breakdown ("What You Said") */}
          <article className={styles.transcriptCard}>
            <div className={styles.transcriptHeader}>
              <div>
                <h2 className={styles.cardHeading}>What You Said</h2>
                <p className={styles.cardSub}>
                  {hasTranscript
                    ? 'Click any phrase or pause chip to jump replay. Hover highlights for coaching tips.'
                    : isTimerSession
                      ? 'Timer rehearsal — question pacing captured without mic.'
                      : 'Web Audio cadence & pauses captured cleanly.'}
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

            {/* Compact Annotation Legend */}
            {hasTranscript && (
              <div className={styles.annotationLegend} aria-label="Transcript highlight legend">
                <span className={styles.legendChipFiller}>Filler</span>
                <span className={styles.legendChipHedge}>Soft hedge</span>
                <span className={styles.legendChipPower}>Strong phrase</span>
                <span className={styles.legendChipPause}>⏸ Pause</span>
              </div>
            )}

            {transcriptChapters.length > 0 ? (
              <div className={styles.chaptersList}>
                {transcriptChapters.map((chapter) => (
                  <div key={chapter.key} className={styles.chapterGroup}>
                    <button
                      type="button"
                      className={styles.chapterHeadingBtn}
                      onClick={() => seekToSec(chapter.startMs / 1000)}
                      title={`Jump to ${chapter.label} (${formatTimeSec(chapter.startMs / 1000)})`}
                    >
                      <span className={styles.chapterTag}>{chapter.label}</span>
                      <span className={styles.chapterQuestion}>{chapter.questionText}</span>
                      <span className={`${styles.chapterTime} tabular-nums`}>
                        {formatTimeSec(chapter.startMs / 1000)}
                      </span>
                    </button>

                    <div className={styles.chapterChunks}>
                      {chapter.chunks.map((chunk) => {
                        const isActiveChunk = chunk.id === activeChunkId;
                        const followingPauses = pausesAfterChunkId.get(chunk.id) ?? [];

                        return (
                          <Fragment key={chunk.id}>
                            <button
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

                            {followingPauses.length > 0 && (
                              <div className={styles.inlinePauseRow}>
                                {followingPauses.map((pause) => (
                                  <button
                                    key={pause.id}
                                    type="button"
                                    className={styles.inlinePauseChip}
                                    onClick={() =>
                                      seekToSec(Math.max(0, pause.startMs / 1000 - 0.5))
                                    }
                                    title={`Jump to ${(pause.durationMs / 1000).toFixed(1)}s ${pause.kind === 'dynamic' ? 'Dynamic Silence' : 'Power Pause'}`}
                                  >
                                    <Pause size={10} fill="currentColor" />
                                    <span className="tabular-nums">
                                      {(pause.durationMs / 1000).toFixed(1)}s{' '}
                                      {pause.kind === 'dynamic' ? 'dynamic silence' : 'pause'}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                      ? 'You rehearsed your questions on the studio timer without a microphone. Switch to Camera or Audio next take to unlock live transcripts, filler/hedge spotting, and line rewrites.'
                      : 'Browser Speech Recognition was unavailable during this take, so Cadence coached your Power Pauses, Vocal Expressiveness, Speaking Ratio, and question pacing via Web Audio.'}
                  </p>
                </div>
              </div>
            )}
          </article>
        </div>

        {/* RIGHT COLUMN: Personal Speech Coach ("Wins, Advice & Sharpened Line") */}
        <aside className={styles.coachingColumn} aria-label="Personal Speech Coach">
          {/* Compact 2x2 Vitals Strip */}
          <div className={styles.vitalsGrid}>
            {/* Vital 1: Pace (WPM) | Expressiveness | Duration */}
            <div className={styles.vitalCard}>
              <div className={styles.vitalHeader}>
                <span className={styles.vitalLabel}>
                  {metrics.wpm !== null
                    ? 'Pace'
                    : isTimerSession
                      ? 'Duration'
                      : 'Expressiveness'}
                </span>
                <span
                  className={`${styles.vitalTonePill} ${getToneClass(
                    isTimerSession && metrics.wpm === null ? 'neutral' : metrics.paceTone,
                  )}`}
                >
                  {isTimerSession && metrics.wpm === null ? 'Timed' : metrics.paceLabel}
                </span>
              </div>
              <div className={styles.vitalValueRow}>
                {metrics.wpm !== null ? (
                  <>
                    <span className={`${styles.vitalValue} tabular-nums`}>{metrics.wpm}</span>
                    <span className={styles.vitalUnit}>WPM</span>
                  </>
                ) : isTimerSession ? (
                  <span className={`${styles.vitalValue} tabular-nums`}>
                    {formatTimeSec(totalDurationSec)}
                  </span>
                ) : (
                  <>
                    <span className={`${styles.vitalValue} tabular-nums`}>
                      {metrics.vocalExpressiveness}
                    </span>
                    <span className={styles.vitalUnit}>/100</span>
                  </>
                )}
              </div>
              <span className={styles.vitalFoot}>
                {metrics.wpm !== null
                  ? `Target ${lensMeta.targetWpmMin}–${lensMeta.targetWpmMax}`
                  : isTimerSession
                    ? `Target ${formatTimeSec(scenario.durationSec)}`
                    : 'Vocal contour'}
              </span>
            </div>

            {/* Vital 2: Power Pauses */}
            <div className={styles.vitalCard}>
              <div className={styles.vitalHeader}>
                <span className={styles.vitalLabel}>
                  {session.lens === 'negotiation' ? 'Silences' : 'Power Pauses'}
                </span>
                <span
                  className={`${styles.vitalTonePill} ${getToneClass(
                    isTimerSession ? 'neutral' : metrics.pauseTone,
                  )}`}
                >
                  {isTimerSession ? 'Mic off' : metrics.pauseLabel}
                </span>
              </div>
              <div className={styles.vitalValueRow}>
                <span className={`${styles.vitalValue} tabular-nums`}>
                  {isTimerSession ? '—' : metrics.powerPauseCount}
                </span>
                {!isTimerSession && (
                  <span className={styles.vitalUnit}>
                    {metrics.powerPauseCount === 1 ? 'pause' : 'pauses'}
                  </span>
                )}
              </div>
              <span className={styles.vitalFoot}>
                {isTimerSession
                  ? 'Enable mic to track'
                  : session.lens === 'negotiation' || metrics.dynamicSilenceCount > 0
                    ? `${metrics.dynamicSilenceCount} dynamic (≥3s)`
                    : 'Target ≥ 2 breaths'}
              </span>
            </div>

            {/* Vital 3: Fillers | Speaking Ratio */}
            <div className={styles.vitalCard}>
              <div className={styles.vitalHeader}>
                <span className={styles.vitalLabel}>
                  {metrics.fillersPerMin !== null
                    ? 'Fillers'
                    : isTimerSession
                      ? 'Fillers'
                      : 'Voice Ratio'}
                </span>
                <span
                  className={`${styles.vitalTonePill} ${getToneClass(
                    isTimerSession ? 'neutral' : metrics.fillerTone,
                  )}`}
                >
                  {isTimerSession ? 'Mic off' : metrics.fillerLabel}
                </span>
              </div>
              <div className={styles.vitalValueRow}>
                {metrics.fillersPerMin !== null ? (
                  <>
                    <span className={`${styles.vitalValue} tabular-nums`}>
                      {metrics.fillerCount}
                    </span>
                    <span className={`${styles.vitalUnit} tabular-nums`}>
                      {metrics.fillersPerMin.toFixed(1)}/m
                    </span>
                  </>
                ) : isTimerSession ? (
                  <span className={`${styles.vitalValue} tabular-nums`}>—</span>
                ) : (
                  <>
                    <span className={`${styles.vitalValue} tabular-nums`}>
                      {metrics.speakingRatio}%
                    </span>
                    <span className={styles.vitalUnit}>voiced</span>
                  </>
                )}
              </div>
              <span className={styles.vitalFoot}>
                {metrics.fillersPerMin !== null
                  ? 'Target ≤ 3/min'
                  : isTimerSession
                    ? 'Enable mic to spot'
                    : 'Voice vs. silence'}
              </span>
            </div>

            {/* Vital 4: Questions Covered */}
            <div className={styles.vitalCard}>
              <div className={styles.vitalHeader}>
                <span className={styles.vitalLabel}>Questions</span>
                <span
                  className={`${styles.vitalTonePill} ${getToneClass(metrics.structureTone)}`}
                >
                  {metrics.structureLabel}
                </span>
              </div>
              <div className={styles.vitalValueRow}>
                <span className={`${styles.vitalValue} tabular-nums`}>
                  {metrics.beatsHit}/{metrics.totalBeats}
                </span>
                <span className={styles.vitalUnit}>covered</span>
              </div>
              <span className={styles.vitalFoot}>
                {metrics.beatsHit >= metrics.totalBeats
                  ? 'All talking points hit'
                  : 'Advance through every Q'}
              </span>
            </div>
          </div>

          {/* What Went Well Card */}
          {coachReport.strengths.length > 0 && (
            <article className={styles.strengthsCard}>
              <div className={styles.coachCardHeader}>
                <CheckCircle2 size={16} className={styles.strengthIcon} />
                <h2 className={styles.coachCardTitle}>What Went Well</h2>
              </div>
              <ul className={styles.coachList}>
                {coachReport.strengths.map((item) => (
                  <li key={item.id} className={styles.coachItem}>
                    <span className={styles.coachBulletSage} aria-hidden="true">
                      <Check size={11} strokeWidth={2.8} />
                    </span>
                    <div className={styles.coachItemBody}>
                      <div className={styles.coachItemTitle}>{item.title}</div>
                      <p className={styles.coachItemDetail}>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {/* Advice: What to Work On Card */}
          {coachReport.improvements.length > 0 && (
            <article className={styles.improvementsCard}>
              <div className={styles.coachCardHeader}>
                <Target size={16} className={styles.improveIcon} />
                <h2 className={styles.coachCardTitle}>Advice: What to Work On</h2>
              </div>
              <ul className={styles.coachList}>
                {coachReport.improvements.map((item) => (
                  <li key={item.id} className={styles.coachItem}>
                    <span className={styles.coachBulletWarm} aria-hidden="true">
                      <Sparkles size={11} />
                    </span>
                    <div className={styles.coachItemBody}>
                      <div className={styles.coachItemTitle}>{item.title}</div>
                      <p className={styles.coachItemDetail}>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {/* Sharpen This Line Card (Before -> After Rewrite) */}
          {coachReport.rewriteTip && (
            <article className={styles.rewriteCard}>
              <div className={styles.rewriteHeader}>
                <span className={styles.rewriteEyebrow}>Sharpen This Line</span>
                {coachReport.rewriteTip.offsetMs !== undefined && (
                  <button
                    type="button"
                    className={styles.rewriteJumpBtn}
                    onClick={() =>
                      seekToSec(Math.max(0, (coachReport.rewriteTip?.offsetMs ?? 0) / 1000))
                    }
                    title="Jump replay to this line"
                  >
                    <Play size={10} fill="currentColor" />
                    <span className="tabular-nums">
                      {formatTimeSec(coachReport.rewriteTip.offsetMs / 1000)}
                    </span>
                  </button>
                )}
              </div>

              <div className={styles.rewriteBefore}>
                <span className={styles.rewriteTagBefore}>You said</span>
                <p className={styles.rewriteOriginal}>
                  &ldquo;{coachReport.rewriteTip.original}&rdquo;
                </p>
              </div>

              <div className={styles.rewriteArrow} aria-hidden="true">
                <ArrowDown size={14} />
              </div>

              <div className={styles.rewriteAfter}>
                <span className={styles.rewriteTagAfter}>Try instead</span>
                <p className={styles.rewriteSharpened}>
                  &ldquo;{coachReport.rewriteTip.sharpened}&rdquo;
                </p>
              </div>

              <p className={styles.rewriteReason}>{coachReport.rewriteTip.reason}</p>
            </article>
          )}

          {/* 1-Line Takeaway Note */}
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

          {/* Action Bar */}
          <div className={styles.actionBar}>
            <button
              type="button"
              className={styles.takeTwoCta}
              onClick={() => flushAndTrigger(onTakeTwo)}
            >
              <span>Take {nextTakeNumber} — Beat Your Score</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => flushAndTrigger(onBackToPractice)}
            >
              Back to Practice
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
