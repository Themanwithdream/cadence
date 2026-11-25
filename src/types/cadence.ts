/**
 * Cadence — Shared Domain, Engine, UI & Persistence Types
 * Single source of truth across data, engines, and UI views.
 */

// ---------------------------------------------------------------------------
// Core Navigation & Modes
// ---------------------------------------------------------------------------

export type AppView = 'lobby' | 'studio' | 'review';

export type Lens = 'camera' | 'clarity' | 'negotiation';

export type LensFilter = 'all' | 'custom' | Lens;

export type StudioMode = 'camera' | 'audio' | 'timer';

export type StudioPhase = 'prep' | 'countdown' | 'live';

// ---------------------------------------------------------------------------
// Curriculum: Lenses, Frameworks & Scenarios
// ---------------------------------------------------------------------------

export type FrameworkId =
  | 'bluf-pyramid'
  | 'prep'
  | 'what-so-what'
  | 'hook-psi'
  | 'tactical-empathy'
  | 'principled-pushback';

export interface LensMeta {
  id: Lens;
  label: string;
  shortLabel: string;
  tagline: string;
  targetWpmMin: number;
  targetWpmMax: number;
}

export interface FrameworkBeat {
  id: string;
  index: number;
  label: string;
  /** Suggested seconds to spend on this beat */
  secHint: number;
  /** Concise non-script guidance displayed beneath the lens beacon */
  livePrompt: string;
  /** Optional spoken opener phrase to reduce blank-mind friction */
  starterCue: string;
}

export interface Framework {
  id: FrameworkId;
  name: string;
  shortName: string;
  primaryLens: Lens;
  secondaryLenses?: Lens[];
  summary: string;
  bestFor: string;
  beats: FrameworkBeat[];
}

export interface Scenario {
  id: string;
  title: string;
  lens: Lens;
  frameworkId: FrameworkId;
  /** Suggested duration in seconds (45, 60, or 75) */
  durationSec: number;
  /** 1-2 line context setting the room and stakes */
  stakes: string;
  /** Actionable speaking challenge */
  prompt: string;
  /** Optional single physical or vocal focus cue before/during the take */
  presenceCue?: string;
  /** Counterpart persona label for negotiation scenarios */
  counterpartRole?: string;
  /** Realistic opening pushback line (negotiation lens) */
  openingPushback?: string;
  /** Optional 3 keyword-slot placeholder prompts for the 15s Quick Outline */
  outlineHints?: [string, string, string];
  /** True when created by the user */
  isCustom?: boolean;
  /** ISO creation timestamp for custom scenarios */
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Real-Time Acoustic, Speech & Beat Telemetry
// ---------------------------------------------------------------------------

export type PauseKind = 'power' | 'dynamic';

export interface AcousticFrame {
  /** Fixed-length (48-64 samples) normalized waveform array in [-1, 1] for 60fps canvas ribbon */
  waveform: number[];
  /** Raw root-mean-square amplitude in [0, 1] */
  rms: number;
  /** Smoothed visual intensity in [0, 1] for calm motion */
  normalizedLevel: number;
  /** Whether voice energy currently exceeds adaptive noise floor */
  isSpeaking: boolean;
  /** Continuous silence duration in milliseconds (0 while speaking) */
  currentSilenceMs: number;
  /** True during deliberate 0.9s - 3.0s silence following voiced speech */
  inPowerPause: boolean;
  /** True during extended 3.0s - 5.5s negotiation Dynamic Silence */
  inDynamicSilence: boolean;
  /** Milliseconds elapsed since take start (or performance clock during prep preview) */
  timestampMs: number;
}

export interface EnergyBucket {
  offsetMs: number;
  /** Normalized energy level in [0, 1] sampled every ~200ms */
  level: number;
  isSpeaking: boolean;
}

export interface PauseEvent {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  kind: PauseKind;
}

export interface FillerEvent {
  id: string;
  /** Detected filler token, e.g. "um", "like", "you know" */
  word: string;
  offsetMs: number;
  contextSnippet?: string;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  offsetMs: number;
  isFinal: boolean;
  beatIndex: number;
}

export interface BeatTransition {
  beatIndex: number;
  beatId: string;
  enteredAtMs: number;
  exitedAtMs?: number;
}

// ---------------------------------------------------------------------------
// Post-Session Feedback, Reflection & Persistence
// ---------------------------------------------------------------------------

export type MetricTone = 'positive' | 'neutral' | 'gentle';

export interface SessionMetrics {
  durationSec: number;
  speechRecognitionSupported: boolean;
  wordCount: number;
  /** Words per minute, or null when speech recognition unavailable / <3 words */
  wpm: number | null;
  paceLabel: string;
  paceTone: MetricTone;
  /** Total deliberate pauses (Power Pauses + Dynamic Silences) */
  powerPauseCount: number;
  /** Subset of pauses lasting >= 3.0s (prized in negotiation) */
  dynamicSilenceCount: number;
  pauseLabel: string;
  pauseTone: MetricTone;
  fillerCount: number;
  /** Fillers per minute, or null when speech recognition unavailable */
  fillersPerMin: number | null;
  fillerLabel: string;
  fillerTone: MetricTone;
  /** 0-100 vocal dynamic expressiveness from Web Audio (fallback when Speech API unavailable) */
  vocalExpressiveness: number;
  /** 0-100 percentage of session actively voiced (fallback when Speech API unavailable) */
  speakingRatio: number;
  beatsHit: number;
  totalBeats: number;
  /** Percentage of total take duration spent in the longest single beat (0-100) */
  longestBeatSharePct: number;
  structureLabel: string;
  structureTone: MetricTone;
}

export type OneChangeRuleKey = 'beats' | 'fillers' | 'pace' | 'pauses' | 'polish';

export interface OneChangeCue {
  rule: OneChangeRuleKey;
  title: string;
  instruction: string;
}

export interface TakeDelta {
  previousSessionId: string;
  previousTakeNumber: number;
  /** Current WPM minus previous WPM (null if unavailable in either take) */
  wpmDiff: number | null;
  /** Current powerPauseCount minus previous */
  powerPauseDiff: number;
  /** Current fillersPerMin minus previous (negative is cleaner) */
  fillerPerMinDiff: number | null;
  /** Current beatsHit minus previous */
  beatsHitDiff: number;
  /** Human-readable 1-line summary of the shift */
  summaryLabel: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  scenarioId: string;
  frameworkId: FrameworkId;
  lens: Lens;
  mode: StudioMode;
  takeNumber: number;
  previousTakeId?: string;
  durationSec: number;
  metrics: SessionMetrics;
  energyTimeline: EnergyBucket[];
  pauses: PauseEvent[];
  fillers: FillerEvent[];
  beatTransitions: BeatTransition[];
  transcript: string;
  transcriptChunks: TranscriptChunk[];
  outlineNotes: string[];
  oneChangeCue: OneChangeCue;
  reflectionNote: string;
}

/** Local ephemeral recording handle for instant Mirror Review playback (not stored in localStorage) */
export interface LiveRecordingAsset {
  url: string | null;
  mimeType: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface StreakSummary {
  currentStreakDays: number;
  totalSessions: number;
  practicedToday: boolean;
  /** Unique scenario IDs practiced at least once */
  practicedScenarioIds: string[];
}

export interface UserPrefs {
  preferredMode: 'camera' | 'audio';
  lastLensFilter: LensFilter;
}

// ---------------------------------------------------------------------------
// Media Capture & Studio Hook Contracts
// ---------------------------------------------------------------------------

export type MediaPermissionStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface MediaErrorInfo {
  code: 'permission-denied' | 'no-device' | 'not-supported' | 'capture-failed';
  title: string;
  message: string;
  canFallbackToAudio: boolean;
}

export interface StudioSessionCompletion {
  record: SessionRecord;
  recording: LiveRecordingAsset;
}

export interface UseStudioSessionOptions {
  scenario: Scenario;
  framework: Framework;
  initialMode: StudioMode;
  takeNumber: number;
  previousTakeId?: string;
  onComplete: (result: StudioSessionCompletion) => void;
}

export interface UseStudioSessionResult {
  // Mode & phase state
  mode: StudioMode;
  phase: StudioPhase;
  countdownValue: number;
  elapsedMs: number;

  // Media & capabilities
  permissionStatus: MediaPermissionStatus;
  mediaError: MediaErrorInfo | null;
  mediaStream: MediaStream | null;
  speechSupported: boolean;

  // Structure state
  activeBeatIndex: number;
  beatTransitions: BeatTransition[];
  outlineNotes: string[];

  // Live acoustic & speech telemetry
  acousticFrame: AcousticFrame;
  pauses: PauseEvent[];
  fillers: FillerEvent[];
  liveWpm: number | null;
  transcriptChunks: TranscriptChunk[];
  interimTranscript: string;
  /** Timestamp (Date.now()) of most recently completed Power Pause / Dynamic Silence for visual bloom */
  lastPauseBloomAt: number | null;

  // Actions
  setMode: (mode: StudioMode) => Promise<void>;
  requestMedia: (modeOverride?: StudioMode) => Promise<boolean>;
  startSession: () => Promise<void>;
  finishSession: () => Promise<void>;
  restartPrep: () => void;
  advanceBeat: () => void;
  goToBeat: (index: number) => void;
  setOutlineNote: (slotIndex: number, value: string) => void;
  cleanup: () => void;
}
