import type { FillerEvent, TranscriptChunk } from '../types/cadence';
import { countWords, detectFillersInText } from './metricsEvaluator';

// ---------------------------------------------------------------------------
// Minimal Browser SpeechRecognition Types (DOM lib does not include these)
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionInstanceLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

// ---------------------------------------------------------------------------
// Constants & Public Interfaces
// ---------------------------------------------------------------------------

const WPM_STABILIZATION_MS = 5000;
const WPM_TICK_INTERVAL_MS = 1000;
const RESTART_DELAY_MS = 260;
const MAX_RAPID_RESTARTS = 6;
const RAPID_RESTART_WINDOW_MS = 8000;

const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
]);

export interface SpeechTrackerCallbacks {
  onChunk: (chunk: TranscriptChunk) => void;
  onInterim: (text: string) => void;
  onFiller: (filler: FillerEvent) => void;
  onWpmChange: (wpm: number | null) => void;
  onError?: (errorCode: string) => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as SpeechWindow;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// ---------------------------------------------------------------------------
// SpeechTracker
// ---------------------------------------------------------------------------

export class SpeechTracker {
  private callbacks: SpeechTrackerCallbacks;
  private recognition: SpeechRecognitionInstanceLike | null = null;
  private isRunning = false;
  private sessionStartMs = 0;
  private activeBeatIndex = 0;

  // Deduplication & telemetry state
  private processedResultCount = 0;
  private chunkCounter = 0;
  private chunks: TranscriptChunk[] = [];
  private fillers: FillerEvent[] = [];
  private finalWordCount = 0;
  private interimText = '';
  private smoothedWpm: number | null = null;

  // Timers & auto-restart protection
  private restartTimerId: number | null = null;
  private wpmTimerId: number | null = null;
  private restartTimestamps: number[] = [];

  constructor(callbacks: SpeechTrackerCallbacks) {
    this.callbacks = callbacks;
  }

  start(sessionStartEpochMs = Date.now(), initialBeatIndex = 0): boolean {
    this.stop();

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;

    this.isRunning = true;
    this.sessionStartMs = sessionStartEpochMs;
    this.activeBeatIndex = initialBeatIndex;
    this.processedResultCount = 0;
    this.chunkCounter = 0;
    this.chunks = [];
    this.fillers = [];
    this.finalWordCount = 0;
    this.interimText = '';
    this.smoothedWpm = null;
    this.restartTimestamps = [];

    const started = this.launchRecognitionInstance(Ctor);
    if (!started) {
      this.isRunning = false;
      return false;
    }

    this.wpmTimerId = window.setInterval(() => {
      this.recomputeLiveWpm();
    }, WPM_TICK_INTERVAL_MS);

    return true;
  }

  setActiveBeatIndex(beatIndex: number): void {
    this.activeBeatIndex = Math.max(0, beatIndex);
  }

  /**
   * Commits any pending interim speech text when a take ends early so
   * the user's final sentence isn't discarded before review.
   */
  flushInterimAsFinal(offsetMs?: number): void {
    const trimmed = this.interimText.trim();
    if (!trimmed) return;
    const resolvedOffset =
      offsetMs ?? Math.max(0, Date.now() - this.sessionStartMs);
    this.commitFinalText(trimmed, resolvedOffset);
    this.interimText = '';
    this.callbacks.onInterim('');
  }

  stop(): void {
    this.isRunning = false;

    if (this.restartTimerId !== null) {
      window.clearTimeout(this.restartTimerId);
      this.restartTimerId = null;
    }

    if (this.wpmTimerId !== null) {
      window.clearInterval(this.wpmTimerId);
      this.wpmTimerId = null;
    }

    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          // Ignore shutdown errors
        }
      }
    }
  }

  getChunks(): TranscriptChunk[] {
    return [...this.chunks];
  }

  getFillers(): FillerEvent[] {
    return [...this.fillers];
  }

  getTranscript(): string {
    return this.chunks
      .map((chunk) => chunk.text.trim())
      .filter(Boolean)
      .join(' ');
  }

  getWordCount(): number {
    return this.finalWordCount;
  }

  getLiveWpm(): number | null {
    return this.smoothedWpm;
  }

  // -------------------------------------------------------------------------
  // Internal Recognition Lifecycle
  // -------------------------------------------------------------------------

  private launchRecognitionInstance(Ctor: SpeechRecognitionCtor): boolean {
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.maxAlternatives = 1;

      this.processedResultCount = 0;
      this.recognition = rec;

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        if (!this.isRunning) return;
        this.handleResultEvent(event);
      };

      rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (!this.isRunning) return;
        const code = event.error || 'unknown';
        this.callbacks.onError?.(code);
        if (FATAL_SPEECH_ERRORS.has(code)) {
          this.stop();
        }
      };

      rec.onend = () => {
        if (!this.isRunning) return;
        // Commit any lingering interim text before restarting a new session instance
        if (this.interimText.trim()) {
          this.flushInterimAsFinal();
        }
        this.scheduleAutoRestart();
      };

      rec.start();
      return true;
    } catch {
      return false;
    }
  }

  private scheduleAutoRestart(): void {
    if (!this.isRunning) return;

    const now = Date.now();
    this.restartTimestamps = this.restartTimestamps.filter(
      (ts) => now - ts < RAPID_RESTART_WINDOW_MS,
    );

    if (this.restartTimestamps.length >= MAX_RAPID_RESTARTS) {
      // Prevent runaway restart loops if browser speech service is unavailable
      this.stop();
      return;
    }

    this.restartTimestamps.push(now);

    if (this.restartTimerId !== null) {
      window.clearTimeout(this.restartTimerId);
    }

    this.restartTimerId = window.setTimeout(() => {
      this.restartTimerId = null;
      if (!this.isRunning) return;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;
      this.launchRecognitionInstance(Ctor);
    }, RESTART_DELAY_MS);
  }

  private handleResultEvent(event: SpeechRecognitionEventLike): void {
    const startIdx = Math.max(event.resultIndex ?? 0, this.processedResultCount);
    let nextInterim = '';

    for (let i = startIdx; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result || result.length === 0) continue;

      const text = result[0]?.transcript ?? '';
      if (result.isFinal) {
        this.processedResultCount = i + 1;
        const trimmed = text.trim();
        if (trimmed) {
          const offsetMs = Math.max(0, Date.now() - this.sessionStartMs);
          this.commitFinalText(trimmed, offsetMs);
        }
      } else {
        nextInterim += text;
      }
    }

    const cleanedInterim = nextInterim.trim();
    if (cleanedInterim !== this.interimText) {
      this.interimText = cleanedInterim;
      this.callbacks.onInterim(cleanedInterim);
    }

    this.recomputeLiveWpm();
  }

  private commitFinalText(text: string, offsetMs: number): void {
    this.chunkCounter += 1;
    const chunk: TranscriptChunk = {
      id: `chunk-${this.chunkCounter}-${Math.round(offsetMs)}`,
      text,
      offsetMs: Math.max(0, Math.round(offsetMs)),
      isFinal: true,
      beatIndex: this.activeBeatIndex,
    };

    this.chunks.push(chunk);
    this.finalWordCount += countWords(text);
    this.callbacks.onChunk(chunk);

    // Run filler detection ONLY on finalized text to guarantee zero double-counting
    const detected = detectFillersInText(text, chunk.offsetMs);
    for (const filler of detected) {
      const uniqueFiller: FillerEvent = {
        ...filler,
        id: `${chunk.id}-${filler.id}`,
      };
      this.fillers.push(uniqueFiller);
      this.callbacks.onFiller(uniqueFiller);
    }
  }

  private recomputeLiveWpm(): void {
    if (!this.isRunning) return;
    const elapsedMs = Date.now() - this.sessionStartMs;
    if (elapsedMs < WPM_STABILIZATION_MS) {
      return;
    }

    const totalWords = this.finalWordCount + countWords(this.interimText);
    if (totalWords < 3) {
      if (this.smoothedWpm !== null) {
        this.smoothedWpm = null;
        this.callbacks.onWpmChange(null);
      }
      return;
    }

    const rawWpm = Math.round(totalWords / (elapsedMs / 60000));
    const bounded = Math.min(260, Math.max(45, rawWpm));
    const nextSmoothed =
      this.smoothedWpm === null
        ? bounded
        : Math.round(this.smoothedWpm * 0.68 + bounded * 0.32);

    if (nextSmoothed !== this.smoothedWpm) {
      this.smoothedWpm = nextSmoothed;
      this.callbacks.onWpmChange(nextSmoothed);
    }
  }
}
