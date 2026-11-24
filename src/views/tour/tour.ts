// The guided tours (Decisions "Tour", "From zero tutorial"): steps, each a card pointing at a part of the app. Two
// tutorials share the engine: the sample tour (steps.ts), where Next goes on and does what a step asks when the user
// has not, so it can be taken by only pressing Next; and From zero (zero/), a project built from an empty one, where a
// step waits for the person (Next once it is done) and *Do it for me* does it. Chapters skips ahead, Exit leaves.
// A step that needs a plugin held back as "coming soon" is left out (`needs`).
// The steps are data and drive the app only through its own verbs: change the app, update the steps (docs/tour.md);
// the guard tests (tour.test.tsx, zero.test.tsx) fail when a step points at nothing.
import { create } from 'zustand'
import { isSoon, usePluginModes } from '../../plugins/index.ts'
import { STEPS } from './steps.ts'
import { ZERO_STEPS } from './zero/index.ts'

export interface TourStep {
  /** Unique; the chapter's first step names the chapter. */
  id: string
  chapter: string
  title: string
  /** Paragraphs. */
  body: string[]
  /** What the control or the parameter is for: folded under the action (From zero). */
  why?: string
  /** A button of the step's own on its card (From zero's "Use the tutorial's site file"). */
  action?: { label: string; run(): void | Promise<void> }
  /** The `data-tour` it points at (absent: a card in the middle). */
  anchor?: string
  /** A plugin the step is about (its id): left out while that plugin is held back as "coming soon" (Decision "Coming
   *  soon"), not while the sample only locks it. */
  needs?: string
  /** What the app shows for this step (a panel, a view, an option): run as the step opens. */
  before?(): void
  /** What the step asks for, done for the user (the sample tour's Next, From zero's *Do it for me*). */
  act?(): void | Promise<void>
  /** Whether the user did it by hand (Next then says so). */
  done?(): boolean
}

export type TutorialId = 'tour' | 'zero'

const STEPS_OF: Record<TutorialId, TourStep[]> = { tour: STEPS, zero: ZERO_STEPS }

/** A tutorial's steps, those about a plugin that is "coming soon" left out. */
export function stepsOf(t: TutorialId): TourStep[] {
  const { soon } = usePluginModes.getState()
  const all = STEPS_OF[t]
  // the same list when none is left out
  return all.some((s) => s.needs && isSoon(soon, s.needs)) ? all.filter((s) => !s.needs || !isSoon(soon, s.needs)) : all
}

/** For tests: a tutorial's steps replaced. */
export function setStepsFor(t: TutorialId, steps: TourStep[]): void {
  STEPS_OF[t] = steps
}

interface TourState {
  /** The card that asks whether to take the tour shows. */
  offer: boolean
  active: boolean
  index: number
  /** The tutorial being taken. */
  tutorial: TutorialId
  setOffer(on: boolean): void
  /** From the start, or from a chapter's first step, of a tutorial (the sample tour by default). */
  start(chapter?: string, tutorial?: TutorialId): void
  next(): void
  /** *Do it for me*: what the step asks, done when it is not, then on. */
  doIt(): Promise<void>
  back(): void
  goTo(index: number): void
  exit(): void
}

export const chapters = (t: TutorialId = 'tour'): string[] => [...new Set(stepsOf(t).map((s) => s.chapter))]

function show(t: TutorialId, index: number): { index: number } {
  stepsOf(t)[index]?.before?.()
  return { index }
}

export const useTour = create<TourState>()((set, get) => {
  /** On to the next step, or the end. */
  const onward = () => {
    const { index, tutorial } = get()
    if (index + 1 >= stepsOf(tutorial).length) set({ active: false })
    else set(show(tutorial, index + 1))
  }
  return {
    offer: false,
    active: false,
    index: 0,
    tutorial: 'tour',
    setOffer: (offer) => set({ offer }),
    start(chapter, tutorial = 'tour') {
      const steps = stepsOf(tutorial)
      const at = chapter ? Math.max(0, steps.findIndex((s) => s.chapter === chapter)) : 0
      set({ offer: false, active: true, tutorial, ...show(tutorial, at) })
    },
    next() {
      const { index, tutorial } = get()
      const step = stepsOf(tutorial)[index]
      if (tutorial === 'zero') {
        // From zero waits for the person: Next once the step is done (Do it for me otherwise)
        if (step?.done && !step.done()) return
      } else if (step?.act && !step.done?.()) void step.act()
      onward()
    },
    async doIt() {
      const { index, tutorial } = get()
      const step = stepsOf(tutorial)[index]
      if (step?.act && !step.done?.()) await step.act()
      if (get().index === index && get().tutorial === tutorial) onward()
    },
    back() {
      const { index, tutorial } = get()
      if (index > 0) set(show(tutorial, index - 1))
    },
    goTo(index) {
      const { tutorial } = get()
      if (index >= 0 && index < stepsOf(tutorial).length) set(show(tutorial, index))
    },
    exit: () => set({ active: false, offer: false }),
  }
})
