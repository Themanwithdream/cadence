import type {
  FrameworkId,
  Lens,
  LensFilter,
  Scenario,
  SessionRecord,
  StreakSummary,
  UserPrefs,
} from '../types/cadence';

export const SESSIONS_STORAGE_KEY = 'cadence.v1.sessions';
export const PREFS_STORAGE_KEY = 'cadence.v1.prefs';
export const CUSTOM_SCENARIOS_STORAGE_KEY = 'cadence.v1.customScenarios';

const MAX_STORED_SESSIONS = 150;
const MAX_CUSTOM_SCENARIOS = 100;

export const DEFAULT_USER_PREFS: UserPrefs = {
  preferredMode: 'camera',
  lastLensFilter: 'all',
};

function getSafeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidPreferredMode(value: unknown): value is UserPrefs['preferredMode'] {
  return value === 'camera' || value === 'audio';
}

function isValidLens(value: unknown): value is Lens {
  return value === 'camera' || value === 'clarity' || value === 'negotiation';
}

function isValidLensFilter(value: unknown): value is LensFilter {
  return value === 'all' || value === 'custom' || isValidLens(value);
}

function isValidFrameworkId(value: unknown): value is FrameworkId {
  return (
    value === 'bluf-pyramid' ||
    value === 'prep' ||
    value === 'what-so-what' ||
    value === 'hook-psi' ||
    value === 'tactical-empathy' ||
    value === 'principled-pushback'
  );
}

export function loadPrefs(): UserPrefs {
  const storage = getSafeStorage();
  if (!storage) {
    return { ...DEFAULT_USER_PREFS };
  }

  try {
    const raw = storage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_USER_PREFS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_USER_PREFS };
    }
    const candidate = parsed as Partial<Record<keyof UserPrefs, unknown>>;
    return {
      preferredMode: isValidPreferredMode(candidate.preferredMode)
        ? candidate.preferredMode
        : DEFAULT_USER_PREFS.preferredMode,
      lastLensFilter: isValidLensFilter(candidate.lastLensFilter)
        ? candidate.lastLensFilter
        : DEFAULT_USER_PREFS.lastLensFilter,
    };
  } catch {
    return { ...DEFAULT_USER_PREFS };
  }
}

export function savePrefs(prefs: UserPrefs): void {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or privacy-mode errors gracefully
  }
}

// ---------------------------------------------------------------------------
// Custom Scenarios CRUD
// ---------------------------------------------------------------------------

function isLikelyCustomScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Scenario>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.title === 'string' &&
    candidate.title.trim().length > 0 &&
    isValidLens(candidate.lens) &&
    isValidFrameworkId(candidate.frameworkId) &&
    typeof candidate.durationSec === 'number' &&
    candidate.durationSec > 0 &&
    typeof candidate.stakes === 'string' &&
    typeof candidate.prompt === 'string'
  );
}

function normalizeCustomScenario(
  scenario: Scenario,
  fallbackCreatedAt?: string
): Scenario {
  const trimmedPresence = scenario.presenceCue?.trim();
  const trimmedRole = scenario.counterpartRole?.trim();
  const trimmedPushback = scenario.openingPushback?.trim();

  return {
    ...scenario,
    id: scenario.id.trim(),
    title: scenario.title.trim(),
    stakes: scenario.stakes.trim(),
    prompt: scenario.prompt.trim(),
    presenceCue: trimmedPresence || undefined,
    counterpartRole: trimmedRole || undefined,
    openingPushback: trimmedPushback || undefined,
    isCustom: true,
    createdAt: scenario.createdAt ?? fallbackCreatedAt ?? new Date().toISOString(),
  };
}

function sortCustomScenariosNewestFirst(scenarios: Scenario[]): Scenario[] {
  return [...scenarios].sort((a, b) => {
    const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
    const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    }
    return timeB - timeA;
  });
}

function persistCustomScenarios(scenarios: Scenario[]): void {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      CUSTOM_SCENARIOS_STORAGE_KEY,
      JSON.stringify(scenarios.slice(0, MAX_CUSTOM_SCENARIOS))
    );
  } catch {
    // Ignore storage quota or privacy-mode errors gracefully
  }
}

export function loadCustomScenarios(): Scenario[] {
  const storage = getSafeStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(CUSTOM_SCENARIOS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid = parsed
      .filter(isLikelyCustomScenario)
      .map((item) => normalizeCustomScenario(item));
    return sortCustomScenariosNewestFirst(valid);
  } catch {
    return [];
  }
}

export function saveCustomScenario(scenario: Scenario): Scenario[] {
  const existing = loadCustomScenarios();
  const prior = existing.find((item) => item.id === scenario.id);
  const normalized = normalizeCustomScenario(scenario, prior?.createdAt);
  const others = existing.filter((item) => item.id !== normalized.id);
  const updated = sortCustomScenariosNewestFirst([normalized, ...others]).slice(
    0,
    MAX_CUSTOM_SCENARIOS
  );
  persistCustomScenarios(updated);
  return updated;
}

export function deleteCustomScenario(scenarioId: string): Scenario[] {
  const updated = loadCustomScenarios().filter(
    (scenario) => scenario.id !== scenarioId
  );
  persistCustomScenarios(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Sessions CRUD & Streak Summary
// ---------------------------------------------------------------------------

function isLikelySessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const rec = value as Partial<SessionRecord>;
  return (
    typeof rec.id === 'string' &&
    typeof rec.createdAt === 'string' &&
    typeof rec.scenarioId === 'string' &&
    typeof rec.frameworkId === 'string' &&
    typeof rec.durationSec === 'number' &&
    Boolean(rec.metrics) &&
    typeof rec.metrics === 'object'
  );
}

function sortSessionsNewestFirst(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => {
    const timeA = Date.parse(a.createdAt);
    const timeB = Date.parse(b.createdAt);
    if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
      return b.createdAt.localeCompare(a.createdAt);
    }
    return timeB - timeA;
  });
}

function persistSessions(sessions: SessionRecord[]): void {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }

  let toSave = sessions.slice(0, MAX_STORED_SESSIONS);
  while (toSave.length > 0) {
    try {
      storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(toSave));
      return;
    } catch {
      // Trim oldest entries if storage quota is tight
      toSave = toSave.slice(0, Math.floor(toSave.length * 0.75));
    }
  }
  try {
    storage.setItem(SESSIONS_STORAGE_KEY, '[]');
  } catch {
    // Ignore unrecoverable storage block
  }
}

export function loadSessions(): SessionRecord[] {
  const storage = getSafeStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid = parsed.filter(isLikelySessionRecord).map((rec) => ({
      ...rec,
      reflectionNote: typeof rec.reflectionNote === 'string' ? rec.reflectionNote : '',
    }));
    return sortSessionsNewestFirst(valid);
  } catch {
    return [];
  }
}

export function saveSession(record: SessionRecord): SessionRecord[] {
  const existing = loadSessions().filter((item) => item.id !== record.id);
  const updated = sortSessionsNewestFirst([record, ...existing]).slice(
    0,
    MAX_STORED_SESSIONS
  );
  persistSessions(updated);
  return updated;
}

export function updateSessionReflection(
  sessionId: string,
  reflectionNote: string
): SessionRecord[] {
  const updated = loadSessions().map((session) =>
    session.id === sessionId
      ? {
          ...session,
          reflectionNote: reflectionNote.trim(),
        }
      : session
  );
  persistSessions(updated);
  return updated;
}

export function deleteSession(sessionId: string): SessionRecord[] {
  const updated = loadSessions().filter((session) => session.id !== sessionId);
  persistSessions(updated);
  return updated;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftLocalDays(base: Date, deltaDays: number): Date {
  const shifted = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  shifted.setDate(shifted.getDate() + deltaDays);
  return shifted;
}

export function computeStreakSummary(
  sessions: SessionRecord[],
  referenceDate: Date = new Date()
): StreakSummary {
  const activeDatesSet = new Set<string>();
  const practicedScenariosSet = new Set<string>();

  for (const session of sessions) {
    practicedScenariosSet.add(session.scenarioId);
    const parsed = new Date(session.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      activeDatesSet.add(toLocalDateKey(parsed));
    }
  }

  const todayKey = toLocalDateKey(referenceDate);
  const yesterdayKey = toLocalDateKey(shiftLocalDays(referenceDate, -1));
  const practicedToday = activeDatesSet.has(todayKey);

  let currentStreakDays = 0;
  let cursorOffset = practicedToday ? 0 : activeDatesSet.has(yesterdayKey) ? -1 : null;

  while (cursorOffset !== null) {
    const key = toLocalDateKey(shiftLocalDays(referenceDate, cursorOffset));
    if (activeDatesSet.has(key)) {
      currentStreakDays += 1;
      cursorOffset -= 1;
    } else {
      break;
    }
  }

  return {
    currentStreakDays,
    totalSessions: sessions.length,
    practicedToday,
    practicedScenarioIds: Array.from(practicedScenariosSet),
  };
}
