import { useMemo } from 'react';
import {
  ArrowRight,
  Layers,
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
  onStartScenario: (scenario: Scenario) => void;
  onCreateScenario: () => void;
  onEditScenario: (scenario: Scenario) => void;
  onDeleteScenario: (scenarioId: string) => void;
}

const LENS_TABS: Array<{ id: Lens; label: string }> = [
  { id: 'camera', label: 'Camera' },
  { id: 'clarity', label: 'Clarity' },
  { id: 'negotiation', label: 'Negotiation' },
];

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
  onCreateScenario,
  onEditScenario,
  onDeleteScenario,
}: LobbyViewProps) {
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
  const todaysLensMeta = lensMeta[todaysScenario.lens];

  return (
    <main className={styles.page}>
      {/* Hero Card — Today's Rep */}
      <section className={styles.heroCard} aria-labelledby="hero-rep-title">
        <div className={styles.heroMetaRow}>
          <span className={styles.heroEyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Today&rsquo;s Rep
          </span>
          <span className={`${styles.lensChip} ${styles[`lens_${todaysScenario.lens}`]}`}>
            <LensIcon lens={todaysScenario.lens} size={12} />
            {todaysLensMeta.shortLabel}
          </span>
          <span className={`${styles.metaText} tabular-nums`}>
            {todaysScenario.durationSec}s
          </span>
          {todaysFramework && (
            <span className={styles.metaText}>{todaysFramework.shortName}</span>
          )}
        </div>

        <div className={styles.heroBody}>
          <h1 id="hero-rep-title" className={styles.heroTitle}>
            {todaysScenario.title}
          </h1>
          <p className={styles.heroStakes}>{todaysScenario.stakes}</p>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => onStartScenario(todaysScenario)}
          >
            <span>Enter Studio</span>
            <ArrowRight size={17} strokeWidth={1.85} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={styles.secondaryCta}
            onClick={onCreateScenario}
          >
            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
            <span>Create Scenario</span>
          </button>
        </div>
      </section>

      {/* Practice Desk */}
      <section className={styles.deskSection} aria-label="Practice scenarios">
        <div className={styles.deskTopRow}>
          <h2 className={styles.deskHeading}>Practice Desk</h2>
          <button
            type="button"
            className={styles.newScenarioButton}
            onClick={onCreateScenario}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            <span>New Scenario</span>
          </button>
        </div>

        <div className={styles.filterBar} role="tablist" aria-label="Filter scenarios">
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

          {LENS_TABS.map((tab) => {
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
              Bring your own moment into the studio.
            </h3>
            <p className={styles.customEmptyCopy}>
              Prep for an upcoming pitch, hard conversation, or interview with a custom room
              saved privately on this device.
            </p>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={onCreateScenario}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              <span>Create Your First Scenario</span>
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredScenarios.map((scenario) => {
              const fw = frameworkMap.get(scenario.frameworkId);
              const meta = lensMeta[scenario.lens];
              const isPracticed = practicedSet.has(scenario.id);

              return (
                <article key={scenario.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardTopLeft}>
                      <span className={`${styles.lensChip} ${styles[`lens_${scenario.lens}`]}`}>
                        <LensIcon lens={scenario.lens} size={12} />
                        {meta.shortLabel}
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
    </main>
  );
}
