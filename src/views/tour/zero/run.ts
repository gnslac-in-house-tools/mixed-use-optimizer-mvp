// Starting From zero, and one of its chapters on its own (spec 2026-11-10-from-zero-tutorial, "Chapters on their own").
// The tutorial builds "My first project", one this browser keeps (its id remembered under TUTORIAL_KEY). A chapter
// opened on its own starts from that project as it would be there: a fresh one with every earlier step's act replayed,
// so its starting points are the steps themselves, never stored files that go stale. A tutorial project already there
// is replaced only after a yes; started again from Home, the tutorial resumes on it where it was left.
import { library } from '../../../io/library.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { openKept, removeKept, startProject } from '../../layout/files.ts'
import { keep } from '../../layout/saving.ts'
import { useToast } from '../../layout/toast.ts'
import { chapters, stepsOf, useTour } from '../tour.ts'

export const TUTORIAL_PROJECT = 'My first project'
/** This browser's tutorial project, by id. */
export const TUTORIAL_KEY = 'gfit.tutorial.project'
/** The step the tutorial was at, by index. */
const AT_KEY = 'gfit.tutorial.at'

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // a browser that keeps nothing: the tutorial still runs, it only does not resume
  }
}

let following = false
/** Where the tutorial is, kept so it resumes there (from its first start: tour.ts imports these steps). */
function follow(): void {
  if (following) return
  following = true
  useTour.subscribe((s) => {
    if (s.active && s.tutorial === 'zero') write(AT_KEY, String(s.index))
  })
}

/** Is the open project the tutorial's? */
export const isTutorialProject = (): boolean => {
  const id = read(TUTORIAL_KEY)
  return id !== null && useApp.getState().project.id === id
}

/** Chapter 1's end: a new, empty Industrial project named "My first project", kept, remembered as the tutorial's. */
export function createTutorialProject(): void {
  startProject('industrial', undefined, TUTORIAL_PROJECT)
  write(TUTORIAL_KEY, useApp.getState().project.id)
}

/** The project the person made in Create new (an Industrial one, no site yet) made the tutorial's: named "My first
 *  project", kept, remembered. Already the tutorial's: nothing. */
export function adoptAsTutorial(): void {
  if (isTutorialProject()) return
  const { project, apply } = useApp.getState()
  if (project.name !== TUTORIAL_PROJECT) apply((p) => actions.renameProject(p, TUTORIAL_PROJECT))
  keep()
  write(TUTORIAL_KEY, useApp.getState().project.id)
}

/** Every step before `index` replayed on the open project: shown, then done when it is not. */
async function replay(index: number): Promise<void> {
  const steps = stepsOf('zero')
  for (const step of steps.slice(0, index)) {
    step.before?.()
    if (step.act && !step.done?.()) await step.act()
  }
}

/** A chapter from the start: the tutorial project replaced (if any), the earlier chapters replayed, the tour there. */
async function fromScratch(chapter: string): Promise<void> {
  const old = read(TUTORIAL_KEY)
  if (old) removeKept(old)
  write(TUTORIAL_KEY, null)
  const at = Math.max(0, stepsOf('zero').findIndex((s) => s.chapter === chapter))
  await replay(at)
  useTour.getState().start(chapter, 'zero')
}

/**
 * Starts From zero. No chapter: resumes on the tutorial project where it was left, else chapter 1 from the start. A
 * chapter: from that chapter's start — after a yes when the tutorial project is there (it replaces what it has).
 */
export async function startZero(chapter?: string): Promise<void> {
  follow()
  const first = chapters('zero')[0]
  const id = read(TUTORIAL_KEY)
  const kept = id !== null && (isTutorialProject() || library.read(id) !== null)
  if (!chapter) {
    if (!kept) return fromScratch(first)
    if (!isTutorialProject()) openKept(id)
    const at = Number(read(AT_KEY) ?? 0)
    useTour.getState().start(undefined, 'zero')
    useTour.getState().goTo(Number.isInteger(at) ? at : 0)
    return
  }
  if (!kept) return fromScratch(chapter)
  // Cancel (the question dismissed) changes nothing
  useToast.getState().confirm(`Start "${chapter}" again on ${TUTORIAL_PROJECT}? It replaces what it has.`, () => void fromScratch(chapter), 'Start again')
}

