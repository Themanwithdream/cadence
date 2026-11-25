import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Layers,
  ListChecks,
  MessageSquareQuote,
  Pencil,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import type {
  Framework,
  FrameworkId,
  Lens,
  LensFilter,
  LensMeta,
  Scenario,
} from '../types/cadence';
import styles from './LobbyView.module.css';

export interface LobbyViewProps {
  scenarios: Scenario[];
  frameworks: Framework[];
  lensMeta: Record<Lens, LensMeta>;
  todaysScenario: Scenario;
  activeLensFilter: LensFilter;
  practicedScenarioIds: string[];
  onLensFilterChange: (filter: LensFilter) => void;
  onStartScenario: (scenario: Scenario, frameworkOverride?: FrameworkId) => void;
  onGoToCreate: () => void;
  onEditScenario: (scenario: Scenario) => void;
  onDeleteScenario: (scenarioId: string) => void;
}

const CATEGORY_TABS: Array<{ id: Lens; label: string }> = [
  { id: 'camera', label: 'On Camera' },
  { id: 'clarity', label: 'Clear Thinking' },
  { id: 'negotiation', label: 'Negotiation' },
];

const LENS_CHIP_LABEL: Record<Lens, string> = {
  camera: 'On Camera',
  clarity: 'Clear Thinking',
  negotiation: 'Negotiation',
};

function LensIcon({ lens, size = 13 }: { lens: Lens; size?: number }) {
  switch (lens) {
    case 'camera':
      return <Video size={size} strokeWidth={1.65} aria-hidden="true" />;
    case 'clarity':
      return <Layers size={size} strokeWidth={1.65} aria-hidden="true" />;
    case 'negotiation':
      return <MessageSquareQuote size={size} strokeWidth={1.65} aria-hidden="true" />;
  }
}

export function LobbyView({
  scenarios,
  frameworks,
  lensMeta,
  todaysScenario,
  activeLensFilter,
  practicedScenarioIds,
  onLensFilterChange,
  onStartScenario,
  onGoToCreate,
  onEditScenario,
  onDeleteScenario,
}: LobbyViewProps) {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<FrameworkId>(
    frameworks[0]?.id ?? 'bluf-pyramid'
  );

  const frameworkMap = useMemo(() => {
    const map = new Map<FrameworkId, Framework>();
    for (const fw of frameworks) {
      map.set(fw.id, fw);
    }
    return map;
  }, [frameworks]);

  const practicedSet = useMemo(
    () => new Set(practicedScenarioIds),
    [practicedScenarioIds]
  );

  const counts = useMemo(() => {
    const result = { custom: 0, camera: 0, clarity: 0, negotiation: 0 };
    for (const sc of scenarios) {
      if (sc.isCustom) result.custom += 1;
      result[sc.lens] += 1;
    }
    return result;
  }, [scenarios]);

  const filteredScenarios = useMemo(() => {
    if (activeLensFilter === 'all') return scenarios;
    if (activeLensFilter === 'custom') return scenarios.filter((sc) => sc.isCustom);
    return scenarios.filter((sc) => sc.lens === activeLensFilter);
  }, [scenarios, activeLensFilter]);

  const todaysFramework = frameworkMap.get(todaysScenario.frameworkId);
  const selectedBlueprint =
    frameworkMap.get(selectedBlueprintId) ?? frameworks[0] ?? null;

  const matchedBlueprintScenario = useMemo(() => {
    if (!selectedBlueprint) return scenarios[0];
    return (
      scenarios.find((sc) => sc.frameworkId === selectedBlueprint.id) ??
      scenarios.find((sc) => sc.lens === selectedBlueprint.primaryLens) ??
      scenarios[0]
    );
  }, [selectedBlueprint, scenarios]);

  return (
    <main className={styles.page}>
      {/* Split Hero Banner */}
      <section className={styles.heroBanner} aria-labelledby="hero-headline">
        <div className={styles.heroIntro}>
          <span className={styles.heroKicker}>Voice &amp; Presence Studio</span>
          <h1 id="hero-headline" className={styles.heroHeadline}>
            Speak clearly. Sound calm. Own the room.
          </h1>
          <p className={styles.heroSubtitle}>
            Answer structured questions on camera or mic, then get instant transcript
            highlights and tailored speech coaching.
          </p>

          <div className={styles.heroCtas}>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={() => onStartScenario(todaysScenario)}
            >
              <span>Start Today&rsquo;s Rep</span>
              <ArrowRight size={17} strokeWidth={1.85} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={styles.secondaryCta}
              onClick={onGoToCreate}
            >
              <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>Build Your Own</span>
            </button>
          </div>
        </div>

        <article className={styles.featuredCard} aria-labelledby="featured-rep-title">
          <div className={styles.featuredTop}>
            <span className={styles.featuredEyebrow}>
              <span className={styles.eyebrowDot} aria-hidden="true" />
              Today&rsquo;s Rep
            </span>
            <div className={styles.featuredChips}>
              <span className={`${styles.lensChip} ${styles[`lens_${todaysScenario.lens}`]}`}>
                <LensIcon lens={todaysScenario.lens} size={12} />
                {LENS_CHIP_LABEL[todaysScenario.lens]}
              </span>
              <span className={`${styles.durationPill} tabular-nums`}>
                {todaysScenario.durationSec}s
              </span>
            </div>
          </div>

          <h2 id="featured-rep-title" className={styles.featuredTitle}>
            {todaysScenario.title}
          </h2>

          {todaysScenario.questions.length > 0 && (
            <ol className={styles.featuredQuestions} aria-label="Questions to answer">
              {todaysScenario.questions.slice(0, 4).map((q, idx) => (
                <li key={q.id} className={styles.featuredQuestionItem}>
                  <span className={`${styles.questionNum} tabular-nums`}>{idx + 1}</span>
                  <span className={styles.questionText}>{q.text}</span>
                </li>
              ))}
            </ol>
          )}

          <div className={styles.featuredFooter}>
            <span className={styles.featuredFramework}>
              {todaysFramework?.shortName ?? lensMeta[todaysScenario.lens].shortLabel}
            </span>

            <button
              type="button"
              className={styles.featuredAction}
              onClick={() => onStartScenario(todaysScenario)}
            >
              <span>Practice</span>
              <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>

      {/* Organized Practice Library */}
      <section className={styles.librarySection} aria-label="Practice library">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>Practice Library</h2>
          <button
            type="button"
            className={styles.createInlineButton}
            onClick={onGoToCreate}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            <span>Create New</span>
          </button>
        </div>

        <div className={styles.filterBar} role="tablist" aria-label="Filter scenarios by category">
          <button
            type="button"
            role="tab"
            aria-selected={activeLensFilter === 'all'}
            className={`${styles.filterPill} ${
              activeLensFilter === 'all' ? styles.filterPillActive : ''
            }`}
            onClick={() => onLensFilterChange('all')}
          >
            <span>All</span>
            <span className={`${styles.filterCount} tabular-nums`}>{scenarios.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeLensFilter === 'custom'}
            className={`${styles.filterPill} ${
              activeLensFilter === 'custom' ? styles.filterPillActive : ''
            }`}
            onClick={() => onLensFilterChange('custom')}
          >
            <span>My Scenarios</span>
            <span className={`${styles.filterCount} tabular-nums`}>{counts.custom}</span>
          </button>

          {CATEGORY_TABS.map((tab) => {
            const active = activeLensFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.filterPill} ${active ? styles.filterPillActive : ''}`}
                onClick={() => onLensFilterChange(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={`${styles.filterCount} tabular-nums`}>
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {activeLensFilter === 'custom' && filteredScenarios.length === 0 ? (
          <div className={styles.customEmptyCard}>
            <h3 className={styles.customEmptyTitle}>
              Design a scenario around your exact talk or meeting.
            </h3>
            <p className={styles.customEmptyCopy}>
              Start from a template or add the 3–5 questions you want to answer aloud —
              Cadence turns them into calm live cue cards.
            </p>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={onGoToCreate}
            >
              <span>Build Your First Scenario</span>
              <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredScenarios.map((scenario) => {
              const fw = frameworkMap.get(scenario.frameworkId);
              const isPracticed = practicedSet.has(scenario.id);
              const questionCount =
                scenario.questions.length > 0
                  ? scenario.questions.length
                  : fw?.beats.length ?? 3;

              return (
                <article key={scenario.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardTopLeft}>
                      <span className={`${styles.lensChip} ${styles[`lens_${scenario.lens}`]}`}>
                        <LensIcon lens={scenario.lens} size={12} />
                        {LENS_CHIP_LABEL[scenario.lens]}
                      </span>
                      {scenario.isCustom && (
                        <span className={styles.customBadge}>Custom</span>
                      )}
                    </div>

                    <div className={styles.cardTopRight}>
                      {isPracticed && (
                        <span
                          className={styles.practicedDot}
                          title="Practiced"
                          aria-label="Practiced"
                        />
                      )}
                      <span className={`${styles.cardDuration} tabular-nums`}>
                        {scenario.durationSec}s
                      </span>
                    </div>
                  </div>

                  <h3 className={styles.cardTitle}>
                    <button
                      type="button"
                      className={styles.cardLaunchTrigger}
                      onClick={() => onStartScenario(scenario)}
                    >
                      {scenario.title}
                    </button>
                  </h3>

                  <span className={styles.questionCountPill}>
                    <ListChecks size={12} strokeWidth={1.75} aria-hidden="true" />
                    <span className="tabular-nums">{questionCount}</span>
                    <span>{questionCount === 1 ? 'question' : 'questions'}</span>
                  </span>

                  <p className={styles.cardStakes}>{scenario.stakes}</p>

                  <div className={styles.cardFooter}>
                    <span className={styles.cardFrameworkLabel}>
                      {fw?.shortName ?? ''}
                    </span>

                    <div className={styles.cardFooterRight}>
                      {scenario.isCustom && (
                        <div className={styles.customActions}>
                          <button
                            type="button"
                            className={styles.iconActionButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditScenario(scenario);
                            }}
                            aria-label={`Edit ${scenario.title}`}
                            title="Edit scenario"
                          >
                            <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconActionButton} ${styles.iconActionDanger}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteScenario(scenario.id);
                            }}
                            aria-label={`Delete ${scenario.title}`}
                            title="Delete scenario"
                          >
                            <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                      )}

                      <span className={styles.cardEnterHint} aria-hidden="true">
                        Practice
                        <ArrowRight size={14} strokeWidth={1.8} />
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Compact Speaking Blueprints Strip (Inline, Zero Hidden Drawers) */}
      {selectedBlueprint && (
        <section className={styles.blueprintsSection} aria-labelledby="blueprints-heading">
          <div className={styles.blueprintsTop}>
            <div>
              <span className={styles.blueprintsEyebrow}>Speaking Blueprints</span>
              <h2 id="blueprints-heading" className={styles.blueprintsHeading}>
                Six proven structures for thinking on your feet
              </h2>
            </div>

            <div
              className={styles.blueprintPills}
              role="tablist"
              aria-label="Inspect speaking blueprints"
            >
              {frameworks.map((fw) => {
                const active = fw.id === selectedBlueprint.id;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.blueprintPill} ${
                      active ? styles.blueprintPillActive : ''
                    }`}
                    onClick={() => setSelectedBlueprintId(fw.id)}
                  >
                    {fw.shortName}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.blueprintBody}>
            <div className={styles.blueprintSummaryRow}>
              <div>
                <h3 className={styles.blueprintName}>{selectedBlueprint.name}</h3>
                <p className={styles.blueprintSummary}>{selectedBlueprint.summary}</p>
              </div>
              <span className={styles.blueprintBestFor}>
                <strong>Best for:</strong> {selectedBlueprint.bestFor}
              </span>
            </div>

            <ol className={styles.beatStrip}>
              {selectedBlueprint.beats.map((beat, idx) => (
                <li key={beat.id} className={styles.beatCard}>
                  <div className={styles.beatCardTop}>
                    <span className={`${styles.beatStepNum} tabular-nums`}>
                      0{idx + 1}
                    </span>
                    <span className={styles.beatLabel}>{beat.label}</span>
                    <span className={`${styles.beatSec} tabular-nums`}>
                      <Clock size={11} strokeWidth={1.7} aria-hidden="true" />
                      {beat.secHint}s
                    </span>
                  </div>
                  <p className={styles.beatPrompt}>{beat.livePrompt}</p>
                  <p className={styles.beatStarter}>{beat.starterCue}</p>
                </li>
              ))}
            </ol>

            {matchedBlueprintScenario && (
              <div className={styles.blueprintFooter}>
                <span className={styles.blueprintSuggested}>
                  Try it on: <strong>{matchedBlueprintScenario.title}</strong>
                </span>
                <button
                  type="button"
                  className={styles.blueprintPracticeBtn}
                  onClick={() =>
                    onStartScenario(matchedBlueprintScenario, selectedBlueprint.id)
                  }
                >
                  <span>Practice with this blueprint</span>
                  <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
