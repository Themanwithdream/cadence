import type { Framework, FrameworkId, Lens, LensMeta } from '../types/cadence';

export const LENS_META: Record<Lens, LensMeta> = {
  camera: {
    id: 'camera',
    label: 'Camera & Presence',
    shortLabel: 'Presence',
    tagline:
      'Anchor the lens, breathe into power pauses, and lift vocal warmth on screen.',
    targetWpmMin: 140,
    targetWpmMax: 160,
  },
  clarity: {
    id: 'clarity',
    label: 'Clear Thinking',
    shortLabel: 'Clarity',
    tagline:
      'Lead with the bottom line, signpost your structure, and land cleanly under pressure.',
    targetWpmMin: 130,
    targetWpmMax: 155,
  },
  negotiation: {
    id: 'negotiation',
    label: 'Negotiation',
    shortLabel: 'Negotiation',
    tagline:
      'Disarm tension with tactical empathy, ask calibrated questions, and let dynamic silence work.',
    targetWpmMin: 120,
    targetWpmMax: 140,
  },
};

export const FRAMEWORKS: Framework[] = [
  {
    id: 'bluf-pyramid',
    name: 'BLUF / Pyramid',
    shortName: 'BLUF',
    primaryLens: 'clarity',
    secondaryLenses: ['camera'],
    summary:
      'Start with the answer first, signpost your supporting pillars, and back it with one crisp piece of proof.',
    bestFor: 'Executive updates, async leadership videos, tough Q&A, and decisive recommendations.',
    beats: [
      {
        id: 'bluf-1',
        index: 0,
        label: 'Bottom Line',
        secHint: 10,
        livePrompt: 'Lead with your answer in one crisp sentence — zero warmup.',
        starterCue: '“My recommendation is…”',
      },
      {
        id: 'bluf-2',
        index: 1,
        label: 'Signpost Pillars',
        secHint: 15,
        livePrompt: 'Preview 2–3 reasons so listeners can map your logic by ear.',
        starterCue: '“Three reasons drive this: first…”',
      },
      {
        id: 'bluf-3',
        index: 2,
        label: 'Anchor Proof',
        secHint: 25,
        livePrompt: 'Drop one concrete metric, precedent, or lived example.',
        starterCue: '“Last quarter / In practice, we saw…”',
      },
      {
        id: 'bluf-4',
        index: 3,
        label: 'Clean Close',
        secHint: 10,
        livePrompt: 'Restate the decision, name the next step, and drop your tone.',
        starterCue: '“So let’s commit to…”',
      },
    ],
  },
  {
    id: 'prep',
    name: 'PREP',
    shortName: 'PREP',
    primaryLens: 'clarity',
    secondaryLenses: ['camera'],
    summary:
      'Take an unmistakable stand, give one compelling reason, ground it with an example, and echo your thesis.',
    bestFor: 'Impromptu opinions, “What do you think?” questions, podcast interviews, and hiring panels.',
    beats: [
      {
        id: 'prep-1',
        index: 0,
        label: 'Point',
        secHint: 10,
        livePrompt: 'Take a clear stance in your very first sentence.',
        starterCue: '“I believe the right move is…”',
      },
      {
        id: 'prep-2',
        index: 1,
        label: 'Reason',
        secHint: 15,
        livePrompt: 'Give the single strongest “why” behind your view.',
        starterCue: '“The core reason is…”',
      },
      {
        id: 'prep-3',
        index: 2,
        label: 'Example',
        secHint: 25,
        livePrompt: 'Make it vivid with a brief story, data point, or precedent.',
        starterCue: '“For example, when we…”',
      },
      {
        id: 'prep-4',
        index: 3,
        label: 'Point (Echo)',
        secHint: 10,
        livePrompt: 'Land the plane — echo your thesis calmly and hold a brief pause.',
        starterCue: '“That’s why I stand by…”',
      },
    ],
  },
  {
    id: 'what-so-what',
    name: 'What · So What · Now What',
    shortName: 'What · So What',
    primaryLens: 'clarity',
    secondaryLenses: ['camera'],
    summary:
      'Turn messy moments into three effortless beats: the core reality, why it matters, and the immediate next step.',
    bestFor: 'Rapid spotlights, video introductions, elevator updates, and calming a spinning room.',
    beats: [
      {
        id: 'wsn-1',
        index: 0,
        label: 'What',
        secHint: 15,
        livePrompt: 'Name the core fact, role, or situation plainly — no jargon.',
        starterCue: '“Here is where things stand…”',
      },
      {
        id: 'wsn-2',
        index: 1,
        label: 'So What',
        secHint: 25,
        livePrompt: 'Translate why this matters directly to the listener right now.',
        starterCue: '“Why this matters to you is…”',
      },
      {
        id: 'wsn-3',
        index: 2,
        label: 'Now What',
        secHint: 20,
        livePrompt: 'Deliver one unmistakable action or takeaway, then pause 2 seconds.',
        starterCue: '“Our immediate move is…”',
      },
    ],
  },
  {
    id: 'hook-psi',
    name: 'Hook · Problem · Solution · Impact',
    shortName: 'Hook · PSI',
    primaryLens: 'camera',
    secondaryLenses: ['clarity'],
    summary:
      'Win the first 10 seconds on camera with contrast, frame the real pain, signpost a Rule-of-3 fix, and land the payoff.',
    bestFor: 'All-hands camera pitches, keynote openers, town halls, and persuasive product stories.',
    beats: [
      {
        id: 'hpsi-1',
        index: 0,
        label: 'Lens Hook',
        secHint: 10,
        livePrompt: 'Hold the lens for one quiet breath, then open with stakes or sharp contrast.',
        starterCue: '“Right now, [sharp contrast or cost]…”',
      },
      {
        id: 'hpsi-2',
        index: 1,
        label: 'Problem',
        secHint: 15,
        livePrompt: 'Name the real bottleneck in plain human language.',
        starterCue: '“The core bottleneck is…”',
      },
      {
        id: 'hpsi-3',
        index: 2,
        label: 'Solution (Rule of 3)',
        secHint: 25,
        livePrompt: 'Frame the fix in 2–3 crisp, verbally signposted shifts.',
        starterCue: '“We fix this in three ways: first…”',
      },
      {
        id: 'hpsi-4',
        index: 3,
        label: 'Impact',
        secHint: 15,
        livePrompt: 'Paint the measurable before-and-after, then hold a 2s power pause.',
        starterCue: '“The result: [concrete payoff].”',
      },
    ],
  },
  {
    id: 'tactical-empathy',
    name: 'Tactical Empathy Loop',
    shortName: 'Tactical Empathy',
    primaryLens: 'negotiation',
    summary:
      'Lower defenses fast using Chris Voss’s sequence: Mirror key words, Label their constraint, ask a Calibrated Question, and hold Dynamic Silence.',
    bestFor: 'Scope creep, surprise price hikes, impossible deadlines, and uncovering hidden leverage.',
    beats: [
      {
        id: 'te-1',
        index: 0,
        label: 'Mirror',
        secHint: 8,
        livePrompt: 'Echo their last 1–3 critical words with calm, upward curiosity.',
        starterCue: '“[…their last 2–3 words]?”',
      },
      {
        id: 'te-2',
        index: 1,
        label: 'Label',
        secHint: 15,
        livePrompt: 'Name their emotion or pressure without saying “I”.',
        starterCue: '“It sounds like… / It seems like…”',
      },
      {
        id: 'te-3',
        index: 2,
        label: 'Calibrated Question',
        secHint: 20,
        livePrompt: 'Ask an open “How” or “What” question so they help solve your constraint.',
        starterCue: '“How am I supposed to…? / What would it take…?”',
      },
      {
        id: 'te-4',
        index: 3,
        label: 'Dynamic Silence',
        secHint: 5,
        livePrompt: 'Stop talking. Hold steady lens eye-line for 4 calm seconds.',
        starterCue: '[Breathe · Hold 4s silence]',
      },
    ],
  },
  {
    id: 'principled-pushback',
    name: 'Principled Pushback',
    shortName: 'Principled Pushback',
    primaryLens: 'negotiation',
    summary:
      'Disarm skepticism with an Accusation Audit, anchor to Objective Criteria, state a calm boundary or soft BATNA, and pivot collaboratively.',
    bestFor: 'Salary negotiations, partnership equity resets, executive boundaries, and unfair terms.',
    beats: [
      {
        id: 'pp-1',
        index: 0,
        label: 'Audit / Validate',
        secHint: 12,
        livePrompt: 'Disarm tension upfront by naming their skepticism or priority.',
        starterCue: '“You might feel I’m pushing hard… / I hear how vital [X] is…”',
      },
      {
        id: 'pp-2',
        index: 1,
        label: 'Objective Criteria',
        secHint: 20,
        livePrompt: 'Shift from ego to market benchmarks, scope data, or a calibrated range.',
        starterCue: '“Looking at market benchmarks / comparable scope…”',
      },
      {
        id: 'pp-3',
        index: 2,
        label: 'Calm Boundary / BATNA',
        secHint: 18,
        livePrompt: 'State your floor or alternative in a low, downward tone — never a threat.',
        starterCue: '“My preference is to work with you, and my realistic floor is…”',
      },
      {
        id: 'pp-4',
        index: 3,
        label: 'Collaborative Pivot',
        secHint: 15,
        livePrompt: 'Hand the puzzle back with a “How/What” question, then hold 3–4s silence.',
        starterCue: '“Given that, how can we structure this so we both win?”',
      },
    ],
  },
];

export const FRAMEWORK_MAP: Record<FrameworkId, Framework> = FRAMEWORKS.reduce(
  (acc, framework) => {
    acc[framework.id] = framework;
    return acc;
  },
  {} as Record<FrameworkId, Framework>
);

export function getFrameworkById(id: FrameworkId): Framework {
  return FRAMEWORK_MAP[id] ?? FRAMEWORKS[0];
}
