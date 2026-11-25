import type {
  CoachFeedbackItem,
  CoachReport,
  FillerEvent,
  Lens,
  LineRewriteTip,
  PauseEvent,
  SessionMetrics,
  SessionRecord,
  StudioMode,
  TranscriptAnnotation,
  TranscriptAnnotationKind,
  TranscriptChunk,
} from '../types/cadence';
import {
  LENS_WPM_BANDS,
  countWords,
  findFillerMatches,
} from './metricsEvaluator';

// ---------------------------------------------------------------------------
// Constants & Pattern Matchers
// ---------------------------------------------------------------------------

const LENS_DISPLAY_LABELS: Record<Lens, string> = {
  camera: 'On Camera',
  clarity: 'Clear Thinking',
  negotiation: 'Negotiation',
};

const TACTICAL_EMPATHY_POWER_REGEX =
  /\b(?:it\s+sounds\s+like|it\s+seems\s+like|it\s+looks\s+like|how\s+can\s+we|what\s+would\s+it\s+take|how\s+am\s+i\s+supposed\s+to)\b/gi;

const SIGNPOST_POWER_REGEX =
  /\b(?:my\s+recommendation|bottom\s+line|for\s+example|for\s+instance|the\s+result|here\s+is\s+why|here['’]s\s+why|next\s+step|in\s+short|to\s+summarize|let['’]s\s+commit|let\s+us\s+commit|first|second|third)\b/gi;

const HEDGE_PHRASE_REGEX =
  /\b(?:i\s+just\s+think|just\s+wanted\s+to|just\s+maybe|a\s+little\s+bit|i\s+guess|kind\s+of|sort\s+of|maybe|probably|honestly|sorry)\b/gi;

const SOFTENING_JUST_REGEX =
  /\bjust(?=\s+(?:think|thinking|want|wanted|wanting|feel|feeling|hope|hoping|try|trying|tried|say|saying|ask|asking|wonder|wondering|check|checking|reach|reaching|look|looking|need|needed|curious|going|wanna|i|we)\b)/gi;

const ANNOTATION_PRIORITY: Record<TranscriptAnnotationKind, number> = {
  power: 3,
  filler: 2,
  hedge: 1,
};

export interface BuildCoachReportInput {
  lens: Lens;
  mode: StudioMode;
  metrics: SessionMetrics;
  transcript: string;
  transcriptChunks: TranscriptChunk[];
  pauses: PauseEvent[];
  fillers: FillerEvent[];
  questionsCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// 1. Transcript Annotations (Non-Overlapping: power > filler > hedge)
// ---------------------------------------------------------------------------

export function annotateTranscriptText(
  text: string,
  lens: Lens,
): TranscriptAnnotation[] {
  if (!text.trim()) return [];

  const candidates: TranscriptAnnotation[] = [];

  // Power phrases: tactical empathy & calibrated questions
  const empathyTip =
    lens === 'negotiation'
      ? 'Tactical empathy cue — lowers defensiveness and invites collaboration.'
      : 'Strong empathy / open-question cue — keeps listeners leaning in.';

  const empathyMatcher = new RegExp(TACTICAL_EMPATHY_POWER_REGEX.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = empathyMatcher.exec(text)) !== null) {
    candidates.push({
      kind: 'power',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      tip: empathyTip,
    });
  }

  // Power phrases: clarity signposts
  const signpostMatcher = new RegExp(SIGNPOST_POWER_REGEX.source, 'gi');
  while ((match = signpostMatcher.exec(text)) !== null) {
    candidates.push({
      kind: 'power',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      tip: 'Strong signpost / clarity cue — helps listeners follow effortlessly.',
    });
  }

  // Fillers: reuse shared grammatical-"like"-safe matcher from metricsEvaluator
  const fillerMatches = findFillerMatches(text);
  for (const filler of fillerMatches) {
    candidates.push({
      kind: 'filler',
      text: filler.raw,
      start: filler.start,
      end: filler.end,
      tip: 'Try a 1.5s silent breath instead of a filler word.',
    });
  }

  // Hedges: confidence-softening phrases
  const hedgeMatcher = new RegExp(HEDGE_PHRASE_REGEX.source, 'gi');
  while ((match = hedgeMatcher.exec(text)) !== null) {
    candidates.push({
      kind: 'hedge',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      tip: 'Softening word — cut it to sound more decisive.',
    });
  }

  // Hedges: standalone softening "just" before verbs/pronouns
  const justMatcher = new RegExp(SOFTENING_JUST_REGEX.source, 'gi');
  while ((match = justMatcher.exec(text)) !== null) {
    candidates.push({
      kind: 'hedge',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      tip: 'Softening word — cut it to sound more decisive.',
    });
  }

  if (candidates.length === 0) return [];

  // Resolve overlaps deterministically: priority (power > filler > hedge),
  // then longer span, then earlier index.
  candidates.sort((a, b) => {
    const prioDiff = ANNOTATION_PRIORITY[b.kind] - ANNOTATION_PRIORITY[a.kind];
    if (prioDiff !== 0) return prioDiff;
    const lenDiff = (b.end - b.start) - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });

  const accepted: TranscriptAnnotation[] = [];
  for (const cand of candidates) {
    const overlaps = accepted.some(
      (existing) => !(cand.end <= existing.start || cand.start >= existing.end),
    );
    if (!overlaps) {
      accepted.push(cand);
    }
  }

  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

// ---------------------------------------------------------------------------
// 2. Subscore & Overall Score Calculators
// ---------------------------------------------------------------------------

function computeSubscores(
  input: BuildCoachReportInput,
  hedgeCount: number,
  powerPhraseCount: number,
  totalSteps: number,
): { pace: number; pauses: number; clarity: number; structure: number; overallScore: number } {
  const { lens, mode, metrics } = input;
  const band = LENS_WPM_BANDS[lens];

  // Structure subscore (always available in every mode)
  const coverage = clamp(metrics.beatsHit / Math.max(1, totalSteps), 0, 1);
  let structure = Math.round(36 + coverage * 64);
  if (totalSteps > 1 && metrics.longestBeatSharePct > 60) {
    const excess = metrics.longestBeatSharePct - 60;
    structure -= Math.min(16, Math.round(excess * 0.55));
  }
  if (metrics.durationSec < 10 && totalSteps > 1) {
    structure = Math.min(structure, 78);
  }
  structure = clamp(structure, 24, 100);

  // Timer mode (no mic/speech telemetry)
  if (mode === 'timer') {
    const pace = metrics.durationSec >= 20 ? 74 : 64;
    const pauses = 68;
    const clarity = 70;
    const overallScore = clamp(
      Math.round(structure * 0.52 + pace * 0.16 + pauses * 0.16 + clarity * 0.16),
      35,
      84,
    );
    return { pace, pauses, clarity, structure, overallScore };
  }

  // Pace subscore
  let pace: number;
  if (metrics.wpm !== null) {
    if (metrics.wpm >= band.min && metrics.wpm <= band.max) {
      const center = (band.min + band.max) / 2;
      const halfWidth = Math.max(1, (band.max - band.min) / 2);
      const distNorm = Math.abs(metrics.wpm - center) / halfWidth;
      pace = Math.round(100 - distNorm * 8);
    } else {
      const delta =
        metrics.wpm > band.max ? metrics.wpm - band.max : band.min - metrics.wpm;
      pace =
        delta <= 15
          ? Math.round(92 - delta * 1.15)
          : Math.round(75 - (delta - 15) * 1.05);
    }
    pace = clamp(pace, 42, 100);
  } else {
    pace = clamp(
      Math.round(52 + clamp(metrics.vocalExpressiveness / 80, 0, 1) * 40),
      48,
      92,
    );
  }

  // Pauses subscore
  let pausesScore: number;
  const pp = metrics.powerPauseCount;
  const ds = metrics.dynamicSilenceCount;
  if (pp === 0) {
    pausesScore = metrics.durationSec < 15 ? 62 : 48;
  } else if (pp === 1) {
    pausesScore = 72;
  } else if (pp === 2) {
    pausesScore = lens === 'negotiation' && ds === 0 ? 82 : 89;
  } else {
    pausesScore = Math.min(98, 92 + (pp - 3) * 2);
  }
  if (lens === 'negotiation' && ds >= 1) {
    pausesScore = Math.min(100, pausesScore + 6);
  }
  if (metrics.speakingRatio > 0 && metrics.speakingRatio < 22) {
    pausesScore = Math.min(pausesScore, 72);
  }
  pausesScore = clamp(pausesScore, 40, 100);

  // Clarity subscore
  let clarity: number;
  if (metrics.fillersPerMin !== null) {
    let score = 94;
    if (metrics.fillersPerMin <= 2) {
      score -= Math.round(metrics.fillersPerMin * 2);
    } else if (metrics.fillersPerMin <= 5) {
      score -= Math.round(4 + (metrics.fillersPerMin - 2) * 4.5);
    } else {
      score -= Math.min(46, Math.round(18 + (metrics.fillersPerMin - 5) * 4.5));
    }

    const durationMin = Math.max(metrics.durationSec / 60, 0.35);
    if (hedgeCount >= 2) {
      const hedgesPerMin = hedgeCount / durationMin;
      score -= Math.min(18, Math.round(hedgesPerMin * 3.2));
    }

    score += Math.min(8, powerPhraseCount * 3);
    clarity = clamp(score, 38, 100);
  } else {
    // Fallback when SpeechRecognition is unavailable
    if (metrics.speakingRatio >= 50 && metrics.speakingRatio <= 86) {
      clarity = 82;
    } else {
      const gap =
        metrics.speakingRatio > 86
          ? metrics.speakingRatio - 86
          : 50 - metrics.speakingRatio;
      clarity = clamp(Math.round(80 - gap * 0.65), 54, 82);
    }
  }

  const overallScore =
    metrics.wpm !== null
      ? Math.round(pace * 0.25 + pausesScore * 0.25 + clarity * 0.3 + structure * 0.2)
      : Math.round(pace * 0.22 + pausesScore * 0.33 + clarity * 0.2 + structure * 0.25);

  return {
    pace,
    pauses: pausesScore,
    clarity,
    structure,
    overallScore: clamp(overallScore, 0, 100),
  };
}

function getVerdictForScore(score: number): string {
  if (score >= 86) return 'Commanding & Clear';
  if (score >= 74) return 'Strong & Engaging';
  if (score >= 60) return 'Solid Foundation';
  return 'Warming Up — Easy Wins Ahead';
}

// ---------------------------------------------------------------------------
// 3. Before → After Line Rewrite Generator
// ---------------------------------------------------------------------------

interface RewriteCandidate {
  text: string;
  offsetMs?: number;
}

function splitIntoSentences(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]?/g);
  if (!parts) return [cleaned];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function tidySharpenedSentence(raw: string, original: string): string {
  let out = raw
    // Collapse leftover paired commas or punctuation from removed parenthetical fillers (", um,")
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\b(that|and|but|or|so|because|while|though|is|are|was|were)\s*,\s+/gi, '$1 ')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*([.!?])/g, '$2')
    // Strip orphaned leading punctuation or stray conjunction commas
    .replace(/^[,;:\s—–-]+/, '')
    .trim();

  // Fix awkward leading "that " left if "I just think that ..." was trimmed
  out = out.replace(/^that\s+/i, '');

  // Capitalize first alphabetic character
  out = out.replace(/^([a-z])/, (m) => m.toUpperCase());

  // Preserve terminal punctuation if original had it
  const origEnding = original.trim().match(/[.!?]$/);
  if (origEnding && !/[.!?]$/.test(out)) {
    out = `${out}${origEnding[0]}`;
  }

  return out;
}

function formatDisplayTerm(term: string): string {
  return term.replace(/\bi\b/g, 'I');
}

function formatQuotedPhrase(term: string): string {
  return `'${formatDisplayTerm(term)}'`;
}

const INTRO_SIGNPOST_BEFORE_COMMA_REGEX =
  /^\s*(?:first|second|third|finally|however|overall|for\s+example|for\s+instance|in\s+short|to\s+summarize|bottom\s+line|meanwhile|instead|still|next|also|lastly),\s*$/i;

function buildLineRewriteTip(
  transcript: string,
  transcriptChunks: TranscriptChunk[],
  lens: Lens,
): LineRewriteTip | null {
  const candidates: RewriteCandidate[] = [];

  if (transcriptChunks.length > 0) {
    for (const chunk of transcriptChunks) {
      const sentences = splitIntoSentences(chunk.text);
      for (const sentence of sentences) {
        candidates.push({ text: sentence, offsetMs: chunk.offsetMs });
      }
    }
  } else if (transcript.trim()) {
    for (const sentence of splitIntoSentences(transcript)) {
      candidates.push({ text: sentence });
    }
  }

  if (candidates.length === 0) return null;

  let best: {
    candidate: RewriteCandidate;
    targets: TranscriptAnnotation[];
    score: number;
  } | null = null;

  for (const candidate of candidates) {
    const words = countWords(candidate.text);
    if (words < 6) continue;

    const annotations = annotateTranscriptText(candidate.text, lens);
    const targets = annotations.filter(
      (a) => a.kind === 'filler' || a.kind === 'hedge',
    );
    if (targets.length === 0) continue;

    // Ideal rewrite candidate is a punchy single sentence (8–26 words) with 1–3 fixes
    let score = Math.min(3, targets.length) * 20;
    if (words >= 8 && words <= 26) score += 25;
    else if (words <= 36) score += 12;
    else score -= 8;

    if (targets.some((t) => t.kind === 'hedge')) score += 6;
    if (targets.some((t) => t.kind === 'filler')) score += 6;

    if (!best || score > best.score) {
      best = { candidate, targets, score };
    }
  }

  if (!best) return null;

  const original = best.candidate.text.trim();
  const sortedTargets = [...best.targets].sort((a, b) => a.start - b.start);

  // Build sharpened string by replacing/stripping target spans cleanly
  let cursor = 0;
  let rebuilt = '';
  const removedLabels: string[] = [];

  for (const target of sortedTargets) {
    if (target.start < cursor) continue;
    rebuilt += original.slice(cursor, target.start);

    const normalized = target.text.toLowerCase().replace(/\s+/g, ' ').trim();
    const trailingSlice = original.slice(target.end);
    let nextCursor = target.end;
    let labelToReport = normalized;

    if (normalized === 'just wanted to') {
      // Keep grammar intact: "I just wanted to share" -> "I want to share"
      rebuilt += 'want to';
    } else if (normalized === 'i just think') {
      // Only preserve "I think" when followed by prepositional/terminal forms ("about", "of", "so", end)
      const needsThinkVerb = /^[\s,]*(?:about\b|of\b|so\b|[.!?]|$)/i.test(trailingSlice);
      if (needsThinkVerb) {
        rebuilt += 'I think';
        labelToReport = 'just';
      } else {
        const leadingThat = trailingSlice.match(/^\s+that\b/i);
        if (leadingThat) {
          nextCursor = target.end + leadingThat[0].length;
        }
      }
    } else {
      // If removed filler/hedge was wrapped on both sides by commas (", um,"),
      // keep the opening comma after sentence-leading signposts ("First, um, ..."),
      // otherwise strip both wrapper commas cleanly ("that, um, we" -> "that we").
      const hadCommaBefore = /,\s*$/.test(rebuilt);
      const commaAfterMatch = trailingSlice.match(/^\s*,/);
      if (hadCommaBefore && commaAfterMatch) {
        if (!INTRO_SIGNPOST_BEFORE_COMMA_REGEX.test(rebuilt)) {
          rebuilt = rebuilt.replace(/,\s*$/, ' ');
        }
        nextCursor = target.end + commaAfterMatch[0].length;
      }
    }

    if (!removedLabels.includes(labelToReport)) {
      removedLabels.push(labelToReport);
    }

    cursor = nextCursor;
  }
  rebuilt += original.slice(cursor);

  const sharpened = tidySharpenedSentence(rebuilt, original);
  if (
    !sharpened ||
    countWords(sharpened) < 4 ||
    sharpened.toLowerCase() === original.toLowerCase()
  ) {
    return null;
  }

  const formatted = removedLabels.slice(0, 3).map(formatQuotedPhrase);
  const quoted =
    formatted.length === 1
      ? formatted[0]
      : formatted.length === 2
        ? `${formatted[0]} and ${formatted[1]}`
        : `${formatted[0]}, ${formatted[1]}, and ${formatted[2]}`;

  const reason = `Cutting ${quoted} makes your point land with cleaner, more direct authority.`;

  return {
    original,
    sharpened,
    reason,
    offsetMs: best.candidate.offsetMs,
  };
}

// ---------------------------------------------------------------------------
// 4. Personalized Strengths, Improvements & Top Focus Summary
// ---------------------------------------------------------------------------

function getTopRepeatedTerm(terms: string[]): { term: string; count: number } | null {
  if (terms.length === 0) return null;
  const counts = new Map<string, number>();
  for (const raw of terms) {
    const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top: { term: string; count: number } | null = null;
  for (const [term, count] of counts.entries()) {
    if (!top || count > top.count) {
      top = { term, count };
    }
  }
  return top;
}

function buildStrengths(
  input: BuildCoachReportInput,
  annotations: TranscriptAnnotation[],
  totalSteps: number,
): CoachFeedbackItem[] {
  const { lens, mode, metrics } = input;
  const band = LENS_WPM_BANDS[lens];
  const lensLabel = LENS_DISPLAY_LABELS[lens];
  const items: CoachFeedbackItem[] = [];

  const powerPhrases = annotations.filter((a) => a.kind === 'power');

  // 1. Structure coverage
  if (metrics.beatsHit >= totalSteps) {
    const balanced = totalSteps <= 1 || metrics.longestBeatSharePct <= 60;
    items.push({
      id: 'str-structure',
      category: 'structure',
      title:
        totalSteps === 1
          ? 'Completed your planned point'
          : `Answered all ${totalSteps} questions`,
      detail: balanced
        ? 'You moved smoothly through every planned question with balanced pacing and a clear close.'
        : 'You made it through every planned question so your listener got the complete arc.',
    });
  }

  // 2. Pace in sweet spot
  if (
    mode !== 'timer' &&
    metrics.wpm !== null &&
    metrics.wpm >= band.min &&
    metrics.wpm <= band.max
  ) {
    items.push({
      id: 'str-pace',
      category: 'pace',
      title: `Dialed-in ${metrics.wpm} WPM pace`,
      detail: `Right inside the ${band.min}–${band.max} WPM sweet spot for ${lensLabel} — calm, crisp, and easy to follow.`,
    });
  }

  // 3. Dynamic Silences / Power Pauses
  if (mode !== 'timer') {
    if (lens === 'negotiation' && metrics.dynamicSilenceCount >= 1) {
      items.push({
        id: 'str-dynamic-silence',
        category: 'negotiation',
        title: `Held ${metrics.dynamicSilenceCount} Dynamic ${metrics.dynamicSilenceCount === 1 ? 'Silence' : 'Silences'}`,
        detail:
          'Holding 3+ seconds of steady silence lets your questions and boundaries carry real executive weight.',
      });
    } else if (metrics.powerPauseCount >= 2) {
      items.push({
        id: 'str-pauses',
        category: 'pauses',
        title: `Landed ${metrics.powerPauseCount} Power Pauses`,
        detail:
          'Deliberate silent breaths between thoughts project composure and give listeners room to absorb key points.',
      });
    }
  }

  // 4. Crisp filler control
  if (
    mode !== 'timer' &&
    metrics.fillersPerMin !== null &&
    metrics.fillersPerMin <= 3 &&
    metrics.wordCount >= 10
  ) {
    items.push({
      id: 'str-fillers',
      category: 'fillers',
      title:
        metrics.fillerCount === 0
          ? 'Zero filler words'
          : `Crisp filler control (${metrics.fillersPerMin}/min)`,
      detail:
        metrics.fillerCount === 0
          ? `Clean, intentional delivery across ${metrics.wordCount} words with zero verbal crutches.`
          : `Just ${metrics.fillerCount} minor ${metrics.fillerCount === 1 ? 'filler' : 'fillers'} across the take — comfortably under the 3/min goal.`,
    });
  }

  // 5. Power phrases / signposts used
  if (powerPhrases.length >= 1) {
    const uniqueExamples: string[] = [];
    for (const p of powerPhrases) {
      const normalized = p.text.trim();
      if (
        !uniqueExamples.some(
          (existing) => existing.toLowerCase() === normalized.toLowerCase(),
        )
      ) {
        uniqueExamples.push(normalized);
      }
      if (uniqueExamples.length >= 2) break;
    }
    const quoted = uniqueExamples.map((e) => `“${e}”`).join(' and ');
    items.push({
      id: 'str-power-phrases',
      category: lens === 'negotiation' ? 'negotiation' : 'clarity',
      title:
        lens === 'negotiation'
          ? 'Strong empathy & framing cues'
          : 'Clear verbal signposts',
      detail: `Using ${quoted} helped guide your listener smoothly from one idea to the next.`,
    });
  }

  // 6. Web Audio fallback strengths (when Speech API unavailable)
  if (mode !== 'timer' && !metrics.speechRecognitionSupported) {
    if (metrics.vocalExpressiveness >= 45) {
      items.push({
        id: 'str-expressiveness',
        category: 'pace',
        title: `Expressive vocal range (${metrics.vocalExpressiveness}%)`,
        detail:
          'Your voice carried lively dynamic contrast instead of flattening into a monotone.',
      });
    }
    if (metrics.speakingRatio >= 50 && metrics.speakingRatio <= 86) {
      items.push({
        id: 'str-speaking-ratio',
        category: 'clarity',
        title: `Balanced speaking rhythm (${metrics.speakingRatio}% voiced)`,
        detail:
          'You kept a steady balance between speaking energy and natural breathing room.',
      });
    }
  }

  // Guarantee at least 2 authentic, encouraging strengths
  if (items.length < 2 && mode !== 'timer' && metrics.powerPauseCount === 1) {
    items.push({
      id: 'str-one-pause',
      category: 'pauses',
      title: 'Landed a clean deliberate pause',
      detail:
        'You held a full 1+ second silent pause — a great habit to repeat right after your main claim.',
    });
  }

  if (items.length < 2) {
    items.push({
      id: 'str-rep-completed',
      category: 'opening',
      title: `Completed a focused ${metrics.durationSec}s rep`,
      detail:
        'Practicing out loud under a live clock builds real recall far faster than silently rehearsing in your head.',
    });
  }

  if (items.length < 2) {
    items.push({
      id: 'str-structured-prep',
      category: 'structure',
      title: 'Practiced with question cue cards',
      detail:
        'Speaking from short prompts instead of a full script trains natural, conversational confidence.',
    });
  }

  return items.slice(0, 3);
}

function buildImprovements(
  input: BuildCoachReportInput,
  annotations: TranscriptAnnotation[],
  totalSteps: number,
): CoachFeedbackItem[] {
  const { lens, mode, metrics, fillers } = input;
  const band = LENS_WPM_BANDS[lens];
  const lensLabel = LENS_DISPLAY_LABELS[lens];
  const items: CoachFeedbackItem[] = [];

  const hedges = annotations.filter((a) => a.kind === 'hedge');
  const powerPhrases = annotations.filter((a) => a.kind === 'power');

  // 1. Missed questions / beats
  if (metrics.beatsHit < totalSteps) {
    items.push({
      id: 'imp-structure',
      category: 'structure',
      title: `Cover all ${totalSteps} questions (${metrics.beatsHit}/${totalSteps} hit)`,
      detail:
        'Tap Space a touch earlier on early questions so you have breathing room to land your final takeaway.',
    });
  }

  // 2. High fillers — name the user's top repeated filler word
  if (mode !== 'timer' && metrics.fillersPerMin !== null && metrics.fillersPerMin > 3) {
    const topFiller = getTopRepeatedTerm(fillers.map((f) => f.word));
    const displayFiller = topFiller ? formatDisplayTerm(topFiller.term) : null;
    items.push({
      id: 'imp-fillers',
      category: 'fillers',
      title: displayFiller
        ? `Trim “${displayFiller}” (${metrics.fillersPerMin}/min)`
        : `Swap fillers for breath (${metrics.fillersPerMin}/min)`,
      detail:
        topFiller && displayFiller
          ? `You leaned on “${displayFiller}” ${topFiller.count} ${topFiller.count === 1 ? 'time' : 'times'}. Replace your next filler with a quiet 1.5s breath while you gather the next thought.`
          : `You averaged ${metrics.fillersPerMin} fillers/min. Trade verbal crutches for a calm 1.5s silent breath between ideas.`,
    });
  }

  // 3. Pace outside lens target band
  if (mode !== 'timer' && metrics.wpm !== null) {
    if (metrics.wpm > band.max) {
      items.push({
        id: 'imp-pace-fast',
        category: 'pace',
        title: `Slow down from ${metrics.wpm} WPM`,
        detail: `Target ${band.min}–${band.max} WPM for ${lensLabel}. Ease off 10–15% on your headline claim and drop your tone at sentence ends.`,
      });
    } else if (metrics.wpm < band.min) {
      items.push({
        id: 'imp-pace-slow',
        category: 'pace',
        title: `Lift vocal momentum (${metrics.wpm} WPM)`,
        detail: `Aim closer to ${band.min}–${band.max} WPM for ${lensLabel} so your energy stays crisp and forward-moving.`,
      });
    }
  }

  // 4. Pauses & Negotiation Dynamic Silence
  if (mode !== 'timer') {
    if (lens === 'negotiation' && metrics.dynamicSilenceCount < 1) {
      items.push({
        id: 'imp-dynamic-silence',
        category: 'negotiation',
        title: 'Hold one 3s Dynamic Silence',
        detail:
          'Right after your label or calibrated “How/What” question, stay silent for 3 full seconds and resist filling the air.',
      });
    } else if (metrics.powerPauseCount < 2) {
      items.push({
        id: 'imp-pauses',
        category: 'pauses',
        title: 'Add 1–2 Power Pauses',
        detail:
          'Pause for a full 1.5–2.5 seconds right after your main point so it lands cleanly instead of blurring into the next line.',
      });
    }
  }

  // 5. Confidence-softening hedges
  if (mode !== 'timer' && hedges.length >= 2) {
    const topHedge = getTopRepeatedTerm(hedges.map((h) => h.text));
    const displayHedge = topHedge ? formatDisplayTerm(topHedge.term) : null;
    items.push({
      id: 'imp-hedges',
      category: 'hedges',
      title: `Cut softening hedges (${hedges.length} spotted)`,
      detail: displayHedge
        ? `Phrases like “${displayHedge}” quietly dilute authority. State your view plainly without apologizing or cushioning.`
        : 'Remove softening words like “maybe” or “just” so your core recommendation sounds settled and clear.',
    });
  }

  // 6. Uneven time spent on a single question
  if (totalSteps > 1 && metrics.longestBeatSharePct > 60) {
    items.push({
      id: 'imp-uneven-beats',
      category: 'structure',
      title: `Tighten your longest step (${metrics.longestBeatSharePct}% of take)`,
      detail:
        'One question took over 60% of your total time. Trim the setup so every point gets crisp, balanced weight.',
    });
  }

  // 7. Missing signposts / empathy cues
  if (mode !== 'timer' && metrics.wordCount >= 18 && powerPhrases.length === 0) {
    items.push({
      id: 'imp-signposts',
      category: lens === 'negotiation' ? 'negotiation' : 'clarity',
      title:
        lens === 'negotiation'
          ? 'Open with a Tactical Empathy cue'
          : 'Drop in verbal signposts',
      detail:
        lens === 'negotiation'
          ? 'Anchor your response with “It sounds like…” or a calibrated “How can we…” question to keep tension low.'
          : 'Use ear-friendly markers like “Bottom line,” “First,” or “For example” so listeners track your logic effortlessly.',
    });
  }

  // 8. Timer mode coaching nudge
  if (mode === 'timer') {
    items.push({
      id: 'imp-enable-mic',
      category: 'clarity',
      title: 'Switch on Audio or Camera for Take 2',
      detail:
        'Timer Mode tracks question pacing cleanly; enabling your mic unlocks live WPM, Power Pauses, annotated transcripts, and line rewrites.',
    });
  }

  // Ensure 2–3 useful coaching tips even on near-perfect takes
  if (items.length < 2) {
    items.push({
      id: 'imp-polish-opening',
      category: 'opening',
      title: 'Sharpen your first 5 seconds',
      detail:
        'Start directly on your headline answer with zero throat-clearing so you earn full attention immediately.',
    });
  }

  if (items.length < 2) {
    items.push({
      id: 'imp-polish-finish',
      category: 'clarity',
      title: 'Hold steady presence through the final beat',
      detail:
        'Dial vocal warmth up 10% and keep your eyes anchored on the lens for two quiet seconds after your final word.',
    });
  }

  return items.slice(0, 3);
}

function buildTopFocusSummary(
  input: BuildCoachReportInput,
  hedgeCount: number,
  totalSteps: number,
): string {
  const { lens, mode, metrics } = input;
  const band = LENS_WPM_BANDS[lens];

  if (metrics.beatsHit < totalSteps) {
    return 'Answer every planned question cleanly';
  }
  if (mode === 'timer') {
    return 'Turn on mic for voice coaching';
  }
  if (metrics.fillersPerMin !== null && metrics.fillersPerMin > 3) {
    return 'Swap fillers for clean pauses';
  }
  if (metrics.wpm !== null && metrics.wpm > band.max) {
    return 'Slow down on key points';
  }
  if (metrics.wpm !== null && metrics.wpm < band.min) {
    return 'Bring up speaking momentum';
  }
  if (lens === 'negotiation' && metrics.dynamicSilenceCount < 1) {
    return 'Hold a 3s Dynamic Silence';
  }
  if (metrics.powerPauseCount < 2) {
    return 'Hold a 2s pause after key points';
  }
  if (hedgeCount >= 2) {
    return 'Cut hedges for firmer conviction';
  }
  return 'Elevate warmth and lens eye-line';
}

// ---------------------------------------------------------------------------
// 5. Public Coach Report Builders
// ---------------------------------------------------------------------------

export function buildCoachReport(input: BuildCoachReportInput): CoachReport {
  const totalSteps = Math.max(1, input.questionsCount || input.metrics.totalBeats);
  const annotations = annotateTranscriptText(input.transcript, input.lens);
  const hedgeCount = annotations.filter((a) => a.kind === 'hedge').length;
  const powerPhraseCount = annotations.filter((a) => a.kind === 'power').length;

  const { pace, pauses, clarity, structure, overallScore } = computeSubscores(
    input,
    hedgeCount,
    powerPhraseCount,
    totalSteps,
  );

  const verdict = getVerdictForScore(overallScore);
  const strengths = buildStrengths(input, annotations, totalSteps);
  const improvements = buildImprovements(input, annotations, totalSteps);
  const rewriteTip =
    input.mode === 'timer'
      ? null
      : buildLineRewriteTip(input.transcript, input.transcriptChunks, input.lens);
  const topFocusSummary = buildTopFocusSummary(input, hedgeCount, totalSteps);

  return {
    overallScore,
    verdict,
    subscores: {
      pace,
      pauses,
      clarity,
      structure,
    },
    strengths,
    improvements,
    rewriteTip,
    hedgeCount,
    powerPhraseCount,
    topFocusSummary,
  };
}

/**
 * Returns the stored CoachReport if present, or synthesizes a complete report
 * cleanly from legacy SessionRecords in localStorage.
 */
export function ensureCoachReport(session: SessionRecord): CoachReport {
  if (session.coachReport) {
    return session.coachReport;
  }

  return buildCoachReport({
    lens: session.lens,
    mode: session.mode,
    metrics: session.metrics,
    transcript: session.transcript,
    transcriptChunks: session.transcriptChunks,
    pauses: session.pauses,
    fillers: session.fillers,
    questionsCount:
      session.questionSnapshots && session.questionSnapshots.length > 0
        ? session.questionSnapshots.length
        : session.metrics.totalBeats,
  });
}
