import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  FileText,
  Layers,
  MessageSquareQuote,
  Plus,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import type {
  Framework,
  FrameworkId,
  Lens,
  Scenario,
  ScenarioQuestion,
  ScenarioTemplate,
} from '../types/cadence';
import styles from './CreateScenarioView.module.css';

export interface CreateScenarioViewProps {
  frameworks: Framework[];
  templates: ScenarioTemplate[];
  questionSuggestions: Record<Lens, string[]>;
  editingScenario?: Scenario | null;
  onSave: (scenario: Scenario, startImmediately: boolean) => void;
  onCancelEdit?: () => void;
}

interface DraftQuestion {
  id: string;
  text: string;
}

const MAX_QUESTIONS = 6;
const DURATION_OPTIONS = [45, 60, 90, 120] as const;

const CATEGORY_OPTIONS: Array<{
  id: Lens;
  label: string;
  defaultFramework: FrameworkId;
}> = [
  { id: 'camera', label: 'On Camera', defaultFramework: 'hook-psi' },
  { id: 'clarity', label: 'Clear Thinking', defaultFramework: 'prep' },
  { id: 'negotiation', label: 'Negotiation', defaultFramework: 'tactical-empathy' },
];

function snapDurationToOption(sec: number): number {
  let closest: number = DURATION_OPTIONS[1];
  let smallestDiff = Math.abs(sec - closest);
  for (const opt of DURATION_OPTIONS) {
    const diff = Math.abs(sec - opt);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = opt;
    }
  }
  return closest;
}

function makeDraftId(seed: number): string {
  return `q-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 6)}`;
}

function createBlankQuestions(): DraftQuestion[] {
  return [
    { id: makeDraftId(1), text: '' },
    { id: makeDraftId(2), text: '' },
    { id: makeDraftId(3), text: '' },
  ];
}

function CategoryIcon({ lens }: { lens: Lens }) {
  switch (lens) {
    case 'camera':
      return <Video size={14} strokeWidth={1.7} aria-hidden="true" />;
    case 'clarity':
      return <Layers size={14} strokeWidth={1.7} aria-hidden="true" />;
    case 'negotiation':
      return <MessageSquareQuote size={14} strokeWidth={1.7} aria-hidden="true" />;
  }
}

export function CreateScenarioView({
  frameworks,
  templates,
  questionSuggestions,
  editingScenario = null,
  onSave,
  onCancelEdit,
}: CreateScenarioViewProps) {
  const isEditing = Boolean(editingScenario);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTemplateId, setActiveTemplateId] = useState<string>('blank');
  const [title, setTitle] = useState('');
  const [lens, setLens] = useState<Lens>('clarity');
  const [frameworkId, setFrameworkId] = useState<FrameworkId>('prep');
  const [frameworkTouched, setFrameworkTouched] = useState(false);
  const [durationSec, setDurationSec] = useState<number>(60);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => createBlankQuestions());
  const [contextText, setContextText] = useState('');
  const [pushback, setPushback] = useState('');
  const [counterpartRole, setCounterpartRole] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [titleError, setTitleError] = useState(false);
  const [questionsError, setQuestionsError] = useState(false);

  // Sync form when entering Create or switching into Edit mode
  useEffect(() => {
    if (editingScenario) {
      setActiveTemplateId('custom-edit');
      setTitle(editingScenario.title);
      setLens(editingScenario.lens);
      setFrameworkId(editingScenario.frameworkId);
      setFrameworkTouched(true);
      setDurationSec(snapDurationToOption(editingScenario.durationSec));
      setQuestions(
        editingScenario.questions.length > 0
          ? editingScenario.questions.slice(0, MAX_QUESTIONS).map((q) => ({
              id: q.id,
              text: q.text,
            }))
          : createBlankQuestions()
      );
      setContextText(editingScenario.stakes || editingScenario.prompt || '');
      setPushback(editingScenario.openingPushback ?? '');
      setCounterpartRole(editingScenario.counterpartRole ?? '');
      setPreviewIndex(0);
      setTitleError(false);
      setQuestionsError(false);
    } else {
      setActiveTemplateId('blank');
      setTitle('');
      setLens('clarity');
      setFrameworkId('prep');
      setFrameworkTouched(false);
      setDurationSec(60);
      setQuestions(createBlankQuestions());
      setContextText('');
      setPushback('');
      setCounterpartRole('');
      setPreviewIndex(0);
      setTitleError(false);
      setQuestionsError(false);
    }
  }, [editingScenario]);

  const selectedFramework = useMemo(
    () => frameworks.find((fw) => fw.id === frameworkId) ?? frameworks[0],
    [frameworks, frameworkId]
  );

  const normalizedQuestionSet = useMemo(
    () => new Set(questions.map((q) => q.text.trim().toLowerCase()).filter(Boolean)),
    [questions]
  );

  const previewQuestions = useMemo(() => {
    const filled = questions.filter((q) => q.text.trim().length > 0);
    if (filled.length > 0) return filled;
    return questions;
  }, [questions]);

  const safePreviewIndex = Math.min(
    previewIndex,
    Math.max(0, previewQuestions.length - 1)
  );
  const activePreviewQuestion = previewQuestions[safePreviewIndex];
  const activePreviewBeat =
    selectedFramework?.beats[
      Math.min(safePreviewIndex, (selectedFramework?.beats.length ?? 1) - 1)
    ];

  const filledCount = questions.filter((q) => q.text.trim().length > 0).length;
  const pacingDivisor = Math.max(1, filledCount || questions.length);
  const secondsPerQuestion = Math.max(5, Math.round(durationSec / pacingDivisor));

  const applyBlankTemplate = () => {
    setActiveTemplateId('blank');
    setTitle('');
    setLens('clarity');
    setFrameworkId('prep');
    setFrameworkTouched(false);
    setDurationSec(60);
    setQuestions(createBlankQuestions());
    setContextText('');
    setPushback('');
    setCounterpartRole('');
    setPreviewIndex(0);
    setTitleError(false);
    setQuestionsError(false);
    titleInputRef.current?.focus();
  };

  const applyTemplate = (tpl: ScenarioTemplate) => {
    setActiveTemplateId(tpl.id);
    setTitle(tpl.defaultTitle);
    setLens(tpl.lens);
    setFrameworkId(tpl.frameworkId);
    setFrameworkTouched(false);
    setDurationSec(snapDurationToOption(tpl.durationSec));
    setQuestions(
      tpl.defaultQuestions.slice(0, MAX_QUESTIONS).map((text, idx) => ({
        id: makeDraftId(idx + 1),
        text,
      }))
    );
    setContextText(tpl.defaultStakes);
    setPushback(tpl.defaultPushback ?? '');
    setCounterpartRole(tpl.defaultRole ?? '');
    setPreviewIndex(0);
    setTitleError(false);
    setQuestionsError(false);
  };

  const handleSelectLens = (nextLens: Lens) => {
    setLens(nextLens);
    if (!frameworkTouched) {
      const opt = CATEGORY_OPTIONS.find((item) => item.id === nextLens);
      if (opt) {
        setFrameworkId(opt.defaultFramework);
      }
    }
  };

  const handleUpdateQuestion = (index: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, text: value } : q))
    );
    if (questionsError && value.trim()) {
      setQuestionsError(false);
    }
    setPreviewIndex(index);
  };

  const handleAddQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    const nextIdx = questions.length;
    setQuestions((prev) => [...prev, { id: makeDraftId(nextIdx + 1), text: '' }]);
    setPreviewIndex(nextIdx);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    setPreviewIndex((prev) => Math.max(0, Math.min(prev, questions.length - 2)));
  };

  const handleMoveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
    setPreviewIndex(target);
  };

  const handleQuickAddSuggestion = (suggestion: string) => {
    const lower = suggestion.trim().toLowerCase();
    if (normalizedQuestionSet.has(lower)) return;

    const emptyIdx = questions.findIndex((q) => q.text.trim().length === 0);
    if (emptyIdx !== -1) {
      setQuestions((prev) =>
        prev.map((q, i) => (i === emptyIdx ? { ...q, text: suggestion } : q))
      );
      setPreviewIndex(emptyIdx);
      setQuestionsError(false);
      return;
    }

    if (questions.length < MAX_QUESTIONS) {
      const nextIdx = questions.length;
      setQuestions((prev) => [
        ...prev,
        { id: makeDraftId(nextIdx + 1), text: suggestion },
      ]);
      setPreviewIndex(nextIdx);
      setQuestionsError(false);
    }
  };

  const handleSubmit = (startImmediately: boolean) => {
    const trimmedTitle = title.trim();
    const cleanedQuestions: ScenarioQuestion[] = questions
      .map((q, idx) => {
        const text = q.text.trim();
        const matchingBeat =
          selectedFramework?.beats[
            Math.min(idx, (selectedFramework?.beats.length ?? 1) - 1)
          ];
        return {
          id: q.id || `custom-q-${idx + 1}`,
          text,
          hint: matchingBeat
            ? `${matchingBeat.label} · ${matchingBeat.starterCue}`
            : undefined,
        };
      })
      .filter((q) => q.text.length > 0);

    let hasError = false;
    if (!trimmedTitle) {
      setTitleError(true);
      hasError = true;
      titleInputRef.current?.focus();
    }
    if (cleanedQuestions.length === 0) {
      setQuestionsError(true);
      hasError = true;
    }
    if (hasError) return;

    const trimmedContext = contextText.trim();
    const effectiveStakes =
      trimmedContext ||
      `Answer ${cleanedQuestions.length} focused ${
        cleanedQuestions.length === 1 ? 'question' : 'questions'
      } with calm pacing and a clean close.`;

    const trimmedPushback = lens === 'negotiation' ? pushback.trim() : '';
    const trimmedRole =
      lens === 'negotiation' && trimmedPushback
        ? counterpartRole.trim() || 'Counterpart'
        : undefined;

    const scenario: Scenario = {
      id: editingScenario?.id ?? `custom-${Date.now()}`,
      title: trimmedTitle,
      lens,
      frameworkId: selectedFramework?.id ?? frameworkId,
      durationSec,
      stakes: effectiveStakes,
      prompt: effectiveStakes,
      questions: cleanedQuestions,
      counterpartRole: trimmedRole,
      openingPushback: trimmedPushback || undefined,
      isCustom: true,
      createdAt: editingScenario?.createdAt ?? new Date().toISOString(),
    };

    onSave(scenario, startImmediately);
  };

  const suggestionsForLens = questionSuggestions[lens] ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>
            {isEditing ? 'Edit Custom Scenario' : 'Scenario Builder'}
          </span>
          <h1 className={styles.pageTitle}>
            {isEditing ? 'Refine your practice scenario' : 'Build your own speaking scenario'}
          </h1>
          <p className={styles.pageSubtitle}>
            Add the exact questions you want to answer aloud — Cadence turns each one into a
            live cue card right under your camera lens.
          </p>
        </div>
      </header>

      {/* Starter Templates Strip */}
      {!isEditing && (
        <section className={styles.templatesStrip} aria-label="Starter templates">
          <span className={styles.templatesLabel}>Start from a template:</span>
          <div className={styles.templatePills}>
            <button
              type="button"
              className={`${styles.templatePill} ${
                activeTemplateId === 'blank' ? styles.templatePillActive : ''
              }`}
              onClick={applyBlankTemplate}
            >
              <FileText size={13} strokeWidth={1.75} aria-hidden="true" />
              <span>Blank</span>
            </button>

            {templates.map((tpl) => {
              const active = activeTemplateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className={`${styles.templatePill} ${
                    active ? styles.templatePillActive : ''
                  }`}
                  onClick={() => applyTemplate(tpl)}
                  title={tpl.description}
                >
                  <CategoryIcon lens={tpl.lens} />
                  <span>{tpl.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 2-Column Workspace: Builder Left, Sticky Live Preview Right */}
      <form
        className={styles.workspace}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(true);
        }}
        noValidate
      >
        <div className={styles.builderCol}>
          {/* 1. Title & Core Setup */}
          <section className={styles.card}>
            <div className={styles.field}>
              <label htmlFor="builder-title" className={styles.label}>
                Scenario title
              </label>
              <input
                ref={titleInputRef}
                id="builder-title"
                type="text"
                className={`${styles.input} ${titleError ? styles.inputError : ''}`}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError && e.target.value.trim()) setTitleError(false);
                }}
                placeholder="What talk, video, or conversation are you preparing for?"
                maxLength={96}
                required
              />
              {titleError && (
                <span className={styles.errorText} role="alert">
                  Add a short title so you can spot this scenario on your desk.
                </span>
              )}
            </div>

            <div className={styles.setupGrid}>
              <div className={styles.field}>
                <span className={styles.label}>Category</span>
                <div
                  className={styles.categoryPills}
                  role="radiogroup"
                  aria-label="Scenario category"
                >
                  {CATEGORY_OPTIONS.map((opt) => {
                    const active = lens === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`${styles.categoryPill} ${
                          active ? styles[`categoryActive_${opt.id}`] : ''
                        }`}
                        onClick={() => handleSelectLens(opt.id)}
                      >
                        <CategoryIcon lens={opt.id} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Target time</span>
                <div
                  className={styles.durationPills}
                  role="radiogroup"
                  aria-label="Target speaking time"
                >
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

            <div className={styles.structureRow}>
              <div className={styles.structureSelectWrap}>
                <label htmlFor="builder-framework" className={styles.label}>
                  Speaking structure
                </label>
                <select
                  id="builder-framework"
                  className={styles.select}
                  value={frameworkId}
                  onChange={(e) => {
                    setFrameworkId(e.target.value as FrameworkId);
                    setFrameworkTouched(true);
                  }}
                >
                  {frameworks.map((fw) => (
                    <option key={fw.id} value={fw.id}>
                      {fw.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFramework && (
                <div className={styles.beatChainBox}>
                  <span className={styles.beatChainLabel}>Beat flow</span>
                  <span className={styles.beatChainText}>
                    {selectedFramework.beats.map((b) => b.label).join(' → ')}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* 2. HERO SECTION — Questions to Answer in Your Speech */}
          <section
            className={`${styles.card} ${styles.questionsCard}`}
            aria-labelledby="questions-section-heading"
          >
            <div className={styles.questionsHeader}>
              <div>
                <h2 id="questions-section-heading" className={styles.sectionTitle}>
                  Questions to Answer in Your Speech
                </h2>
                <p className={styles.sectionSubcopy}>
                  Add 1 to 6 questions or talking points. You&rsquo;ll advance through them one
                  by one while recording.
                </p>
              </div>
              <span className={`${styles.qCounterPill} tabular-nums`}>
                {questions.length} / {MAX_QUESTIONS}
              </span>
            </div>

            <ol className={styles.questionList}>
              {questions.map((q, idx) => (
                <li
                  key={q.id}
                  className={`${styles.questionRow} ${
                    safePreviewIndex === idx ? styles.questionRowFocused : ''
                  }`}
                >
                  <span className={`${styles.qBadge} tabular-nums`}>Q{idx + 1}</span>
                  <input
                    type="text"
                    className={styles.questionInput}
                    value={q.text}
                    onFocus={() => setPreviewIndex(idx)}
                    onChange={(e) => handleUpdateQuestion(idx, e.target.value)}
                    placeholder={
                      idx === 0
                        ? 'What is the opening question or headline you want to answer?'
                        : idx === questions.length - 1
                          ? 'What takeaway, close, or ask lands the finish?'
                          : 'What point, example, or objection do you want to cover?'
                    }
                    aria-label={`Question ${idx + 1}`}
                    maxLength={180}
                  />
                  <div className={styles.rowControls}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={() => handleMoveQuestion(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`Move question ${idx + 1} up`}
                      title="Move up"
                    >
                      <ArrowUp size={13} strokeWidth={1.85} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={() => handleMoveQuestion(idx, 1)}
                      disabled={idx === questions.length - 1}
                      aria-label={`Move question ${idx + 1} down`}
                      title="Move down"
                    >
                      <ArrowDown size={13} strokeWidth={1.85} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowIconBtn} ${styles.rowIconDanger}`}
                      onClick={() => handleRemoveQuestion(idx)}
                      disabled={questions.length <= 1}
                      aria-label={`Remove question ${idx + 1}`}
                      title="Remove question"
                    >
                      <Trash2 size={13} strokeWidth={1.85} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            {questionsError && (
              <span className={styles.errorText} role="alert">
                Add at least one question you want to answer in your speech.
              </span>
            )}

            <div className={styles.addRow}>
              <button
                type="button"
                className={styles.addQuestionBtn}
                onClick={handleAddQuestion}
                disabled={questions.length >= MAX_QUESTIONS}
              >
                <Plus size={15} strokeWidth={2} aria-hidden="true" />
                <span>
                  {questions.length >= MAX_QUESTIONS
                    ? 'Maximum 6 questions reached'
                    : 'Add Question'}
                </span>
              </button>
            </div>

            {/* 1-Click Quick-Add Suggestion Chips */}
            {suggestionsForLens.length > 0 && (
              <div className={styles.suggestionsBlock}>
                <span className={styles.suggestionsLabel}>
                  <Sparkles size={12} strokeWidth={1.8} aria-hidden="true" />
                  Quick-add prompt ideas:
                </span>
                <div className={styles.suggestionChips}>
                  {suggestionsForLens.map((prompt) => {
                    const alreadyAdded = normalizedQuestionSet.has(
                      prompt.trim().toLowerCase()
                    );
                    const isFull =
                      !alreadyAdded &&
                      questions.length >= MAX_QUESTIONS &&
                      questions.every((q) => q.text.trim().length > 0);
                    return (
                      <button
                        key={prompt}
                        type="button"
                        className={`${styles.suggestionChip} ${
                          alreadyAdded ? styles.suggestionChipAdded : ''
                        }`}
                        disabled={alreadyAdded || isFull}
                        onClick={() => handleQuickAddSuggestion(prompt)}
                      >
                        {alreadyAdded ? (
                          <Check size={12} strokeWidth={2.2} aria-hidden="true" />
                        ) : (
                          <Plus size={12} strokeWidth={2} aria-hidden="true" />
                        )}
                        <span>{prompt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 3. Optional Context & Conditional Negotiation Pushback */}
          <section className={styles.card}>
            <div className={styles.field}>
              <label htmlFor="builder-context" className={styles.label}>
                Short context
                <span className={styles.optionalTag}>Optional</span>
              </label>
              <textarea
                id="builder-context"
                className={styles.textarea}
                rows={2}
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                placeholder="Who are you talking to, and what outcome do you want?"
                maxLength={280}
              />
            </div>

            {lens === 'negotiation' && (
              <div className={styles.pushbackBox}>
                <div className={styles.pushbackHeader}>
                  <MessageSquareQuote size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Counterpart&rsquo;s Pushback</span>
                  <span className={styles.optionalTag}>Optional</span>
                </div>
                <input
                  id="builder-pushback"
                  type="text"
                  className={styles.input}
                  value={pushback}
                  onChange={(e) => setPushback(e.target.value)}
                  placeholder="What tough objection might they throw at you live?"
                  aria-label="Counterpart objection"
                  maxLength={220}
                />
                <input
                  id="builder-role"
                  type="text"
                  className={styles.inputCompact}
                  value={counterpartRole}
                  onChange={(e) => setCounterpartRole(e.target.value)}
                  placeholder="Who is pushing back? (e.g. Hiring Manager, Client CFO)"
                  aria-label="Counterpart role"
                  maxLength={48}
                />
              </div>
            )}
          </section>
        </div>

        {/* Right Column — Sticky Live Studio Cue-Card Preview */}
        <aside className={styles.previewCol} aria-label="Live studio cue card preview">
          <div className={styles.previewStickyCard}>
            <div className={styles.previewCardHeader}>
              <span className={styles.previewTitle}>Live Studio Preview</span>
              <span className={`${styles.pacingChip} tabular-nums`}>
                {filledCount || questions.length}{' '}
                {(filledCount || questions.length) === 1 ? 'question' : 'questions'} · ~
                {secondsPerQuestion}s each
              </span>
            </div>

            {/* Mini Warm-Charcoal Studio Stage */}
            <div className={styles.miniStage}>
              <div className={styles.miniBeacon}>
                <span className={styles.miniBeaconDot} aria-hidden="true" />
                <span>Look at camera lens</span>
              </div>

              <div className={styles.miniCueCard}>
                <div className={styles.miniProgressTrack} aria-hidden="true">
                  {previewQuestions.map((pq, idx) => (
                    <span
                      key={pq.id}
                      className={`${styles.miniProgressSeg} ${
                        idx <= safePreviewIndex ? styles.miniProgressSegActive : ''
                      }`}
                    />
                  ))}
                </div>

                <div className={styles.miniCueMeta}>
                  <span className="tabular-nums">
                    Question {safePreviewIndex + 1} of {previewQuestions.length}
                  </span>
                  {activePreviewBeat && (
                    <span className={styles.miniBeatTag}>{activePreviewBeat.label}</span>
                  )}
                </div>

                <p className={styles.miniCueQuestion}>
                  {activePreviewQuestion?.text.trim() ||
                    'Type your first question on the left to see your live cue card…'}
                </p>

                {activePreviewBeat && (
                  <p className={styles.miniCueHint}>{activePreviewBeat.starterCue}</p>
                )}
              </div>

              {lens === 'negotiation' && pushback.trim() && (
                <div className={styles.miniPushback}>
                  <span className={styles.miniPushbackRole}>
                    {counterpartRole.trim() || 'Counterpart'}
                  </span>
                  <p className={styles.miniPushbackText}>&ldquo;{pushback.trim()}&rdquo;</p>
                </div>
              )}

              {previewQuestions.length > 1 && (
                <div className={styles.previewSwitcher} role="group" aria-label="Preview question">
                  {previewQuestions.map((pq, idx) => (
                    <button
                      key={pq.id}
                      type="button"
                      className={`${styles.previewStepPill} ${
                        idx === safePreviewIndex ? styles.previewStepPillActive : ''
                      } tabular-nums`}
                      onClick={() => setPreviewIndex(idx)}
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.previewMetaLine}>
              <span className={styles.previewScenarioName}>
                {title.trim() || 'Untitled Scenario'}
              </span>
              <span className="tabular-nums">{durationSec}s</span>
            </div>

            <div className={styles.actionStack}>
              <button type="submit" className={styles.primaryAction}>
                <span>
                  {isEditing ? 'Save & Start Practicing' : 'Save & Start Practicing'}
                </span>
                <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
              </button>

              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => handleSubmit(false)}
              >
                Save to My Scenarios
              </button>

              {isEditing && onCancelEdit && (
                <button
                  type="button"
                  className={styles.cancelAction}
                  onClick={onCancelEdit}
                >
                  Cancel Editing
                </button>
              )}
            </div>
          </div>
        </aside>
      </form>
    </main>
  );
}
