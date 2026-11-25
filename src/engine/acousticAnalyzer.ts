import type {
  AcousticFrame,
  EnergyBucket,
  PauseEvent,
  PauseKind,
} from '../types/cadence';
import { computeAcousticSummary, type AcousticSummary } from './metricsEvaluator';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const WAVEFORM_SAMPLE_COUNT = 48;

const CALIBRATION_DURATION_MS = 600;
const ENERGY_BUCKET_INTERVAL_MS = 200;
const VOICE_HANGOVER_MS = 180;
const MIN_SPEECH_BURST_MS = 1000;
const POWER_PAUSE_MIN_MS = 1000;
const DYNAMIC_SILENCE_MIN_MS = 3000;

interface AudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export interface AcousticAnalyzerCallbacks {
  onFrame: (frame: AcousticFrame) => void;
  onPauseComplete?: (pause: PauseEvent) => void;
  onEnergyBucket?: (bucket: EnergyBucket) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createIdleAcousticFrame(timestampMs = 0): AcousticFrame {
  return {
    waveform: new Array<number>(WAVEFORM_SAMPLE_COUNT).fill(0),
    rms: 0,
    normalizedLevel: 0,
    isSpeaking: false,
    currentSilenceMs: 0,
    inPowerPause: false,
    inDynamicSilence: false,
    timestampMs,
  };
}

// ---------------------------------------------------------------------------
// Real-Time Web Audio Acoustic Analyzer
// ---------------------------------------------------------------------------

export class AcousticAnalyzer {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private timeDomainBuffer: Float32Array<ArrayBuffer> | null = null;
  private prevWaveform: number[] = new Array<number>(WAVEFORM_SAMPLE_COUNT).fill(0);

  private rafId: number | null = null;
  private running = false;
  private callbacks: AcousticAnalyzerCallbacks;

  // Calibration & smoothing state
  private startedPerfMs = 0;
  private calibrationSum = 0;
  private calibrationCount = 0;
  private calibrated = false;
  private noiseFloor = 0.014;
  private smoothedRms = 0;
  private smoothedLevel = 0;
  private lastFramePerfMs = 0;

  // Voice activity & pause state machine
  private isRecording = false;
  private sessionStartPerfMs = 0;
  private isVoiceActive = false;
  private lastAboveExitPerfMs = 0;
  private voicedBurstAccumMs = 0;
  private hasQualifyingSpeechBurst = false;
  private silenceStartOffsetMs: number | null = null;
  private pauseCounter = 0;

  // Recorded telemetry
  private pauses: PauseEvent[] = [];
  private energyBuckets: EnergyBucket[] = [];
  private lastBucketOffsetMs = -ENERGY_BUCKET_INTERVAL_MS;

  constructor(callbacks: AcousticAnalyzerCallbacks) {
    this.callbacks = callbacks;
  }

  start(stream: MediaStream): boolean {
    this.stop();

    if (typeof window === 'undefined') return false;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    const AudioCtx =
      window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;

      // Connect source -> analyser ONLY (never to destination, avoiding mic echo)
      source.connect(analyser);

      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }

      this.audioContext = ctx;
      this.sourceNode = source;
      this.analyserNode = analyser;
      this.timeDomainBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.prevWaveform = new Array<number>(WAVEFORM_SAMPLE_COUNT).fill(0);

      this.running = true;
      this.startedPerfMs = performance.now();
      this.lastFramePerfMs = this.startedPerfMs;
      this.calibrationSum = 0;
      this.calibrationCount = 0;
      this.calibrated = false;
      this.noiseFloor = 0.014;
      this.smoothedRms = 0;
      this.smoothedLevel = 0;

      this.resetRecordingTelemetry(false, this.startedPerfMs);
      this.scheduleNextFrame();
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  /**
   * Switches between prep preview mode (visual waveform + calibration only)
   * and live recording mode (PauseEvents + 200ms EnergyBuckets).
   */
  setRecordingMode(recording: boolean, sessionStartPerfMs?: number): void {
    const startRef = sessionStartPerfMs ?? performance.now();
    this.resetRecordingTelemetry(recording, startRef);
    if (this.audioContext && this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => undefined);
    }
  }

  /**
   * Flushes any in-progress qualifying silence as a final PauseEvent
   * and returns the recorded pauses, energy buckets, and acoustic summary.
   */
  finalizeRecording(endOffsetMs?: number): {
    pauses: PauseEvent[];
    energyBuckets: EnergyBucket[];
    summary: AcousticSummary;
  } {
    if (this.isRecording) {
      const resolvedEndMs =
        endOffsetMs ?? Math.max(0, Math.round(performance.now() - this.sessionStartPerfMs));

      if (this.hasQualifyingSpeechBurst && this.silenceStartOffsetMs !== null) {
        const durationMs = Math.round(resolvedEndMs - this.silenceStartOffsetMs);
        if (durationMs >= POWER_PAUSE_MIN_MS) {
          this.emitPause(this.silenceStartOffsetMs, resolvedEndMs, durationMs);
        }
      }
      this.isRecording = false;
      this.silenceStartOffsetMs = null;
      this.hasQualifyingSpeechBurst = false;
      this.voicedBurstAccumMs = 0;
    }

    return {
      pauses: [...this.pauses],
      energyBuckets: [...this.energyBuckets],
      summary: this.getSummary(),
    };
  }

  getPauses(): PauseEvent[] {
    return [...this.pauses];
  }

  getEnergyBuckets(): EnergyBucket[] {
    return [...this.energyBuckets];
  }

  getSummary(): AcousticSummary {
    return computeAcousticSummary(this.energyBuckets);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    try {
      this.sourceNode?.disconnect();
    } catch {
      // Already disconnected
    }
    try {
      this.analyserNode?.disconnect();
    } catch {
      // Already disconnected
    }

    const ctx = this.audioContext;
    this.sourceNode = null;
    this.analyserNode = null;
    this.audioContext = null;
    this.timeDomainBuffer = null;

    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => undefined);
    }
  }

  // -------------------------------------------------------------------------
  // Internal Processing Loop
  // -------------------------------------------------------------------------

  private resetRecordingTelemetry(recording: boolean, startPerfMs: number): void {
    this.isRecording = recording;
    this.sessionStartPerfMs = startPerfMs;
    this.isVoiceActive = false;
    this.lastAboveExitPerfMs = 0;
    this.voicedBurstAccumMs = 0;
    this.hasQualifyingSpeechBurst = false;
    this.silenceStartOffsetMs = null;
    this.pauseCounter = 0;
    this.pauses = [];
    this.energyBuckets = [];
    this.lastBucketOffsetMs = -ENERGY_BUCKET_INTERVAL_MS;
  }

  private scheduleNextFrame(): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (nowPerfMs: number): void => {
    if (!this.running || !this.analyserNode || !this.timeDomainBuffer) {
      return;
    }

    const dtMs = clamp(nowPerfMs - this.lastFramePerfMs, 0, 120);
    this.lastFramePerfMs = nowPerfMs;

    this.analyserNode.getFloatTimeDomainData(this.timeDomainBuffer);

    // 1. Compute RMS & 48-sample normalized waveform
    const buffer = this.timeDomainBuffer;
    const len = buffer.length;
    let sumSq = 0;
    for (let i = 0; i < len; i += 1) {
      const s = buffer[i];
      sumSq += s * s;
    }
    const rawRms = clamp(Math.sqrt(sumSq / len), 0, 1);
    this.smoothedRms = this.smoothedRms * 0.65 + rawRms * 0.35;

    const waveform = this.downsampleWaveform(buffer);

    // 2. Adaptive ambient noise floor calibration in first ~600ms
    const elapsedSinceStart = nowPerfMs - this.startedPerfMs;
    if (!this.calibrated) {
      this.calibrationSum += rawRms;
      this.calibrationCount += 1;
      if (elapsedSinceStart >= CALIBRATION_DURATION_MS && this.calibrationCount > 0) {
        const avgNoise = this.calibrationSum / this.calibrationCount;
        this.noiseFloor = clamp(avgNoise, 0.005, 0.055);
        this.calibrated = true;
      } else if (this.calibrationCount > 0) {
        this.noiseFloor = clamp(this.calibrationSum / this.calibrationCount, 0.005, 0.055);
      }
    }

    // 3. Hysteresis speech activity detection with short hangover
    const enterThreshold = Math.max(
      this.noiseFloor * 2.2,
      this.noiseFloor + 0.013,
      0.019,
    );
    const exitThreshold = Math.max(
      this.noiseFloor * 1.5,
      this.noiseFloor + 0.007,
      0.012,
    );

    if (this.smoothedRms >= enterThreshold) {
      this.isVoiceActive = true;
      this.lastAboveExitPerfMs = nowPerfMs;
    } else if (this.smoothedRms >= exitThreshold && this.isVoiceActive) {
      this.lastAboveExitPerfMs = nowPerfMs;
    } else if (this.isVoiceActive && nowPerfMs - this.lastAboveExitPerfMs >= VOICE_HANGOVER_MS) {
      this.isVoiceActive = false;
    }

    // Slowly track quiet room changes when not speaking
    if (this.calibrated && !this.isVoiceActive) {
      this.noiseFloor = clamp(this.noiseFloor * 0.985 + rawRms * 0.015, 0.004, 0.065);
    }

    // Smooth visual intensity [0, 1]
    const aboveFloor = Math.max(0, this.smoothedRms - this.noiseFloor * 0.85);
    const curved = Math.pow(clamp(aboveFloor / 0.14, 0, 1), 0.72);
    this.smoothedLevel = this.smoothedLevel * 0.76 + curved * 0.24;

    const timestampMs = this.isRecording
      ? Math.max(0, Math.round(nowPerfMs - this.sessionStartPerfMs))
      : Math.max(0, Math.round(elapsedSinceStart));

    // 4. Speech / Silence state machine (live Power Pause & Dynamic Silence)
    let currentSilenceMs = 0;
    let inPowerPause = false;
    let inDynamicSilence = false;

    if (this.isRecording) {
      if (this.isVoiceActive) {
        // Did we just finish a clean pause?
        if (this.hasQualifyingSpeechBurst && this.silenceStartOffsetMs !== null) {
          const pauseDurationMs = Math.round(timestampMs - this.silenceStartOffsetMs);
          if (pauseDurationMs >= POWER_PAUSE_MIN_MS) {
            this.emitPause(this.silenceStartOffsetMs, timestampMs, pauseDurationMs);
            // Reset burst accumulator so next pause requires another qualifying speech burst
            this.hasQualifyingSpeechBurst = false;
            this.voicedBurstAccumMs = 0;
          }
        }
        this.silenceStartOffsetMs = null;
        this.voicedBurstAccumMs += dtMs;
        if (this.voicedBurstAccumMs >= MIN_SPEECH_BURST_MS) {
          this.hasQualifyingSpeechBurst = true;
        }
      } else {
        if (this.silenceStartOffsetMs === null) {
          this.silenceStartOffsetMs = timestampMs;
        }
        currentSilenceMs = Math.max(0, timestampMs - this.silenceStartOffsetMs);
        if (this.hasQualifyingSpeechBurst) {
          inPowerPause =
            currentSilenceMs >= POWER_PAUSE_MIN_MS &&
            currentSilenceMs < DYNAMIC_SILENCE_MIN_MS;
          inDynamicSilence = currentSilenceMs >= DYNAMIC_SILENCE_MIN_MS;
        }
      }

      // 5. Capture EnergyBucket every ~200ms
      if (timestampMs - this.lastBucketOffsetMs >= ENERGY_BUCKET_INTERVAL_MS) {
        this.lastBucketOffsetMs = timestampMs;
        const bucket: EnergyBucket = {
          offsetMs: timestampMs,
          level: Number(this.smoothedLevel.toFixed(3)),
          isSpeaking: this.isVoiceActive,
        };
        this.energyBuckets.push(bucket);
        this.callbacks.onEnergyBucket?.(bucket);
      }
    }

    this.callbacks.onFrame({
      waveform,
      rms: Number(this.smoothedRms.toFixed(4)),
      normalizedLevel: Number(this.smoothedLevel.toFixed(4)),
      isSpeaking: this.isVoiceActive,
      currentSilenceMs,
      inPowerPause,
      inDynamicSilence,
      timestampMs,
    });

    this.scheduleNextFrame();
  };

  private downsampleWaveform(buffer: Float32Array): number[] {
    const out = new Array<number>(WAVEFORM_SAMPLE_COUNT);
    const windowSize = Math.max(1, Math.floor(buffer.length / WAVEFORM_SAMPLE_COUNT));

    for (let i = 0; i < WAVEFORM_SAMPLE_COUNT; i += 1) {
      const start = i * windowSize;
      const end = Math.min(buffer.length, start + windowSize);
      let peakSigned = 0;
      let peakAbs = 0;

      for (let j = start; j < end; j += 1) {
        const sample = buffer[j];
        const abs = Math.abs(sample);
        if (abs > peakAbs) {
          peakAbs = abs;
          peakSigned = sample;
        }
      }

      // Soft gain + tanh saturation keeps speech lively without harsh clipping
      const amplified = Math.tanh(peakSigned * 3.2);
      const smoothed = this.prevWaveform[i] * 0.35 + amplified * 0.65;
      this.prevWaveform[i] = smoothed;
      out[i] = Number(clamp(smoothed, -1, 1).toFixed(4));
    }

    return out;
  }

  private emitPause(startMs: number, endMs: number, durationMs: number): void {
    this.pauseCounter += 1;
    const kind: PauseKind = durationMs >= DYNAMIC_SILENCE_MIN_MS ? 'dynamic' : 'power';
    const pause: PauseEvent = {
      id: `pause-${this.pauseCounter}-${Math.round(startMs)}`,
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(Math.round(startMs), Math.round(endMs)),
      durationMs: Math.round(durationMs),
      kind,
    };
    this.pauses.push(pause);
    this.callbacks.onPauseComplete?.(pause);
  }
}
