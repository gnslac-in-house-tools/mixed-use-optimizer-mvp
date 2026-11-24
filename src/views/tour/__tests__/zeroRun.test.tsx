// Starting From zero and opening one of its chapters on its own (spec 2026-11-10-from-zero-tutorial, "Chapters on
// their own"): a chapter starts from "My first project" with every earlier step's act replayed; a project already
// there is replaced only after a yes; the tutorial never makes a second "My first project".
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { library } from '../../../io/library.ts'
import { useApp } from '../../../state/store.ts'
import { followSample } from '../../home/sample.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { setStepsFor, useTour, type TourStep } from '../tour.ts'
import { createTutorialProject, isTutorialProject, startZero, TUTORIAL_KEY, TUTORIAL_PROJECT } from '../zero/run.ts'

let ran: string[] = []
let b = false
const fake: TourStep[] = [
  { id: 'a1', chapter: 'A', title: 'Make it', body: [], act: () => createTutorialProject(), done: () => isTutorialProject() },
  {
    id: 'b1',
    chapter: 'B',
    title: 'Change it',
    body: [],
    act: async () => {
      await Promise.resolve()
      ran.push('b1')
      b = true
    },
    done: () => b,
  },
  { id: 'c1', chapter: 'C', title: 'Look', body: [] },
]

const named = () => library.list().filter((s) => s.name === TUTORIAL_PROJECT)

beforeEach(() => {
  localStorage.clear()
  ran = []
  b = false
  setStepsFor('zero', fake)
  useScreen.setState({ home: true })
  useToast.setState({ toast: null, confirmation: null })
  useTour.setState({ offer: false, active: false, index: 0, tutorial: 'tour' })
})
afterEach(() => setStepsFor('zero', []))

describe('startZero', () => {
  it('a later chapter with no tutorial project: a fresh one, the earlier acts replayed in order, the tour at that chapter', async () => {
    await act(() => startZero('C'))
    expect(useApp.getState().project.name).toBe(TUTORIAL_PROJECT)
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe(useApp.getState().project.id)
    expect(ran).toEqual(['b1'])
    expect(useTour.getState()).toMatchObject({ active: true, tutorial: 'zero', index: 2 })
  })

  it('with the tutorial project there, a chapter asks first; Cancel changes nothing, Start again replays', async () => {
    await act(() => startZero('C'))
    const before = useApp.getState().project
    ran = []
    b = false
    await act(() => startZero('B'))
    const ask = useToast.getState().confirmation
    expect(ask?.text).toMatch(/Start "B" again on My first project\? It replaces what it has/)
    act(() => useToast.getState().closeConfirmation())
    expect(useApp.getState().project).toBe(before)
    await act(() => startZero('B'))
    await act(async () => useToast.getState().confirmation!.onContinue())
    expect(useTour.getState().index).toBe(1)
    expect(named()).toHaveLength(1)
  })

  it('the project it makes does not end it (the sample’s watcher ends only the sample tour)', async () => {
    const stop = followSample()
    await act(() => startZero())
    await act(() => useTour.getState().doIt())
    expect(isTutorialProject()).toBe(true)
    expect(useTour.getState()).toMatchObject({ active: true, tutorial: 'zero', index: 1 })
    stop()
  })

  it('started twice from Home: one My first project, the second time resumed where it was', async () => {
    await act(() => startZero())
    expect(useTour.getState()).toMatchObject({ active: true, tutorial: 'zero', index: 0 })
    await act(() => useTour.getState().doIt())
    expect(isTutorialProject()).toBe(true)
    act(() => useTour.getState().exit())
    await act(() => startZero())
    expect(named()).toHaveLength(1)
    expect(useTour.getState()).toMatchObject({ active: true, tutorial: 'zero', index: 1 })
  })
})
