import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Mic,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Square,
  Zap,
} from 'lucide-react';
import type {
  Framework,
  FrameworkId,
  LensMeta,
  OneChangeCue,
  Scenario,
  StudioMode,
  UseStudioSessionResult,
} from '../types/cadence';
import { EyeLineBeacon } from './EyeLineBeacon';
import { VoiceRibbon } from './VoiceRibbon';
import styles from './StudioView.module.css';

export interface StudioViewProps {
  scenario: Scenario;
  framework: Framework;
  availableFrameworks: Framework[];
  lensMeta: LensMeta;
  studio: UseStudioSessionResult;
  takeNumber: number;
  pinnedCue?: OneChangeCue | null;
  onBackToPractice: () => void;
  onSelectFramework: (frameworkId: FrameworkId) => void;
}

interface StudioStep {
  id: string;
  index: number;
  tag: string;
  prompt: string;
  hint: string;
  placeholder: string;
  secHint: number;
}

function formatTimeSec(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function StudioView({
  scenario,
  framework,
  availableFrameworks,
  lensMeta,
  studio,
  takeNumber,
  pinnedCue = null,
  onBackToPractice,
  onSelectFramework,
}: StudioViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameworkMenuRef = useRef<HTMLDivElement | null>(null);
  const [frameworkMenuOpen, setFrameworkMenuOpen] = useState(false);

  const isPrep = studio.phase === 'prep';
  const isCountdown = studio.phase === 'countdown';
  const isLive = studio.phase === 'live';

  // Derive live speaking steps from scenario.questions (falling back to framework.beats)
  const hasQuestions = scenario.questions.length > 0;
  const steps: StudioStep[] = useMemo(() => {
    if (scenario.questions.length > 0) {
      const perQuestionSec = Math.max(
        10,
        Math.round(scenario.durationSec / scenario.questions.length),
      );
      return scenario.questions.map((q, idx) => {
        const matchedBeat =
          framework.beats[Math.min(idx, Math.max(0, framework.beats.length - 1))];
        const fallbackHint = matchedBeat
          ? `${matchedBeat.label}: ${matchedBeat.starterCue}`
          : '';
        return {
          id: q.id,
          index: idx,
          tag: `Q${idx + 1}`,
          prompt: q.text,
          hint: q.hint?.trim() || fallbackHint,
          placeholder: scenario.outlineHints?.[idx] || 'Optional 2–3 word cue…',
          secHint: perQuestionSec,
        };
      });
    }

    return framework.beats.map((beat, idx) => ({
      id: beat.id,
      index: idx,
      tag: `Q${idx + 1}`,
      prompt: beat.livePrompt,
      hint: beat.starterCue,
      placeholder: scenario.outlineHints?.[idx] || `${beat.label} keyword…`,
      secHint: beat.secHint,
    }));
  }, [framework.beats, scenario.durationSec, scenario.outlineHints, scenario.questions]);

  const safeStepIndex =
    steps.length > 0
      ? Math.max(0, Math.min(studio.activeBeatIndex, steps.length - 1))
      : 0;
  const activeStep = steps[safeStepIndex] ?? steps[0];
  const isLastStep = safeStepIndex >= steps.length - 1;
  const nextStepNumber = Math.min(steps.length, safeStepIndex + 2);

  const activeKeywordNote = (studio.outlineNotes[safeStepIndex] ?? '').trim();

  const pushbackQuote = scenario.openingPushback?.trim() ?? '';
  const hasCounterpartPushback = pushbackQuote.length > 0;

  // Attach live MediaStream to <video> cleanly across stream updates and mode switches
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (studio.mode === 'camera' && studio.mediaStream) {
      if (videoEl.srcObject !== studio.mediaStream) {
        videoEl.srcObject = studio.mediaStream;
      }
      videoEl.play().catch(() => {
        // Ignore autoplay promise rejections before user gesture
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [studio.mediaStream, studio.mode]);

  // Close framework popover on outside click or Escape
  useEffect(() => {
    if (!frameworkMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        frameworkMenuRef.current &&
        !frameworkMenuRef.current.contains(event.target as Node)
      ) {
        setFrameworkMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFrameworkMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [frameworkMenuOpen]);

  // Close framework dropdown whenever leaving prep
  useEffect(() => {
    if (!isPrep && frameworkMenuOpen) {
      setFrameworkMenuOpen(false);
    }
  }, [isPrep, frameworkMenuOpen]);

  // Keyboard shortcuts during live take: Space / ArrowRight advances to next question
  useEffect(() => {
    if (!isLive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
        if (event.code === 'Space' && tag === 'BUTTON') {
          return;
        }
      }

      if (event.code === 'Space' || event.key === 'ArrowRight') {
        event.preventDefault();
        studio.advanceBeat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLive, studio]);

  const handleStartClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.currentTarget.blur();
      void studio.startSession();
    },
    [studio],
  );

  const handleModeSwitch = useCallback(
    (nextMode: StudioMode) => {
      if (!isPrep || nextMode === studio.mode) return;
      void studio.setMode(nextMode);
    },
    [isPrep, studio],
  );

  const elapsedSec = Math.floor(studio.elapsedMs / 1000);
  const isOverTarget = isLive && elapsedSec > scenario.durationSec + 10;

  const hasCameraHardwareIssue =
    studio.mode === 'camera' &&
    (Boolean(studio.mediaError) ||
      studio.permissionStatus === 'denied' ||
      studio.permissionStatus === 'unavailable' ||
      studio.permissionStatus === 'error');

  const hasAudioHardwareIssue =
    studio.mode === 'audio' &&
    (Boolean(studio.mediaError) ||
      studio.permissionStatus === 'denied' ||
      studio.permissionStatus === 'unavailable' ||
      studio.permissionStatus === 'error');

  const canStartTake =
    studio.mode === 'timer' ||
    (studio.permissionStatus !== 'requesting' &&
      !hasCameraHardwareIssue &&
      !hasAudioHardwareIssue);

  const showVoiceRibbon = studio.mode === 'camera' || studio.mode === 'audio';

  const acousticGlowScale =
    studio.mode === 'timer'
      ? 1.02
      : 1 + Math.min(0.42, studio.acousticFrame.normalizedLevel * 0.45);
  const isPauseVisual =
    studio.acousticFrame.inPowerPause || studio.acousticFrame.inDynamicSilence;

  return (
    <section
      className={styles.studioShell}
      aria-label={`${lensMeta.label} Live Speaking Studio`}
    >
      {/* Slim Studio Header — 4 essentials */}
      <header className={styles.studioHeader}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onBackToPractice}
            aria-label="Back to Practice"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            <span>Practice</span>
          </button>

          <span className={styles.headerDivider} aria-hidden="true" />

          <div className={styles.scenarioMeta}>
            <h1 className={styles.scenarioTitle} title={scenario.title}>
              {scenario.title}
            </h1>
            {takeNumber > 1 && (
              <span className={styles.takeBadge}>Take {takeNumber}</span>
            )}
          </div>

          {/* Swappable Framework Selector Pill */}
          <div className={styles.frameworkPicker} ref={frameworkMenuRef}>
            <button
              type="button"
              className={styles.frameworkPill}
              onClick={() => isPrep && setFrameworkMenuOpen((open) => !open)}
              disabled={!isPrep}
              aria-haspopup="listbox"
              aria-expanded={frameworkMenuOpen}
              title={
                isPrep
                  ? 'Swap speaking blueprint'
                  : 'Finish or restart take to swap blueprint'
              }
            >
              <span className={styles.frameworkPillDot} aria-hidden="true" />
              <span>{framework.shortName}</span>
              <ChevronDown
                size={13}
                className={`${styles.chevron} ${frameworkMenuOpen ? styles.chevronOpen : ''}`}
              />
            </button>

            {frameworkMenuOpen && (
              <div
                className={styles.frameworkDropdown}
                role="listbox"
                aria-label="Choose speaking blueprint"
              >
                <div className={styles.dropdownHeading}>Speaking Blueprint</div>
                {availableFrameworks.map((fw) => {
                  const selected = fw.id === framework.id;
                  return (
                    <button
                      key={fw.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`${styles.frameworkOption} ${
                        selected ? styles.frameworkOptionSelected : ''
                      }`}
                      onClick={() => {
                        onSelectFramework(fw.id);
                        setFrameworkMenuOpen(false);
                      }}
                    >
                      <div className={styles.frameworkOptionTop}>
                        <span className={styles.frameworkOptionName}>{fw.name}</span>
                        <span className={styles.frameworkOptionBeats}>
                          {fw.beats.length} steps
                          {selected && <Check size={13} className={styles.checkIcon} />}
                        </span>
                      </div>
                      <span className={styles.frameworkOptionSub}>{fw.bestFor}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* 2-Option Mode Switcher: Camera | Audio */}
          <div className={styles.modeSegmented} role="group" aria-label="Studio capture mode">
            {(
              [
                { id: 'camera', label: 'Camera', icon: Camera },
                { id: 'audio', label: 'Audio', icon: Mic },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = studio.mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`${styles.modeTab} ${active ? styles.modeTabActive : ''}`}
                  onClick={() => handleModeSwitch(id)}
                  disabled={!isPrep}
                  aria-pressed={active}
                >
                  <Icon size={13} strokeWidth={2} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Tabular Mono Timer */}
          <div
            className={`${styles.timerPill} ${isLive ? styles.timerPillLive : ''} ${
              isOverTarget ? styles.timerPillOver : ''
            }`}
            aria-label={`Elapsed time ${formatTimeSec(elapsedSec)} of ${formatTimeSec(scenario.durationSec)}`}
          >
            <span className={styles.timerDot} aria-hidden="true" />
            <span className="tabular-nums">
              {formatTimeSec(elapsedSec)}
              <span className={styles.timerSlash}> / </span>
              {formatTimeSec(scenario.durationSec)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Stage Viewport (Deep Warm Charcoal, Top-Weighted Near Webcam Lens) */}
      <div className={styles.stageViewport}>
        {/* Mode Background Layer */}
        {studio.mode === 'camera' ? (
          <>
            <video
              ref={videoRef}
              className={styles.cameraVideo}
              autoPlay
              playsInline
              muted
            />
            <div className={styles.stageVignette} aria-hidden="true" />
          </>
        ) : (
          <div className={styles.acousticBackdrop} aria-hidden="true">
            <div className={styles.acousticGrid} />
            <div
              className={`${styles.focalRingOuter} ${
                isPauseVisual ? styles.focalRingSage : ''
              }`}
              style={{
                transform: `translate(-50%, -50%) scale(${acousticGlowScale.toFixed(3)})`,
              }}
            />
            <div className={styles.focalRingMid} />
            <div className={styles.focalRingInner} />
          </div>
        )}

        {/* Top-Left Subtle Mode Pill (Audio & Timer only) */}
        {studio.mode === 'audio' && (
          <div className={styles.stageBadgeLeft}>
            <Radio size={12} />
            <span>Audio Studio</span>
          </div>
        )}
        {studio.mode === 'timer' && (
          <div className={styles.stageBadgeLeft}>
            <Clock size={12} />
            <span>Timer Mode</span>
          </div>
        )}

        {/* Take 2 Focus Pin (Top-Right of Stage) */}
        {takeNumber > 1 && pinnedCue && (
          <aside className={styles.oneChangePin} aria-label="Take 2 focus reminder">
            <div className={styles.oneChangePinEyebrow}>
              <Zap size={11} />
              <span>Take {takeNumber} Focus</span>
            </div>
            <div className={styles.oneChangePinTitle}>{pinnedCue.title}</div>
            <p className={styles.oneChangePinBody}>{pinnedCue.instruction}</p>
          </aside>
        )}

        {/* Top-Center Eye-Line Beacon + Directly Anchored Question Cue Card */}
        <div className={styles.lensCluster}>
          <EyeLineBeacon
            phase={studio.phase}
            mode={studio.mode}
            inPowerPause={studio.acousticFrame.inPowerPause}
            inDynamicSilence={studio.acousticFrame.inDynamicSilence}
            lastPauseBloomAt={studio.lastPauseBloomAt}
            label="Look at camera lens"
          />

          {activeStep && (
            <div
              key={`${scenario.id}-${framework.id}-${activeStep.id}`}
              className={styles.questionCueCard}
              aria-live="polite"
            >
              {/* Sleek Segmented Progress Bar across top of card */}
              <div
                className={styles.segmentedBar}
                role="tablist"
                aria-label="Speech questions progress"
              >
                {steps.map((step, idx) => {
                  const isCompleted = idx < safeStepIndex;
                  const isActive = idx === safeStepIndex;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Question ${idx + 1} of ${steps.length}: ${step.prompt}`}
                      title={`Q${idx + 1}: ${step.prompt}`}
                      className={`${styles.segmentTrack} ${
                        isCompleted
                          ? styles.segmentCompleted
                          : isActive
                            ? styles.segmentActive
                            : ''
                      }`}
                      onClick={() => studio.goToBeat(idx)}
                    />
                  );
                })}
              </div>

              {/* Header Row: Question X of Y + Completed Checkmarks + Pace Hint */}
              <div className={styles.questionHeader}>
                <div className={styles.questionCounterRow}>
                  <span className={styles.questionCounter}>
                    {hasQuestions ? 'Question' : 'Step'} {safeStepIndex + 1} of {steps.length}
                  </span>
                  {safeStepIndex > 0 && (
                    <span className={styles.completedBadge}>
                      <Check size={11} strokeWidth={2.5} />
                      <span>{safeStepIndex} done</span>
                    </span>
                  )}
                  <span className={`${styles.secHintPill} tabular-nums`}>
                    ~{activeStep.secHint}s
                  </span>
                </div>

                {/* Clickable Step Check / Dot Pills */}
                <div className={styles.stepDots} aria-hidden="true">
                  {steps.map((step, idx) => {
                    const isCompleted = idx < safeStepIndex;
                    const isActive = idx === safeStepIndex;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        tabIndex={-1}
                        className={`${styles.stepDot} ${
                          isCompleted
                            ? styles.stepDotCompleted
                            : isActive
                              ? styles.stepDotActive
                              : ''
                        }`}
                        onClick={() => studio.goToBeat(idx)}
                      >
                        {isCompleted ? <Check size={9} strokeWidth={3} /> : idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Question Display */}
              <p className={styles.questionText}>{activeStep.prompt}</p>

              {/* Subtle Hint + Personal Keyword Note + Shortcut */}
              <div className={styles.questionFooter}>
                {activeStep.hint && (
                  <span className={styles.questionHint}>{activeStep.hint}</span>
                )}

                {activeKeywordNote && (
                  <span className={styles.keywordCuePill} title="Your talking point cue">
                    <Sparkles size={11} />
                    <span>{activeKeywordNote}</span>
                  </span>
                )}

                {isLive && (
                  <span className={styles.shortcutHint}>
                    {isLastStep ? 'Hold a calm close' : 'Space / → next'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Camera / Audio Hardware Status or Calm Inline Fallback Card */}
        {(hasCameraHardwareIssue || hasAudioHardwareIssue) && (
          <div className={styles.hardwareCardWrap}>
            <div className={styles.hardwareCard} role="alert">
              <div className={styles.hardwareEyebrow}>Studio Input</div>
              <h2 className={styles.hardwareTitle}>
                {studio.mediaError?.title ??
                  (studio.mode === 'camera'
                    ? 'Camera access is unavailable'
                    : 'Microphone access is unavailable')}
              </h2>
              <p className={styles.hardwareMessage}>
                {studio.mediaError?.message ??
                  'You can still rehearse calmly with Audio Only or practice your questions on a silent timer.'}
              </p>
              <div className={styles.hardwareActions}>
                <button
                  type="button"
                  className={styles.hardwareBtnSecondary}
                  onClick={() => void studio.requestMedia(studio.mode)}
                >
                  <RotateCcw size={14} />
                  <span>Try Again</span>
                </button>
                {studio.mode === 'camera' &&
                  studio.mediaError?.canFallbackToAudio !== false && (
                    <button
                      type="button"
                      className={styles.hardwareBtnSecondary}
                      onClick={() => void studio.setMode('audio')}
                    >
                      <Mic size={14} />
                      <span>Audio Only</span>
                    </button>
                  )}
                <button
                  type="button"
                  className={styles.hardwareBtnPrimary}
                  onClick={() => void studio.setMode('timer')}
                >
                  <Clock size={14} />
                  <span>Practice Without Mic</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {studio.mode !== 'timer' &&
          !hasCameraHardwareIssue &&
          !hasAudioHardwareIssue &&
          studio.permissionStatus === 'requesting' && (
            <div className={styles.hardwareCardWrap}>
              <div className={styles.connectingPill}>
                <span className={styles.connectingPulse} aria-hidden="true" />
                <span>
                  Connecting {studio.mode === 'camera' ? 'camera & microphone' : 'microphone'}…
                </span>
              </div>
            </div>
          )}

        {studio.mode === 'camera' &&
          !hasCameraHardwareIssue &&
          studio.permissionStatus === 'idle' &&
          !studio.mediaStream && (
            <div className={styles.hardwareCardWrap}>
              <div className={styles.hardwareCard}>
                <div className={styles.hardwareEyebrow}>Studio Preview</div>
                <h2 className={styles.hardwareTitle}>Ready when your camera is</h2>
                <p className={styles.hardwareMessage}>
                  Everything stays locally in your browser — nothing is ever uploaded.
                </p>
                <div className={styles.hardwareActions}>
                  <button
                    type="button"
                    className={styles.hardwareBtnPrimary}
                    onClick={() => void studio.requestMedia('camera')}
                  >
                    <Camera size={14} />
                    <span>Enable Camera</span>
                  </button>
                  <button
                    type="button"
                    className={styles.hardwareBtnSecondary}
                    onClick={() => void studio.setMode('timer')}
                  >
                    <Clock size={14} />
                    <span>Practice Without Mic</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Clean Burnished-Brass Counterpart Pushback Card */}
        {hasCounterpartPushback && !hasCameraHardwareIssue && !hasAudioHardwareIssue && (
          <div className={styles.counterpartWrap}>
            <aside
              className={styles.counterpartCard}
              aria-label="Negotiation counterpart pushback"
            >
              <div className={styles.counterpartHeader}>
                <span className={styles.counterpartRole}>
                  {scenario.counterpartRole || 'Counterpart'}
                </span>
                <span className={styles.pushbackTag}>Opening Pushback</span>
              </div>
              <blockquote className={styles.counterpartQuote}>
                &ldquo;{pushbackQuote}&rdquo;
              </blockquote>
            </aside>
          </div>
        )}

        {/* Automatic 3-2-1 Breath Countdown Overlay */}
        {isCountdown && (
          <div className={styles.countdownOverlay} role="status" aria-live="assertive">
            <div className={styles.countdownRing}>
              <span className={`${styles.countdownNumber} tabular-nums`}>
                {studio.countdownValue}
              </span>
            </div>
            <p className={styles.countdownCaption}>Quiet breath · Anchor on the lens</p>
          </div>
        )}
      </div>

      {/* Silky 60fps Acoustic VoiceRibbon (Camera & Audio modes only) */}
      {showVoiceRibbon && (
        <div className={styles.ribbonStrip}>
          <VoiceRibbon
            acousticFrame={studio.acousticFrame}
            phase={studio.phase}
            lastPauseBloomAt={studio.lastPauseBloomAt}
            height={58}
          />
        </div>
      )}

      {/* Reorganized Prep & Live Transport Dock */}
      <footer className={styles.transportDock}>
        {isPrep && (
          <div className={styles.prepDockLayout}>
            <div className={styles.talkingPointsArea} aria-label="Your Talking Points">
              <div className={styles.talkingPointsHeader}>
                <span className={styles.talkingPointsTitle}>Your Talking Points</span>
                <span className={styles.talkingPointsSub}>(Optional keywords)</span>
                {scenario.stakes && (
                  <span className={styles.talkingPointsStakes} title={scenario.stakes}>
                    · {scenario.stakes}
                  </span>
                )}
              </div>

              <div
                className={`${styles.talkingPointsGrid} ${
                  steps.length > 4 ? styles.talkingPointsScroll : ''
                }`}
              >
                {steps.map((step, idx) => (
                  <label
                    key={step.id}
                    className={`${styles.talkingPointField} ${
                      idx === safeStepIndex ? styles.talkingPointFieldFocused : ''
                    }`}
                  >
                    <span className={styles.talkingPointTop} title={step.prompt}>
                      <span className={styles.talkingPointBadge}>{step.tag}</span>
                      <span className={styles.talkingPointLabel}>{step.prompt}</span>
                    </span>
                    <input
                      type="text"
                      className={styles.talkingPointInput}
                      value={studio.outlineNotes[idx] ?? ''}
                      onChange={(e) => studio.setOutlineNote(idx, e.target.value)}
                      placeholder={step.placeholder}
                      maxLength={48}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.prepCtaWrap}>
              <button
                type="button"
                className={styles.primaryCta}
                onClick={handleStartClick}
                disabled={!canStartTake}
              >
                <Play size={16} fill="currentColor" />
                <span>Start Speaking</span>
              </button>
            </div>
          </div>
        )}

        {isCountdown && (
          <div className={styles.countdownDockLayout}>
            <span className={styles.countdownDockText}>
              <Pause size={14} />
              <span>Taking a quiet breath before your take begins…</span>
            </span>
            <button
              type="button"
              className={styles.quietBtn}
              onClick={() => studio.restartPrep()}
            >
              Cancel
            </button>
          </div>
        )}

        {isLive && (
          <div className={styles.liveDockLayout}>
            <button
              type="button"
              className={styles.quietBtn}
              onClick={() => studio.restartPrep()}
            >
              <RotateCcw size={15} />
              <span>Restart</span>
            </button>

            <button
              type="button"
              className={styles.nextBeatBtn}
              onClick={(e) => {
                e.currentTarget.blur();
                studio.advanceBeat();
              }}
              disabled={isLastStep}
            >
              <span>
                {isLastStep
                  ? `Final ${hasQuestions ? 'Question' : 'Step'} (${steps.length}/${steps.length})`
                  : `Next ${hasQuestions ? 'Question' : 'Step'} (${nextStepNumber}/${steps.length})`}
              </span>
              {!isLastStep && (
                <>
                  <kbd className={styles.keyCap}>Space</kbd>
                  <ArrowRight size={15} />
                </>
              )}
            </button>

            <button
              type="button"
              className={styles.primaryCta}
              onClick={() => void studio.finishSession()}
            >
              <Square size={13} fill="currentColor" />
              <span>Finish &amp; Get Coaching</span>
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
