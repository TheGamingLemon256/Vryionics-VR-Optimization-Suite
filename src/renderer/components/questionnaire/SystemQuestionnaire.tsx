// Vryionics VR Optimization Suite — System Setup Questionnaire
// Full-page interactive branching interview. One question at a time,
// auto-advancing after selection, with back navigation and completion summary.

import React, { useEffect, useRef, useState } from 'react'
import { useQuestionnaireStore } from '../../stores/questionnaire-store'
import { useAppStore } from '../../stores/app-store'
import { QUESTION_TREE, getAnswerLabel, type Question, type QuestionOption } from '../../../main/data/questionnaire-tree'

// ── Section colour palette ────────────────────────────────────────────────────

const SECTION_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  Hardware:   { bg: 'bg-blue-500/15',   text: 'text-blue-300',   border: 'border-blue-500/30',   icon: '🥽' },
  Connection: { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30', icon: '🔌' },
  Issues:     { bg: 'bg-amber-500/15',  text: 'text-amber-300',  border: 'border-amber-500/30',  icon: '⚠️' },
  Goals:      { bg: 'bg-emerald-500/15',text: 'text-emerald-300',border: 'border-emerald-500/30',icon: '🎯' },
}

function getSectionStyle(section: string) {
  return SECTION_STYLES[section] ?? { bg: 'bg-white/5', text: 'text-gray-300', border: 'border-white/10', icon: '❓' }
}

// ── Auto-advance delay (ms) after an option card is clicked ───────────────────
const AUTO_ADVANCE_DELAY = 400

// ── Main export ───────────────────────────────────────────────────────────────

export default function SystemQuestionnaire(): React.ReactElement {
  const {
    currentQuestionId,
    isComplete,
    answers,
    history,
    startQuestionnaire,
    answerQuestion,
    goBack,
    resetQuestionnaire,
    getCurrentQuestion,
    getProgress,
  } = useQuestionnaireStore()

  const setCurrentPage = useAppStore((s) => s.setCurrentPage)

  // Whether the welcome screen is showing (before any start)
  const hasStarted = currentQuestionId !== null || isComplete
  const [animKey, setAnimKey] = useState(0) // bump to retrigger CSS animation

  // Bump animation key whenever the question changes
  const prevQuestionId = useRef<string | null>(null)
  useEffect(() => {
    if (currentQuestionId !== prevQuestionId.current) {
      setAnimKey((k) => k + 1)
      prevQuestionId.current = currentQuestionId
    }
  }, [currentQuestionId])

  if (!hasStarted) {
    return (
      <WelcomeScreen
        onStart={() => {
          startQuestionnaire()
          setAnimKey((k) => k + 1)
        }}
        onSkip={() => setCurrentPage('dashboard')}
      />
    )
  }

  if (isComplete) {
    return (
      <CompletionScreen
        answers={answers}
        onEdit={() => {
          resetQuestionnaire()
          startQuestionnaire()
        }}
        onViewPlan={() => setCurrentPage('summary')}
      />
    )
  }

  const question = getCurrentQuestion()
  if (!question) return <div className="text-gray-400 text-center p-12">Loading…</div>

  const { current, estimated } = getProgress()
  const progressPct = Math.min(100, Math.round((current / estimated) * 100))

  return (
    <QuestionScreen
      key={animKey}
      question={question}
      current={current}
      estimated={estimated}
      progressPct={progressPct}
      canGoBack={history.length > 0}
      onAnswer={(value) => answerQuestion(question.id, value)}
      onBack={goBack}
    />
  )
}

// ── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({
  onStart,
  onSkip,
}: {
  onStart: () => void
  onSkip: () => void
}): React.ReactElement {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 page-enter">
      <div className="w-full max-w-lg space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl glass-panel-sm flex items-center justify-center text-5xl">
            🎯
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-white">System Setup Interview</h1>
          <p className="text-sm text-gray-400 leading-relaxed max-w-sm mx-auto">
            Answer ~10 questions about your specific setup. Vryionics will use your
            answers to give you more precise, personalised recommendations.
            Takes about 2 minutes.
          </p>
        </div>

        {/* Info cards */}
        <div className="space-y-2">
          {[
            { icon: '🌿', title: 'Branching paths', body: 'You only see questions relevant to your setup — no wasted time.' },
            { icon: '🔒', title: 'Stays on your PC', body: 'All answers are stored locally. Nothing leaves your machine.' },
            { icon: '✏️', title: 'Edit any time', body: 'You can restart the interview from Settings whenever you like.' },
          ].map(({ icon, title, body }) => (
            <div key={title} className="flex items-start gap-4 glass-panel-sm p-3.5 rounded-xl">
              <span className="text-xl mt-0.5">{icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            className="glass-button btn-spring w-full py-3 text-sm font-semibold"
            onClick={onStart}
          >
            Start Interview →
          </button>
          <button
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Question screen ───────────────────────────────────────────────────────────

function QuestionScreen({
  question,
  current,
  estimated,
  progressPct,
  canGoBack,
  onAnswer,
  onBack,
}: {
  question: Question
  current: number
  estimated: number
  progressPct: number
  canGoBack: boolean
  onAnswer: (value: string) => void
  onBack: () => void
}): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const sectionStyle = getSectionStyle(question.section)

  const handleOptionClick = (value: string) => {
    if (advancing) return
    setSelected(value)
    setAdvancing(true)
    setTimeout(() => {
      onAnswer(value)
    }, AUTO_ADVANCE_DELAY)
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 panel-animate">
      <div className="w-full max-w-xl space-y-6">

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="font-medium">
              {sectionStyle.icon}&nbsp;{question.section}
              &nbsp;—&nbsp;Step {current} of ~{estimated}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, var(--accent-primary), #5b9bf5)',
              }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-2xl overflow-hidden">

          {/* Section chip strip */}
          <div className={`px-6 py-2 flex items-center gap-2 border-b border-white/5 ${sectionStyle.bg}`}>
            <span className={`text-xs font-semibold uppercase tracking-widest ${sectionStyle.text}`}>
              {question.section}
            </span>
          </div>

          <div className="p-6 space-y-6">

            {/* Question text */}
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-white leading-snug">{question.question}</h2>
              {question.subtext && (
                <p className="text-xs text-gray-400 leading-relaxed">{question.subtext}</p>
              )}
            </div>

            {/* Options */}
            <div className="space-y-2">
              {question.options.map((option) => (
                <OptionCard
                  key={option.value}
                  option={option}
                  isSelected={selected === option.value}
                  isDisabled={advancing && selected !== option.value}
                  onClick={() => handleOptionClick(option.value)}
                />
              ))}
            </div>

            {/* Back button */}
            {canGoBack && (
              <button
                className="glass-button-danger btn-spring px-4 py-2 text-xs w-full"
                onClick={onBack}
                disabled={advancing}
              >
                ← Back
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Option card ───────────────────────────────────────────────────────────────

function OptionCard({
  option,
  isSelected,
  isDisabled,
  onClick,
}: {
  option: QuestionOption
  isSelected: boolean
  isDisabled: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 btn-spring',
        'flex items-start gap-3',
        isSelected
          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 shadow-[0_0_12px_rgba(124,91,245,0.2)]'
          : isDisabled
            ? 'glass-panel-sm border-white/5 opacity-40 cursor-not-allowed'
            : 'glass-panel-sm border-white/5 hover:border-[var(--accent-primary)]/40 hover:bg-[var(--accent-primary)]/5 cursor-pointer',
      ].join(' ')}
    >
      {/* Icon */}
      {option.icon && (
        <span className="text-xl mt-0.5 shrink-0 leading-none">{option.icon}</span>
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${isSelected ? 'text-white' : 'text-gray-200'}`}>
          {option.label}
        </p>
        {option.description && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{option.description}</p>
        )}
      </div>

      {/* Selected check */}
      {isSelected && (
        <span className="text-[var(--accent-primary)] text-sm shrink-0 mt-0.5">✓</span>
      )}
    </button>
  )
}

// ── Completion screen ─────────────────────────────────────────────────────────

function CompletionScreen({
  answers,
  onEdit,
  onViewPlan,
}: {
  answers: Record<string, string>
  onEdit: () => void
  onViewPlan: () => void
}): React.ReactElement {
  // Group answered questions by section for the summary
  const sections = buildAnswerSummary(answers)

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 page-enter">
      <div className="w-full max-w-lg space-y-6">

        {/* Checkmark */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-4xl panel-animate">
            ✓
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-white">Interview complete!</h1>
          <p className="text-sm text-gray-400">
            Your action plan has been updated with your answers.
          </p>
        </div>

        {/* Answers summary */}
        <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-white/5 max-h-72 overflow-y-auto">
          {sections.map(({ section, icon, rows }) => (
            <div key={section}>
              <div className="px-5 py-2 bg-white/3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {icon} {section}
                </p>
              </div>
              {rows.map(({ questionId, questionText, answerLabel }) => (
                <div key={questionId} className="px-5 py-3 flex items-start justify-between gap-4">
                  <p className="text-xs text-gray-400 leading-snug flex-1">{questionText}</p>
                  <p className="text-xs font-semibold text-white text-right shrink-0 max-w-[45%] leading-snug">
                    {answerLabel}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            className="glass-button-danger btn-spring flex-1 py-2.5 text-sm"
            onClick={onEdit}
          >
            Edit Answers
          </button>
          <button
            className="glass-button btn-spring flex-1 py-2.5 text-sm font-semibold"
            onClick={onViewPlan}
          >
            View Action Plan →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Answer summary builder ────────────────────────────────────────────────────

interface SummaryRow {
  questionId: string
  questionText: string
  answerLabel: string
}

interface SummarySection {
  section: string
  icon: string
  rows: SummaryRow[]
}

function buildAnswerSummary(answers: Record<string, string>): SummarySection[] {
  const sectionMap: Record<string, SummarySection> = {}

  for (const [questionId, answerValue] of Object.entries(answers)) {
    const question = QUESTION_TREE.questions[questionId]
    if (!question) continue

    const style = getSectionStyle(question.section)

    if (!sectionMap[question.section]) {
      sectionMap[question.section] = {
        section: question.section,
        icon: style.icon,
        rows: [],
      }
    }

    sectionMap[question.section].rows.push({
      questionId,
      questionText: question.question,
      answerLabel: getAnswerLabel(questionId, answerValue),
    })
  }

  // Return in a sensible order
  const sectionOrder = ['Hardware', 'Connection', 'Issues', 'Goals']
  return sectionOrder
    .filter((s) => sectionMap[s])
    .map((s) => sectionMap[s])
}
