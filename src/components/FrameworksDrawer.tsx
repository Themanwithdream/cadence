import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, BookOpen, Clock, X } from 'lucide-react';
import type {
  Framework,
  FrameworkId,
  Lens,
  LensMeta,
  Scenario,
} from '../types/cadence';
import styles from './FrameworksDrawer.module.css';

export interface FrameworksDrawerProps {
  isOpen: boolean;
  frameworks: Framework[];
  scenarios: Scenario[];
  lensMeta: Record<Lens, LensMeta>;
  highlightFrameworkId?: FrameworkId | null;
  onClose: () => void;
  onPracticeFramework: (frameworkId: FrameworkId, matchingScenario: Scenario) => void;
}

export function FrameworksDrawer({
  isOpen,
  frameworks,
  scenarios,
  lensMeta,
  highlightFrameworkId = null,
  onClose,
  onPracticeFramework,
}: FrameworksDrawerProps) {
  const cardRefs = useRef<Partial<Record<FrameworkId, HTMLElement | null>>>({});

  const matchingScenarioByFramework = useMemo(() => {
    const map = new Map<FrameworkId, Scenario>();
    for (const fw of frameworks) {
      const exact = scenarios.find((sc) => sc.frameworkId === fw.id);
      const lensFallback = scenarios.find((sc) => sc.lens === fw.primaryLens);
      const pick = exact ?? lensFallback ?? scenarios[0];
      if (pick) {
        map.set(fw.id, pick);
      }
    }
    return map;
  }, [frameworks, scenarios]);

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !highlightFrameworkId) return;
    const node = cardRefs.current[highlightFrameworkId];
    if (node) {
      const timer = window.setTimeout(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, highlightFrameworkId]);

  if (!isOpen) return null;

  const jumpToFramework = (id: FrameworkId) => {
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="presentation"
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="frameworks-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerTitleBlock}>
            <span className={styles.eyebrow}>
              <BookOpen size={13} strokeWidth={1.7} aria-hidden="true" />
              Field Guide
            </span>
            <h2 id="frameworks-drawer-title" className={styles.title}>
              Spoken Frameworks
            </h2>
            <p className={styles.subtitle}>
              Structure sets your mind free. Follow live beats instead of memorizing a script.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close frameworks guide"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <nav className={styles.jumpNav} aria-label="Jump to framework">
          {frameworks.map((fw) => (
            <button
              key={fw.id}
              type="button"
              className={`${styles.jumpPill} ${
                highlightFrameworkId === fw.id ? styles.jumpPillActive : ''
              }`}
              onClick={() => jumpToFramework(fw.id)}
            >
              {fw.shortName}
            </button>
          ))}
        </nav>

        <div className={styles.body}>
          {frameworks.map((fw) => {
            const primaryMeta = lensMeta[fw.primaryLens];
            const isHighlighted = highlightFrameworkId === fw.id;
            const matchedScenario = matchingScenarioByFramework.get(fw.id);

            return (
              <article
                key={fw.id}
                ref={(el) => {
                  cardRefs.current[fw.id] = el;
                }}
                className={`${styles.card} ${isHighlighted ? styles.cardHighlighted : ''}`}
              >
                <div className={styles.cardHeader}>
                  <span className={`${styles.lensChip} ${styles[`lens_${fw.primaryLens}`]}`}>
                    {primaryMeta.label}
                  </span>
                  <span className={`${styles.beatCount} tabular-nums`}>
                    {fw.beats.length} beats
                  </span>
                </div>

                <h3 className={styles.fwName}>{fw.name}</h3>
                <p className={styles.fwSummary}>{fw.summary}</p>
                <p className={styles.bestFor}>
                  <span className={styles.bestForLabel}>Best for:</span> {fw.bestFor}
                </p>

                <ol className={styles.beatList}>
                  {fw.beats.map((beat, idx) => (
                    <li key={beat.id} className={styles.beatItem}>
                      <div className={styles.beatRail} aria-hidden="true">
                        <span className={`${styles.beatNumber} tabular-nums`}>
                          0{idx + 1}
                        </span>
                        {idx < fw.beats.length - 1 && <span className={styles.beatLine} />}
                      </div>

                      <div className={styles.beatContent}>
                        <div className={styles.beatTop}>
                          <span className={styles.beatLabel}>{beat.label}</span>
                          <span className={`${styles.beatSec} tabular-nums`}>
                            <Clock size={11} strokeWidth={1.7} aria-hidden="true" />
                            {beat.secHint}s
                          </span>
                        </div>
                        <p className={styles.beatPrompt}>{beat.livePrompt}</p>
                        <p className={styles.starterCue}>{beat.starterCue}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {matchedScenario && (
                  <div className={styles.cardFooter}>
                    <span className={styles.matchedLabel}>
                      Suggested rep: <strong>{matchedScenario.title}</strong>
                    </span>
                    <button
                      type="button"
                      className={styles.practiceButton}
                      onClick={() => onPracticeFramework(fw.id, matchedScenario)}
                    >
                      <span>Practice this framework</span>
                      <ArrowRight size={14} strokeWidth={1.85} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
