// Vryionics VR Optimization Suite — Questionnaire Store
// Zustand store for the interactive setup interview.
// Persisted to localStorage so answers survive restarts.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { QUESTION_TREE, type Question } from '../../main/data/questionnaire-tree'


export interface QuestionnaireAnswers {
  [questionId: string]: string
}

interface QuestionnaireState {
  answers: QuestionnaireAnswers
  currentQuestionId: string | null
  history: string[]          // stack of visited question IDs for back navigation
  isComplete: boolean

  // Actions
  startQuestionnaire: () => void
  answerQuestion: (questionId: string, value: string) => void
  goBack: () => void
  resetQuestionnaire: () => void

  // Computed helpers (functions so they always read fresh state)
  getCurrentQuestion: () => Question | undefined
  getProgress: () => { current: number; estimated: number }
}

// Used to render the progress bar — not 100 % accurate, just a reasonable guess.
const ESTIMATED_QUESTIONS = 10


export const useQuestionnaireStore = create<QuestionnaireState>()(
  persist(
    (set, get) => ({
      answers: {},
      currentQuestionId: null,
      history: [],
      isComplete: false,

      startQuestionnaire: () => {
        set({
          currentQuestionId: QUESTION_TREE.startQuestionId,
          history: [],
          isComplete: false,
          // Keep answers — allows resuming if partially answered
        })
      },

      answerQuestion: (questionId, value) => {
        const question = QUESTION_TREE.questions[questionId]
        if (!question) return

        // Persist the answer
        const newAnswers = { ...get().answers, [questionId]: value }

        // Determine next question:
        // 1. Option-level override takes priority
        // 2. Question-level default
        // 3. null → terminal
        const selectedOption = question.options.find((o) => o.value === value)
        const nextId =
          selectedOption?.nextQuestionId ??
          question.nextQuestionId ??
          null

        const isTerminal =
          question.isTerminal === true ||
          nextId === null ||
          !QUESTION_TREE.questions[nextId ?? '']

        set({
          answers: newAnswers,
          history: [...get().history, questionId],
          currentQuestionId: isTerminal ? null : nextId,
          isComplete: isTerminal,
        })
      },

      goBack: () => {
        const { history, answers } = get()
        if (history.length === 0) return

        const previousId = history[history.length - 1]
        const newHistory = history.slice(0, -1)

        // Remove the answer for the question we're going back TO so the
        // user can re-select without stale state (we keep all earlier answers).
        const newAnswers = { ...answers }
        delete newAnswers[previousId]

        set({
          currentQuestionId: previousId,
          history: newHistory,
          isComplete: false,
          answers: newAnswers,
        })
      },

      resetQuestionnaire: () => {
        set({
          answers: {},
          currentQuestionId: null,
          history: [],
          isComplete: false,
        })
      },

      getCurrentQuestion: () => {
        const id = get().currentQuestionId
        if (!id) return undefined
        return QUESTION_TREE.questions[id]
      },

      getProgress: () => {
        const current = get().history.length + 1
        return { current, estimated: Math.max(current, ESTIMATED_QUESTIONS) }
      },
    }),
    {
      name: 'vryionics-questionnaire',
      // Only persist data, not computed functions
      partialize: (state) => ({
        answers: state.answers,
        currentQuestionId: state.currentQuestionId,
        history: state.history,
        isComplete: state.isComplete,
      }),
    }
  )
)
