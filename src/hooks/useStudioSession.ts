import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AcousticFrame,
  BeatTransition,
  EnergyBucket,
  FillerEvent,
  LiveRecordingAsset,
  MediaErrorInfo,
  MediaPermissionStatus,
  PauseEvent,
  SessionRecord,
  StudioMode,
  StudioPhase,
  TranscriptChunk,
  UseStudioSessionOptions,
  UseStudioSessionResult,
} from '../types/cadence';
import {
  AcousticAnalyzer,
  createIdleAcousticFrame,
} from '../engine/acousticAnalyzer';
import {
  StudioMediaRecorder,
  createEmptyRecordingAsset,
  isMediaCaptureSupported,
  mapMediaError,
  requestStudioMedia,
  stopMediaStream,
} from '../engine/mediaCapture';
import {
  evaluateSessionMetrics,
  pickOneChangeCue,
} from '../engine/metricsEvaluator';
import {
  SpeechTracker,
  isSpeechRecognitionSupported,
} from '../engine/speechTracker';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const COUNTDOWN_STEP_MS = 850;
const ELAPSED_TICK_MS = 100;
const INITIAL_OUTLINE_NOTES: [string, string, string] = ['', '', ''];

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cadence-${crypto.randomUUID()}`;
  }
  return `cadence-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hasLiveTracks(stream: MediaStream | null, mode: StudioMode): boolean {
  if (!stream) return false;
  const audioLive = stream.getAudioTracks().some((t) => t.readyState === 'live');
  if (mode === 'audio') return audioLive;
  if (mode === 'camera') {
    const videoLive = stream.getVideoTracks().some((t) => t.readyState === 'live');
    return audioLive && videoLive;
  }
  return false;
}

function permissionStatusFromError(error: MediaErrorInfo): MediaPermissionStatus {
  if (error.code === 'permission-denied') return 'denied';
  if (error.code === 'no-device' || error.code === 'not-supported') return 'unavailable';
  return 'error';
}

// ---------------------------------------------------------------------------
// useStudioSession Hook
// ---------------------------------------------------------------------------

export function useStudioSession(
  options: UseStudioSessionOptions,
): UseStudioSessionResult {
  const {
    scenario,
    framework,
    initialMode,
    takeNumber,
    previousTakeId,
    onComplete,
  } = options;

  const browserSpeechSupported = isSpeechRecognitionSupported();

  // Mode & phase state
  const [mode, setModeState] = useState<StudioMode>(initialMode);
  const [phase, setPhaseState] = useState<StudioPhase>('prep');
  const [countdownValue, setCountdownValue] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  // Media & capabilities
  const [permissionStatus, setPermissionStatus] = useState<MediaPermissionStatus>(
    initialMode === 'timer' ? 'ready' : 'idle',
  );
  const [mediaError, setMediaError] = useState<MediaErrorInfo | null>(null);
  const [mediaStream, setMediaStreamState] = useState<MediaStream | null>(null);

  // Structure state
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [beatTransitions, setBeatTransitions] = useState<BeatTransition[]>([]);
  const [outlineNotes, setOutlineNotes] = useState<string[]>([
    ...INITIAL_OUTLINE_NOTES,
  ]);

  // Live acoustic & speech telemetry
  const [acousticFrame, setAcousticFrame] = useState<AcousticFrame>(() =>
    createIdleAcousticFrame(0),
  );
  const [pauses, setPauses] = useState<PauseEvent[]>([]);
  const [fillers, setFillers] = useState<FillerEvent[]>([]);
  const [liveWpm, setLiveWpm] = useState<number | null>(null);
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [lastPauseBloomAt, setLastPauseBloomAt] = useState<number | null>(null);

  // Latest-options refs (prevents stale closures inside async/rAF callbacks)
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const frameworkRef = useRef(framework);
  frameworkRef.current = framework;
  const takeNumberRef = useRef(takeNumber);
  takeNumberRef.current = takeNumber;
  const previousTakeIdRef = useRef(previousTakeId);
  previousTakeIdRef.current = previousTakeId;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Mutable lifecycle & telemetry refs
  const mountedRef = useRef<boolean>(true);
  const modeRef = useRef<StudioMode>(initialMode);
  const phaseRef = useRef<StudioPhase>('prep');
  const mediaRequestIdRef = useRef<number>(0);
  const isFinishingRef = useRef<boolean>(false);
  const prevScenarioIdRef = useRef<string>(scenario.id);
  const prevFrameworkIdRef = useRef<string>(framework.id);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const acousticAnalyzerRef = useRef<AcousticAnalyzer | null>(null);
  const recorderRef = useRef<StudioMediaRecorder>(new StudioMediaRecorder());
  const speechTrackerRef = useRef<SpeechTracker | null>(null);

  const countdownTimersRef = useRef<number[]>([]);
  const elapsedTimerRef = useRef<number | null>(null);
  const sessionStartPerfMsRef = useRef<number>(0);

  const activeBeatIndexRef = useRef<number>(0);
  const beatTransitionsRef = useRef<BeatTransition[]>([]);
  const outlineNotesRef = useRef<string[]>([...INITIAL_OUTLINE_NOTES]);

  const pausesRef = useRef<PauseEvent[]>([]);
  const fillersRef = useRef<FillerEvent[]>([]);
  const energyBucketsRef = useRef<EnergyBucket[]>([]);
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);

  // -------------------------------------------------------------------------
  // Low-Level Resource Helpers
  // -------------------------------------------------------------------------

  const clearCountdownTimers = useCallback(() => {
    for (const id of countdownTimersRef.current) {
      window.clearTimeout(id);
    }
    countdownTimersRef.current = [];
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const stopLiveEngines = useCallback(() => {
    clearCountdownTimers();
    clearElapsedTimer();

    recorderRef.current.abort();

    if (speechTrackerRef.current) {
      speechTrackerRef.current.stop();
      speechTrackerRef.current = null;
    }
  }, [clearCountdownTimers, clearElapsedTimer]);

  const stopHardwareCapture = useCallback(() => {
    if (acousticAnalyzerRef.current) {
      acousticAnalyzerRef.current.stop();
      acousticAnalyzerRef.current = null;
    }

    if (mediaStreamRef.current) {
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
    }

    if (mountedRef.current) {
      setMediaStreamState(null);
      setAcousticFrame(createIdleAcousticFrame(0));
    }
  }, []);

  const resetLiveTelemetry = useCallback(() => {
    activeBeatIndexRef.current = 0;
    beatTransitionsRef.current = [];
    pausesRef.current = [];
    fillersRef.current = [];
    energyBucketsRef.current = [];
    transcriptChunksRef.current = [];

    if (!mountedRef.current) return;
    setCountdownValue(0);
    setElapsedMs(0);
    setActiveBeatIndex(0);
    setBeatTransitions([]);
    setPauses([]);
    setFillers([]);
    setLiveWpm(null);
    setTranscriptChunks([]);
    setInterimTranscript('');
    setLastPauseBloomAt(null);
  }, []);

  const recordBeatTransition = useCallback((nextIndex: number, offsetMs: number) => {
    const beats = frameworkRef.current.beats;
    if (beats.length === 0) return;

    const clamped = Math.min(beats.length - 1, Math.max(0, nextIndex));
    if (clamped === activeBeatIndexRef.current && beatTransitionsRef.current.length > 0) {
      return;
    }

    activeBeatIndexRef.current = clamped;
    if (mountedRef.current) {
      setActiveBeatIndex(clamped);
    }

    if (phaseRef.current !== 'live') {
      return;
    }

    const safeOffset = Math.max(0, Math.round(offsetMs));
    const currentList = beatTransitionsRef.current;
    const updated: BeatTransition[] = currentList.map((entry, idx) =>
      idx === currentList.length - 1 && entry.exitedAtMs === undefined
        ? { ...entry, exitedAtMs: Math.max(entry.enteredAtMs, safeOffset) }
        : entry,
    );

    updated.push({
      beatIndex: clamped,
      beatId: beats[clamped]?.id ?? `beat-${clamped}`,
      enteredAtMs: safeOffset,
    });

    beatTransitionsRef.current = updated;
    if (mountedRef.current) {
      setBeatTransitions(updated);
    }

    speechTrackerRef.current?.setActiveBeatIndex(clamped);
  }, []);

  // -------------------------------------------------------------------------
  // Media Permission & Live Preview Management
  // -------------------------------------------------------------------------

  const requestMedia = useCallback(
    async (modeOverride?: StudioMode): Promise<boolean> => {
      const targetMode = modeOverride ?? modeRef.current;
      const requestId = mediaRequestIdRef.current + 1;
      mediaRequestIdRef.current = requestId;

      if (targetMode === 'timer') {
        stopHardwareCapture();
        if (mountedRef.current) {
          setMediaError(null);
          setPermissionStatus('ready');
        }
        return true;
      }

      if (!isMediaCaptureSupported()) {
        stopHardwareCapture();
        const errInfo = mapMediaError(
          Object.assign(new Error('Unsupported'), { name: 'NotSupportedError' }),
          targetMode,
        );
        if (mountedRef.current) {
          setMediaError(errInfo);
          setPermissionStatus(permissionStatusFromError(errInfo));
        }
        return false;
      }

      stopHardwareCapture();
      if (mountedRef.current) {
        setMediaError(null);
        setPermissionStatus('requesting');
      }

      try {
        const stream = await requestStudioMedia(targetMode);

        // Guard against unmount or newer mode switch while permission prompt was open
        if (!mountedRef.current || mediaRequestIdRef.current !== requestId) {
          stopMediaStream(stream);
          return false;
        }

        mediaStreamRef.current = stream;
        setMediaStreamState(stream);

        const analyzer = new AcousticAnalyzer({
          onFrame: (frame) => {
            if (mountedRef.current) {
              setAcousticFrame(frame);
            }
          },
          onPauseComplete: (pause) => {
            pausesRef.current = [...pausesRef.current, pause];
            if (mountedRef.current) {
              setPauses(pausesRef.current);
              setLastPauseBloomAt(Date.now());
            }
          },
          onEnergyBucket: (bucket) => {
            energyBucketsRef.current.push(bucket);
          },
        });
        analyzer.start(stream);
        acousticAnalyzerRef.current = analyzer;

        setMediaError(null);
        setPermissionStatus('ready');
        return true;
      } catch (err) {
        if (!mountedRef.current || mediaRequestIdRef.current !== requestId) {
          return false;
        }
        const errInfo = mapMediaError(err, targetMode);
        setMediaError(errInfo);
        setPermissionStatus(permissionStatusFromError(errInfo));
        return false;
      }
    },
    [stopHardwareCapture],
  );

  // -------------------------------------------------------------------------
  // Live Session Start & Finish
  // -------------------------------------------------------------------------

  const finishSession = useCallback(async (): Promise<void> => {
    if (isFinishingRef.current || phaseRef.current !== 'live') {
      return;
    }
    isFinishingRef.current = true;

    const currentMode = modeRef.current;
    const currentScenario = scenarioRef.current;
    const currentFramework = frameworkRef.current;

    clearCountdownTimers();
    clearElapsedTimer();

    const finalDurationMs = Math.max(
      1000,
      Math.round(performance.now() - sessionStartPerfMsRef.current),
    );
    let recording: LiveRecordingAsset = createEmptyRecordingAsset();

    if (currentMode !== 'timer') {
      // Flush trailing speech phrase and stop recognition cleanly
      if (speechTrackerRef.current) {
        speechTrackerRef.current.flushInterimAsFinal(finalDurationMs);
        speechTrackerRef.current.stop();
        speechTrackerRef.current = null;
      }

      // Flush any final deliberate silence from Web Audio analyzer
      if (acousticAnalyzerRef.current) {
        const finalized = acousticAnalyzerRef.current.finalizeRecording(finalDurationMs);
        pausesRef.current = finalized.pauses;
        energyBucketsRef.current = finalized.energyBuckets;
      }

      // Finalize local video/audio recording asset
      try {
        recording = await recorderRef.current.stop();
      } catch {
        recording = createEmptyRecordingAsset();
      }

      // Release camera & microphone cleanly as user moves to Mirror Review
      stopHardwareCapture();
    }

    // Close the final beat transition timestamp
    const firstBeatId = currentFramework.beats[0]?.id ?? 'beat-0';
    const rawTransitions =
      beatTransitionsRef.current.length > 0
        ? beatTransitionsRef.current
        : [{ beatIndex: 0, beatId: firstBeatId, enteredAtMs: 0 }];

    const closedTransitions: BeatTransition[] = rawTransitions.map((entry, idx) =>
      idx === rawTransitions.length - 1
        ? {
            ...entry,
            exitedAtMs: Math.max(entry.enteredAtMs, finalDurationMs),
          }
        : entry,
    );

    const chunks = [...transcriptChunksRef.current];
    const transcript = chunks
      .map((chunk) => chunk.text.trim())
      .filter(Boolean)
      .join(' ');

    const speechSupportedForMetrics =
      currentMode !== 'timer' && browserSpeechSupported;

    const metrics = evaluateSessionMetrics({
      durationMs: finalDurationMs,
      lens: currentScenario.lens,
      speechRecognitionSupported: speechSupportedForMetrics,
      transcript,
      pauses: pausesRef.current,
      fillers: fillersRef.current,
      energyTimeline: energyBucketsRef.current,
      beatTransitions: closedTransitions,
      totalBeats: Math.max(1, currentFramework.beats.length),
    });

    const oneChangeCue = pickOneChangeCue(metrics, currentScenario.lens);

    const record: SessionRecord = {
      id: createSessionId(),
      createdAt: new Date().toISOString(),
      scenarioId: currentScenario.id,
      frameworkId: currentFramework.id,
      lens: currentScenario.lens,
      mode: currentMode,
      takeNumber: takeNumberRef.current,
      previousTakeId: previousTakeIdRef.current,
      durationSec: metrics.durationSec,
      metrics,
      energyTimeline: [...energyBucketsRef.current],
      pauses: [...pausesRef.current],
      fillers: [...fillersRef.current],
      beatTransitions: closedTransitions,
      transcript,
      transcriptChunks: chunks,
      outlineNotes: [...outlineNotesRef.current],
      oneChangeCue,
      reflectionNote: '',
    };

    phaseRef.current = 'prep';
    isFinishingRef.current = false;

    if (mountedRef.current) {
      setPhaseState('prep');
      setElapsedMs(finalDurationMs);
      setInterimTranscript('');
      setBeatTransitions(closedTransitions);
      setPauses([...pausesRef.current]);
      onCompleteRef.current({ record, recording });
    }
  }, [
    browserSpeechSupported,
    clearCountdownTimers,
    clearElapsedTimer,
    stopHardwareCapture,
  ]);

  const beginLiveSession = useCallback(() => {
    if (!mountedRef.current) return;

    const currentMode = modeRef.current;
    const currentFramework = frameworkRef.current;

    const startPerfMs = performance.now();
    const startEpochMs = Date.now();
    sessionStartPerfMsRef.current = startPerfMs;

    phaseRef.current = 'live';
    setPhaseState('live');
    setCountdownValue(0);
    setElapsedMs(0);

    const initialTransition: BeatTransition = {
      beatIndex: 0,
      beatId: currentFramework.beats[0]?.id ?? 'beat-0',
      enteredAtMs: 0,
    };
    activeBeatIndexRef.current = 0;
    beatTransitionsRef.current = [initialTransition];
    setActiveBeatIndex(0);
    setBeatTransitions([initialTransition]);

    if (currentMode !== 'timer') {
      const stream = mediaStreamRef.current;
      if (acousticAnalyzerRef.current) {
        acousticAnalyzerRef.current.setRecordingMode(true, startPerfMs);
      }

      if (stream) {
        recorderRef.current.start(stream, currentMode === 'camera');
      }

      if (browserSpeechSupported) {
        const tracker = new SpeechTracker({
          onChunk: (chunk) => {
            transcriptChunksRef.current = [...transcriptChunksRef.current, chunk];
            if (mountedRef.current) {
              setTranscriptChunks(transcriptChunksRef.current);
            }
          },
          onInterim: (text) => {
            if (mountedRef.current) {
              setInterimTranscript(text);
            }
          },
          onFiller: (filler) => {
            fillersRef.current = [...fillersRef.current, filler];
            if (mountedRef.current) {
              setFillers(fillersRef.current);
            }
          },
          onWpmChange: (wpm) => {
            if (mountedRef.current) {
              setLiveWpm(wpm);
            }
          },
        });
        tracker.start(startEpochMs, 0);
        speechTrackerRef.current = tracker;
      }
    }

    clearElapsedTimer();
    elapsedTimerRef.current = window.setInterval(() => {
      if (!mountedRef.current || phaseRef.current !== 'live') return;
      setElapsedMs(
        Math.max(0, Math.round(performance.now() - sessionStartPerfMsRef.current)),
      );
    }, ELAPSED_TICK_MS);
  }, [browserSpeechSupported, clearElapsedTimer]);

  // -------------------------------------------------------------------------
  // Public Actions
  // -------------------------------------------------------------------------

  const startSession = useCallback(async (): Promise<void> => {
    if (phaseRef.current !== 'prep' || isFinishingRef.current) {
      return;
    }

    const currentMode = modeRef.current;
    if (currentMode !== 'timer' && !hasLiveTracks(mediaStreamRef.current, currentMode)) {
      const ready = await requestMedia(currentMode);
      if (!ready || !mountedRef.current || modeRef.current !== currentMode) {
        return;
      }
    }

    stopLiveEngines();
    resetLiveTelemetry();

    // Automatic calm 3-2-1 breath countdown before going live
    phaseRef.current = 'countdown';
    setPhaseState('countdown');
    setCountdownValue(3);

    const t2 = window.setTimeout(() => {
      if (mountedRef.current && phaseRef.current === 'countdown') {
        setCountdownValue(2);
      }
    }, COUNTDOWN_STEP_MS);

    const t1 = window.setTimeout(() => {
      if (mountedRef.current && phaseRef.current === 'countdown') {
        setCountdownValue(1);
      }
    }, COUNTDOWN_STEP_MS * 2);

    const tGo = window.setTimeout(() => {
      if (mountedRef.current && phaseRef.current === 'countdown') {
        beginLiveSession();
      }
    }, COUNTDOWN_STEP_MS * 3);

    countdownTimersRef.current = [t2, t1, tGo];
  }, [beginLiveSession, requestMedia, resetLiveTelemetry, stopLiveEngines]);

  const setMode = useCallback(
    async (nextMode: StudioMode): Promise<void> => {
      stopLiveEngines();
      isFinishingRef.current = false;
      phaseRef.current = 'prep';
      modeRef.current = nextMode;

      if (mountedRef.current) {
        setPhaseState('prep');
        setModeState(nextMode);
      }

      resetLiveTelemetry();
      await requestMedia(nextMode);
    },
    [requestMedia, resetLiveTelemetry, stopLiveEngines],
  );

  const restartPrep = useCallback(() => {
    stopLiveEngines();
    isFinishingRef.current = false;
    phaseRef.current = 'prep';

    if (acousticAnalyzerRef.current) {
      acousticAnalyzerRef.current.setRecordingMode(false);
    } else if (mountedRef.current) {
      setAcousticFrame(createIdleAcousticFrame(0));
    }

    if (mountedRef.current) {
      setPhaseState('prep');
    }

    resetLiveTelemetry();
  }, [resetLiveTelemetry, stopLiveEngines]);

  const goToBeat = useCallback(
    (index: number) => {
      const offsetMs =
        phaseRef.current === 'live'
          ? Math.max(0, Math.round(performance.now() - sessionStartPerfMsRef.current))
          : 0;
      recordBeatTransition(index, offsetMs);
    },
    [recordBeatTransition],
  );

  const advanceBeat = useCallback(() => {
    const maxIndex = Math.max(0, frameworkRef.current.beats.length - 1);
    const nextIndex = Math.min(maxIndex, activeBeatIndexRef.current + 1);
    goToBeat(nextIndex);
  }, [goToBeat]);

  const setOutlineNote = useCallback((slotIndex: number, value: string) => {
    if (slotIndex < 0) return;
    const next = [...outlineNotesRef.current];
    while (next.length <= slotIndex) {
      next.push('');
    }
    next[slotIndex] = value;
    outlineNotesRef.current = next;
    if (mountedRef.current) {
      setOutlineNotes(next);
    }
  }, []);

  const cleanup = useCallback(() => {
    mediaRequestIdRef.current += 1;
    isFinishingRef.current = false;
    phaseRef.current = 'prep';
    stopLiveEngines();
    stopHardwareCapture();
  }, [stopHardwareCapture, stopLiveEngines]);

  // -------------------------------------------------------------------------
  // Lifecycle Effects
  // -------------------------------------------------------------------------

  // Initial mount: open live media preview when starting in camera/audio mode;
  // full zero-leak cleanup on unmount.
  useEffect(() => {
    mountedRef.current = true;
    if (modeRef.current !== 'timer') {
      void requestMedia(modeRef.current);
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup, requestMedia]);

  // Reset outline & prep state cleanly if the user switches to a different scenario
  useEffect(() => {
    if (prevScenarioIdRef.current !== scenario.id) {
      prevScenarioIdRef.current = scenario.id;
      outlineNotesRef.current = [...INITIAL_OUTLINE_NOTES];
      setOutlineNotes([...INITIAL_OUTLINE_NOTES]);
      restartPrep();
    }
  }, [restartPrep, scenario.id]);

  // Reset activeBeatIndex cleanly when swapping frameworks in prep (and clamp defensively otherwise)
  useEffect(() => {
    if (prevFrameworkIdRef.current !== framework.id) {
      prevFrameworkIdRef.current = framework.id;
      if (phaseRef.current === 'prep') {
        activeBeatIndexRef.current = 0;
        beatTransitionsRef.current = [];
        setActiveBeatIndex(0);
        setBeatTransitions([]);
      } else {
        const maxIndex = Math.max(0, framework.beats.length - 1);
        if (activeBeatIndexRef.current > maxIndex) {
          activeBeatIndexRef.current = maxIndex;
          setActiveBeatIndex(maxIndex);
        }
      }
    }
  }, [framework.beats.length, framework.id]);

  const safeActiveBeatIndex = Math.min(
    activeBeatIndex,
    Math.max(0, framework.beats.length - 1),
  );

  return {
    // Mode & phase state
    mode,
    phase,
    countdownValue,
    elapsedMs,

    // Media & capabilities
    permissionStatus,
    mediaError,
    mediaStream,
    speechSupported: mode !== 'timer' && browserSpeechSupported,

    // Structure state
    activeBeatIndex: safeActiveBeatIndex,
    beatTransitions,
    outlineNotes,

    // Live acoustic & speech telemetry
    acousticFrame,
    pauses,
    fillers,
    liveWpm,
    transcriptChunks,
    interimTranscript,
    lastPauseBloomAt,

    // Actions
    setMode,
    requestMedia,
    startSession,
    finishSession,
    restartPrep,
    advanceBeat,
    goToBeat,
    setOutlineNote,
    cleanup,
  };
}
