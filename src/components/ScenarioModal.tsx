import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Layers,
  MessageSquareQuote,
  Video,
  X,
} from 'lucide-react';
import type { Framework, FrameworkId, Lens, Scenario } from '../types/cadence';
import styles from './ScenarioModal.module.css';

export interface ScenarioModalProps {
  isOpen: boolean;
  frameworks: Framework[];
  initialScenario?: Scenario | null;
  onClose: () => void;
  onSave: (scenario: Scenario, startImmediately: boolean) => void;
}

const FOCUS_OPTIONS: Array<{ id: Lens; label: string; defaultFramework: FrameworkId }> = [
  { id: 'camera', label: 'Camera & Presence', defaultFramework: 'hook-psi' },
  { id: 'clarity', label: 'Clear Thinking', defaultFramework: 'prep' },
  { id: 'negotiation', label: 'Negotiation', defaultFramework: 'tactical-empathy' },
];

const DURATION_OPTIONS = [45, 60, 75, 90] as const;

function FocusIcon({ lens }: { lens: Lens }) {
  switch (lens) {
    case 'camera':
      return <Video size={14} strokeWidth={1.7} aria-hidden="true" />;
    case 'clarity':
      return <Layers size={14} strokeWidth={1.7} aria-hidden="true" />;
    case 'negotiation':
      return <MessageSquareQuote size={14} strokeWidth={1.7} aria-hidden="true" />;
  }
}

function deriveOutlineHints(framework: Framework | undefined): [string, string, string] {
  if (!framework || framework.beats.length === 0) {
    return ['Opening stance', 'Core proof', 'Clean close'];
  }
  const beats = framework.beats;
  const first = beats[0].label;
  const mid = beats[Math.min(1, beats.length - 1)].label;
  const last = beats[beats.length - 1].label;
  return [first, mid, last];
}

export function ScenarioModal({
  isOpen,
  frameworks,
  initialScenario = null,
  onClose,
  onSave,
}: ScenarioModalProps) {
  const isEditing = Boolean(initialScenario);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [lens, setLens] = useState<Lens>('clarity');
  const [frameworkId, setFrameworkId] = useState<FrameworkId>('prep');
  const [frameworkManuallyChosen, setFrameworkManuallyChosen] = useState(false);
  const [durationSec, setDurationSec] = useState<number>(60);
  const [contextText, setContextText] = useState('');
  const [pushback, setPushback] = useState('');
  const [counterpartRole, setCounterpartRole] = useState('');
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (initialScenario) {
      setTitle(initialScenario.title);
      setLens(initialScenario.lens);
      setFrameworkId(initialScenario.frameworkId);
      setFrameworkManuallyChosen(true);
      setDurationSec(initialScenario.durationSec);
      setContextText(initialScenario.stakes || initialScenario.prompt || '');
      setPushback(initialScenario.openingPushback ?? '');
      setCounterpartRole(initialScenario.counterpartRole ?? '');
    } else {
      setTitle('');
      setLens('clarity');
      setFrameworkId('prep');
      setFrameworkManuallyChosen(false);
      setDurationSec(60);
      setContextText('');
      setPushback('');
      setCounterpartRole('');
    }
    setTitleError(false);

    const focusTimer = window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(focusTimer);
  }, [isOpen, initialScenario]);

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

  const selectedFramework = useMemo(
    () => frameworks.find((fw) => fw.id === frameworkId) ?? frameworks[0],
    [frameworks, frameworkId]
  );

  if (!isOpen) return null;

  const handleSelectLens = (nextLens: Lens) => {
    setLens(nextLens);
    if (!frameworkManuallyChosen) {
      const match = FOCUS_OPTIONS.find((opt) => opt.id === nextLens);
      if (match) {
        setFrameworkId(match.defaultFramework);
      }
    }
  };

  const handleSelectFramework = (nextId: FrameworkId) => {
    setFrameworkId(nextId);
    setFrameworkManuallyChosen(true);
  };

  const buildAndSubmit = (startImmediately: boolean) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }

    const trimmedContext = contextText.trim();
    const effectiveStakes =
      trimmedContext ||
      'Deliver your point with calm structure, steady pacing, and a clean close.';
    const trimmedPushback = lens === 'negotiation' ? pushback.trim() : '';
    const trimmedRole =
      lens === 'negotiation' && trimmedPushback
        ? counterpartRole.trim() || 'Counterpart'
        : undefined;

    const scenario: Scenario = {
      id: initialScenario?.id ?? `custom-${Date.now()}`,
      title: trimmedTitle,
      lens,
      frameworkId: selectedFramework?.id ?? frameworkId,
      durationSec,
      stakes: effectiveStakes,
      prompt: effectiveStakes,
      counterpartRole: trimmedRole,
      openingPushback: trimmedPushback || undefined,
      outlineHints: deriveOutlineHints(selectedFramework),
      isCustom: true,
      createdAt: initialScenario?.createdAt ?? new Date().toISOString(),
    };

    onSave(scenario, startImmediately);
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              {isEditing ? 'Edit Custom Scenario' : 'New Scenario'}
            </span>
            <h2 id="scenario-modal-title" className={styles.title}>
              {isEditing ? 'Refine your practice room' : 'Create your own scenario'}
            </h2>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close scenario editor"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            buildAndSubmit(true);
          }}
          noValidate
        >
          {/* 1. Title */}
          <div className={styles.field}>
            <label htmlFor="custom-scenario-title" className={styles.label}>
              What are you preparing for?
            </label>
            <input
              ref={titleInputRef}
              id="custom-scenario-title"
              type="text"
              className={`${styles.input} ${titleError ? styles.inputError : ''}`}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError && e.target.value.trim()) {
                  setTitleError(false);
                }
              }}
              placeholder="e.g. Pitching our Q3 plan to leadership"
              maxLength={90}
              required
            />
            {titleError && (
              <span className={styles.errorText} role="alert">
                Give your scenario a short title so you can find it on the desk.
              </span>
            )}
          </div>

          {/* 2. Focus */}
          <div className={styles.field}>
            <span className={styles.label}>Focus</span>
            <div className={styles.pillRow} role="radiogroup" aria-label="Scenario focus">
              {FOCUS_OPTIONS.map((opt) => {
                const active = lens === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.focusPill} ${
                      active ? styles[`focusPillActive_${opt.id}`] : ''
                    }`}
                    onClick={() => handleSelectLens(opt.id)}
                  >
                    <FocusIcon lens={opt.id} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Framework & 4. Duration */}
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label htmlFor="custom-scenario-framework" className={styles.label}>
                Framework
              </label>
              <select
                id="custom-scenario-framework"
                className={styles.select}
                value={frameworkId}
                onChange={(e) => handleSelectFramework(e.target.value as FrameworkId)}
              >
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Duration</span>
              <div className={styles.durationRow} role="radiogroup" aria-label="Target duration">
                {DURATION_OPTIONS.map((sec) => {
                  const active = durationSec === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.durationPill} ${
                        active ? styles.durationPillActive : ''
                      } tabular-nums`}
                      onClick={() => setDurationSec(sec)}
                    >
                      {sec}s
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedFramework && (
            <div className={styles.beatPreview} aria-label="Framework beat sequence">
              <span className={styles.beatPreviewLabel}>Beats</span>
              <span className={styles.beatPreviewChain}>
                {selectedFramework.beats.map((b) => b.label).join(' → ')}
              </span>
            </div>
          )}

          {/* 5. Context / Stakes */}
          <div className={styles.field}>
            <label htmlFor="custom-scenario-context" className={styles.label}>
              Context &amp; stakes
              <span className={styles.optionalTag}>Optional</span>
            </label>
            <textarea
              id="custom-scenario-context"
              className={styles.textarea}
              rows={3}
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder="Who are you talking to, and what outcome do you want?"
              maxLength={320}
            />
          </div>

          {/* 6. Counterpart Pushback (Negotiation only) */}
          {lens === 'negotiation' && (
            <div className={styles.negotiationBox}>
              <div className={styles.negotiationHeader}>
                <MessageSquareQuote size={14} strokeWidth={1.7} aria-hidden="true" />
                <span>Counterpart&rsquo;s Pushback</span>
                <span className={styles.optionalTag}>Optional</span>
              </div>

              <div className={styles.negotiationFields}>
                <input
                  id="custom-scenario-pushback"
                  type="text"
                  className={styles.input}
                  value={pushback}
                  onChange={(e) => setPushback(e.target.value)}
                  placeholder="What objection might they throw at you?"
                  aria-label="Counterpart objection"
                  maxLength={220}
                />
                <input
                  id="custom-scenario-role"
                  type="text"
                  className={styles.inputCompact}
                  value={counterpartRole}
                  onChange={(e) => setCounterpartRole(e.target.value)}
                  placeholder="Counterpart role (e.g. Hiring Manager)"
                  aria-label="Counterpart role"
                  maxLength={48}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>

            <div className={styles.footerRight}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => buildAndSubmit(false)}
              >
                Save to Desk
              </button>

              <button type="submit" className={styles.primaryButton}>
                <span>{isEditing ? 'Save & Enter Studio' : 'Create & Enter Studio'}</span>
                <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
