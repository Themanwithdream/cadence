import type {
  LiveRecordingAsset,
  MediaErrorInfo,
  StudioMode,
} from '../types/cadence';

// ---------------------------------------------------------------------------
// Capability Checks & Media Constraints
// ---------------------------------------------------------------------------

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
] as const;

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

export function isMediaCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

export function pickSupportedRecorderMimeType(hasVideo: boolean): string | null {
  if (!isMediaRecorderSupported()) return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null;

  const candidates = hasVideo ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES;
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // Ignore browser-specific MIME probe exceptions
    }
  }
  return null;
}

/**
 * Clean getUserMedia wrapper for camera (720p front-facing + echo-cancelled audio)
 * or audio-only studio capture.
 */
export async function requestStudioMedia(
  mode: 'camera' | 'audio',
): Promise<MediaStream> {
  if (!isMediaCaptureSupported()) {
    const err = new Error('Media capture is not supported in this browser context.');
    err.name = 'NotSupportedError';
    throw err;
  }

  const constraints: MediaStreamConstraints =
    mode === 'camera'
      ? {
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }
      : {
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        };

  return navigator.mediaDevices.getUserMedia(constraints);
}

// ---------------------------------------------------------------------------
// Calm, Non-Technical Media Error Mapping
// ---------------------------------------------------------------------------

function extractErrorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string') {
    return err.name;
  }
  return 'UnknownError';
}

export function mapMediaError(err: unknown, mode: StudioMode): MediaErrorInfo {
  const name = extractErrorName(err);
  const isCamera = mode === 'camera';

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError'
  ) {
    return {
      code: 'permission-denied',
      title: isCamera ? 'Camera & Mic Access Needed' : 'Microphone Access Needed',
      message: isCamera
        ? 'Your browser paused camera access. You can allow it in the address bar, switch to Audio-Only, or practice in Timer Mode without a mic.'
        : 'Your browser paused microphone access. You can allow it in the address bar or practice in Timer Mode without a mic.',
      canFallbackToAudio: isCamera,
    };
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return {
      code: 'no-device',
      title: isCamera ? 'No Camera Detected' : 'No Microphone Detected',
      message: isCamera
        ? 'We could not find an available camera on this device. Switch to Audio-Only or practice in Timer Mode without hardware.'
        : 'We could not find an available microphone. Connect a mic or practice in Timer Mode without hardware.',
      canFallbackToAudio: isCamera,
    };
  }

  if (name === 'NotSupportedError' || name === 'TypeError') {
    return {
      code: 'not-supported',
      title: 'Live Capture Unavailable Here',
      message:
        'This browser window does not support live audio/video capture. You can still rehearse your structure and pacing in Timer Mode.',
      canFallbackToAudio: false,
    };
  }

  return {
    code: 'capture-failed',
    title: isCamera ? 'Camera Busy Elsewhere' : 'Microphone Unavailable',
    message: isCamera
      ? 'Another app may be holding onto your camera. Close it and retry, switch to Audio-Only, or practice in Timer Mode.'
      : 'Another app may be using your microphone. Close it and retry, or practice in Timer Mode without a mic.',
    canFallbackToAudio: isCamera,
  };
}

// ---------------------------------------------------------------------------
// Stream & Asset Helpers
// ---------------------------------------------------------------------------

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Track already stopped
    }
  }
}

export function createEmptyRecordingAsset(): LiveRecordingAsset {
  return {
    url: null,
    mimeType: null,
    hasVideo: false,
    hasAudio: false,
  };
}

export function revokeRecordingAssetUrl(asset: LiveRecordingAsset | null | undefined): void {
  if (asset?.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(asset.url);
    } catch {
      // Ignore already-revoked object URLs
    }
  }
}

// ---------------------------------------------------------------------------
// MediaRecorder Wrapper with MIME Fallback & Safe Finalization
// ---------------------------------------------------------------------------

export class StudioMediaRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private mimeType: string | null = null;
  private hasVideo = false;
  private hasAudio = false;
  private stopPromise: Promise<LiveRecordingAsset> | null = null;

  start(stream: MediaStream, preferVideo: boolean): boolean {
    this.abort();

    if (!isMediaRecorderSupported()) {
      return false;
    }

    const activeVideoTracks = stream
      .getVideoTracks()
      .filter((t) => t.readyState === 'live');
    const activeAudioTracks = stream
      .getAudioTracks()
      .filter((t) => t.readyState === 'live');

    this.hasVideo = preferVideo && activeVideoTracks.length > 0;
    this.hasAudio = activeAudioTracks.length > 0;
    this.chunks = [];

    const selectedMime = pickSupportedRecorderMimeType(this.hasVideo);
    this.mimeType = selectedMime;

    try {
      const options: MediaRecorderOptions = {};
      if (selectedMime) {
        options.mimeType = selectedMime;
      }
      const recorder = new MediaRecorder(stream, options);
      this.recorder = recorder;
      if (!this.mimeType && recorder.mimeType) {
        this.mimeType = recorder.mimeType;
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      recorder.start(250);
      return true;
    } catch {
      // Retry once with default MediaRecorder options if chosen MIME failed at runtime
      try {
        const fallbackRecorder = new MediaRecorder(stream);
        this.recorder = fallbackRecorder;
        this.mimeType = fallbackRecorder.mimeType || null;
        fallbackRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            this.chunks.push(event.data);
          }
        };
        fallbackRecorder.start(250);
        return true;
      } catch {
        this.recorder = null;
        this.chunks = [];
        return false;
      }
    }
  }

  stop(): Promise<LiveRecordingAsset> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    const recorder = this.recorder;
    if (!recorder) {
      return Promise.resolve(createEmptyRecordingAsset());
    }

    if (recorder.state === 'inactive') {
      const asset = this.buildAsset();
      this.resetState();
      return Promise.resolve(asset);
    }

    this.stopPromise = new Promise<LiveRecordingAsset>((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyTimer);
        const asset = this.buildAsset();
        this.resetState();
        resolve(asset);
      };

      const safetyTimer = window.setTimeout(finish, 1500);

      recorder.onstop = finish;
      recorder.onerror = finish;

      try {
        recorder.requestData();
      } catch {
        // Not all browsers allow requestData before stop
      }

      try {
        recorder.stop();
      } catch {
        finish();
      }
    });

    return this.stopPromise;
  }

  abort(): void {
    const recorder = this.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Ignore stop errors during abort
        }
      }
    }
    this.resetState();
  }

  private buildAsset(): LiveRecordingAsset {
    if (this.chunks.length === 0) {
      return createEmptyRecordingAsset();
    }

    const resolvedMime =
      this.mimeType || (this.hasVideo ? 'video/webm' : 'audio/webm');
    const blob = new Blob(this.chunks, { type: resolvedMime });
    if (blob.size === 0) {
      return createEmptyRecordingAsset();
    }

    const url = URL.createObjectURL(blob);
    return {
      url,
      mimeType: blob.type || resolvedMime,
      hasVideo: this.hasVideo,
      hasAudio: this.hasAudio,
    };
  }

  private resetState(): void {
    this.recorder = null;
    this.chunks = [];
    this.mimeType = null;
    this.hasVideo = false;
    this.hasAudio = false;
    this.stopPromise = null;
  }
}
