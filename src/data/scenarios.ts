import type { Lens, Scenario, ScenarioTemplate } from '../types/cadence';

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
    questions: [
      {
        id: 'cam-intro-q1',
        text: 'Who are you, and what do you focus on right now?',
        hint: 'What · Open directly — skip “uh, hi everyone”',
      },
      {
        id: 'cam-intro-q2',
        text: 'What problem do you genuinely love solving — and why does it matter?',
        hint: 'So What · Share one specific friction you care about',
      },
      {
        id: 'cam-intro-q3',
        text: 'How should teammates or peers reach out and work with you?',
        hint: 'Now What · Give one warm, concrete invitation and pause',
      },
    ],
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
    questions: [
      {
        id: 'cam-allhands-q1',
        text: 'What is the hidden cost of keeping our current workflow?',
        hint: 'Lens Hook · Lead with one sharp contrast or stat',
      },
      {
        id: 'cam-allhands-q2',
        text: 'Where is the real bottleneck slowing the team down?',
        hint: 'Problem · Name the pain in plain human words',
      },
      {
        id: 'cam-allhands-q3',
        text: 'What are the three concrete shifts you are proposing?',
        hint: 'Solution · Signpost clearly: First, Second, Third',
      },
      {
        id: 'cam-allhands-q4',
        text: 'What measurably improves in Q3 if we commit today?',
        hint: 'Impact · Paint the payoff, then hold a 2s power pause',
      },
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
    questions: [
      {
        id: 'cam-badnews-q1',
        text: 'What is the new launch date and headline status?',
        hint: 'Bottom Line · State the date in sentence one',
      },
      {
        id: 'cam-badnews-q2',
        text: 'What caused the slip, and what two guardrails prevent it repeating?',
        hint: 'Signpost Pillars · Keep tone calm and factual',
      },
      {
        id: 'cam-badnews-q3',
        text: 'What concrete proof shows the revised date will hold?',
        hint: 'Anchor Proof · Cite one verified milestone or test',
      },
      {
        id: 'cam-badnews-q4',
        text: 'What exact decision or support do you need from leadership?',
        hint: 'Clean Close · Drop tone cleanly — zero apologetic uptalk',
      },
    ],
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
    questions: [
      {
        id: 'think-spot-q1',
        text: 'Ship fast with rough edges or delay two weeks — where do you stand?',
        hint: 'Point · Pick one clear side in sentence one',
      },
      {
        id: 'think-spot-q2',
        text: 'What is the single strongest trade-off driving your call?',
        hint: 'Reason · Anchor on the one factor that decides it',
      },
      {
        id: 'think-spot-q3',
        text: 'What past launch or user signal backs up that judgment?',
        hint: 'Example · Share one tight 15-second precedent',
      },
      {
        id: 'think-spot-q4',
        text: 'So what should the team commit to right after this meeting?',
        hint: 'Point (Echo) · Restate your stance calmly and pause',
      },
    ],
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
    questions: [
      {
        id: 'think-elevator-q1',
        text: 'In one sentence, how is your initiative actually doing right now?',
        hint: 'What · Honest pulse — green, yellow, or red',
      },
      {
        id: 'think-elevator-q2',
        text: 'Why does that momentum or risk matter to top company goals?',
        hint: 'So What · Connect straight to customers or revenue',
      },
      {
        id: 'think-elevator-q3',
        text: 'What is the next concrete milestone and target date?',
        hint: 'Now What · Land one crisp date before doors open',
      },
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
    questions: [
      {
        id: 'think-qa-q1',
        text: 'Why not just keep our spreadsheet instead of building this?',
        hint: 'Bottom Line · Answer calmly and directly upfront',
      },
      {
        id: 'think-qa-q2',
        text: 'What two or three real limits break down as we scale?',
        hint: 'Signpost Pillars · First, Second, Third — zero defensiveness',
      },
      {
        id: 'think-qa-q3',
        text: 'What real cost or error has the spreadsheet already caused?',
        hint: 'Anchor Proof · Drop one concrete number or incident',
      },
      {
        id: 'think-qa-q4',
        text: 'What low-risk pilot proves value before we go all-in?',
        hint: 'Clean Close · Invite alignment with a clear next step',
      },
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
    questions: [
      {
        id: 'neg-salary-q1',
        text: 'How do you validate their band limit without backing down?',
        hint: 'Audit / Validate · Warm tone, acknowledge internal fairness',
      },
      {
        id: 'neg-salary-q2',
        text: 'What objective market data or scope justifies your target range?',
        hint: 'Objective Criteria · Shift from ego to comparable scope',
      },
      {
        id: 'neg-salary-q3',
        text: 'How do you state your floor or other options without sounding like a threat?',
        hint: 'Calm Boundary · Low downward tone, express preference',
      },
      {
        id: 'neg-salary-q4',
        text: 'What calibrated “How/What” question invites them to bridge the gap?',
        hint: 'Collaborative Pivot · Ask cleanly, then hold 4s silence',
      },
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
    questions: [
      {
        id: 'neg-client-q1',
        text: 'Which 2–3 words from their demand will you mirror with calm curiosity?',
        hint: 'Mirror · Echo “bring renewal down 20%?” gently',
      },
      {
        id: 'neg-client-q2',
        text: 'How do you label the CFO pressure they feel without saying “I”?',
        hint: 'Label · Start with “It sounds like…” or “It seems like…”',
      },
      {
        id: 'neg-client-q3',
        text: 'What “How am I supposed to…” question puts the scope trade-off back on them?',
        hint: 'Calibrated Question · Protect quality without a hard “no”',
      },
      {
        id: 'neg-client-q4',
        text: 'Hold 4 calm seconds of silence — what options do you invite them to propose?',
        hint: 'Dynamic Silence · Breathe, hold lens, let them fill the air',
      },
    ],
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
    questions: [
      {
        id: 'neg-deadline-q1',
        text: 'What exact 2–3 words from the executive will you mirror calmly?',
        hint: 'Mirror · Softly echo “live by the 15th?”',
      },
      {
        id: 'neg-deadline-q2',
        text: 'How do you label the board visibility stakes they are carrying?',
        hint: 'Label · “It sounds like the board demo is critical…”',
      },
      {
        id: 'neg-deadline-q3',
        text: 'What “What/How” question forces a clear scope-versus-date choice?',
        hint: 'Calibrated Question · “What must be live on the 15th?”',
      },
      {
        id: 'neg-deadline-q4',
        text: 'Hold 4 calm seconds — let them reveal what truly matters most.',
        hint: 'Dynamic Silence · Stay grounded and wait for their trade-off',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Create View: 1-Click Scenario Templates & Question Suggestion Chips
// ---------------------------------------------------------------------------

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'tpl-camera',
    label: 'Camera / YouTube Video',
    description:
      'Hook viewers in 10 seconds, share one sharp insight, and land a clean takeaway.',
    lens: 'camera',
    frameworkId: 'hook-psi',
    durationSec: 60,
    defaultTitle: '60-Second Camera Take',
    defaultStakes:
      'You are recording a crisp short-form video or async update — win attention fast and speak straight to the lens.',
    defaultQuestions: [
      'What surprising hook or contrast grabs attention in the first 10 seconds?',
      'What is your main insight — and one real example that proves it?',
      'What is the single takeaway or action you want viewers to remember?',
    ],
  },
  {
    id: 'tpl-interview',
    label: 'Job Interview Answer',
    description:
      'Lead with a clear stance, tell a tight story with measurable impact, and tie it to the role.',
    lens: 'clarity',
    frameworkId: 'prep',
    durationSec: 75,
    defaultTitle: 'Behavioral Interview Answer',
    defaultStakes:
      'The hiring panel just asked a high-stakes question — sound structured, calm, and memorable without rambling.',
    defaultQuestions: [
      'What is your clear, one-sentence headline answer upfront?',
      'What specific story, decision, and measurable result proves it?',
      'Why does that experience directly matter for this role and team?',
    ],
  },
  {
    id: 'tpl-pitch',
    label: 'Work Pitch or Update',
    description:
      'Deliver your bottom line first, back it with crisp proof, and close with an unmistakable ask.',
    lens: 'clarity',
    frameworkId: 'bluf-pyramid',
    durationSec: 60,
    defaultTitle: 'Executive Pitch or Status Update',
    defaultStakes:
      'Busy stakeholders gave you 60 seconds — lead with your recommendation and leave zero ambiguity.',
    defaultQuestions: [
      'What is your bottom-line recommendation or headline update?',
      'What two or three reasons and one concrete proof point back it up?',
      'What exact decision, alignment, or next step are you asking for?',
    ],
  },
  {
    id: 'tpl-negotiation',
    label: 'Salary or Deal Negotiation',
    description:
      'Respond calmly to live pushback using empathy labels, objective benchmarks, and calibrated questions.',
    lens: 'negotiation',
    frameworkId: 'tactical-empathy',
    durationSec: 75,
    defaultTitle: 'Compensation or Deal Counter',
    defaultStakes:
      'You are facing live pushback on price, scope, or compensation — stay warm, grounded, and collaborative under pressure.',
    defaultRole: 'Hiring Manager / Client',
    defaultPushback:
      'We really want to move forward together, but your number is above what we budgeted for this quarter.',
    defaultQuestions: [
      'How will you mirror or label their budget constraint calmly?',
      'What objective value, scope, or market benchmark anchors your ask?',
      'What calibrated “How/What” question invites them to bridge the gap — followed by silence?',
    ],
  },
];

export const QUESTION_SUGGESTIONS: Record<Lens, string[]> = {
  camera: [
    'What bold hook grabs attention in the first 10 seconds?',
    'What common mistake or friction are you calling out?',
    'What quick personal story makes this concrete?',
    'What are the three key shifts or takeaways?',
    'What single action should listeners take next?',
  ],
  clarity: [
    'What is my bottom-line answer in one crisp sentence?',
    'What is the strongest reason or trade-off behind this?',
    'What concrete metric or example proves my point?',
    'What real risk happens if we stay with the status quo?',
    'What exact decision or next step am I asking for?',
  ],
  negotiation: [
    'Which 2–3 words of their objection will I mirror?',
    'What pressure or concern are they feeling right now?',
    'What objective benchmark or scope supports my ask?',
    'How do I state my boundary warmly without threatening?',
    'What “How/What” question hands the puzzle back to them?',
  ],
};

// ---------------------------------------------------------------------------
// Scenario Helpers
// ---------------------------------------------------------------------------

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
