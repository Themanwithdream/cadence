import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppView,
  Framework,
  FrameworkId,
  LensFilter,
  LiveRecordingAsset,
  OneChangeCue,
  Scenario,
  SessionRecord,
  StudioMode,
  StudioSessionCompletion,
  UserPrefs,
  UseStudioSessionResult,
} from './types/cadence';
import { FRAMEWORKS, LENS_META, getFrameworkById } from './data/frameworks';
import { SCENARIOS, getScenarioById, getTodaysScenario } from './data/scenarios';
import {
  computeStreakSummary,
  deleteCustomScenario,
  deleteSession,
  loadCustomScenarios,
  loadPrefs,
  loadSessions,
  saveCustomScenario,
  savePrefs,
  saveSession,
  updateSessionReflection,
} from './lib/storage';
import { computeTakeDelta } from './engine/metricsEvaluator';
import { revokeRecordingAssetUrl } from './engine/mediaCapture';
import { useStudioSession } from './hooks/useStudioSession';
import { TopBar } from './components/TopBar';
import { LobbyView } from './components/LobbyView';
import { FrameworksDrawer } from './components/FrameworksDrawer';
import { JournalDrawer } from './components/JournalDrawer';
import { ScenarioModal } from './components/ScenarioModal';
import { StudioView } from './components/StudioView';
import { ReviewView } from './components/ReviewView';

interface ActiveStudioConfig {
  scenario: Scenario;
  frameworkId: FrameworkId;
  initialMode: StudioMode;
  takeNumber: number;
  previousTakeId?: string;
  pinnedCue: OneChangeCue | null;
  mountNonce: number;
}

interface StudioHostProps {
  scenario: Scenario;
  framework: Framework;
  initialMode: StudioMode;
  takeNumber: number;
  previousTakeId?: string;
  pinnedCue: OneChangeCue | null;
  onComplete: (result: StudioSessionCompletion) => void;
  onBackToLobby: () => void;
  onSelectFramework: (frameworkId: FrameworkId) => void;
  onRememberMode: (mode: 'camera' | 'audio') => void;
}

function resolveScenarioForSession(
  session: SessionRecord,
  customScenarios: Scenario[]
): Scenario {
  const found = getScenarioById(session.scenarioId, customScenarios);
  if (found) return found;
  return {
    id: session.scenarioId,
    title: session.scenarioId.startsWith('custom-') ? 'Custom Scenario' : 'Practice Take',
    lens: session.lens,
    frameworkId: session.frameworkId,
    durationSec: Math.max(45, Math.round(session.durationSec) || 60),
    stakes: 'Saved practice take from your history.',
    prompt: 'Saved practice take from your history.',
    isCustom: session.scenarioId.startsWith('custom-'),
  };
}

/**
 * Thin inner host so `useStudioSession` mounts ONLY while in the Live Studio
 * and cleanly releases camera/mic hardware tracks on exit.
 */
function StudioHost({
  scenario,
  framework,
  initialMode,
  takeNumber,
  previousTakeId,
  pinnedCue,
  onComplete,
  onBackToLobby,
  onSelectFramework,
  onRememberMode,
}: StudioHostProps) {
  const studio = useStudioSession({
    scenario,
    framework,
    initialMode,
    takeNumber,
    previousTakeId,
    onComplete,
  });

  const studioWithModeMemory = useMemo<UseStudioSessionResult>(
    () => ({
      ...studio,
      setMode: async (nextMode: StudioMode) => {
        if (nextMode === 'camera' || nextMode === 'audio') {
          onRememberMode(nextMode);
        }
        await studio.setMode(nextMode);
      },
    }),
    [studio, onRememberMode]
  );

  return (
    <StudioView
      scenario={scenario}
      framework={framework}
      availableFrameworks={FRAMEWORKS}
      lensMeta={LENS_META[scenario.lens]}
      studio={studioWithModeMemory}
      takeNumber={takeNumber}
      pinnedCue={pinnedCue}
      onBackToLobby={onBackToLobby}
      onSelectFramework={onSelectFramework}
    />
  );
}

export function App() {
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>(() =>
    loadCustomScenarios()
  );
  const [sessions, setSessions] = useState<SessionRecord[]>(() => loadSessions());
  const [prefs, setPrefs] = useState<UserPrefs>(() => loadPrefs());
  const [view, setView] = useState<AppView>('lobby');

  const [studioConfig, setStudioConfig] = useState<ActiveStudioConfig | null>(null);
  const [reviewSession, setReviewSession] = useState<SessionRecord | null>(null);
  const [reviewRecording, setReviewRecording] = useState<LiveRecordingAsset | null>(null);

  const [frameworksOpen, setFrameworksOpen] = useState(false);
  const [highlightedFrameworkId, setHighlightedFrameworkId] =
    useState<FrameworkId | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);

  const mountNonceRef = useRef(0);
  const reviewRecordingRef = useRef<LiveRecordingAsset | null>(null);

  useEffect(() => {
    reviewRecordingRef.current = reviewRecording;
  }, [reviewRecording]);

  useEffect(() => {
    return () => {
      if (reviewRecordingRef.current) {
        revokeRecordingAssetUrl(reviewRecordingRef.current);
      }
    };
  }, []);

  const allScenarios = useMemo(
    () => [...customScenarios, ...SCENARIOS],
    [customScenarios]
  );

  const streak = useMemo(() => computeStreakSummary(sessions), [sessions]);

  const todaysScenario = useMemo(
    () => getTodaysScenario(allScenarios, streak.practicedScenarioIds),
    [allScenarios, streak.practicedScenarioIds]
  );

  const updatePrefs = useCallback((patch: Partial<UserPrefs>) => {
    setPrefs((prev) => {
      const next: UserPrefs = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const replaceReviewRecording = useCallback((next: LiveRecordingAsset | null) => {
    setReviewRecording((prev) => {
      if (prev && prev !== next) {
        revokeRecordingAssetUrl(prev);
      }
      return next;
    });
  }, []);

  const launchStudio = useCallback(
    (params: {
      scenario: Scenario;
      frameworkId?: FrameworkId;
      initialMode?: StudioMode;
      takeNumber?: number;
      previousTakeId?: string;
      pinnedCue?: OneChangeCue | null;
    }) => {
      mountNonceRef.current += 1;
      setFrameworksOpen(false);
      setJournalOpen(false);
      setScenarioModalOpen(false);
      setEditingScenario(null);
      setStudioConfig({
        scenario: params.scenario,
        frameworkId: params.frameworkId ?? params.scenario.frameworkId,
        initialMode: params.initialMode ?? prefs.preferredMode,
        takeNumber: params.takeNumber ?? 1,
        previousTakeId: params.previousTakeId,
        pinnedCue: params.pinnedCue ?? null,
        mountNonce: mountNonceRef.current,
      });
      setView('studio');
    },
    [prefs.preferredMode]
  );

  const handleStartScenario = useCallback(
    (scenario: Scenario) => {
      launchStudio({ scenario });
    },
    [launchStudio]
  );

  const handleLensFilterChange = useCallback(
    (filter: LensFilter) => {
      updatePrefs({ lastLensFilter: filter });
    },
    [updatePrefs]
  );

  const handleGoHome = useCallback(() => {
    setFrameworksOpen(false);
    setJournalOpen(false);
    setStudioConfig(null);
    setView('lobby');
  }, []);

  const handleOpenFrameworks = useCallback((highlightId?: FrameworkId) => {
    setJournalOpen(false);
    setHighlightedFrameworkId(highlightId ?? null);
    setFrameworksOpen(true);
  }, []);

  const handleOpenJournal = useCallback(() => {
    setFrameworksOpen(false);
    setJournalOpen(true);
  }, []);

  const handleOpenCreateScenario = useCallback(() => {
    setFrameworksOpen(false);
    setJournalOpen(false);
    setEditingScenario(null);
    setScenarioModalOpen(true);
  }, []);

  const handleOpenEditScenario = useCallback((scenario: Scenario) => {
    setEditingScenario(scenario);
    setScenarioModalOpen(true);
  }, []);

  const handleSaveCustomScenario = useCallback(
    (scenario: Scenario, startImmediately: boolean) => {
      const updated = saveCustomScenario(scenario);
      setCustomScenarios(updated);
      setScenarioModalOpen(false);
      setEditingScenario(null);
      if (startImmediately) {
        launchStudio({ scenario });
      }
    },
    [launchStudio]
  );

  const handleDeleteCustomScenario = useCallback((scenarioId: string) => {
    const updated = deleteCustomScenario(scenarioId);
    setCustomScenarios(updated);
  }, []);

  const handlePracticeFramework = useCallback(
    (frameworkId: FrameworkId, matchingScenario: Scenario) => {
      launchStudio({ scenario: matchingScenario, frameworkId });
    },
    [launchStudio]
  );

  const handleSelectStudioFramework = useCallback((frameworkId: FrameworkId) => {
    setStudioConfig((prev) => (prev ? { ...prev, frameworkId } : prev));
  }, []);

  const handleRememberMode = useCallback(
    (mode: 'camera' | 'audio') => {
      updatePrefs({ preferredMode: mode });
    },
    [updatePrefs]
  );

  const handleStudioComplete = useCallback(
    ({ record, recording }: StudioSessionCompletion) => {
      replaceReviewRecording(recording);
      const updated = saveSession(record);
      setSessions(updated);
      setReviewSession(record);
      setStudioConfig(null);
      setView('review');
    },
    [replaceReviewRecording]
  );

  const handleTakeTwo = useCallback(() => {
    if (!reviewSession) return;
    const scenario = resolveScenarioForSession(reviewSession, customScenarios);
    launchStudio({
      scenario,
      frameworkId: reviewSession.frameworkId,
      initialMode: reviewSession.mode,
      takeNumber: reviewSession.takeNumber + 1,
      previousTakeId: reviewSession.id,
      pinnedCue: reviewSession.oneChangeCue,
    });
  }, [reviewSession, customScenarios, launchStudio]);

  const handleSaveReflection = useCallback(
    (sessionId: string, reflectionNote: string) => {
      const updated = updateSessionReflection(sessionId, reflectionNote);
      setSessions(updated);
      setReviewSession((prev) =>
        prev && prev.id === sessionId ? { ...prev, reflectionNote } : prev
      );
    },
    []
  );

  const handleSelectJournalSession = useCallback(
    (session: SessionRecord) => {
      setJournalOpen(false);
      setStudioConfig(null);
      replaceReviewRecording(null);
      setReviewSession(session);
      setView('review');
    },
    [replaceReviewRecording]
  );

  const handleDeleteJournalSession = useCallback(
    (sessionId: string) => {
      const updated = deleteSession(sessionId);
      setSessions(updated);
      if (reviewSession?.id === sessionId) {
        replaceReviewRecording(null);
        setReviewSession(null);
        setView('lobby');
      }
    },
    [reviewSession, replaceReviewRecording]
  );

  const activeStudioFramework = useMemo(
    () => (studioConfig ? getFrameworkById(studioConfig.frameworkId) : null),
    [studioConfig]
  );

  const reviewScenario = useMemo(() => {
    if (!reviewSession) return null;
    return resolveScenarioForSession(reviewSession, customScenarios);
  }, [reviewSession, customScenarios]);

  const reviewFramework = useMemo(() => {
    if (!reviewSession) return null;
    return getFrameworkById(reviewSession.frameworkId);
  }, [reviewSession]);

  const reviewTakeDelta = useMemo(() => {
    if (!reviewSession?.previousTakeId) return null;
    const previous = sessions.find((s) => s.id === reviewSession.previousTakeId);
    if (!previous) return null;
    return computeTakeDelta(reviewSession, previous);
  }, [reviewSession, sessions]);

  return (
    <>
      {view !== 'studio' && (
        <TopBar
          currentView={view}
          streak={streak}
          onGoHome={handleGoHome}
          onOpenFrameworks={() => handleOpenFrameworks()}
          onOpenJournal={handleOpenJournal}
        />
      )}

      {view === 'lobby' && (
        <LobbyView
          scenarios={allScenarios}
          frameworks={FRAMEWORKS}
          lensMeta={LENS_META}
          todaysScenario={todaysScenario}
          activeLensFilter={prefs.lastLensFilter}
          practicedScenarioIds={streak.practicedScenarioIds}
          onLensFilterChange={handleLensFilterChange}
          onStartScenario={handleStartScenario}
          onCreateScenario={handleOpenCreateScenario}
          onEditScenario={handleOpenEditScenario}
          onDeleteScenario={handleDeleteCustomScenario}
        />
      )}

      {view === 'studio' && studioConfig && activeStudioFramework && (
        <StudioHost
          key={`${studioConfig.scenario.id}-${studioConfig.takeNumber}-${studioConfig.mountNonce}`}
          scenario={studioConfig.scenario}
          framework={activeStudioFramework}
          initialMode={studioConfig.initialMode}
          takeNumber={studioConfig.takeNumber}
          previousTakeId={studioConfig.previousTakeId}
          pinnedCue={studioConfig.pinnedCue}
          onComplete={handleStudioComplete}
          onBackToLobby={handleGoHome}
          onSelectFramework={handleSelectStudioFramework}
          onRememberMode={handleRememberMode}
        />
      )}

      {view === 'review' && reviewSession && reviewScenario && reviewFramework && (
        <ReviewView
          session={reviewSession}
          recording={reviewRecording}
          scenario={reviewScenario}
          framework={reviewFramework}
          lensMeta={LENS_META[reviewScenario.lens]}
          takeDelta={reviewTakeDelta}
          onTakeTwo={handleTakeTwo}
          onNewScenario={handleGoHome}
          onSaveReflection={handleSaveReflection}
        />
      )}

      <ScenarioModal
        isOpen={scenarioModalOpen}
        frameworks={FRAMEWORKS}
        initialScenario={editingScenario}
        onClose={() => {
          setScenarioModalOpen(false);
          setEditingScenario(null);
        }}
        onSave={handleSaveCustomScenario}
      />

      <FrameworksDrawer
        isOpen={frameworksOpen}
        frameworks={FRAMEWORKS}
        scenarios={allScenarios}
        lensMeta={LENS_META}
        highlightFrameworkId={highlightedFrameworkId}
        onClose={() => setFrameworksOpen(false)}
        onPracticeFramework={handlePracticeFramework}
      />

      <JournalDrawer
        isOpen={journalOpen}
        sessions={sessions}
        scenarios={allScenarios}
        frameworks={FRAMEWORKS}
        streak={streak}
        onClose={() => setJournalOpen(false)}
        onSelectSession={handleSelectJournalSession}
        onDeleteSession={handleDeleteJournalSession}
      />
    </>
  );
}
