import type { Scenario } from '../types/cadence';

export const SCENARIOS: Scenario[] = [
  // -------------------------------------------------------------------------
  // Lens A: Camera & Presence (3 curated scenarios)
  // -------------------------------------------------------------------------
  {
    id: 'cam-intro',
    title: '60-Second Video Intro That Lands',
    lens: 'camera',
    frameworkId: 'what-so-what',
    durationSec: 60,
    stakes:
      'You are recording a crisp welcome video for a new team or leadership cohort — zero “uh, hi everyone.”',
    prompt:
      'Introduce who you are, the one problem you love solving, and how you want to collaborate.',
    presenceCue:
      'Hold the lens for 1 quiet breath before word one; finish with a warm 2-second pause.',
    outlineHints: ['Role in 5 words', 'Problem you love', 'Invite to connect'],
  },
  {
    id: 'cam-allhands',
    title: 'All-Hands Camera Pitch',
    lens: 'camera',
    frameworkId: 'hook-psi',
    durationSec: 75,
    stakes:
      '120 remote teammates are half-checking Slack. You have 75 seconds on webcam to win backing for a Q3 workflow shift.',
    prompt:
      'Open with the cost of doing nothing, signpost your 3-part fix, and land the concrete payoff.',
    presenceCue:
      'Lift vocal energy +15% for the camera; keep gestures crisp inside your chest-to-waist box.',
    outlineHints: [
      'Cost of status quo',
      '3 crisp shift labels',
      'Measurable Q3 payoff',
    ],
  },
  {
    id: 'cam-badnews',
    title: 'Async Exec Video: Bad News With Composure',
    lens: 'camera',
    frameworkId: 'bluf-pyramid',
    durationSec: 60,
    stakes:
      'A flagship launch slipped 10 days. You are recording a 60-second video update for the VP instead of hiding behind an email wall.',
    prompt:
      'Give the new date in sentence one, share the root cause plus two mitigations, and state what you need from leadership.',
    presenceCue:
      'Hold steady lens eye-line and use downward vocal endings — zero apologetic uptalk.',
    outlineHints: ['New launch date', 'Root cause + 2 fixes', 'Support needed now'],
  },

  // -------------------------------------------------------------------------
  // Lens B: Clear Thinking on the Spot (3 curated scenarios)
  // -------------------------------------------------------------------------
  {
    id: 'think-spot',
    title: 'Put on the Spot: “Where Do You Stand?”',
    lens: 'clarity',
    frameworkId: 'prep',
    durationSec: 60,
    stakes:
      'Mid-meeting, the director turns straight to you: “Ship fast with rough edges or delay two weeks for polish — your call?”',
    prompt:
      'Pick a clear side immediately, justify the trade-off, cite one precedent, and close cleanly.',
    presenceCue:
      'Take a 2-second silent breath before answering — silence looks thoughtful, “um” looks rattled.',
    outlineHints: ['Ship vs. polish call', 'Core trade-off', 'One quick precedent'],
  },
  {
    id: 'think-elevator',
    title: '45-Second CEO Elevator Pulse',
    lens: 'clarity',
    frameworkId: 'what-so-what',
    durationSec: 45,
    stakes:
      'An executive sponsor steps into the elevator and asks: “Quick version — how is your initiative really going?”',
    prompt:
      'Give the honest status, why it matters to company goals, and the exact next milestone before the doors open.',
    presenceCue:
      'Cut every throat-clearing filler; signpost cleanly so every sentence earns air time.',
    outlineHints: [
      'Honest 1-line pulse',
      'Link to top goals',
      'Next milestone + date',
    ],
  },
  {
    id: 'think-qa',
    title: 'Hostile Q&A Curveball',
    lens: 'clarity',
    frameworkId: 'bluf-pyramid',
    durationSec: 60,
    stakes:
      'After your pitch, a skeptical stakeholder cuts in: “Honestly, this looks over-engineered. Why not just stick with our spreadsheet?”',
    prompt:
      'Answer directly upfront, give 2–3 structured reasons tied to risk and scale, cite one real cost of staying put, and invite alignment.',
    presenceCue:
      'Keep shoulders loose and tone warm — treat pushback as curiosity, never combat.',
    outlineHints: [
      'Direct answer first',
      '2–3 spreadsheet risks',
      'Cost of staying put',
    ],
  },

  // -------------------------------------------------------------------------
  // Lens C: High-Stakes Negotiation (3 curated scenarios)
  // -------------------------------------------------------------------------
  {
    id: 'neg-salary',
    title: 'Salary Counter: “Outside Our Band”',
    lens: 'negotiation',
    frameworkId: 'principled-pushback',
    durationSec: 75,
    stakes:
      'You received a strong job offer, but base comp sits 15% below market for the scope you will own. You are live on video with the hiring manager.',
    prompt:
      'Validate their band constraint, anchor calmly to objective market scope, state your range or alternative warmly, and ask a calibrated “How/What” question.',
    presenceCue:
      'Drop into a slow Late-Night FM DJ cadence (~125–135 WPM) and hold 4 seconds of silence after your calibrated question.',
    counterpartRole: 'Hiring Manager',
    openingPushback:
      'We really want you here, but that number sits outside our approved band — we’d have to pay more than anyone else at this level.',
    outlineHints: [
      'Validate band limit',
      'Market scope anchor',
      'Soft BATNA + How ask',
    ],
  },
  {
    id: 'neg-client',
    title: 'Client Scope Creep & 20% Discount Demand',
    lens: 'negotiation',
    frameworkId: 'tactical-empathy',
    durationSec: 75,
    stakes:
      'A key client wants two major deliverables bundled into an ongoing engagement — while asking for a 20% fee cut on renewal.',
    prompt:
      'Mirror their budget pressure, label the squeeze they face with their CFO, ask a calibrated question, and hold 4 seconds of dynamic silence.',
    presenceCue:
      'Mirror with genuine curiosity (never sarcasm), avoid “I feel”, and let post-question silence do the heavy lifting.',
    counterpartRole: 'VP Client Sponsor',
    openingPushback:
      'Our CFO is slashing vendor spend across the board. We need you to bundle the analytics module and bring renewal down 20%.',
    outlineHints: ['2–3 word mirror', 'Label CFO pressure', 'Calibrated How + 4s'],
  },
  {
    id: 'neg-deadline',
    title: 'Push Back on an Impossible Deadline',
    lens: 'negotiation',
    frameworkId: 'tactical-empathy',
    durationSec: 60,
    stakes:
      'An executive demands a complex launch three weeks early with zero extra headcount or scope cuts.',
    prompt:
      'Mirror and label the board pressure they carry, avoid a defensive “no”, and pivot with a calibrated “What/How” trade-off question.',
    presenceCue:
      'Exhale before answering so your tone stays grounded and collaborative — never clipped or defensive.',
    counterpartRole: 'Executive Sponsor',
    openingPushback:
      'The board expects this live by the 15th. I don’t want excuses — figure out how to ship the full scope.',
    outlineHints: [
      'Mirror “by the 15th?”',
      'Label board stakes',
      '“What must ship?”',
    ],
  },
];

export function getScenarioById(
  id: string,
  customScenarios?: Scenario[]
): Scenario | undefined {
  if (customScenarios && customScenarios.length > 0) {
    const customMatch = customScenarios.find((scenario) => scenario.id === id);
    if (customMatch) {
      return customMatch;
    }
  }
  return SCENARIOS.find((scenario) => scenario.id === id);
}

function getLocalDaySeed(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getTodaysScenario(
  scenarios: Scenario[] = SCENARIOS,
  practicedIds: string[] = []
): Scenario {
  const pool = scenarios.length > 0 ? scenarios : SCENARIOS;
  const baseIndex = getLocalDaySeed() % pool.length;
  if (practicedIds.length === 0) {
    return pool[baseIndex];
  }
  const practicedSet = new Set(practicedIds);
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(baseIndex + offset) % pool.length];
    if (!practicedSet.has(candidate.id)) {
      return candidate;
    }
  }
  return pool[baseIndex];
}
