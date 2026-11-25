import type {
  BeatTransition,
  EnergyBucket,
  FillerEvent,
  Lens,
  MetricTone,
  OneChangeCue,
  PauseEvent,
  SessionMetrics,
  SessionRecord,
  TakeDelta,
} from '../types/cadence';

// ---------------------------------------------------------------------------
// Constants & Rubric Thresholds (aligned with Cadence pedagogy rubric)
// ---------------------------------------------------------------------------

/**
 * Matches target filler words and multi-word verbal crutches:
 * um, uh, er, ah, like, you know, basically, actually, literally, kind of, sort of, i mean.
 * Excludes grammatical verb/preposition collocations of "like" (e.g. "sounds like",
 * "seems like", "looks like", "feel like", "would like", "'d like", "like to").
 */
export const FILLER_WORDS_REGEX =
  /\b(?:you\s+know|kind\s+of|sort\s+of|i\s+mean|basically|actually|literally|umm?|uhh?|er|ahh?)\b|(?<!\b(?:sounds?|sounded|sounding|seems?|seemed|seeming|looks?|looked|looking|feels?|felt|feeling|acts?|acted|acting|smells?|tastes?|works?|appears?|behaves?|reads?|would|do|does|did|don['’]t|doesn['’]t|didn['’]t|will|won['’]t|should|could|might|may|to|really|also|truly|always|never|just|more|less|most|much|very|something|anything|nothing|everything|someone|anyone|things?|people|teams?|companies|options?|cases?|situations?|moments?|tools?|questions?)\s+)(?<!['’]d\s+)\blike\b(?!\s+to\b)/gi;

const NON_FILLER_LIKE_PREFIX_REGEX =
  /(?:^|[\s([{"'“‘])(?:sounds?|sounded|sounding|seems?|seemed|seeming|looks?|looked|looking|feels?|felt|feeling|acts?|acted|acting|smells?|tastes?|works?|appears?|behaves?|reads?|would|['’]d|do|does|did|don['’]t|doesn['’]t|didn['’]t|will|won['’]t|should|could|might|may|to|really|also|truly|always|never|just|more|less|most|much|very|something|anything|nothing|everything|someone|anyone|things?|people|teams?|companies|options?|cases?|situations?|moments?|tools?|questions?)\s+$/i;

const PRONOUN_LIKE_PREFIX_REGEX = /(?:^|[\s([{"'“‘])(?:i|we|you|they)\s+$/i;
const INFINITIVE_LIKE_SUFFIX_REGEX = /^\s+to\b/i;

export interface FillerTextMatch {
  word: string;
  raw: string;
  start: number;
  end: number;
}

export const LENS_WPM_BANDS: Record<Lens, { min: number; max: number; briskLimit: number }> = {
  negotiation: { min: 120, max: 140, briskLimit: 150 },
  camera: { min: 140, max: 160, briskLimit: 165 },
  clarity: { min: 130, max: 155, briskLimit: 165 },
};

export interface EvaluateSessionMetricsInput {
  durationMs: number;
  lens: Lens;
  speechRecognitionSupported: boolean;
  transcript: string;
  wordCount?: number;
  pauses: PauseEvent[];
  fillers: FillerEvent[];
  energyTimeline: EnergyBucket[];
  beatTransitions: BeatTransition[];
  totalBeats: number;
}

export interface AcousticSummary {
  vocalExpressiveness: number;
  speakingRatio: number;
}

// ---------------------------------------------------------------------------
// Text & Filler Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function buildContextSnippet(text: string, matchIndex: number, matchLength: number): string {
  const radius = 26;
  const rawStart = Math.max(0, matchIndex - radius);
  const rawEnd = Math.min(text.length, matchIndex + matchLength + radius);

  let start = rawStart;
  if (rawStart > 0) {
    const nextSpace = text.indexOf(' ', rawStart);
    if (nextSpace !== -1 && nextSpace < matchIndex) {
      start = nextSpace + 1;
    }
  }

  let end = rawEnd;
  if (rawEnd < text.length) {
    const prevSpace = text.lastIndexOf(' ', rawEnd);
    if (prevSpace > matchIndex + matchLength) {
      end = prevSpace;
    }
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Returns true when an occurrence of "like" is used grammatically
 * (e.g. Tactical Empathy labels "sounds/seems/looks/feels like", "would/'d like",
 * "like to", "just/something like", or direct verb "I/we/you/they like ...")
 * rather than as a verbal filler.
 */
export function isGrammaticalLike(
  text: string,
  matchIndex: number,
  matchLength: number,
): boolean {
  const before = text.slice(Math.max(0, matchIndex - 32), matchIndex);
  const after = text.slice(matchIndex + matchLength, matchIndex + matchLength + 16);

  if (NON_FILLER_LIKE_PREFIX_REGEX.test(before)) {
    return true;
  }

  if (INFINITIVE_LIKE_SUFFIX_REGEX.test(after)) {
    return true;
  }

  // Direct verb usage: "I like this approach" (exclude comma-set-off ", like," or "I like, um")
  if (PRONOUN_LIKE_PREFIX_REGEX.test(before) && !/^\s*[,;—–-]/.test(after)) {
    return true;
  }

  return false;
}

/**
 * Shared deterministic filler span matcher for both metrics scoring and
 * ReviewView transcript highlighting.
 */
export function findFillerMatches(text: string): FillerTextMatch[] {
  if (!text.trim()) return [];

  const matcher = new RegExp(FILLER_WORDS_REGEX.source, 'gi');
  const matches: FillerTextMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const raw = match[0];
    const word = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (word === 'like' && isGrammaticalLike(text, match.index, raw.length)) {
      continue;
    }

    matches.push({
      word,
      raw,
      start: match.index,
      end: match.index + raw.length,
    });
  }

  return matches;
}

/**
 * Detects gentle filler words in a text segment.
 * Optionally spreads filler timestamps across [offsetMs, offsetMs + spanMs] when spanMs > 0.
 */
export function detectFillersInText(
  text: string,
  offsetMs: number,
  spanMs = 0,
): FillerEvent[] {
  const matches = findFillerMatches(text);
  if (matches.length === 0) return [];

  const textLen = Math.max(1, text.length);

  return matches.map((m, occurrence) => {
    const interpolatedOffset =
      spanMs > 0
        ? Math.round(offsetMs + (m.start / textLen) * spanMs)
        : Math.max(0, Math.round(offsetMs));

    return {
      id: `filler-${interpolatedOffset}-${occurrence}-${m.word.replace(/\s+/g, '_')}`,
      word: m.word,
      offsetMs: interpolatedOffset,
      contextSnippet: buildContextSnippet(text, m.start, m.raw.length),
    };
  });
}

// ---------------------------------------------------------------------------
// Acoustic Summary (Web Audio Fallback Metrics)
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * Computes vocal dynamic expressiveness (0–100) and speaking ratio (0–100)
 * purely from Web Audio energy buckets (works without SpeechRecognition).
 */
export function computeAcousticSummary(energyTimeline: EnergyBucket[]): AcousticSummary {
  if (energyTimeline.length === 0) {
    return { vocalExpressiveness: 0, speakingRatio: 0 };
  }

  const voiced = energyTimeline.filter((bucket) => bucket.isSpeaking);
  const speakingRatio = Math.round(clamp((voiced.length / energyTimeline.length) * 100, 0, 100));

  const samples = (voiced.length >= 3 ? voiced : energyTimeline).map((b) =>
    clamp(b.level, 0, 1),
  );
  if (samples.length < 2) {
    return { vocalExpressiveness: 0, speakingRatio };
  }

  const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
  const variance =
    samples.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  const sorted = [...samples].sort((a, b) => a - b);
  const spread = percentile(sorted, 0.9) - percentile(sorted, 0.1);

  // Calibrated so a lively, varied speaking voice lands ~60–90 and monotone lands ~20–35
  const stdScore = clamp(stdDev / 0.21, 0, 1);
  const spreadScore = clamp(spread / 0.52, 0, 1);
  const presenceFactor = voiced.length >= 3 ? 1 : 0.45;
  const vocalExpressiveness = Math.round(
    clamp((stdScore * 0.58 + spreadScore * 0.42) * 100 * presenceFactor, 0, 100),
  );

  return { vocalExpressiveness, speakingRatio };
}

// ---------------------------------------------------------------------------
// Structure Flow Helper
// ---------------------------------------------------------------------------

function evaluateStructure(
  beatTransitions: BeatTransition[],
  totalBeats: number,
  durationMs: number,
): {
  beatsHit: number;
  totalBeats: number;
  longestBeatSharePct: number;
  structureLabel: string;
  structureTone: MetricTone;
} {
  const safeTotalBeats = Math.max(1, totalBeats);
  const safeDurationMs = Math.max(1, durationMs);

  const visited = new Set<number>();
  const durationByBeat = new Map<number, number>();

  for (let i = 0; i < beatTransitions.length; i += 1) {
    const current = beatTransitions[i];
    if (current.beatIndex >= 0 && current.beatIndex < safeTotalBeats) {
      visited.add(current.beatIndex);
    }

    const nextStart = beatTransitions[i + 1]?.enteredAtMs;
    const endMs = current.exitedAtMs ?? nextStart ?? safeDurationMs;
    const span = Math.max(0, endMs - current.enteredAtMs);
    durationByBeat.set(current.beatIndex, (durationByBeat.get(current.beatIndex) ?? 0) + span);
  }

  const beatsHit = clamp(visited.size, 0, safeTotalBeats);

  let totalTrackedMs = 0;
  let maxBeatMs = 0;
  let longestBeatIndex = 0;

  for (const [beatIndex, ms] of durationByBeat.entries()) {
    totalTrackedMs += ms;
    if (ms > maxBeatMs) {
      maxBeatMs = ms;
      longestBeatIndex = beatIndex;
    }
  }

  const denominator = totalTrackedMs > 0 ? totalTrackedMs : safeDurationMs;
  const longestBeatSharePct =
    durationByBeat.size > 0
      ? Math.round(clamp((maxBeatMs / denominator) * 100, 0, 100))
      : 0;

  const isUneven = safeTotalBeats > 1 && longestBeatSharePct > 60;
  const baseLabel = `${beatsHit}/${safeTotalBeats} Beats Landed`;

  let structureLabel = baseLabel;
  let structureTone: MetricTone = 'positive';

  if (beatsHit < safeTotalBeats) {
    structureTone = 'gentle';
    if (isUneven && longestBeatIndex === 0) {
      structureLabel = `${beatsHit}/${safeTotalBeats} Beats · Long Opener`;
    }
  } else if (isUneven) {
    structureTone = 'gentle';
    structureLabel =
      longestBeatIndex === 0
        ? `${beatsHit}/${safeTotalBeats} Beats · Long Opener`
        : `${beatsHit}/${safeTotalBeats} Beats · Uneven Pacing`;
  }

  return {
    beatsHit,
    totalBeats: safeTotalBeats,
    longestBeatSharePct,
    structureLabel,
    structureTone,
  };
}

// ---------------------------------------------------------------------------
// Primary Session Metrics Evaluator
// ---------------------------------------------------------------------------

export function evaluateSessionMetrics(input: EvaluateSessionMetricsInput): SessionMetrics {
  const safeDurationMs = Math.max(1000, Math.round(input.durationMs));
  const durationSec = Math.max(1, Math.round(safeDurationMs / 1000));
  const durationMin = Math.max(safeDurationMs / 60000, 1 / 60);

  const wordCount =
    typeof input.wordCount === 'number'
      ? Math.max(0, Math.round(input.wordCount))
      : countWords(input.transcript);

  const { vocalExpressiveness, speakingRatio } = computeAcousticSummary(input.energyTimeline);

  // 1. Pace (WPM) with graceful fallback
  const band = LENS_WPM_BANDS[input.lens];
  let wpm: number | null = null;
  let paceLabel: string;
  let paceTone: MetricTone;

  if (!input.speechRecognitionSupported) {
    wpm = null;
    if (vocalExpressiveness >= 45) {
      paceLabel = 'Expressive Range';
      paceTone = 'positive';
    } else if (vocalExpressiveness >= 25) {
      paceLabel = 'Steady Cadence';
      paceTone = 'neutral';
    } else {
      paceLabel = 'Even Delivery';
      paceTone = 'neutral';
    }
  } else if (wordCount < 3) {
    wpm = null;
    paceLabel = 'Brief Sample';
    paceTone = 'neutral';
  } else {
    wpm = Math.round(wordCount / durationMin);
    if (wpm >= band.min && wpm <= band.max) {
      paceLabel = 'Measured & Clear';
      paceTone = 'positive';
    } else if (wpm > band.max) {
      paceLabel = 'Slightly Brisk';
      paceTone = wpm > band.briskLimit ? 'gentle' : 'neutral';
    } else {
      paceLabel = 'Deliberate';
      paceTone = wpm < 95 ? 'gentle' : 'neutral';
    }
  }

  // 2. Power Pauses (1.0–3.0s) & Dynamic Silences (>= 3.0s)
  const qualifyingPauses = input.pauses.filter((p) => p.durationMs >= 1000);
  const powerPauseCount = qualifyingPauses.length;
  const dynamicSilenceCount = qualifyingPauses.filter(
    (p) => p.kind === 'dynamic' || p.durationMs >= 3000,
  ).length;

  let pauseLabel: string;
  let pauseTone: MetricTone;
  if (powerPauseCount >= 2) {
    pauseLabel = 'Composure Landed';
    pauseTone =
      input.lens === 'negotiation' && dynamicSilenceCount === 0 ? 'neutral' : 'positive';
  } else {
    pauseLabel = 'Room to Breathe';
    pauseTone = durationSec >= 20 ? 'gentle' : 'neutral';
  }

  // 3. Filler Clarity (with Speaking Ratio fallback)
  const fillerCount = input.fillers.length;
  let fillersPerMin: number | null = null;
  let fillerLabel: string;
  let fillerTone: MetricTone;

  if (!input.speechRecognitionSupported) {
    fillersPerMin = null;
    if (speakingRatio >= 50 && speakingRatio <= 86) {
      fillerLabel = 'Balanced Breath';
      fillerTone = 'positive';
    } else if (speakingRatio > 86) {
      fillerLabel = 'Dense Pace';
      fillerTone = 'gentle';
    } else {
      fillerLabel = 'Spacious Rhythm';
      fillerTone = 'neutral';
    }
  } else {
    fillersPerMin = Number((fillerCount / durationMin).toFixed(1));
    if (fillersPerMin <= 3) {
      fillerLabel = 'Crisp';
      fillerTone = 'positive';
    } else if (fillersPerMin < 8) {
      fillerLabel = 'Watch';
      fillerTone = 'neutral';
    } else {
      fillerLabel = 'Swap for Breath';
      fillerTone = 'gentle';
    }
  }

  // 4. Structure Flow
  const structure = evaluateStructure(input.beatTransitions, input.totalBeats, safeDurationMs);

  return {
    durationSec,
    speechRecognitionSupported: input.speechRecognitionSupported,
    wordCount,
    wpm,
    paceLabel,
    paceTone,
    powerPauseCount,
    dynamicSilenceCount,
    pauseLabel,
    pauseTone,
    fillerCount,
    fillersPerMin,
    fillerLabel,
    fillerTone,
    vocalExpressiveness,
    speakingRatio,
    beatsHit: structure.beatsHit,
    totalBeats: structure.totalBeats,
    longestBeatSharePct: structure.longestBeatSharePct,
    structureLabel: structure.structureLabel,
    structureTone: structure.structureTone,
  };
}

// ---------------------------------------------------------------------------
// Deterministic "One-Change Rule" Cue for Take 2
// Priority: beats -> fillers -> pace -> pauses -> polish
// ---------------------------------------------------------------------------

export function pickOneChangeCue(metrics: SessionMetrics, lens: Lens): OneChangeCue {
  // 1. Missed >= 1 framework beat
  if (metrics.beatsHit < metrics.totalBeats) {
    return {
      rule: 'beats',
      title: 'Land Every Beat',
      instruction: 'Advance cleanly through all beats so your close lands with impact.',
    };
  }

  // 2. Fillers > 3/min
  if (metrics.fillersPerMin !== null && metrics.fillersPerMin > 3) {
    return {
      rule: 'fillers',
      title: 'Swap Fillers for Breath',
      instruction: 'Swap your next filler word for one silent 1.5s breath at beat transitions.',
    };
  }

  // 3. Pace > 165 WPM (or > 150 in Negotiation)
  const briskLimit = LENS_WPM_BANDS[lens].briskLimit;
  if (metrics.wpm !== null && metrics.wpm > briskLimit) {
    return {
      rule: 'pace',
      title: 'Ease Into Your Cadence',
      instruction: 'Slow down 15% on your core claim and drop your tone at sentence ends.',
    };
  }

  // 4. Power Pauses < 2 (or 0 Dynamic Silences in Negotiation)
  if (
    metrics.powerPauseCount < 2 ||
    (lens === 'negotiation' && metrics.dynamicSilenceCount < 1)
  ) {
    return {
      rule: 'pauses',
      title: lens === 'negotiation' ? 'Hold Dynamic Silence' : 'Let Silence Land',
      instruction:
        'Hold one full 2–4s silent pause right after your main point or calibrated question.',
    };
  }

  // 5. All green — vocal warmth & steady eye-line polish
  return {
    rule: 'polish',
    title: 'Elevate Warmth & Eye-Line',
    instruction:
      'Dial vocal warmth up 10% and hold steady lens eye-line through the final 2 seconds.',
  };
}

// ---------------------------------------------------------------------------
// Take N vs Previous Take Delta Comparison
// ---------------------------------------------------------------------------

export function computeTakeDelta(
  current: SessionRecord,
  previous: SessionRecord,
): TakeDelta {
  const wpmDiff =
    current.metrics.wpm !== null && previous.metrics.wpm !== null
      ? current.metrics.wpm - previous.metrics.wpm
      : null;

  const powerPauseDiff =
    current.metrics.powerPauseCount - previous.metrics.powerPauseCount;

  const fillerPerMinDiff =
    current.metrics.fillersPerMin !== null && previous.metrics.fillersPerMin !== null
      ? Number((current.metrics.fillersPerMin - previous.metrics.fillersPerMin).toFixed(1))
      : null;

  const beatsHitDiff = current.metrics.beatsHit - previous.metrics.beatsHit;

  const band = LENS_WPM_BANDS[current.lens];
  const prevDist =
    previous.metrics.wpm !== null
      ? Math.max(0, band.min - previous.metrics.wpm, previous.metrics.wpm - band.max)
      : null;
  const currDist =
    current.metrics.wpm !== null
      ? Math.max(0, band.min - current.metrics.wpm, current.metrics.wpm - band.max)
      : null;

  const wins: string[] = [];
  const notes: string[] = [];

  if (beatsHitDiff > 0) {
    wins.push(`+${beatsHitDiff} more ${beatsHitDiff === 1 ? 'beat' : 'beats'} landed`);
  } else if (beatsHitDiff < 0) {
    notes.push(`${Math.abs(beatsHitDiff)} fewer ${Math.abs(beatsHitDiff) === 1 ? 'beat' : 'beats'}`);
  }

  if (powerPauseDiff > 0) {
    wins.push(
      `+${powerPauseDiff} power ${powerPauseDiff === 1 ? 'pause' : 'pauses'}`,
    );
  } else if (powerPauseDiff < 0) {
    notes.push(
      `${Math.abs(powerPauseDiff)} fewer ${Math.abs(powerPauseDiff) === 1 ? 'pause' : 'pauses'}`,
    );
  }

  if (fillerPerMinDiff !== null) {
    if (fillerPerMinDiff <= -0.5) {
      wins.push(`${Math.abs(fillerPerMinDiff).toFixed(1)} fewer fillers/min`);
    } else if (fillerPerMinDiff >= 1) {
      notes.push(`+${fillerPerMinDiff.toFixed(1)} fillers/min`);
    }
  }

  if (wpmDiff !== null && Math.abs(wpmDiff) >= 5) {
    const movedCloserToZone =
      prevDist !== null && currDist !== null && currDist < prevDist;
    const paceText =
      wpmDiff < 0
        ? `${Math.abs(wpmDiff)} WPM calmer`
        : `+${wpmDiff} WPM brisker`;

    if (movedCloserToZone) {
      wins.push(`pace dialed in (${paceText})`);
    } else {
      notes.push(paceText);
    }
  }

  let summaryLabel: string;
  if (wins.length > 0) {
    summaryLabel = `Take ${current.takeNumber} sharpened: ${wins.slice(0, 3).join(' · ')}`;
  } else if (notes.length > 0) {
    summaryLabel = `Shift from Take ${previous.takeNumber}: ${notes.slice(0, 2).join(' · ')}`;
  } else {
    summaryLabel = `Steady, consistent cadence matching Take ${previous.takeNumber}`;
  }

  return {
    previousSessionId: previous.id,
    previousTakeNumber: previous.takeNumber,
    wpmDiff,
    powerPauseDiff,
    fillerPerMinDiff,
    beatsHitDiff,
    summaryLabel,
  };
}
